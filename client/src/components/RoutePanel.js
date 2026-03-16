import React, { useState } from 'react';
import useStore from '../store/useStore';
import api from '../services/api';

const RoutePanel = () => {
  const deliveryPoints = useStore((state) => state.deliveryPoints) || [];
  const vehicles = useStore((state) => state.vehicles) || [];
  const setOptimizedRoute = useStore((state) => state.setOptimizedRoute);
  const realRouteStats = useStore((state) => state.realRouteStats);
  const optimizedRoute = useStore((state) => state.optimizedRoute);
  
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedDeliveries, setSelectedDeliveries] = useState([]);
  const [result, setResult] = useState(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentAnalysis, setIncidentAnalysis] = useState(null);
  const [analyzingIncident, setAnalyzingIncident] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    type: 'accident',
    severity: 'medium',
    lat: '',
    lng: '',
    description: ''
  });

  const getAddressString = (address) => {
    if (!address) return '';
    if (typeof address === 'string') return address;
    if (typeof address === 'object') {
      const parts = [address.street, address.city, address.state].filter(Boolean);
      return parts.join(', ');
    }
    return '';
  };

  const toggleDelivery = (id) => {
    setSelectedDeliveries(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedDeliveries.length === deliveryPoints.length) {
      setSelectedDeliveries([]);
    } else {
      setSelectedDeliveries(deliveryPoints.map(d => d._id));
    }
  };

  const optimizeRoute = async () => {
    if (!selectedVehicle) { alert('Select a vehicle'); return; }
    if (selectedDeliveries.length < 1) { alert('Select at least 1 delivery point'); return; }
    
    console.log('🚀 Optimizing route with:', {
      vehicle: selectedVehicle,
      deliveries: selectedDeliveries.length,
      deliveryIds: selectedDeliveries
    });
    
    try {
      setLoading(true);
      const response = await api.post('/optimize/route', {
        vehicleId: selectedVehicle,
        deliveryPointIds: selectedDeliveries
      });
      const data = response.data;
      console.log('✅ Optimization response:', data);
      if (data.success) {
        setResult(data.data);
        if (setOptimizedRoute) setOptimizedRoute(data.data);
        alert('Route optimized successfully!');
      } else {
        alert(data.message || 'Optimization failed');
      }
    } catch (error) {
      console.error('❌ Optimization error:', error);
      alert('Error optimizing route: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const analyzeIncident = async () => {
    if (!optimizedRoute || !optimizedRoute.routeGeometry) {
      alert('Please optimize a route first');
      return;
    }
    if (!incidentForm.lat || !incidentForm.lng) {
      alert('Please enter incident location (latitude and longitude)');
      return;
    }

    try {
      setAnalyzingIncident(true);
      const response = await api.post('/traffic/analyze-incident', {
        currentRoute: {
          coordinates: optimizedRoute.routeGeometry,
          routeGeometry: optimizedRoute.routeGeometry
        },
        incident: {
          type: incidentForm.type,
          severity: incidentForm.severity,
          location: {
            lat: parseFloat(incidentForm.lat),
            lng: parseFloat(incidentForm.lng)
          },
          description: incidentForm.description || undefined
        },
        vehicleLocation: optimizedRoute.routeGeometry[0] ? {
          lat: optimizedRoute.routeGeometry[0][1],
          lng: optimizedRoute.routeGeometry[0][0]
        } : null,
        city: 'Jaipur'
      });
      const data = response.data;
      if (data.success) {
        setIncidentAnalysis(data.data);
      } else {
        alert('Failed to analyze incident');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error analyzing incident');
    } finally {
      setAnalyzingIncident(false);
    }
  };

  const closeIncidentModal = () => {
    setShowIncidentModal(false);
    setIncidentAnalysis(null);
    setIncidentForm({
      type: 'accident',
      severity: 'medium',
      lat: '',
      lng: '',
      description: ''
    });
  };

  const useMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIncidentForm({
            ...incidentForm,
            lat: position.coords.latitude.toFixed(4),
            lng: position.coords.longitude.toFixed(4)
          });
        },
        (error) => {
          alert('Unable to get your location. Please enable location access or enter manually.');
          console.error('Geolocation error:', error);
        }
      );
    } else {
      alert('Geolocation is not supported by your browser');
    }
  };

  const useVehicleLocation = () => {
    const vehicle = vehicles.find(v => v._id === selectedVehicle);
    if (vehicle && vehicle.currentLocation && vehicle.currentLocation.coordinates) {
      const [lng, lat] = vehicle.currentLocation.coordinates;
      setIncidentForm({
        ...incidentForm,
        lat: lat.toFixed(4),
        lng: lng.toFixed(4)
      });
    } else if (optimizedRoute && optimizedRoute.routeGeometry && optimizedRoute.routeGeometry[0]) {
      // Use first point of optimized route (vehicle start position)
      const [lng, lat] = optimizedRoute.routeGeometry[0];
      setIncidentForm({
        ...incidentForm,
        lat: lat.toFixed(4),
        lng: lng.toFixed(4)
      });
    } else {
      alert('Vehicle location not available. Please use another method.');
    }
  };

  const useRoutePoint = () => {
    if (optimizedRoute && optimizedRoute.routeGeometry && optimizedRoute.routeGeometry.length > 0) {
      // Use middle point of the route as default
      const midIndex = Math.floor(optimizedRoute.routeGeometry.length / 2);
      const [lng, lat] = optimizedRoute.routeGeometry[midIndex];
      setIncidentForm({
        ...incidentForm,
        lat: lat.toFixed(4),
        lng: lng.toFixed(4)
      });
    } else {
      alert('No route available. Please optimize route first.');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">Route Optimization</h2>
        
        <div className="mb-4">
          <label className="text-slate-400 text-xs block mb-1">Select Vehicle</label>
          <select 
            value={selectedVehicle} 
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
          >
            <option value="">-- Choose Vehicle --</option>
            {vehicles.map(v => (
              <option key={v._id} value={v._id}>{v.name} ({v.type})</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
        <button onClick={optimizeRoute} disabled={loading || !selectedVehicle || selectedDeliveries.length < 1} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? 'Optimizing...' : 'Optimize Route'}
        </button>

        {/* Live Tracking Controls */}
        {result && result._id && (
          <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-4 rounded-lg border border-purple-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="text-xl">📡</span>
                Live Vehicle Tracking
              </h3>
              {isTracking && (
                <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full animate-pulse">
                  ● LIVE
                </span>
              )}
            </div>

            {!isTracking ? (
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.post(`/routes/${result._id}/start-tracking`, {
                      speed: 40
                    });
                    setIsTracking(true);
                    alert('🚀 Live tracking started! Watch the vehicle on the map.');
                  } catch (error) {
                    alert('Error: ' + (error.response?.data?.error || error.message));
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span className="text-xl">📍</span>
                Start Live Tracking
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    try {
                      await api.post(`/routes/${result._id}/stop-tracking`);
                      setIsTracking(false);
                      alert('🛑 Tracking stopped');
                    } catch (error) {
                      alert('Error: ' + error.message);
                    }
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                >
                  🛑 Stop Tracking
                </button>

                {/* Speed Control for Traffic Simulation */}
                <div className="bg-gray-800 p-3 rounded">
                  <label className="text-xs text-gray-400 block mb-2">Simulate Traffic (Adjust Speed)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/routes/${result._id}/update-speed`, { speed: 20 });
                          alert('🐌 Speed set to 20 km/h (heavy traffic)');
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-2 rounded text-xs"
                    >
                      Heavy<br/>(20 km/h)
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/routes/${result._id}/update-speed`, { speed: 40 });
                          alert('🚗 Speed set to 40 km/h (normal)');
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-2 rounded text-xs"
                    >
                      Normal<br/>(40 km/h)
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/routes/${result._id}/update-speed`, { speed: 60 });
                          alert('🏎️ Speed set to 60 km/h (clear roads)');
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-2 py-2 rounded text-xs"
                    >
                      Clear<br/>(60 km/h)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <button 
            onClick={() => setShowIncidentModal(true)} 
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
          >
            🚨 Report Incident & Analyze
          </button>
        )}
        <p className="text-slate-400 text-xs text-center">{selectedDeliveries.length} deliveries selected</p>
      </div>

      {/* Incident Analysis Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeIncidentModal}>
          <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800">
              <h3 className="text-white font-semibold">🚨 Traffic Incident Analyzer</h3>
              <button onClick={closeIncidentModal} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-4">
              {!incidentAnalysis ? (
                <form onSubmit={(e) => { e.preventDefault(); analyzeIncident(); }} className="space-y-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Incident Type</label>
                    <select 
                      value={incidentForm.type} 
                      onChange={(e) => setIncidentForm({...incidentForm, type: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    >
                      <option value="accident">🚗 Accident</option>
                      <option value="road_closure">🚧 Road Closure</option>
                      <option value="weather">🌧️ Weather</option>
                      <option value="road_work">🔧 Road Work</option>
                      <option value="congestion">🚦 Congestion</option>
                      <option value="event">🎉 Event</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Severity</label>
                    <select 
                      value={incidentForm.severity} 
                      onChange={(e) => setIncidentForm({...incidentForm, severity: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    >
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🔴 High</option>
                      <option value="critical">⚫ Critical</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400 text-xs">Incident Location *</label>
                      <span className="text-slate-500 text-xs">Pick location:</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <button 
                        type="button"
                        onClick={useMyLocation}
                        className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                        title="Use your current location"
                      >
                        📍 My Location
                      </button>
                      <button 
                        type="button"
                        onClick={useVehicleLocation}
                        className="px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors"
                        title="Use vehicle's current location"
                      >
                        🚚 Vehicle
                      </button>
                      <button 
                        type="button"
                        onClick={useRoutePoint}
                        className="px-2 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs transition-colors"
                        title="Use a point on the route"
                      >
                        🗺️ On Route
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Latitude *</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        placeholder="26.9200"
                        value={incidentForm.lat}
                        onChange={(e) => setIncidentForm({...incidentForm, lat: e.target.value})}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Longitude *</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        placeholder="75.8655"
                        value={incidentForm.lng}
                        onChange={(e) => setIncidentForm({...incidentForm, lng: e.target.value})}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Description (Optional)</label>
                    <textarea 
                      placeholder="Multi-vehicle collision blocking 2 lanes"
                      value={incidentForm.description}
                      onChange={(e) => setIncidentForm({...incidentForm, description: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                      rows="3"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={analyzingIncident}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {analyzingIncident ? 'Analyzing...' : '🤖 Analyze Incident Impact'}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Incident Details */}
                  <div className="bg-slate-700/50 p-3 rounded-lg">
                    <h4 className="text-white font-medium text-sm mb-2">🚨 Incident Details</h4>
                    <div className="text-xs space-y-1">
                      <p className="text-slate-300">Type: <span className="text-white capitalize">{incidentAnalysis.incident.type.replace('_', ' ')}</span></p>
                      <p className="text-slate-300">Severity: <span className={`font-medium ${
                        incidentAnalysis.incident.severity === 'low' ? 'text-green-400' :
                        incidentAnalysis.incident.severity === 'medium' ? 'text-yellow-400' :
                        incidentAnalysis.incident.severity === 'high' ? 'text-orange-400' : 'text-red-400'
                      }`}>{incidentAnalysis.incident.severity.toUpperCase()}</span></p>
                      <p className="text-slate-300">{incidentAnalysis.incident.description}</p>
                    </div>
                  </div>

                  {/* Re-routing Decision */}
                  <div className={`p-4 rounded-lg border-2 ${
                    incidentAnalysis.reroutingRequired 
                      ? 'bg-red-900/30 border-red-500' 
                      : 'bg-green-900/30 border-green-500'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{incidentAnalysis.reroutingRequired ? '🔄' : '✅'}</span>
                      <div>
                        <h4 className={`font-bold ${incidentAnalysis.reroutingRequired ? 'text-red-400' : 'text-green-400'}`}>
                          Re-routing {incidentAnalysis.reroutingRequired ? 'REQUIRED' : 'NOT Required'}
                        </h4>
                        <p className="text-slate-300 text-xs">{incidentAnalysis.reroutingReason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="text-white font-medium">{(incidentAnalysis.confidence * 100).toFixed(0)}%</span>
                      <span className="text-slate-400">• Urgency:</span>
                      <span className={`font-medium ${
                        incidentAnalysis.recommendations.urgency === 'critical' ? 'text-red-400' :
                        incidentAnalysis.recommendations.urgency === 'high' ? 'text-orange-400' :
                        incidentAnalysis.recommendations.urgency === 'medium' ? 'text-yellow-400' : 'text-green-400'
                      }`}>{incidentAnalysis.recommendations.urgency.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Affected Segments */}
                  {incidentAnalysis.affectedSegments.count > 0 && (
                    <div className="bg-slate-700/50 p-3 rounded-lg">
                      <h4 className="text-orange-400 font-medium text-sm mb-2">⚠️ Affected Segments ({incidentAnalysis.affectedSegments.count})</h4>
                      <div className="space-y-2">
                        {incidentAnalysis.affectedSegments.details.slice(0, 3).map((seg, i) => (
                          <div key={i} className="bg-slate-800 p-2 rounded text-xs">
                            <p className="text-white font-medium">{seg.roadName}</p>
                            <div className="flex gap-3 text-slate-400 mt-1">
                              <span>Distance: {seg.distanceToIncident}m</span>
                              <span className="text-yellow-400">Delay: +{seg.estimatedDelay}m</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Traffic Penalties */}
                  <div className="bg-slate-700/50 p-3 rounded-lg">
                    <h4 className="text-white font-medium text-sm mb-2">💰 Traffic Penalties</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-800 p-2 rounded text-center">
                        <p className="text-slate-400 text-xs">Total Delay</p>
                        <p className="text-orange-400 font-bold">+{incidentAnalysis.trafficPenalties.totalDelay}m</p>
                      </div>
                      <div className="bg-slate-800 p-2 rounded text-center">
                        <p className="text-slate-400 text-xs">Congestion</p>
                        <p className="text-red-400 font-bold">+{incidentAnalysis.trafficPenalties.congestionIncrease}%</p>
                      </div>
                      <div className="bg-slate-800 p-2 rounded text-center">
                        <p className="text-slate-400 text-xs">Speed Drop</p>
                        <p className="text-yellow-400 font-bold">-{incidentAnalysis.trafficPenalties.speedReduction}%</p>
                      </div>
                    </div>
                  </div>

                  {/* AI Recommendations */}
                  <div className="bg-blue-900/30 border border-blue-500 p-3 rounded-lg">
                    <h4 className="text-blue-400 font-medium text-sm mb-2">💡 AI Recommendations</h4>
                    <p className="text-slate-300 text-xs mb-2">{incidentAnalysis.recommendations.reasoning}</p>
                    
                    {incidentAnalysis.recommendations.risks.length > 0 && (
                      <div className="mb-2">
                        <p className="text-slate-400 text-xs font-medium mb-1">Risks:</p>
                        {incidentAnalysis.recommendations.risks.map((risk, i) => (
                          <p key={i} className="text-orange-300 text-xs">• {risk}</p>
                        ))}
                      </div>
                    )}

                    <div className="mb-2">
                      <p className="text-slate-400 text-xs font-medium mb-1">Action Steps:</p>
                      {incidentAnalysis.recommendations.actionableSteps.map((step, i) => (
                        <p key={i} className="text-green-300 text-xs">{step}</p>
                      ))}
                    </div>

                    <p className="text-blue-300 text-xs">
                      💾 Potential savings: {incidentAnalysis.recommendations.estimatedSavings}
                    </p>
                  </div>

                  {/* Source */}
                  <p className="text-slate-500 text-xs text-center">
                    {incidentAnalysis.source === 'gemini-ai' ? '🤖 Powered by Google Gemini AI' : '📊 Rule-based Analysis'}
                  </p>

                  <button 
                    onClick={closeIncidentModal}
                    className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <label className="text-slate-400 text-xs">Select Deliveries</label>
        <button onClick={selectAll} className="text-blue-400 text-xs">{selectedDeliveries.length === deliveryPoints.length ? 'Deselect All' : 'Select All'}</button>
      </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {deliveryPoints.length === 0 ? (
          <div className="text-center text-slate-400 py-8">No delivery points<br/><span className="text-xs">Add deliveries first</span></div>
        ) : (
          <div className="space-y-2">
            {deliveryPoints.map((d, i) => (
              <div key={d._id} onClick={() => toggleDelivery(d._id)} className={"p-3 rounded-lg border cursor-pointer " + (selectedDeliveries.includes(d._id) ? 'bg-blue-900/30 border-blue-500' : 'bg-slate-800 border-slate-700')}>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{i + 1}.</span>
                  <span className="text-white text-sm">{d.name}</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">{getAddressString(d.address)}</p>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className="mt-4 p-4 bg-green-900/30 border border-green-500 rounded-lg">
            <h3 className="text-green-400 font-medium text-sm mb-2">✓ Optimized Route</h3>
            {realRouteStats ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-slate-800 p-2 rounded">
                    <p className="text-slate-400 text-xs">Distance</p>
                    <p className="text-white font-medium">{realRouteStats.distance.toFixed(2)} km</p>
                  </div>
                  <div className="bg-slate-800 p-2 rounded">
                    <p className="text-slate-400 text-xs">Est. Time</p>
                    <p className="text-white font-medium">{Math.floor(realRouteStats.duration / 60)}h {realRouteStats.duration % 60}m</p>
                  </div>
                </div>
                <p className="text-green-400 text-xs">📍 Real road distance via {realRouteStats.source}</p>
              </>
            ) : (
              <>
                <p className="text-white text-sm">Distance: {((result.totalDistance || 0) / 1000).toFixed(2)} km</p>
                <p className="text-white text-sm">Est. Time: {Math.round((result.totalDuration || 0) / 60)} mins</p>
                <p className="text-yellow-400 text-xs mt-1">⏳ Loading real road data...</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-700">
        <button onClick={optimizeRoute} disabled={loading || !selectedVehicle || selectedDeliveries.length < 1} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? 'Optimizing...' : 'Optimize Route'}
        </button>
        <p className="text-slate-400 text-xs mt-2 text-center">{selectedDeliveries.length} deliveries selected</p>
      </div>
    </div>
  );
};

export default RoutePanel;
