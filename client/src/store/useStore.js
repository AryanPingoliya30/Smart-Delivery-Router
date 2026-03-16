import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Connection state
  connected: false,
  setConnected: (connected) => set({ connected }),

  // Delivery points
  deliveryPoints: [],
  setDeliveryPoints: (points) => set({ deliveryPoints: points }),
  addDeliveryPoint: (point) => set((state) => ({ 
    deliveryPoints: [...state.deliveryPoints, point] 
  })),
  removeDeliveryPoint: (id) => set((state) => ({
    deliveryPoints: state.deliveryPoints.filter((p) => p._id !== id)
  })),

  // Vehicles
  vehicles: [],
  setVehicles: (vehicles) => set({ vehicles }),
  addVehicle: (vehicle) => set((state) => ({ 
    vehicles: [...state.vehicles, vehicle] 
  })),
  updateVehicleLocation: (vehicleId, location) => set((state) => ({
    vehicles: state.vehicles.map((v) =>
      v._id === vehicleId ? { ...v, currentLocation: location } : v
    )
  })),

  // Routes
  routes: [],
  setRoutes: (routes) => set({ routes }),
  optimizedRoute: null,
  setOptimizedRoute: (route) => set({ optimizedRoute: route }),
  
  // Real route stats from Mapbox
  realRouteStats: null,
  setRealRouteStats: (stats) => set({ realRouteStats: stats }),

  // Selected location from map click
  selectedLocation: null,
  setSelectedLocation: (location) => set({ selectedLocation: location }),

  // Traffic
  showTraffic: false,
  setShowTraffic: (show) => set({ showTraffic: show }),
  toggleTrafficLayer: () => set((state) => ({ showTraffic: !state.showTraffic })),
  trafficData: null,
  setTrafficData: (data) => set({ trafficData: data }),

  // Notifications
  notifications: [],
  addNotification: (notification) => set((state) => ({
    notifications: [
      ...state.notifications,
      { ...notification, id: Date.now() }
    ]
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((n) => n.id !== id)
  })),

  // Active panel
  activePanel: 'deliveries',
  setActivePanel: (panel) => set({ activePanel: panel }),
}));

export default useStore;
