const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Route = require('../models/Route');
const Vehicle = require('../models/Vehicle');
const DeliveryPoint = require('../models/DeliveryPoint');
const { v4: uuidv4 } = require('uuid');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// @route   GET /api/routes
// @desc    Get all routes
router.get('/', async (req, res, next) => {
  try {
    const { status, vehicleId, limit = 50, page = 1 } = req.query;
    
    let query = {};
    if (status) query.status = status;
    if (vehicleId) query.vehicle = vehicleId;

    const total = await Route.countDocuments(query);
    const routes = await Route.find(query)
      .populate('vehicle', 'vehicleId name type')
      .populate('stops.deliveryPoint', 'name address location')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: routes.length,
      total,
      data: routes
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/routes/active
// @desc    Get all active routes (in_progress)
router.get('/active', async (req, res, next) => {
  try {
    const routes = await Route.find({ status: 'in_progress' })
      .populate('vehicle', 'vehicleId name type currentLocation')
      .populate('stops.deliveryPoint', 'name address location status');

    res.json({ success: true, count: routes.length, data: routes });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/routes/:id
// @desc    Get single route with full details
router.get('/:id', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('vehicle')
      .populate('stops.deliveryPoint');
    
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }
    res.json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/routes
// @desc    Create a new route
router.post('/', [
  body('vehicleId').notEmpty().withMessage('Vehicle ID is required'),
  body('deliveryPointIds').isArray({ min: 1 }).withMessage('At least one delivery point is required'),
  validate
], async (req, res, next) => {
  try {
    const { vehicleId, deliveryPointIds, startTime } = req.body;

    // Get vehicle
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Get delivery points
    const deliveryPoints = await DeliveryPoint.find({ _id: { $in: deliveryPointIds } });
    if (deliveryPoints.length !== deliveryPointIds.length) {
      return res.status(400).json({ success: false, error: 'Some delivery points not found' });
    }

    // Create stops in provided order (can be optimized later)
    const stops = deliveryPointIds.map((dpId, index) => ({
      deliveryPoint: dpId,
      sequence: index + 1,
      status: 'pending'
    }));

    // Create route
    const route = await Route.create({
      routeId: `RT-${uuidv4().substring(0, 8).toUpperCase()}`,
      vehicle: vehicleId,
      stops,
      startLocation: {
        type: 'Point',
        coordinates: vehicle.depot.coordinates,
        address: vehicle.depot.address
      },
      endLocation: {
        type: 'Point',
        coordinates: vehicle.depot.coordinates,
        address: vehicle.depot.address
      },
      estimatedStartTime: startTime || new Date(),
      status: 'planned',
      metadata: {
        createdBy: 'api'
      }
    });

    // Update vehicle status
    vehicle.status = 'on_route';
    vehicle.currentRoute = route._id;
    await vehicle.save();

    // Update delivery points status
    await DeliveryPoint.updateMany(
      { _id: { $in: deliveryPointIds } },
      { status: 'assigned' }
    );

    const populatedRoute = await Route.findById(route._id)
      .populate('vehicle', 'vehicleId name type')
      .populate('stops.deliveryPoint', 'name address location');

    res.status(201).json({ success: true, data: populatedRoute });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/routes/:id/start
// @desc    Start a route
router.put('/:id/start', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    route.status = 'in_progress';
    route.actualStartTime = new Date();
    if (route.stops.length > 0) {
      route.stops[0].status = 'en_route';
    }
    await route.save();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`route:${route._id}`).emit('route:started', { routeId: route._id });
    io.emit('route:statusUpdate', { routeId: route._id, status: 'in_progress' });

    res.json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/routes/:id/stops/:sequence/complete
// @desc    Complete a stop
router.put('/:id/stops/:sequence/complete', async (req, res, next) => {
  try {
    const { id, sequence } = req.params;
    const route = await Route.findById(id).populate('stops.deliveryPoint');
    
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    const stop = route.stops.find(s => s.sequence === parseInt(sequence));
    if (!stop) {
      return res.status(404).json({ success: false, error: 'Stop not found' });
    }

    stop.status = 'completed';
    stop.actualDeparture = new Date();

    // Update delivery point status
    await DeliveryPoint.findByIdAndUpdate(stop.deliveryPoint._id, { status: 'delivered' });

    // Update next stop
    const nextStop = route.stops.find(s => s.sequence === parseInt(sequence) + 1);
    if (nextStop) {
      nextStop.status = 'en_route';
    } else {
      // Route completed
      route.status = 'completed';
      route.actualEndTime = new Date();
      
      // Update vehicle status
      await Vehicle.findByIdAndUpdate(route.vehicle, {
        status: 'available',
        currentRoute: null,
        $inc: { completedDeliveries: route.stops.length }
      });
    }

    await route.save();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`route:${route._id}`).emit('route:stopCompleted', {
      routeId: route._id,
      sequence: parseInt(sequence),
      nextStop: nextStop ? nextStop.sequence : null
    });

    res.json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/routes/:id/incident
// @desc    Report an incident on a route
router.post('/:id/incident', [
  body('type').isIn(['accident', 'road_closure', 'weather', 'vehicle_issue', 'customer_request', 'other']),
  body('description').notEmpty(),
  validate
], async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    const incident = {
      type: req.body.type,
      description: req.body.description,
      location: req.body.location,
      impact: req.body.impact || 'medium',
      reportedAt: new Date()
    };

    route.incidents.push(incident);
    await route.save();

    // Emit real-time update for re-routing
    const io = req.app.get('io');
    io.to(`route:${route._id}`).emit('route:incident', {
      routeId: route._id,
      incident
    });
    io.emit('incident:reported', { routeId: route._id, incident });

    res.json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/routes/:id/reroute
// @desc    Update route with new optimized stops
router.put('/:id/reroute', [
  body('newStops').isArray({ min: 1 }),
  validate
], async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    // Save reroute history
    const rerouteEntry = {
      reason: req.body.reason || 'Manual reroute',
      previousStops: [...route.stops],
      newStops: req.body.newStops,
      distanceSaved: req.body.distanceSaved,
      timeSaved: req.body.timeSaved
    };
    route.rerouteHistory.push(rerouteEntry);

    // Update stops
    route.stops = req.body.newStops;
    if (req.body.routeGeometry) {
      route.routeGeometry.coordinates = req.body.routeGeometry;
    }
    if (req.body.totalDistance) {
      route.totalDistance = req.body.totalDistance;
    }
    if (req.body.totalDuration) {
      route.totalDuration = req.body.totalDuration;
    }

    await route.save();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`route:${route._id}`).emit('route:rerouted', {
      routeId: route._id,
      newStops: route.stops
    });

    const populatedRoute = await Route.findById(route._id)
      .populate('vehicle')
      .populate('stops.deliveryPoint');

    res.json({ success: true, data: populatedRoute });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/routes/:id/cancel
// @desc    Cancel a route
router.put('/:id/cancel', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    route.status = 'cancelled';
    await route.save();

    // Update vehicle status
    await Vehicle.findByIdAndUpdate(route.vehicle, {
      status: 'available',
      currentRoute: null
    });

    // Reset delivery points status
    const pendingStops = route.stops.filter(s => s.status !== 'completed');
    await DeliveryPoint.updateMany(
      { _id: { $in: pendingStops.map(s => s.deliveryPoint) } },
      { status: 'pending' }
    );

    const io = req.app.get('io');
    io.emit('route:cancelled', { routeId: route._id });

    res.json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/routes/:id
// @desc    Delete a route
router.delete('/:id', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    if (route.status === 'in_progress') {
      return res.status(400).json({ success: false, error: 'Cannot delete an active route' });
    }

    await Route.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/routes/:id/start-tracking
 * @desc    Start real-time GPS tracking for a route
 * @access  Public
 */
router.post('/:id/start-tracking', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('vehicle')
      .populate('stops.deliveryPoint');

    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    if (!route.routeGeometry || route.routeGeometry.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Route geometry not available. Please optimize route first.' 
      });
    }

    // Get vehicle tracker from app
    const vehicleTracker = req.app.get('vehicleTracker');
    
    // Start tracking with default speed of 40 km/h or custom speed
    const speed = req.body.speed || 40;
    vehicleTracker.startTracking(
      route.vehicle._id.toString(),
      route.routeGeometry,
      speed
    );

    // Update route status
    route.status = 'in_progress';
    route.startTime = route.startTime || new Date();
    await route.save();

    res.json({
      success: true,
      message: '🚀 Vehicle tracking started',
      data: {
        vehicleId: route.vehicle._id,
        vehicleName: route.vehicle.name,
        routeId: route._id,
        totalDistance: route.totalDistance,
        estimatedDuration: route.totalDuration,
        speed: speed,
        stops: route.stops.length
      }
    });
  } catch (error) {
    console.error('Error starting tracking:', error);
    next(error);
  }
});

/**
 * @route   POST /api/routes/:id/stop-tracking
 * @desc    Stop real-time GPS tracking for a route
 * @access  Public
 */
router.post('/:id/stop-tracking', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id).populate('vehicle');

    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    const vehicleTracker = req.app.get('vehicleTracker');
    vehicleTracker.stopTracking(route.vehicle._id.toString());

    res.json({
      success: true,
      message: '🛑 Vehicle tracking stopped',
      data: {
        vehicleId: route.vehicle._id,
        routeId: route._id
      }
    });
  } catch (error) {
    console.error('Error stopping tracking:', error);
    next(error);
  }
});

/**
 * @route   GET /api/routes/tracking/active
 * @desc    Get all actively tracked vehicles
 * @access  Public
 */
router.get('/tracking/active', (req, res, next) => {
  try {
    const vehicleTracker = req.app.get('vehicleTracker');
    const activeVehicles = vehicleTracker.getActiveVehicles();

    res.json({
      success: true,
      count: activeVehicles.length,
      data: activeVehicles
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/routes/:id/update-speed
 * @desc    Update vehicle speed during tracking (simulate traffic)
 * @access  Public
 */
router.put('/:id/update-speed', async (req, res, next) => {
  try {
    const { speed } = req.body;
    
    if (!speed || speed < 0 || speed > 120) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid speed. Must be between 0-120 km/h' 
      });
    }

    const route = await Route.findById(req.params.id).populate('vehicle');

    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    const vehicleTracker = req.app.get('vehicleTracker');
    vehicleTracker.updateSpeed(route.vehicle._id.toString(), speed);

    let speedStatus = '🚗 Normal';
    if (speed < 30) speedStatus = '🐌 Heavy Traffic';
    else if (speed > 50) speedStatus = '🏎️ Clear Roads';

    res.json({
      success: true,
      message: `${speedStatus} - Speed updated to ${speed} km/h`,
      data: {
        vehicleId: route.vehicle._id,
        newSpeed: speed
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
