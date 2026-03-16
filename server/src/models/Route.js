const mongoose = require('mongoose');

const routeStopSchema = new mongoose.Schema({
  deliveryPoint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryPoint',
    required: true
  },
  sequence: {
    type: Number,
    required: true
  },
  estimatedArrival: {
    type: Date
  },
  actualArrival: {
    type: Date
  },
  estimatedDeparture: {
    type: Date
  },
  actualDeparture: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'en_route', 'arrived', 'completed', 'skipped'],
    default: 'pending'
  },
  distanceFromPrevious: {
    type: Number // in meters
  },
  durationFromPrevious: {
    type: Number // in seconds
  },
  notes: {
    type: String
  }
}, { _id: false });

const routeSchema = new mongoose.Schema({
  routeId: {
    type: String,
    required: true,
    unique: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  stops: [routeStopSchema],
  startLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    address: { type: String }
  },
  endLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number]
    },
    address: { type: String }
  },
  routeGeometry: {
    type: {
      type: String,
      enum: ['LineString'],
      default: 'LineString'
    },
    coordinates: {
      type: [[Number]], // Array of [lng, lat] points
      default: []
    }
  },
  totalDistance: {
    type: Number, // in meters
    default: 0
  },
  totalDuration: {
    type: Number, // in seconds
    default: 0
  },
  estimatedStartTime: {
    type: Date
  },
  actualStartTime: {
    type: Date
  },
  estimatedEndTime: {
    type: Date
  },
  actualEndTime: {
    type: Date
  },
  trafficConditions: {
    level: {
      type: String,
      enum: ['light', 'moderate', 'heavy', 'severe'],
      default: 'moderate'
    },
    lastUpdated: { type: Date },
    predictions: [{
      time: Date,
      level: String,
      confidence: Number
    }]
  },
  optimizationScore: {
    type: Number, // 0-100
    default: 0
  },
  status: {
    type: String,
    enum: ['planned', 'in_progress', 'completed', 'cancelled', 'paused'],
    default: 'planned'
  },
  incidents: [{
    type: {
      type: String,
      enum: ['accident', 'road_closure', 'weather', 'vehicle_issue', 'customer_request', 'other']
    },
    description: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    },
    reportedAt: { type: Date, default: Date.now },
    resolvedAt: Date,
    impact: {
      type: String,
      enum: ['low', 'medium', 'high']
    }
  }],
  rerouteHistory: [{
    timestamp: { type: Date, default: Date.now },
    reason: String,
    previousStops: [routeStopSchema],
    newStops: [routeStopSchema],
    distanceSaved: Number,
    timeSaved: Number
  }],
  metadata: {
    createdBy: String,
    optimizationAlgorithm: { type: String, default: 'or-tools' },
    aiModel: { type: String, default: 'gemini' }
  }
}, {
  timestamps: true
});

// Indexes
routeSchema.index({ routeId: 1 });
routeSchema.index({ vehicle: 1 });
routeSchema.index({ status: 1 });
routeSchema.index({ startLocation: '2dsphere' });
routeSchema.index({ 'stops.deliveryPoint': 1 });

// Virtual for progress percentage
routeSchema.virtual('progress').get(function() {
  if (!this.stops || this.stops.length === 0) return 0;
  const completed = this.stops.filter(s => s.status === 'completed').length;
  return Math.round((completed / this.stops.length) * 100);
});

// Method to get current stop
routeSchema.methods.getCurrentStop = function() {
  return this.stops.find(s => s.status === 'en_route' || s.status === 'arrived');
};

// Method to get next stop
routeSchema.methods.getNextStop = function() {
  const currentIndex = this.stops.findIndex(s => s.status === 'en_route' || s.status === 'arrived');
  if (currentIndex >= 0 && currentIndex < this.stops.length - 1) {
    return this.stops[currentIndex + 1];
  }
  return this.stops.find(s => s.status === 'pending');
};

// Method to complete a stop
routeSchema.methods.completeStop = function(stopSequence) {
  const stop = this.stops.find(s => s.sequence === stopSequence);
  if (stop) {
    stop.status = 'completed';
    stop.actualDeparture = new Date();
    
    // Update next stop status
    const nextStop = this.stops.find(s => s.sequence === stopSequence + 1);
    if (nextStop) {
      nextStop.status = 'en_route';
    } else {
      // Route completed
      this.status = 'completed';
      this.actualEndTime = new Date();
    }
  }
  return this.save();
};

module.exports = mongoose.model('Route', routeSchema);
