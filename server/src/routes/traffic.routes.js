const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const TrafficService = require('../services/TrafficService');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// @route   GET /api/traffic/current
// @desc    Get current traffic conditions for an area
router.get('/current', async (req, res, next) => {
  try {
    const { lat, lng, radius = 5000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        error: 'Latitude and longitude are required' 
      });
    }

    const trafficService = new TrafficService();
    const trafficData = await trafficService.getCurrentTraffic(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius)
    );

    res.json({ success: true, data: trafficData });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/traffic/predict
// @desc    Predict traffic using AI (supports city context like Jaipur, India)
router.post('/predict', [
  body('coordinates').isArray({ min: 1 }).withMessage('Coordinates array is required'),
  body('dateTime').optional().isISO8601(),
  body('city').optional().isString(),
  validate
], async (req, res, next) => {
  try {
    const { coordinates, dateTime, historicalData, city } = req.body;

    const trafficService = new TrafficService();
    const predictions = await trafficService.predictTraffic(
      coordinates,
      dateTime ? new Date(dateTime) : new Date(),
      historicalData,
      city || 'Jaipur' // Default to Jaipur, India
    );

    res.json({ success: true, data: predictions });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/traffic/analyze-route
// @desc    Analyze traffic along a route
router.post('/analyze-route', [
  body('routeCoordinates').isArray({ min: 2 }).withMessage('Route coordinates are required'),
  validate
], async (req, res, next) => {
  try {
    const { routeCoordinates, departureTime } = req.body;

    const trafficService = new TrafficService();
    const analysis = await trafficService.analyzeRouteTraffic(
      routeCoordinates,
      departureTime ? new Date(departureTime) : new Date()
    );

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/traffic/incidents
// @desc    Get traffic incidents in an area
router.get('/incidents', async (req, res, next) => {
  try {
    const { lat, lng, radius = 10000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        error: 'Latitude and longitude are required' 
      });
    }

    const trafficService = new TrafficService();
    const incidents = await trafficService.getIncidents(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius)
    );

    res.json({ success: true, data: incidents });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/traffic/optimal-departure
// @desc    Get optimal departure time based on traffic predictions
router.post('/optimal-departure', [
  body('origin').isObject().withMessage('Origin coordinates required'),
  body('destination').isObject().withMessage('Destination coordinates required'),
  validate
], async (req, res, next) => {
  try {
    const { origin, destination, preferredTimeRange } = req.body;

    const trafficService = new TrafficService();
    const optimalTime = await trafficService.getOptimalDepartureTime(
      origin,
      destination,
      preferredTimeRange
    );

    res.json({ success: true, data: optimalTime });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/traffic/analyze-incident
// @desc    AI-powered incident impact analysis and re-routing decision
router.post('/analyze-incident', [
  body('currentRoute').isObject().withMessage('Current route is required'),
  body('incident').isObject().withMessage('Incident data is required'),
  body('incident.type').notEmpty().withMessage('Incident type is required'),
  body('incident.severity').notEmpty().withMessage('Incident severity is required'),
  body('incident.location').isObject().withMessage('Incident location is required'),
  validate
], async (req, res, next) => {
  try {
    const { currentRoute, incident, vehicleLocation, city } = req.body;

    const trafficService = new TrafficService();
    const analysis = await trafficService.analyzeIncidentImpact(
      currentRoute,
      incident,
      vehicleLocation || null,
      city || 'Jaipur'
    );

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
