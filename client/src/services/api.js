import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Delivery Points API
export const deliveryPointsApi = {
  getAll: (params = {}) => api.get('/delivery-points', { params }),
  getById: (id) => api.get(`/delivery-points/${id}`),
  create: (data) => api.post('/delivery-points', data),
  createBulk: (deliveryPoints) => api.post('/delivery-points/bulk', { deliveryPoints }),
  update: (id, data) => api.put(`/delivery-points/${id}`, data),
  updateStatus: (id, status) => api.put(`/delivery-points/${id}/status`, { status }),
  delete: (id) => api.delete(`/delivery-points/${id}`),
  getNearby: (lng, lat, maxDistance) => 
    api.get(`/delivery-points/nearby/${lng}/${lat}`, { params: { maxDistance } }),
};

// Vehicles API
export const vehiclesApi = {
  getAll: (params = {}) => api.get('/vehicles', { params }),
  getAvailable: (params = {}) => api.get('/vehicles/available', { params }),
  getById: (id) => api.get(`/vehicles/${id}`),
  create: (data) => api.post('/vehicles', data),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  updateLocation: (id, coordinates) => api.put(`/vehicles/${id}/location`, { coordinates }),
  updateStatus: (id, status) => api.put(`/vehicles/${id}/status`, { status }),
  delete: (id) => api.delete(`/vehicles/${id}`),
};

// Routes API
export const routesApi = {
  getAll: (params = {}) => api.get('/routes', { params }),
  getActive: () => api.get('/routes/active'),
  getById: (id) => api.get(`/routes/${id}`),
  create: (data) => api.post('/routes', data),
  start: (id) => api.put(`/routes/${id}/start`),
  completeStop: (id, sequence) => api.put(`/routes/${id}/stops/${sequence}/complete`),
  reportIncident: (id, incident) => api.post(`/routes/${id}/incident`, incident),
  reroute: (id, data) => api.put(`/routes/${id}/reroute`, data),
  cancel: (id) => api.put(`/routes/${id}/cancel`),
  delete: (id) => api.delete(`/routes/${id}`),
};

// Optimization API
export const optimizationApi = {
  optimizeRoute: (vehicleId, deliveryPointIds, options = {}) => 
    api.post('/optimize/route', { vehicleId, deliveryPointIds, options }),
  optimizeMultiVehicle: (vehicleIds, deliveryPointIds, options = {}) =>
    api.post('/optimize/multi-vehicle', { vehicleIds, deliveryPointIds, options }),
  createOptimizedRoutes: (vehicleIds, deliveryPointIds, options = {}) =>
    api.post('/optimize/create-optimized-routes', { vehicleIds, deliveryPointIds, options }),
  rerouteExisting: (routeId, options = {}) =>
    api.post(`/optimize/reroute/${routeId}`, options),
};

// Traffic API
export const trafficApi = {
  getCurrent: (lat, lng, radius) => 
    api.get('/traffic/current', { params: { lat, lng, radius } }),
  predict: (coordinates, dateTime, historicalData) =>
    api.post('/traffic/predict', { coordinates, dateTime, historicalData }),
  analyzeRoute: (routeCoordinates, departureTime) =>
    api.post('/traffic/analyze-route', { routeCoordinates, departureTime }),
  getIncidents: (lat, lng, radius) =>
    api.get('/traffic/incidents', { params: { lat, lng, radius } }),
  getOptimalDeparture: (origin, destination, preferredTimeRange) =>
    api.post('/traffic/optimal-departure', { origin, destination, preferredTimeRange }),
};

export default api;
