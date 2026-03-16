import React from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import useStore from '../store/useStore';

const Header = () => {
  const { connected, toggleTrafficLayer, showTraffic } = useStore();

  return (
    <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">Smart Delivery Router</h1>
        <span className="text-xs text-slate-400">AI-Powered Route Optimization</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Traffic toggle */}
        <button
          onClick={toggleTrafficLayer}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            showTraffic 
              ? 'bg-green-600 text-white' 
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {showTraffic ? 'Traffic On' : 'Traffic Off'}
        </button>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-500">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-500">Disconnected</span>
            </>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={() => window.location.reload()}
          className="p-2 rounded hover:bg-slate-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </header>
  );
};

export default Header;
