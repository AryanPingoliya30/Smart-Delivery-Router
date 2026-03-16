import React, { useState, useEffect } from 'react';
import useStore from '../store/useStore';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const VehiclePanel = () => {
  const vehicles = useStore((state) => state.vehicles) || [];
  const setVehicles = useStore((state) => state.setVehicles);
  
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [depotSuggestions, setDepotSuggestions] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    type: 'van',
    capacity: '',
    licensePlate: '',
    status: 'available',
    driverName: '',
    driverPhone: '',
    fuelType: 'diesel',
    fuelEfficiency: '',
    costPerKm: '',
    yearManufactured: '',
    color: '',
    depotAddress: ''
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchVehicles(); }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL + '/vehicles');
      const data = await response.json();
      if (data.success && setVehicles) setVehicles(data.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Geocode depot address
  const geocodeDepotAddress = async (address) => {
    if (!address || address.length < 3) {
      setDepotSuggestions([]);
      return;
    }
    
    try {
      setGeocoding(true);
      const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1Ijoicm9oaXQ4OTU2IiwiYSI6ImNtNWF2bWR1MDA5MnQya3B5MGh2OXlxbjcifQ.gDVssVl_c6r7rVoYCHn2jQ';
      
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&autocomplete=true&limit=5&country=IN`
      );
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setDepotSuggestions(data.features.map(f => ({
          place_name: f.place_name,
          coordinates: f.geometry.coordinates,
          address: f.place_name
        })));
      } else {
        setDepotSuggestions([]);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setGeocoding(false);
    }
  };

  const selectDepotSuggestion = (suggestion) => {
    setFormData({
      ...formData,
      depotAddress: suggestion.place_name
    });
    setDepotSuggestions([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      // Generate vehicle ID based on type and timestamp
      const vehicleId = `${formData.type.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      
      // Get driver's actual GPS location
      let currentLocation = null;
      let locationAddress = 'Location unknown';
      
      try {
        // Request user's real GPS location with longer timeout and less strict settings
        const position = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
          }
          
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { 
              enableHighAccuracy: false, // Less strict - faster response
              timeout: 15000, // 15 seconds 
              maximumAge: 60000 // Accept cached position up to 1 minute old
            }
          );
        });
        
        currentLocation = {
          type: 'Point',
          coordinates: [position.coords.longitude, position.coords.latitude]
        };
        
        locationAddress = `Driver Location: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        
        console.log(`✅ GPS Location detected: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
      } catch (gpsError) {
        console.log('GPS detection during vehicle creation failed:', gpsError.message);
        console.log('⏳ Using approximate location - GPS will update automatically once vehicle is created');
        
        // Use approximate Jaipur location - the real GPS will update automatically via the Map component
        currentLocation = {
          type: 'Point',
          coordinates: [75.8197, 26.8620] // Approximate Jaipur location
        };
      }
      
      // Default depot coordinates - use geocoded address if provided
      let defaultDepot = {
        type: 'Point',
        coordinates: [75.7873, 26.9124],
        address: formData.depotAddress || 'Main Depot, Jaipur'
      };

      // If depot address was provided, geocode it to get exact coordinates
      if (formData.depotAddress && formData.depotAddress.length > 5) {
        try {
          const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1Ijoicm9oaXQ4OTU2IiwiYSI6ImNtNWF2bWR1MDA5MnQya3B5MGh2OXlxbjcifQ.gDVssVl_c6r7rVoYCHn2jQ';
          const geoResponse = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(formData.depotAddress)}.json?access_token=${mapboxToken}&limit=1&country=IN`
          );
          const geoData = await geoResponse.json();
          
          if (geoData.features && geoData.features.length > 0) {
            const [lng, lat] = geoData.features[0].geometry.coordinates;
            defaultDepot = {
              type: 'Point',
              coordinates: [lng, lat],
              address: formData.depotAddress
            };
          }
        } catch (geoError) {
          console.warn('Could not geocode depot address:', geoError);
        }
      }
      
      const payload = {
        vehicleId: vehicleId,
        name: formData.name,
        type: formData.type === 'bike' ? 'motorcycle' : formData.type,
        capacity: {
          maxWeight: parseFloat(formData.capacity) || 100,
          maxVolume: (parseFloat(formData.capacity) || 100) * 0.01,
          maxPackages: 50
        },
        depot: defaultDepot,
        currentLocation: currentLocation, // Driver's actual GPS location
        driver: {
          name: formData.driverName || undefined,
          phone: formData.driverPhone || undefined
        },
        fuelEfficiency: formData.fuelEfficiency ? parseFloat(formData.fuelEfficiency) : 10,
        status: formData.status
      };
      
      const response = await fetch(API_URL + '/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success && setVehicles) {
        setVehicles([...vehicles, data.data]);
        resetForm();
        alert('Vehicle added successfully!');
      } else {
        const errorMsg = data.errors ? data.errors.map(e => e.msg).join(', ') : data.error || 'Error adding vehicle';
        alert('Error: ' + errorMsg);
      }
    } catch (error) { 
      console.error('Error adding vehicle:', error);
      alert('Error adding vehicle'); 
    } finally { 
      setLoading(false); 
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'van',
      capacity: '',
      licensePlate: '',
      status: 'available',
      driverName: '',
      driverPhone: '',
      fuelType: 'diesel',
      fuelEfficiency: '',
      costPerKm: '',
      yearManufactured: '',
      color: ''
    });
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete vehicle?')) return;
    try {
      await fetch(API_URL + '/vehicles/' + id, { method: 'DELETE' });
      if (setVehicles) setVehicles(vehicles.filter(v => v._id !== id));
    } catch (e) { alert('Error'); }
  };

  const getStatusColor = (s) => ({ available: 'bg-green-500', busy: 'bg-yellow-500', offline: 'bg-gray-500' }[s] || 'bg-gray-500');
  const getTypeIcon = (t) => ({ truck: '🚛', van: '🚐', bike: '🏍️', car: '🚗' }[t] || '🚗');

  const getCapacityString = (capacity) => {
    if (!capacity) return 'N/A';
    if (typeof capacity === 'number') return capacity + 'kg';
    if (typeof capacity === 'object') {
      if (capacity.maxWeight) return capacity.maxWeight + 'kg';
      return JSON.stringify(capacity);
    }
    return String(capacity);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Vehicles</h2>
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg">+ Add</button>
        </div>
      </div>

      {showForm && (
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 max-h-[70vh] overflow-y-auto">
          <h3 className="text-white font-semibold mb-3 text-sm">Add New Vehicle</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Vehicle Information */}
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium">Vehicle Details</label>
              <input 
                type="text" 
                placeholder="Vehicle Name *" 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
                required 
              />
              
              <div className="grid grid-cols-2 gap-2">
                <select 
                  value={formData.type} 
                  onChange={(e) => setFormData({...formData, type: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="van">🚐 Van</option>
                  <option value="truck">🚛 Truck</option>
                  <option value="bike">🏍️ Bike</option>
                  <option value="car">🚗 Car</option>
                </select>
                
                <input 
                  type="text" 
                  placeholder="License Plate" 
                  value={formData.licensePlate} 
                  onChange={(e) => setFormData({...formData, licensePlate: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm uppercase focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="number" 
                  placeholder="Capacity (kg) *" 
                  value={formData.capacity} 
                  onChange={(e) => setFormData({...formData, capacity: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  required 
                />
                
                <input 
                  type="number" 
                  placeholder="Year" 
                  value={formData.yearManufactured} 
                  onChange={(e) => setFormData({...formData, yearManufactured: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  min="1900"
                  max="2030"
                />
              </div>

              <input 
                type="text" 
                placeholder="Color" 
                value={formData.color} 
                onChange={(e) => setFormData({...formData, color: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
              />
            </div>

            {/* Driver Information */}
            <div className="space-y-2 pt-2 border-t border-slate-700">
              <label className="text-xs text-slate-400 font-medium">Driver Information</label>
              <input 
                type="text" 
                placeholder="Driver Name" 
                value={formData.driverName} 
                onChange={(e) => setFormData({...formData, driverName: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
              />
              
              <input 
                type="tel" 
                placeholder="Driver Phone" 
                value={formData.driverPhone} 
                onChange={(e) => setFormData({...formData, driverPhone: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
              />
              
              {/* Depot Address with Geocoding */}
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Depot/Warehouse Address (optional, type to search)" 
                  value={formData.depotAddress} 
                  onChange={(e) => {
                    setFormData({...formData, depotAddress: e.target.value});
                    geocodeDepotAddress(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
                />
                {geocoding && (
                  <div className="absolute right-3 top-2.5">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                )}
                
                {/* Depot suggestions dropdown */}
                {depotSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {depotSuggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        onClick={() => selectDepotSuggestion(suggestion)}
                        className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-white text-sm border-b border-slate-700 last:border-b-0"
                      >
                        <div className="font-medium">🏢 {suggestion.place_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">💡 Leave empty to use default Jaipur location</p>
            </div>

            {/* Fuel & Cost Information */}
            <div className="space-y-2 pt-2 border-t border-slate-700">
              <label className="text-xs text-slate-400 font-medium">Fuel & Operating Costs</label>
              <div className="grid grid-cols-2 gap-2">
                <select 
                  value={formData.fuelType} 
                  onChange={(e) => setFormData({...formData, fuelType: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="diesel">⛽ Diesel</option>
                  <option value="petrol">⛽ Petrol</option>
                  <option value="electric">🔋 Electric</option>
                  <option value="hybrid">🔌 Hybrid</option>
                  <option value="cng">💨 CNG</option>
                </select>
                
                <input 
                  type="number" 
                  step="0.1"
                  placeholder="Fuel Efficiency (km/l)" 
                  value={formData.fuelEfficiency} 
                  onChange={(e) => setFormData({...formData, fuelEfficiency: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
                />
              </div>

              <input 
                type="number" 
                step="0.01"
                placeholder="Cost per KM ($)" 
                value={formData.costPerKm} 
                onChange={(e) => setFormData({...formData, costPerKm: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" 
              />
            </div>

            {/* Status */}
            <div className="space-y-2 pt-2 border-t border-slate-700">
              <label className="text-xs text-slate-400 font-medium">Vehicle Status</label>
              <select 
                value={formData.status} 
                onChange={(e) => setFormData({...formData, status: e.target.value})} 
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="available">✅ Available</option>
                <option value="on_route">🚛 On Route</option>
                <option value="maintenance">🔧 Maintenance</option>
                <option value="offline">❌ Offline</option>
              </select>
            </div>

            <div className="flex gap-2 pt-3">
              <button 
                type="button" 
                onClick={resetForm} 
                className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={loading} 
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Adding...' : 'Add Vehicle'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {vehicles.length === 0 ? (
          <div className="text-center text-slate-400 py-8">No vehicles<br/><span className="text-xs">Click + Add to add a vehicle</span></div>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div key={v._id} className="p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getTypeIcon(v.type)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-medium text-sm">{v.name}</h4>
                        <span className={"w-2 h-2 rounded-full " + getStatusColor(v.status)}></span>
                      </div>
                      <p className="text-slate-500 text-xs">{v.vehicleId || 'N/A'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(v._id)} 
                    className="text-red-400 hover:text-red-300 text-xs transition-colors"
                  >
                    Delete
                  </button>
                </div>
                
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>📦</span>
                    <span>{getCapacityString(v.capacity)} capacity</span>
                  </div>
                  
                  {v.driver && v.driver.name && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>👤</span>
                      <span>{v.driver.name}</span>
                      {v.driver.phone && <span className="text-slate-500">• {v.driver.phone}</span>}
                    </div>
                  )}
                  
                  {v.fuelEfficiency && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>⛽</span>
                      <span>{v.fuelEfficiency} km/l</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-400">{vehicles.length} vehicles</div>
    </div>
  );
};

export default VehiclePanel;
