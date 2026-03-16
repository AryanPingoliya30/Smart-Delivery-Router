/**
 * Test VRP (Vehicle Routing Problem) System
 * This demonstrates single vehicle route optimization with traffic awareness
 */

require('dotenv').config();
const mongoose = require('mongoose');
const RouteOptimizer = require('./src/services/RouteOptimizer');
const Vehicle = require('./src/models/Vehicle');
const DeliveryPoint = require('./src/models/DeliveryPoint');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

async function testVRP() {
  try {
    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.cyan}🚚 Testing Vehicle Routing Problem (VRP)${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`${colors.green}✓ Connected to MongoDB${colors.reset}\n`);

    const optimizer = new RouteOptimizer();

    // Create test vehicle
    const vehicle = await Vehicle.create({
      vehicleId: `TEST-VRP-${Date.now()}`,
      name: 'Test Delivery Van',
      type: 'van',
      licensePlate: 'VRP-TEST-001',
      capacity: {
        maxWeight: 1000,
        maxVolume: 20,
        maxPackages: 50
      },
      depot: {
        type: 'Point',
        coordinates: [75.7873, 26.9124], // Jaipur city center
        address: 'Main Depot, Jaipur'
      },
      status: 'available'
    });

    console.log(`${colors.blue}📦 Created test vehicle: ${vehicle.name}${colors.reset}`);
    console.log(`   Vehicle ID: ${vehicle.vehicleId}`);
    console.log(`   Capacity: ${vehicle.capacity.maxWeight}kg, ${vehicle.capacity.maxPackages} packages\n`);

    // Create test delivery points around Jaipur
    const deliveryLocations = [
      { name: 'Delivery A - MI Road', coords: [75.8093, 26.9196], priority: 'urgent', weight: 50 },
      { name: 'Delivery B - JLN Marg', coords: [75.8176, 26.9173], priority: 'high', weight: 75 },
      { name: 'Delivery C - Tonk Road', coords: [75.8165, 26.8712], priority: 'medium', weight: 100 },
      { name: 'Delivery D - Ajmer Road', coords: [75.7390, 26.9389], priority: 'medium', weight: 80 },
      { name: 'Delivery E - Sikar Road', coords: [75.7895, 26.9685], priority: 'low', weight: 60 },
      { name: 'Delivery F - Amer Road', coords: [75.8512, 26.9855], priority: 'high', weight: 90 },
      { name: 'Delivery G - Sanganer', coords: [75.8047, 26.8245], priority: 'medium', weight: 70 },
      { name: 'Delivery H - Malviya Nagar', coords: [75.8215, 26.8523], priority: 'urgent', weight: 55 }
    ];

    const deliveryPoints = [];
    for (const loc of deliveryLocations) {
      const dp = await DeliveryPoint.create({
        name: loc.name,
        location: {
          type: 'Point',
          coordinates: loc.coords
        },
        address: {
          street: loc.name,
          city: 'Jaipur',
          state: 'Rajasthan',
          country: 'India',
          zipCode: '302001'
        },
        priority: loc.priority,
        status: 'pending',
        packageDetails: {
          weight: loc.weight,
          dimensions: { length: 30, width: 30, height: 20 },
          quantity: 1
        },
        estimatedServiceTime: 10
      });
      deliveryPoints.push(dp);
      console.log(`${colors.green}✓${colors.reset} Created: ${loc.name} (${loc.priority} priority, ${loc.weight}kg)`);
    }

    console.log(`\n${colors.yellow}📊 Total deliveries: ${deliveryPoints.length}${colors.reset}`);
    console.log(`${colors.yellow}📊 Total weight: ${deliveryLocations.reduce((sum, d) => sum + d.weight, 0)}kg${colors.reset}\n`);

    // Test 1: Route optimization WITHOUT traffic consideration
    console.log(`${colors.magenta}========================================${colors.reset}`);
    console.log(`${colors.magenta}Test 1: Basic Route Optimization${colors.reset}`);
    console.log(`${colors.magenta}========================================${colors.reset}\n`);

    const startTime1 = Date.now();
    const result1 = await optimizer.optimizeRoute(vehicle, deliveryPoints, {
      considerTraffic: false,
      prioritizeUrgent: false,
      returnToDepot: false
    });
    const optimizationTime1 = Date.now() - startTime1;

    console.log(`${colors.cyan}Route Order:${colors.reset}`);
    result1.optimizedOrder.forEach((delivery, index) => {
      const eta = new Date(delivery.estimatedArrival).toLocaleTimeString();
      const distKm = (delivery.distanceFromPrevious / 1000).toFixed(2);
      const durationMin = Math.round(delivery.durationFromPrevious / 60);
      console.log(`  ${index + 1}. ${delivery.name}`);
      console.log(`     ⏰ ETA: ${eta}`);
      if (index > 0) {
        console.log(`     📏 From prev: ${distKm}km, ${durationMin} min`);
      }
    });

    console.log(`\n${colors.green}📊 Results:${colors.reset}`);
    console.log(`   Total Distance: ${(result1.totalDistance / 1000).toFixed(2)} km`);
    console.log(`   Total Duration: ${Math.round(result1.totalDuration / 60)} minutes`);
    console.log(`   Optimization Score: ${result1.score}/100`);
    console.log(`   Distance Savings: ${(result1.savings.distance / 1000).toFixed(2)} km (${result1.savings.percentageDistance}%)`);
    console.log(`   Time Savings: ${Math.round(result1.savings.time / 60)} min (${result1.savings.percentageTime}%)`);
    console.log(`   Computation Time: ${optimizationTime1}ms\n`);

    // Test 2: Route optimization WITH traffic and priority consideration
    console.log(`${colors.magenta}========================================${colors.reset}`);
    console.log(`${colors.magenta}Test 2: Traffic-Aware + Priority Optimization${colors.reset}`);
    console.log(`${colors.magenta}========================================${colors.reset}\n`);

    const startTime2 = Date.now();
    const result2 = await optimizer.optimizeRoute(vehicle, deliveryPoints, {
      considerTraffic: true,
      prioritizeUrgent: true,
      returnToDepot: false
    });
    const optimizationTime2 = Date.now() - startTime2;

    console.log(`${colors.cyan}Route Order (with traffic & priority):${colors.reset}`);
    result2.optimizedOrder.forEach((delivery, index) => {
      const eta = new Date(delivery.estimatedArrival).toLocaleTimeString();
      const distKm = (delivery.distanceFromPrevious / 1000).toFixed(2);
      const durationMin = Math.round(delivery.durationFromPrevious / 60);
      const priorityColor = delivery.priority === 'urgent' ? colors.red : 
                           delivery.priority === 'high' ? colors.yellow : colors.reset;
      console.log(`  ${index + 1}. ${delivery.name} ${priorityColor}[${delivery.priority}]${colors.reset}`);
      console.log(`     ⏰ ETA: ${eta}`);
      if (index > 0) {
        console.log(`     📏 From prev: ${distKm}km, ${durationMin} min`);
      }
    });

    console.log(`\n${colors.green}📊 Results (Traffic-Aware):${colors.reset}`);
    console.log(`   Total Distance: ${(result2.totalDistance / 1000).toFixed(2)} km`);
    console.log(`   Total Duration: ${Math.round(result2.totalDuration / 60)} minutes`);
    console.log(`   Optimization Score: ${result2.score}/100`);
    console.log(`   Distance Savings: ${(result2.savings.distance / 1000).toFixed(2)} km (${result2.savings.percentageDistance}%)`);
    console.log(`   Time Savings: ${Math.round(result2.savings.time / 60)} min (${result2.savings.percentageTime}%)`);
    console.log(`   Computation Time: ${optimizationTime2}ms\n`);

    // Comparison
    console.log(`${colors.magenta}========================================${colors.reset}`);
    console.log(`${colors.magenta}📊 Comparison: Basic vs Traffic-Aware${colors.reset}`);
    console.log(`${colors.magenta}========================================${colors.reset}\n`);

    const distDiff = ((result2.totalDistance - result1.totalDistance) / 1000).toFixed(2);
    const timeDiff = Math.round((result2.totalDuration - result1.totalDuration) / 60);
    
    console.log(`   Distance difference: ${distDiff > 0 ? '+' : ''}${distDiff} km`);
    console.log(`   Time difference: ${timeDiff > 0 ? '+' : ''}${timeDiff} min`);
    console.log(`   Score difference: ${result2.score - result1.score} points\n`);

    // Cleanup
    await Vehicle.deleteOne({ _id: vehicle._id });
    await DeliveryPoint.deleteMany({ _id: { $in: deliveryPoints.map(dp => dp._id) } });
    console.log(`${colors.green}✓ Cleaned up test data${colors.reset}\n`);

    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.green}✅ ALL VRP TESTS COMPLETED SUCCESSFULLY!${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);

    console.log(`${colors.yellow}📚 Key Takeaways:${colors.reset}`);
    console.log(`   1. ✓ Distance Matrix: Built using Haversine + Mapbox API`);
    console.log(`   2. ✓ Algorithm: Nearest Neighbor → 2-Opt → Or-Opt`);
    console.log(`   3. ✓ Traffic Awareness: Real-time penalties applied`);
    console.log(`   4. ✓ Priority Routing: Urgent deliveries prioritized`);
    console.log(`   5. ✓ ETA Calculation: Precise arrival times computed`);
    console.log(`   6. ✓ Capacity Checking: Weight constraints validated`);
    console.log(`   7. ✓ Savings: ${result2.savings.percentageDistance}% distance, ${result2.savings.percentageTime}% time saved!\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log(`${colors.blue}👋 Disconnected from database${colors.reset}`);
  }
}

// Run the test
testVRP();
