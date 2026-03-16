/**
 * Quick Fix Script - Update Vehicle Depot Locations to Jaipur, India
 * Run this once to fix existing vehicles in database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Vehicle = require('./src/models/Vehicle');

async function fixVehicleLocations() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected!\n');

    // Find all vehicles with New York coordinates (wrong location)
    const wrongLocationVehicles = await Vehicle.find({
      'depot.coordinates.0': { $lt: 0 } // Negative longitude = Western Hemisphere (Americas)
    });

    console.log(`Found ${wrongLocationVehicles.length} vehicles with incorrect location\n`);

    if (wrongLocationVehicles.length === 0) {
      console.log('✓ All vehicles already have correct locations!');
      process.exit(0);
    }

    // Update each vehicle to Jaipur, India coordinates
    for (const vehicle of wrongLocationVehicles) {
      console.log(`Updating: ${vehicle.name} (${vehicle.vehicleId})`);
      console.log(`  Old location: [${vehicle.depot.coordinates[0]}, ${vehicle.depot.coordinates[1]}]`);
      
      vehicle.depot.coordinates = [75.7873, 26.9124]; // Jaipur, India
      vehicle.depot.address = 'Main Depot, Jaipur, India';
      
      // Also update current location if it's at default [0,0]
      if (vehicle.currentLocation.coordinates[0] === 0 && vehicle.currentLocation.coordinates[1] === 0) {
        vehicle.currentLocation.coordinates = [75.7873, 26.9124];
      }
      
      await vehicle.save();
      console.log(`  New location: [${vehicle.depot.coordinates[0]}, ${vehicle.depot.coordinates[1]}] ✓\n`);
    }

    console.log('═══════════════════════════════════════════');
    console.log('✅ ALL VEHICLES UPDATED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════');
    console.log('\n📍 All vehicles now start from: Jaipur, India');
    console.log('🔄 Refresh your browser to see the changes\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
}

fixVehicleLocations();
