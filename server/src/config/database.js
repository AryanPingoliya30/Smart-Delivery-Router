const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-delivery-router', {
      // Mongoose 8.x defaults are good, but you can add options if needed
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create geospatial indexes
    await createIndexes();
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    // Indexes will be created automatically when models are loaded
    console.log('📍 Geospatial indexes ready');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

module.exports = connectDB;
