const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Vehicle = require('../models/Vehicle');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// @route   GET /api/vehicles
// @desc    Get all vehicles
router.get('/', async (req, res, next) => {
  try {
    const { status, type, limit = 50, page = 1 } = req.query;
    
    let query = { isActive: true };
    if (status) query.status = status;
    if (type) query.type = type;

    const total = await Vehicle.countDocuments(query);
    const vehicles = await Vehicle.find(query)
      .populate('currentRoute', 'routeId status')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: vehicles.length,
      total,
      data: vehicles
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/vehicles/available
// @desc    Get available vehicles
router.get('/available', async (req, res, next) => {
  try {
    const { near, maxDistance = 50000 } = req.query;

    let vehicles;
    if (near) {
      const [lng, lat] = near.split(',').map(Number);
      vehicles = await Vehicle.findAvailableNear([lng, lat], parseInt(maxDistance));
    } else {
      vehicles = await Vehicle.find({ status: 'available', isActive: true });
    }

    res.json({ success: true, count: vehicles.length, data: vehicles });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/vehicles/:id
// @desc    Get single vehicle
router.get('/:id', async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).populate('currentRoute');
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    res.json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/vehicles
// @desc    Create new vehicle
router.post('/', [
  body('vehicleId').trim().notEmpty().withMessage('Vehicle ID is required'),
  body('name').trim().notEmpty().withMessage('Vehicle name is required'),
  body('capacity.maxWeight').isNumeric().withMessage('Max weight is required'),
  body('depot.coordinates').isArray({ min: 2, max: 2 }).withMessage('Depot coordinates required'),
  validate
], async (req, res, next) => {
  try {
    // Set current location to depot by default
    if (!req.body.currentLocation) {
      req.body.currentLocation = {
        type: 'Point',
        coordinates: req.body.depot.coordinates
      };
    }
    
    const vehicle = await Vehicle.create(req.body);
    res.status(201).json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/vehicles/:id
// @desc    Update vehicle
router.put('/:id', async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    res.json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/vehicles/:id/location
// @desc    Update vehicle location
router.put('/:id/location', [
  body('coordinates').isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [lng, lat]'),
  validate
], async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    
    await vehicle.updateLocation(req.body.coordinates);
    
    // Emit socket event for real-time tracking
    const io = req.app.get('io');
    io.emit('vehicle:locationUpdate', {
      vehicleId: vehicle._id,
      coordinates: req.body.coordinates,
      timestamp: new Date()
    });
    
    res.json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/vehicles/:id/status
// @desc    Update vehicle status
router.put('/:id/status', [
  body('status').isIn(['available', 'on_route', 'maintenance', 'offline']),
  validate
], async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    
    const io = req.app.get('io');
    io.emit('vehicle:statusUpdate', { vehicleId: vehicle._id, status: vehicle.status });
    
    res.json({ success: true, data: vehicle });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/vehicles/:id
// @desc    Delete vehicle (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
