const turf = require('@turf/turf');

class VehicleTracker {
  constructor(io) {
    this.io = io;
    this.activeVehicles = new Map();
  }

  /**
   * Start tracking a vehicle along its optimized route
   * @param {String} vehicleId - Vehicle ID
   * @param {Array} routeGeometry - Array of [lng, lat] coordinates
   * @param {Number} speedKmh - Average speed in km/h (default 40)
   */
  startTracking(vehicleId, routeGeometry, speedKmh = 40) {
    if (this.activeVehicles.has(vehicleId)) {
      console.log(`⚠️ Vehicle ${vehicleId} already being tracked`);
      return;
    }

    // Calculate total route distance
    const line = turf.lineString(routeGeometry);
    const totalDistance = turf.length(line, { units: 'kilometers' });
    
    // Calculate update interval (update every 5 seconds)
    const updateIntervalSeconds = 5;
    const distancePerUpdate = (speedKmh / 3600) * updateIntervalSeconds; // km per update
    
    const tracking = {
      vehicleId,
      routeGeometry,
      totalDistance,
      currentDistance: 0,
      speedKmh,
      distancePerUpdate,
      interval: null,
      line
    };

    console.log(`🚀 Starting tracking for vehicle ${vehicleId}`);
    console.log(`📏 Total route distance: ${totalDistance.toFixed(2)} km`);
    console.log(`⚡ Speed: ${speedKmh} km/h`);

    // Simulate movement every 5 seconds
    tracking.interval = setInterval(() => {
      tracking.currentDistance += tracking.distancePerUpdate;

      // Check if reached destination
      if (tracking.currentDistance >= tracking.totalDistance) {
        this.stopTracking(vehicleId);
        this.io.emit('vehicle-arrived', {
          vehicleId,
          timestamp: new Date()
        });
        console.log(`🏁 Vehicle ${vehicleId} reached destination`);
        return;
      }

      // Calculate current position along route
      const progress = tracking.currentDistance / tracking.totalDistance;
      const currentPoint = turf.along(tracking.line, tracking.currentDistance, { units: 'kilometers' });
      const [lng, lat] = currentPoint.geometry.coordinates;

      // Calculate heading (direction)
      let bearing = 0;
      try {
        const nextDistance = Math.min(tracking.currentDistance + 0.1, tracking.totalDistance);
        const nextPoint = turf.along(tracking.line, nextDistance, { units: 'kilometers' });
        bearing = turf.bearing(currentPoint, nextPoint);
      } catch (error) {
        bearing = 0;
      }

      // Broadcast to all connected clients
      this.io.emit('vehicle-location-update', {
        vehicleId,
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        speed: tracking.speedKmh,
        heading: bearing,
        progress: Math.round(progress * 100),
        distanceTraveled: tracking.currentDistance.toFixed(2),
        distanceRemaining: (tracking.totalDistance - tracking.currentDistance).toFixed(2),
        timestamp: new Date()
      });

      console.log(`🚚 Vehicle ${vehicleId}: ${lat.toFixed(4)}, ${lng.toFixed(4)} (${Math.round(progress * 100)}% complete)`);
    }, updateIntervalSeconds * 1000);

    this.activeVehicles.set(vehicleId, tracking);
  }

  /**
   * Stop tracking a vehicle
   */
  stopTracking(vehicleId) {
    const tracking = this.activeVehicles.get(vehicleId);
    if (tracking) {
      clearInterval(tracking.interval);
      this.activeVehicles.delete(vehicleId);
      console.log(`🛑 Stopped tracking vehicle ${vehicleId}`);
      
      this.io.emit('vehicle-tracking-stopped', {
        vehicleId,
        timestamp: new Date()
      });
    }
  }

  /**
   * Update vehicle speed (for traffic simulation)
   */
  updateSpeed(vehicleId, newSpeedKmh) {
    const tracking = this.activeVehicles.get(vehicleId);
    if (tracking) {
      tracking.speedKmh = newSpeedKmh;
      tracking.distancePerUpdate = (newSpeedKmh / 3600) * 5;
      console.log(`⚡ Vehicle ${vehicleId} speed updated to ${newSpeedKmh} km/h`);
    }
  }

  /**
   * Get all active vehicles being tracked
   */
  getActiveVehicles() {
    return Array.from(this.activeVehicles.keys());
  }

  /**
   * Stop all tracking
   */
  stopAll() {
    this.activeVehicles.forEach((_, vehicleId) => {
      this.stopTracking(vehicleId);
    });
  }
}

module.exports = VehicleTracker;
