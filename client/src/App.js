import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Map from './components/Map';
import DeliveryPanel from './components/DeliveryPanel';
import VehiclePanel from './components/VehiclePanel';
import RoutePanel from './components/RoutePanel';
import TrafficPanel from './components/TrafficPanel';
import useSocket from './hooks/useSocket';
import useStore from './store/useStore';

function App() {
  const { isConnected } = useSocket();
  const { notifications, removeNotification } = useStore();
  const [activePanel, setActivePanel] = useState('deliveries');

  useEffect(() => {
    // Auto-remove notifications after 5 seconds
    if (notifications.length > 0) {
      const timer = setTimeout(() => {
        removeNotification(notifications[0]?.id);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications, removeNotification]);

  const renderPanel = () => {
    switch (activePanel) {
      case 'deliveries':
        return <DeliveryPanel />;
      case 'vehicles':
        return <VehiclePanel />;
      case 'routes':
        return <RoutePanel />;
      case 'traffic':
        return <TrafficPanel />;
      default:
        return <DeliveryPanel />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header - Fixed: changed 'connected' to 'isConnected' */}
      <Header connected={isConnected} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar activePanel={activePanel} setActivePanel={setActivePanel} />

        {/* Panel */}
        <div className="w-80 bg-slate-900 border-r border-slate-700 overflow-y-auto">
          {renderPanel()}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <Map />
          
          {/* Notifications */}
          <div className="absolute top-4 right-4 z-10 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`px-4 py-3 rounded-lg shadow-lg max-w-sm animate-slide-in ${
                  notification.type === 'error'
                    ? 'bg-red-500 text-white'
                    : notification.type === 'warning'
                    ? 'bg-yellow-500 text-white'
                    : notification.type === 'success'
                    ? 'bg-green-500 text-white'
                    : 'bg-blue-500 text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{notification.message}</span>
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="ml-3 text-white hover:text-gray-200"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;