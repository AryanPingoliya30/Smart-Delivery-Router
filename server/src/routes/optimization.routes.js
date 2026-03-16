const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const RouteOptimizer = require('../services/RouteOptimizer');
const DeliveryPoint = require('../models/DeliveryPoint');
const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const { v4: uuidv4 } = require('uuid');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// @route   POST /api/optimize/route
// @desc    Optimize a route for a vehicle
router.post('/route', [
  body('vehicleId').notEmpty().withMessage('Vehicle ID is required'),
  body('deliveryPointIds').isArray({ min: 1 }).withMessage('At least one delivery point is required'),
  validate
], async (req, res, next) => {
  try {
    const { vehicleId, deliveryPointIds, options = {} } = req.body;

    // Get vehicle
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    // Get delivery points
    const deliveryPoints = await DeliveryPoint.find({ _id: { $in: deliveryPointIds } });
    if (deliveryPoints.length === 0) {
      return res.status(400).json({ success: false, error: 'No delivery points found' });
    }

    // Initialize optimizer
    const optimizer = new RouteOptimizer();

    // Use vehicle's current location as start point (driver's actual position)
    const startLocation = vehicle.currentLocation?.coordinates || null;
    
    // Optimize route starting from driver's current location
    const optimizedResult = await optimizer.optimizeRoute(
      vehicle,
      deliveryPoints,
      {
        returnToDepot: options.returnToDepot !== false,
        considerTraffic: options.considerTraffic !== false,
        prioritizeUrgent: options.prioritizeUrgent !== false,
        startLocation: startLocation, // Start from driver's current GPS position
        maxDrivingTime: options.maxDrivingTime || 8 * 60 * 60, // 8 hours in seconds
        ...options
      }
    );

    res.json({
      success: true,
      data: {
        optimizedOrder: optimizedResult.optimizedOrder,
        totalDistance: optimizedResult.totalDistance,
        totalDuration: optimizedResult.totalDuration,
        routeGeometry: optimizedResult.routeGeometry,
        estimatedTimes: optimizedResult.estimatedTimes,
        optimizationScore: optimizedResult.score,
        savings: optimizedResult.savings
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/optimize/multi-vehicle
// @desc    Optimize routes for multiple vehicles (VRP)
router.post('/multi-vehicle', [
  body('vehicleIds').isArray({ min: 1 }).withMessage('At least one vehicle is required'),
  body('deliveryPointIds').isArray({ min: 1 }).withMessage('At least one delivery point is required'),
  validate
], async (req, res, next) => {
  try {
    const { vehicleIds, deliveryPointIds, options = {} } = req.body;

    // Get vehicles
    const vehicles = await Vehicle.find({ _id: { $in: vehicleIds }, status: 'available' });
    if (vehicles.length === 0) {
      return res.status(400).json({ success: false, error: 'No available vehicles found' });
    }

    // Get delivery points
    const deliveryPoints = await DeliveryPoint.find({ 
      _id: { $in: deliveryPointIds },
      status: 'pending'
    });
    if (deliveryPoints.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending delivery points found' });
    }

    const optimizer = new RouteOptimizer();
    const vrpResult = await optimizer.solveVRP(vehicles, deliveryPoints, options);

    res.json({
      success: true,
      data: {
        assignments: vrpResult.assignments,
        totalDistance: vrpResult.totalDistance,
        totalDuration: vrpResult.totalDuration,
        unassigned: vrpResult.unassigned,
        optimizationScore: vrpResult.score
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/optimize/create-optimized-routes
// @desc    Create optimized routes and save to database
router.post('/create-optimized-routes', [
  body('vehicleIds').isArray({ min: 1 }),
  body('deliveryPointIds').isArray({ min: 1 }),
  validate
], async (req, res, next) => {
  try {
    const { vehicleIds, deliveryPointIds, options = {} } = req.body;

    const vehicles = await Vehicle.find({ _id: { $in: vehicleIds }, status: 'available' });
    const deliveryPoints = await DeliveryPoint.find({ 
      _id: { $in: deliveryPointIds },
      status: 'pending'
    });

    if (vehicles.length === 0 || deliveryPoints.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No available vehicles or pending delivery points' 
      });
    }

    const optimizer = new RouteOptimizer();
    const vrpResult = await optimizer.solveVRP(vehicles, deliveryPoints, options);

    const createdRoutes = [];

    // Create routes for each vehicle assignment
    for (const assignment of vrpResult.assignments) {
      if (assignment.deliveryPoints.length === 0) continue;

      const vehicle = vehicles.find(v => v._id.toString() === assignment.vehicleId);
      
      const stops = assignment.deliveryPoints.map((dp, index) => ({
        deliveryPoint: dp._id,
        sequence: index + 1,
        status: 'pending',
        estimatedArrival: dp.estimatedArrival,
        distanceFromPrevious: dp.distanceFromPrevious,
        durationFromPrevious: dp.durationFromPrevious
      }));

      const route = await Route.create({
        routeId: `RT-${uuidv4().substring(0, 8).toUpperCase()}`,
        vehicle: vehicle._id,
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
        routeGeometry: {
          type: 'LineString',
          coordinates: assignment.routeGeometry || []
        },
        totalDistance: assignment.totalDistance,
        totalDuration: assignment.totalDuration,
        estimatedStartTime: new Date(),
        estimatedEndTime: new Date(Date.now() + assignment.totalDuration * 1000),
        optimizationScore: assignment.score || vrpResult.score,
        status: 'planned',
        metadata: {
          createdBy: 'optimizer',
          optimizationAlgorithm: 'or-tools-vrp'
        }
      });

      // Update vehicle
      vehicle.status = 'on_route';
      vehicle.currentRoute = route._id;
      await vehicle.save();

      // Update delivery points
      await DeliveryPoint.updateMany(
        { _id: { $in: assignment.deliveryPoints.map(dp => dp._id) } },
        { status: 'assigned' }
      );

      const populatedRoute = await Route.findById(route._id)
        .populate('vehicle', 'vehicleId name type')
        .populate('stops.deliveryPoint', 'name address location');

      createdRoutes.push(populatedRoute);
    }

    res.status(201).json({
      success: true,
      data: {
        routes: createdRoutes,
        totalRoutes: createdRoutes.length,
        unassignedDeliveries: vrpResult.unassigned
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/optimize/reroute/:routeId
// @desc    Re-optimize an existing route (for incidents/traffic)
router.post('/reroute/:routeId', async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.routeId)
      .populate('vehicle')
      .populate('stops.deliveryPoint');

    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    // Get pending stops
    const pendingStops = route.stops.filter(s => s.status === 'pending' || s.status === 'en_route');
    if (pendingStops.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending stops to reroute' });
    }

    const deliveryPoints = pendingStops.map(s => s.deliveryPoint);
    const currentLocation = route.vehicle.currentLocation.coordinates;

    const optimizer = new RouteOptimizer();
    const optimizedResult = await optimizer.optimizeRoute(
      route.vehicle,
      deliveryPoints,
      {
        startLocation: currentLocation,
        considerTraffic: true,
        avoidIncidents: route.incidents.filter(i => !i.resolvedAt),
        ...req.body.options
      }
    );

    // Build new stops array maintaining completed stops
    const completedStops = route.stops.filter(s => s.status === 'completed');
    const newStops = optimizedResult.optimizedOrder.map((dp, index) => ({
      deliveryPoint: dp._id,
      sequence: completedStops.length + index + 1,
      status: index === 0 ? 'en_route' : 'pending',
      estimatedArrival: dp.estimatedArrival,
      distanceFromPrevious: dp.distanceFromPrevious,
      durationFromPrevious: dp.durationFromPrevious
    }));

    // Save reroute history
    route.rerouteHistory.push({
      reason: req.body.reason || 'Dynamic reroute',
      previousStops: [...route.stops],
      newStops: [...completedStops, ...newStops],
      distanceSaved: optimizedResult.savings?.distance || 0,
      timeSaved: optimizedResult.savings?.time || 0
    });

    // Update route
    route.stops = [...completedStops, ...newStops];
    route.routeGeometry.coordinates = optimizedResult.routeGeometry;
    route.totalDistance = route.stops.reduce((sum, s) => sum + (s.distanceFromPrevious || 0), 0);
    route.totalDuration = route.stops.reduce((sum, s) => sum + (s.durationFromPrevious || 0), 0);

    await route.save();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`route:${route._id}`).emit('route:rerouted', {
      routeId: route._id,
      newStops: route.stops,
      routeGeometry: route.routeGeometry
    });

    res.json({
      success: true,
      data: {
        route,
        optimizationDetails: optimizedResult
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
