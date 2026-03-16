require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const VehicleTracker = require('./services/VehicleTracker');

const app = express();
const server = http.createServer(app);

// Socket.io setup for real-time updates
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Initialize Vehicle Tracker
const vehicleTracker = new VehicleTracker(io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Make io and vehicleTracker accessible to routes
app.set('io', io);
app.set('vehicleTracker', vehicleTracker);

// Connect to MongoDB
connectDB();

// API Routes
app.use('/api', routes);

// Update CORS for production
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
};

// Add health check endpoint (important for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);
  
  socket.on('subscribe:route', (routeId) => {
    socket.join(`route:${routeId}`);
    console.log(`Socket ${socket.id} subscribed to route:${routeId}`);
  });
  
  socket.on('unsubscribe:route', (routeId) => {
    socket.leave(`route:${routeId}`);
  });
  
  // Listen for manual location updates (if using real GPS)
  socket.on('vehicle-location-manual', (data) => {
    io.emit('vehicle-location-update', data);
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io enabled for real-time updates`);
  console.log(`🗺️  Mapbox token: ${process.env.MAPBOX_ACCESS_TOKEN ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🤖 Gemini API: ${process.env.GEMINI_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🔗 API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, stopping all vehicle tracking...');
  vehicleTracker.stopAll();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, stopping all vehicle tracking...');
  vehicleTracker.stopAll();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, io };
