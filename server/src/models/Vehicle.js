const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: [true, 'Vehicle ID is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Vehicle name is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['van', 'truck', 'motorcycle', 'bicycle', 'car'],
    default: 'van'
  },
  capacity: {
    maxWeight: { type: Number, required: true }, // in kg
    maxVolume: { type: Number }, // in cubic meters
    maxPackages: { type: Number, default: 50 }
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  depot: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: { type: String }
  },
  driver: {
    name: { type: String },
    phone: { type: String },
    email: { type: String },
    license: { type: String }
  },
  operatingHours: {
    start: { type: String, default: '08:00' }, // HH:mm format
    end: { type: String, default: '18:00' }
  },
  averageSpeed: {
    type: Number, // km/h
    default: 40
  },
  fuelEfficiency: {
    type: Number, // km per liter
    default: 10
  },
  status: {
    type: String,
    enum: ['available', 'on_route', 'maintenance', 'offline'],
    default: 'available'
  },
  currentRoute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },
  completedDeliveries: {
    type: Number,
    default: 0
  },
  totalDistance: {
    type: Number, // in km
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create 2dsphere index for geospatial queries
vehicleSchema.index({ currentLocation: '2dsphere' });
vehicleSchema.index({ 'depot.coordinates': '2dsphere' });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ vehicleId: 1 });

// Method to check if vehicle is within operating hours
vehicleSchema.methods.isOperating = function() {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  return currentTime >= this.operatingHours.start && currentTime <= this.operatingHours.end;
};

// Method to update current location
vehicleSchema.methods.updateLocation = function(coordinates) {
  this.currentLocation.coordinates = coordinates;
  return this.save();
};

// Static method to find available vehicles near a location
vehicleSchema.statics.findAvailableNear = function(coordinates, maxDistance = 50000) {
  return this.find({
    status: 'available',
    isActive: true,
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  });
};

module.exports = mongoose.model('Vehicle', vehicleSchema);
