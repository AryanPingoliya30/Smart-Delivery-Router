const express = require('express');
const router = express.Router();

const deliveryPointRoutes = require('./deliveryPoint.routes');
const vehicleRoutes = require('./vehicle.routes');
const routeRoutes = require('./route.routes');
const optimizationRoutes = require('./optimization.routes');
const trafficRoutes = require('./traffic.routes');

// Mount routes
router.use('/delivery-points', deliveryPointRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/routes', routeRoutes);
router.use('/optimize', optimizationRoutes);
router.use('/traffic', trafficRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'Smart Delivery Router API',
    version: '1.0.0',
    endpoints: {
      deliveryPoints: '/api/delivery-points',
      vehicles: '/api/vehicles',
      routes: '/api/routes',
      optimization: '/api/optimize',
      traffic: '/api/traffic'
    }
  });
});

module.exports = router;
