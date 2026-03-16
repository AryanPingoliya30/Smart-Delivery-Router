const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const DeliveryPoint = require('../models/DeliveryPoint');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// @route   GET /api/delivery-points
// @desc    Get all delivery points with filtering
router.get('/', async (req, res, next) => {
  try {
    const {
      status,
      priority,
      limit = 100,
      page = 1,
      near,
      maxDistance = 10000
    } = req.query;

    let query = { isActive: true };
    
    if (status) query.status = status;
    if (priority) query.priority = priority;

    let deliveryPointsQuery;

    if (near) {
      const [lng, lat] = near.split(',').map(Number);
      deliveryPointsQuery = DeliveryPoint.find({
        ...query,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: parseInt(maxDistance)
          }
        }
      });
    } else {
      deliveryPointsQuery = DeliveryPoint.find(query);
    }

    const total = await DeliveryPoint.countDocuments(query);
    const deliveryPoints = await deliveryPointsQuery
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: deliveryPoints.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: deliveryPoints
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/delivery-points/:id
// @desc    Get single delivery point
router.get('/:id', async (req, res, next) => {
  try {
    const deliveryPoint = await DeliveryPoint.findById(req.params.id);
    if (!deliveryPoint) {
      return res.status(404).json({ success: false, error: 'Delivery point not found' });
    }
    res.json({ success: true, data: deliveryPoint });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/delivery-points
// @desc    Create new delivery point
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('location.coordinates').isArray({ min: 2, max: 2 }).withMessage('Coordinates must be [lng, lat]'),
  validate
], async (req, res, next) => {
  try {
    // Handle address - can be string or object
    let addressData = req.body.address;
    if (typeof addressData === 'string') {
      // Convert string to address object
      addressData = {
        street: addressData,
        city: 'Unknown',
        state: '',
        postalCode: '',
        country: 'India'
      };
    }
    
    const deliveryPointData = {
      ...req.body,
      address: addressData
    };
    
    const deliveryPoint = await DeliveryPoint.create(deliveryPointData);
    res.status(201).json({ success: true, data: deliveryPoint });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/delivery-points/bulk
// @desc    Create multiple delivery points
router.post('/bulk', [
  body('deliveryPoints').isArray({ min: 1 }).withMessage('Delivery points array is required'),
  validate
], async (req, res, next) => {
  try {
    const deliveryPoints = await DeliveryPoint.insertMany(req.body.deliveryPoints);
    res.status(201).json({ success: true, count: deliveryPoints.length, data: deliveryPoints });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/delivery-points/:id
// @desc    Update delivery point
router.put('/:id', async (req, res, next) => {
  try {
    const deliveryPoint = await DeliveryPoint.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!deliveryPoint) {
      return res.status(404).json({ success: false, error: 'Delivery point not found' });
    }
    res.json({ success: true, data: deliveryPoint });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/delivery-points/:id/status
// @desc    Update delivery point status
router.put('/:id/status', [
  body('status').isIn(['pending', 'assigned', 'in_transit', 'delivered', 'failed']),
  validate
], async (req, res, next) => {
  try {
    const deliveryPoint = await DeliveryPoint.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!deliveryPoint) {
      return res.status(404).json({ success: false, error: 'Delivery point not found' });
    }
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.emit('deliveryPoint:statusUpdate', { id: deliveryPoint._id, status: deliveryPoint.status });
    
    res.json({ success: true, data: deliveryPoint });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/delivery-points/:id
// @desc    Delete delivery point (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const deliveryPoint = await DeliveryPoint.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!deliveryPoint) {
      return res.status(404).json({ success: false, error: 'Delivery point not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/delivery-points/nearby/:lng/:lat
// @desc    Find delivery points near a location
router.get('/nearby/:lng/:lat', async (req, res, next) => {
  try {
    const { lng, lat } = req.params;
    const { maxDistance = 10000 } = req.query;
    
    const deliveryPoints = await DeliveryPoint.findNearby(
      [parseFloat(lng), parseFloat(lat)],
      parseInt(maxDistance)
    );
    
    res.json({ success: true, count: deliveryPoints.length, data: deliveryPoints });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
