import React from 'react';
import { 
  MapPin, 
  Truck, 
  Route, 
  Activity, 
  Settings,
  Zap
} from 'lucide-react';
import clsx from 'clsx';

const Sidebar = ({ activePanel, setActivePanel }) => {
  const menuItems = [
    { id: 'deliveries', icon: MapPin, label: 'Deliveries' },
    { id: 'vehicles', icon: Truck, label: 'Vehicles' },
    { id: 'routes', icon: Route, label: 'Routes' },
    { id: 'traffic', icon: Activity, label: 'Traffic' },
  ];

  return (
    <div className="w-16 bg-slate-800 flex flex-col items-center py-4 border-r border-slate-700">
      {/* Logo */}
      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-8">
        <Zap className="w-6 h-6 text-white" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={clsx(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                activePanel === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              )}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </nav>

      {/* Settings */}
      <button
        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
        title="Settings"
      >
        <Settings className="w-5 h-5" />
      </button>
    </div>
  );
};

export default Sidebar;
