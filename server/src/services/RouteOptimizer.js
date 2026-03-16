/**
 * Route Optimizer Service
 * Implements various optimization algorithms inspired by Google OR-Tools
 * for solving Vehicle Routing Problems (VRP) and Traveling Salesman Problems (TSP)
 */

const axios = require('axios');
const NodeCache = require('node-cache');

class RouteOptimizer {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 300 }); // 5 min cache for distance matrices
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  haversineDistance(coord1, coord2) {
    const R = 6371000; // Earth's radius in meters
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const deltaLng = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Build distance matrix for all locations
   */
  async buildDistanceMatrix(locations, useMapbox = false) {
    const n = locations.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
    const durationMatrix = Array(n).fill(null).map(() => Array(n).fill(0));

    if (useMapbox && this.mapboxToken && locations.length <= 25) {
      try {
        // Use Mapbox Matrix API for accurate road distances
        const coordinates = locations.map(loc => 
          `${loc.coordinates[0]},${loc.coordinates[1]}`
        ).join(';');

        const response = await axios.get(
          `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}`,
          {
            params: {
              access_token: this.mapboxToken,
              annotations: 'distance,duration'
            }
          }
        );

        if (response.data.distances && response.data.durations) {
          return {
            distances: response.data.distances,
            durations: response.data.durations
          };
        }
      } catch (error) {
        console.log('Mapbox Matrix API error, falling back to Haversine:', error.message);
      }
    }

    // Fallback to Haversine distance with estimated duration
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const distance = this.haversineDistance(
            locations[i].coordinates,
            locations[j].coordinates
          );
          matrix[i][j] = distance;
          // Estimate duration assuming average speed of 30 km/h in urban areas
          durationMatrix[i][j] = (distance / 1000) / 30 * 3600; // seconds
        }
      }
    }

    return { distances: matrix, durations: durationMatrix };
  }

  /**
   * Nearest Neighbor Algorithm for TSP
   * Simple but effective greedy algorithm
   */
  nearestNeighbor(distanceMatrix, startIndex = 0) {
    const n = distanceMatrix.length;
    const visited = new Set([startIndex]);
    const route = [startIndex];
    let current = startIndex;
    let totalDistance = 0;

    while (visited.size < n) {
      let nearest = -1;
      let nearestDistance = Infinity;

      for (let i = 0; i < n; i++) {
        if (!visited.has(i) && distanceMatrix[current][i] < nearestDistance) {
          nearest = i;
          nearestDistance = distanceMatrix[current][i];
        }
      }

      if (nearest !== -1) {
        visited.add(nearest);
        route.push(nearest);
        totalDistance += nearestDistance;
        current = nearest;
      }
    }

    return { route, totalDistance };
  }

  /**
   * 2-opt improvement algorithm
   * Improves an existing route by removing edge crossings
   */
  twoOpt(route, distanceMatrix) {
    let improved = true;
    let bestRoute = [...route];
    let bestDistance = this.calculateRouteDistance(bestRoute, distanceMatrix);

    while (improved) {
      improved = false;
      for (let i = 1; i < bestRoute.length - 1; i++) {
        for (let j = i + 1; j < bestRoute.length; j++) {
          const newRoute = this.twoOptSwap(bestRoute, i, j);
          const newDistance = this.calculateRouteDistance(newRoute, distanceMatrix);

          if (newDistance < bestDistance) {
            bestRoute = newRoute;
            bestDistance = newDistance;
            improved = true;
          }
        }
      }
    }

    return { route: bestRoute, totalDistance: bestDistance };
  }

  twoOptSwap(route, i, j) {
    const newRoute = route.slice(0, i);
    const reversedSegment = route.slice(i, j + 1).reverse();
    const remainingSegment = route.slice(j + 1);
    return [...newRoute, ...reversedSegment, ...remainingSegment];
  }

  calculateRouteDistance(route, distanceMatrix) {
    let distance = 0;
    for (let i = 0; i < route.length - 1; i++) {
      distance += distanceMatrix[route[i]][route[i + 1]];
    }
    return distance;
  }

  /**
   * Or-opt improvement (moving segments)
   */
  orOpt(route, distanceMatrix) {
    let improved = true;
    let bestRoute = [...route];
    let bestDistance = this.calculateRouteDistance(bestRoute, distanceMatrix);

    while (improved) {
      improved = false;
      for (let segmentLength = 1; segmentLength <= 3; segmentLength++) {
        for (let i = 1; i < bestRoute.length - segmentLength; i++) {
          for (let j = 1; j < bestRoute.length; j++) {
            if (j >= i && j <= i + segmentLength) continue;

            const segment = bestRoute.slice(i, i + segmentLength);
            const remaining = [
              ...bestRoute.slice(0, i),
              ...bestRoute.slice(i + segmentLength)
            ];
            
            const newRoute = [
              ...remaining.slice(0, j > i ? j - segmentLength : j),
              ...segment,
              ...remaining.slice(j > i ? j - segmentLength : j)
            ];

            const newDistance = this.calculateRouteDistance(newRoute, distanceMatrix);

            if (newDistance < bestDistance) {
              bestRoute = newRoute;
              bestDistance = newDistance;
              improved = true;
            }
          }
        }
      }
    }

    return { route: bestRoute, totalDistance: bestDistance };
  }

  /**
   * Main route optimization method
   */
  async optimizeRoute(vehicle, deliveryPoints, options = {}) {
    const {
      returnToDepot = false,  // Changed default to false
      considerTraffic = true,
      prioritizeUrgent = true,
      startLocation = null,
      avoidIncidents = []
    } = options;

    // Determine starting coordinates - prioritize driver's current location
    // This ensures route starts from where the driver actually is
    let startCoords;
    if (startLocation) {
      // Use driver's current GPS location (most accurate)
      startCoords = startLocation;
      console.log('🚚 Starting route from driver\'s current location:', startCoords);
    } else if (vehicle.currentLocation?.coordinates) {
      // Fallback to vehicle's stored current location
      startCoords = vehicle.currentLocation.coordinates;
      console.log('🚚 Starting route from vehicle current location:', startCoords);
    } else if (deliveryPoints.length > 0) {
      // Use first delivery point as start (we'll optimize from there)
      startCoords = deliveryPoints[0].location.coordinates;
      console.log('📦 Starting route from first delivery point:', startCoords);
    } else if (vehicle.depot?.coordinates) {
      startCoords = vehicle.depot.coordinates;
      console.log('🏢 Starting route from depot:', startCoords);
    } else {
      throw new Error('No valid starting location available');
    }

    // Build locations array - IMPORTANT: Include driver's starting position as index 0
    const locations = [
      {
        coordinates: startCoords,
        id: 'driver-start',
        priority: 'urgent', // Driver position has highest priority
        timeWindow: null,
        serviceTime: 0, // No service time at driver's starting position
        data: null,
        isStart: true
      },
      ...deliveryPoints.map(dp => ({
        coordinates: dp.location.coordinates,
        id: dp._id,
        priority: dp.priority,
        timeWindow: dp.timeWindow,
        serviceTime: dp.estimatedServiceTime || 10,
        data: dp,
        isStart: false
      }))
    ];

    // Build distance/duration matrix (includes driver position at index 0)
    const { distances, durations } = await this.buildDistanceMatrix(locations, true);
    
    console.log('📊 Distance Matrix (from driver at index 0):');
    for (let i = 0; i < Math.min(locations.length, 5); i++) {
      const loc = locations[i];
      if (i === 0) {
        console.log(`  [${i}] DRIVER START at [${startCoords[0].toFixed(4)}, ${startCoords[1].toFixed(4)}]`);
      } else {
        console.log(`  [${i}] ${loc.data?.name || 'Delivery'} - Distance from driver: ${(distances[0][i]/1000).toFixed(2)}km`);
      }
    }

    // Special case: Single delivery point (just driver + 1 delivery)
    if (locations.length === 2) {
      // No need for complex optimization - just go from driver to the one delivery
      const result = {
        route: [0, 1], // Driver (0) -> Delivery (1)
        totalDistance: distances[0][1]
      };
      
      const actualDistance = distances[0][1];
      const actualDuration = durations[0][1];
      
      // Build simple route
      const now = new Date();
      const routeCoordinates = [startCoords, locations[1].coordinates];
      const arrivalTime = new Date(now.getTime() + actualDuration * 1000);
      
      return {
        optimizedOrder: [{
          ...locations[1].data.toObject(),
          estimatedArrival: arrivalTime,
          distanceFromPrevious: actualDistance,
          durationFromPrevious: actualDuration
        }],
        totalDistance: actualDistance,
        totalDuration: actualDuration,
        routeGeometry: routeCoordinates,
        estimatedTimes: {
          start: now,
          end: new Date(arrivalTime.getTime() + 10 * 60 * 1000) // +10min service time
        },
        score: 100,
        savings: {
          distance: 0,
          time: 0,
          percentageDistance: 0,
          percentageTime: 0
        }
      };
    }

    // Multiple deliveries - PURE DISTANCE-BASED optimization
    // DISABLE priority weighting to ensure nearest-first routing
    console.log('🎯 Using PURE distance-based optimization (no priority weighting)');
    let weightedDistances = distances; // Use actual distances, NO priority adjustment

    // Run nearest neighbor starting from driver's position (index 0)
    console.log('🔍 Running Nearest Neighbor from driver position (index 0)...');
    let result = this.nearestNeighbor(weightedDistances, 0);
    console.log('📍 Initial route order:', result.route.map((idx, i) => {
      if (idx === 0) return 'DRIVER';
      return `#${i} (${locations[idx].data?.name || 'Delivery'})`;
    }));

    // Improve with 2-opt
    result = this.twoOpt(result.route, weightedDistances);

    // Further improve with or-opt
    result = this.orOpt(result.route, weightedDistances);

    // Calculate actual distances and durations using original matrices
    const actualDistance = this.calculateRouteDistance(result.route, distances);
    const actualDuration = this.calculateRouteDistance(result.route, durations);
    
    console.log('✅ Final optimized route:');
    result.route.forEach((idx, i) => {
      if (idx === 0) {
        console.log(`  Start: DRIVER at [${startCoords[0].toFixed(4)}, ${startCoords[1].toFixed(4)}]`);
      } else {
        const prevIdx = i > 0 ? result.route[i - 1] : 0;
        const dist = distances[prevIdx][idx] / 1000;
        console.log(`  Stop #${i}: ${locations[idx].data?.name || 'Delivery'} (${dist.toFixed(2)}km from previous)`);
      }
    });
    console.log(`  Total distance: ${(actualDistance/1000).toFixed(2)}km, Duration: ${Math.round(actualDuration/60)}min`);

    // Build optimized order with estimated times
    const now = new Date();
    let currentTime = now;
    const optimizedOrder = [];
    const routeCoordinates = [];
    
    // IMPORTANT: Add driver's starting position as first point in route
    // This ensures the blue route line starts from the green driver marker
    routeCoordinates.push(startCoords);

    // Process all locations in the optimized route order
    // Skip index 0 (driver's starting position) - only process actual delivery stops
    for (let i = 0; i < result.route.length; i++) {
      const locationIndex = result.route[i];
      const location = locations[locationIndex];
      
      // Skip the driver's starting position
      if (location.isStart) continue;
      
      // Add coordinates for the route line
      routeCoordinates.push(location.coordinates);
      
      // Calculate travel time and distance from previous stop
      let travelTime = 0;
      let distanceFromPrev = 0;
      
      // Find the previous actual location in the route (might be driver position or previous delivery)
      let prevLocationIndex = i > 0 ? result.route[i - 1] : 0; // If first delivery, previous is driver (index 0)
      
      travelTime = durations[prevLocationIndex][locationIndex];
      distanceFromPrev = distances[prevLocationIndex][locationIndex];
      currentTime = new Date(currentTime.getTime() + travelTime * 1000);
      
      optimizedOrder.push({
        ...location.data.toObject(),
        estimatedArrival: new Date(currentTime),
        distanceFromPrevious: distanceFromPrev,
        durationFromPrevious: travelTime
      });

      // Add service time
      currentTime = new Date(currentTime.getTime() + (location.serviceTime || 10) * 60 * 1000);
    }

    // Calculate baseline (unoptimized) for comparison
    const unoptimizedDistance = this.calculateSequentialDistance(distances, locations.length);
    const unoptimizedDuration = this.calculateSequentialDistance(durations, locations.length);

    return {
      optimizedOrder,
      totalDistance: actualDistance,
      totalDuration: actualDuration,
      routeGeometry: routeCoordinates,
      estimatedTimes: {
        start: now,
        end: currentTime
      },
      score: Math.min(100, Math.round((1 - actualDistance / unoptimizedDistance) * 100 + 50)),
      savings: {
        distance: Math.max(0, unoptimizedDistance - actualDistance),
        time: Math.max(0, unoptimizedDuration - actualDuration),
        percentageDistance: Math.round((1 - actualDistance / unoptimizedDistance) * 100),
        percentageTime: Math.round((1 - actualDuration / unoptimizedDuration) * 100)
      }
    };
  }

  /**
   * Apply priority weights to distance matrix
   */
  applyPriorityWeights(distances, locations) {
    // Smaller multipliers = distance matters more, priority matters less
    // urgent gets 20% discount, high gets 10%, low gets 10% penalty
    const priorityMultipliers = {
      urgent: 0.8,  // 20% closer (was 0.5 = 50% closer, too aggressive)
      high: 0.9,    // 10% closer (was 0.7 = 30% closer)
      medium: 1.0,  // No change
      low: 1.1      // 10% farther (was 1.3 = 30% farther)
    };

    const weighted = distances.map((row, i) => 
      row.map((dist, j) => {
        if (j === 0) return dist; // Don't weight depot
        const priority = locations[j]?.priority || 'medium';
        return dist * (priorityMultipliers[priority] || 1.0);
      })
    );

    return weighted;
  }

  calculateSequentialDistance(matrix, n) {
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      total += matrix[i][i + 1];
    }
    return total || 1; // Avoid division by zero
  }

  /**
   * Solve Vehicle Routing Problem for multiple vehicles
   */
  async solveVRP(vehicles, deliveryPoints, options = {}) {
    const {
      maxStopsPerVehicle = 20,
      balanceWorkload = true,
      considerCapacity = true
    } = options;

    // Sort delivery points by priority
    const sortedPoints = [...deliveryPoints].sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });

    // Cluster delivery points to vehicles based on proximity to depot
    const assignments = vehicles.map(v => ({
      vehicleId: v._id.toString(),
      vehicle: v,
      deliveryPoints: [],
      totalDistance: 0,
      totalDuration: 0,
      currentLoad: 0
    }));

    const unassigned = [];

    // Assign each delivery point to nearest available vehicle
    for (const dp of sortedPoints) {
      let bestVehicle = null;
      let bestDistance = Infinity;

      for (const assignment of assignments) {
        if (assignment.deliveryPoints.length >= maxStopsPerVehicle) continue;
        
        // Check capacity
        if (considerCapacity && dp.packageDetails?.weight) {
          if (assignment.currentLoad + dp.packageDetails.weight > assignment.vehicle.capacity.maxWeight) {
            continue;
          }
        }

        const distance = this.haversineDistance(
          assignment.vehicle.depot.coordinates,
          dp.location.coordinates
        );

        // Apply workload balancing penalty
        const workloadPenalty = balanceWorkload 
          ? assignment.deliveryPoints.length * 100 
          : 0;

        if (distance + workloadPenalty < bestDistance) {
          bestDistance = distance + workloadPenalty;
          bestVehicle = assignment;
        }
      }

      if (bestVehicle) {
        bestVehicle.deliveryPoints.push(dp);
        bestVehicle.currentLoad += dp.packageDetails?.weight || 0;
      } else {
        unassigned.push(dp);
      }
    }

    // Optimize each vehicle's route
    const totalStats = { distance: 0, duration: 0 };

    for (const assignment of assignments) {
      if (assignment.deliveryPoints.length === 0) continue;

      const optimized = await this.optimizeRoute(
        assignment.vehicle,
        assignment.deliveryPoints,
        options
      );

      assignment.deliveryPoints = optimized.optimizedOrder;
      assignment.totalDistance = optimized.totalDistance;
      assignment.totalDuration = optimized.totalDuration;
      assignment.routeGeometry = optimized.routeGeometry;
      assignment.score = optimized.score;

      totalStats.distance += optimized.totalDistance;
      totalStats.duration += optimized.totalDuration;
    }

    return {
      assignments: assignments.filter(a => a.deliveryPoints.length > 0),
      totalDistance: totalStats.distance,
      totalDuration: totalStats.duration,
      unassigned,
      score: Math.round(
        assignments.reduce((sum, a) => sum + (a.score || 0), 0) / 
        Math.max(1, assignments.filter(a => a.deliveryPoints.length > 0).length)
      )
    };
  }
}

module.exports = RouteOptimizer;
