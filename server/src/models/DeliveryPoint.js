const mongoose = require('mongoose');

const deliveryPointSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Delivery point name is required'],
    trim: true
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String, default: 'USA' }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'Coordinates are required'],
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && 
                 v[1] >= -90 && v[1] <= 90;
        },
        message: 'Invalid coordinates. Must be [longitude, latitude]'
      }
    }
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  timeWindow: {
    start: { type: Date },
    end: { type: Date }
  },
  estimatedServiceTime: {
    type: Number, // in minutes
    default: 10
  },
  contactInfo: {
    name: { type: String },
    phone: { type: String },
    email: { type: String }
  },
  packageDetails: {
    weight: { type: Number }, // in kg
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number }
    },
    specialInstructions: { type: String }
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_transit', 'delivered', 'failed'],
    default: 'pending'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create 2dsphere index for geospatial queries
deliveryPointSchema.index({ location: '2dsphere' });
deliveryPointSchema.index({ status: 1 });
deliveryPointSchema.index({ priority: 1 });

// Virtual for full address
deliveryPointSchema.virtual('fullAddress').get(function() {
  const { street, city, state, postalCode, country } = this.address;
  return [street, city, state, postalCode, country].filter(Boolean).join(', ');
});

// Method to check if within time window
deliveryPointSchema.methods.isWithinTimeWindow = function() {
  if (!this.timeWindow.start || !this.timeWindow.end) return true;
  const now = new Date();
  return now >= this.timeWindow.start && now <= this.timeWindow.end;
};

// Static method to find nearby delivery points
deliveryPointSchema.statics.findNearby = function(coordinates, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance // in meters
      }
    },
    isActive: true
  });
};

module.exports = mongoose.model('DeliveryPoint', deliveryPointSchema);
