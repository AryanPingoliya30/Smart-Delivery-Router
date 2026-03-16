/**
 * Database Seed Script
 * Run this script to populate the database with sample data
 * 
 * Usage: node scripts/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import models
const DeliveryPoint = require('../src/models/DeliveryPoint');
const Vehicle = require('../src/models/Vehicle');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-delivery-router';

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Read sample data
    const sampleDataPath = path.join(__dirname, '../data/sample-delivery-data.json');
    const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, 'utf8'));

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await DeliveryPoint.deleteMany({});
    await Vehicle.deleteMany({});

    // Seed delivery points
    console.log('📍 Seeding delivery points...');
    const deliveryPoints = await DeliveryPoint.insertMany(sampleData.deliveryPoints);
    console.log(`   Created ${deliveryPoints.length} delivery points`);

    // Seed vehicles
    console.log('🚚 Seeding vehicles...');
    const vehiclePromises = sampleData.vehicles.map(async (vehicleData) => {
      // Set current location to depot
      vehicleData.currentLocation = {
        type: 'Point',
        coordinates: vehicleData.depot.coordinates
      };
      return Vehicle.create(vehicleData);
    });
    const vehicles = await Promise.all(vehiclePromises);
    console.log(`   Created ${vehicles.length} vehicles`);

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Delivery Points: ${deliveryPoints.length}`);
    console.log(`   - Vehicles: ${vehicles.length}`);

    // Display some sample IDs for testing
    console.log('\n🔑 Sample IDs for testing:');
    console.log(`   Delivery Point: ${deliveryPoints[0]._id}`);
    console.log(`   Vehicle: ${vehicles[0]._id}`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

seedDatabase();
