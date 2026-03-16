import React, { useState, useEffect, useRef } from 'react';
import useStore from '../store/useStore';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const DeliveryPanel = () => {
  const deliveryPoints = useStore((state) => state.deliveryPoints) || [];
  const setDeliveryPoints = useStore((state) => state.setDeliveryPoints);
  const selectedLocation = useStore((state) => state.selectedLocation);
  const setSelectedLocation = useStore((state) => state.setSelectedLocation);
  
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '', address: '', contactName: '', contactPhone: '', priority: 'medium', latitude: '', longitude: ''
  });
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const searchTimeoutRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDeliveryPoints(); }, []);

  useEffect(() => {
    if (selectedLocation) {
      setFormData(prev => ({
        ...prev,
        latitude: selectedLocation.lat.toFixed(6),
        longitude: selectedLocation.lng.toFixed(6)
      }));
      setShowForm(true);
    }
  }, [selectedLocation]);

  const fetchDeliveryPoints = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL + '/delivery-points');
      const data = await response.json();
      if (data.success && setDeliveryPoints) setDeliveryPoints(data.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Geocode address to get coordinates using Mapbox Geocoding API
  const geocodeAddress = async (address) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!address || address.length < 2) {
      setSuggestions([]);
      return;
    }
    
    console.log('🔍 Searching for address:', address);
    
    // Debounce: Wait 500ms after user stops typing before searching
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setGeocoding(true);
        const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN || 'pk.eyJ1Ijoicm9oaXQ4OTU2IiwiYSI6ImNtNWF2bWR1MDA5MnQya3B5MGh2OXlxbjcifQ.gDVssVl_c6r7rVoYCHn2jQ';
        
        console.log('🌐 Calling Mapbox API for:', address);
        
        // Use Mapbox Geocoding API with autocomplete
        // Search globally first, then filter/prioritize India results in the response
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&autocomplete=true&limit=10&proximity=78.9629,20.5937&types=place,locality,region,district,postcode,address`;
        console.log('📡 API URL:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('✅ Mapbox response:', data);
        
        if (data.features && data.features.length > 0) {
          console.log(`✅ Found ${data.features.length} suggestions`);
          
          // Prioritize Indian results (but don't exclude others)
          const sortedFeatures = data.features.sort((a, b) => {
            const aIsIndia = a.place_name.toLowerCase().includes('india');
            const bIsIndia = b.place_name.toLowerCase().includes('india');
            if (aIsIndia && !bIsIndia) return -1;
            if (!aIsIndia && bIsIndia) return 1;
            return 0;
          });
          
          // Show suggestions to user
          setSuggestions(sortedFeatures.map(f => ({
            place_name: f.place_name,
            coordinates: f.geometry.coordinates, // [lng, lat]
            address: f.place_name
          })));
        } else {
          // No results found - just clear suggestions, don't show alert
          console.log('❌ No results found for:', address);
          setSuggestions([]);
        }
      } catch (error) {
        console.error('❌ Geocoding error:', error);
        setSuggestions([]);
      } finally {
        setGeocoding(false);
      }
    }, 500); // Wait 500ms after user stops typing
  };

  // Select a suggestion from dropdown
  const selectSuggestion = (suggestion) => {
    const [lng, lat] = suggestion.coordinates;
    setFormData({
      ...formData,
      address: suggestion.place_name,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6)
    });
    setSuggestions([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.latitude || !formData.longitude) { alert('Click on map to select location first'); return; }
    try {
      setLoading(true);
      const payload = {
        name: formData.name,
        address: formData.address || 'Address not specified',
        contactName: formData.contactName,
        contactPhone: formData.contactPhone,
        priority: formData.priority,
        location: { type: 'Point', coordinates: [parseFloat(formData.longitude), parseFloat(formData.latitude)] }
      };
      const response = await fetch(API_URL + '/delivery-points', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success && setDeliveryPoints) {
        setDeliveryPoints([...deliveryPoints, data.data]);
        resetForm();
        alert('Delivery point created!');
      } else {
        alert(data.errors?.[0]?.msg || data.error || 'Failed to create delivery point');
      }
    } catch (error) { 
      console.error('Error:', error);
      alert('Error creating delivery point'); 
    } finally { setLoading(false); }
  };

  const resetForm = () => {
    setFormData({ name: '', address: '', contactName: '', contactPhone: '', priority: 'medium', latitude: '', longitude: '' });
    setShowForm(false);
    if (setSelectedLocation) setSelectedLocation(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return;
    try {
      await fetch(API_URL + '/delivery-points/' + id, { method: 'DELETE' });
      if (setDeliveryPoints) setDeliveryPoints(deliveryPoints.filter(dp => dp._id !== id));
    } catch (e) { alert('Error'); }
  };

  const getPriorityColor = (p) => ({ urgent: 'bg-red-500', high: 'bg-orange-500', normal: 'bg-blue-500' }[p] || 'bg-blue-500');

  const getAddressString = (address) => {
    if (!address) return '';
    if (typeof address === 'string') return address;
    if (typeof address === 'object') {
      const parts = [address.street, address.city, address.state, address.postalCode, address.country].filter(Boolean);
      return parts.join(', ');
    }
    return '';
  };

  const filteredDeliveries = deliveryPoints.filter(dp => dp.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Delivery Points</h2>
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg">+ Add</button>
        </div>
        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm" />
      </div>

      {showForm && (
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="text" placeholder="Delivery Name *" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm" required />
            
            {/* Address input with geocoding */}
            <div className="relative">
              <input 
                type="text" 
                placeholder="Address * (type to search locations)" 
                value={formData.address} 
                onChange={(e) => {
                  setFormData({...formData, address: e.target.value});
                  geocodeAddress(e.target.value);
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm" 
                required 
              />
              {geocoding && (
                <div className="absolute right-3 top-2.5">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
              )}
              
              {/* Address suggestions dropdown */}
              {suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectSuggestion(suggestion)}
                      className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-white text-sm border-b border-slate-700 last:border-b-0"
                    >
                      <div className="font-medium">📍 {suggestion.place_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Contact Name" value={formData.contactName} onChange={(e) => setFormData({...formData, contactName: e.target.value})} className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm" />
              <input type="tel" placeholder="Phone Number" value={formData.contactPhone} onChange={(e) => setFormData({...formData, contactPhone: e.target.value})} className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Latitude *" value={formData.latitude} onChange={(e) => setFormData({...formData, latitude: e.target.value})} className="px-3 py-2 bg-slate-700 border border-blue-500 rounded-lg text-white text-sm" required readOnly />
              <input type="text" placeholder="Longitude *" value={formData.longitude} onChange={(e) => setFormData({...formData, longitude: e.target.value})} className="px-3 py-2 bg-slate-700 border border-blue-500 rounded-lg text-white text-sm" required readOnly />
            </div>
            <p className="text-xs text-blue-400">💡 Type address above OR click on map to auto-fill coordinates</p>
            <select value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value})} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm">
              <option value="normal">Normal Priority</option><option value="high">High Priority</option><option value="urgent">Urgent Priority</option>
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={resetForm} className="flex-1 px-3 py-2 bg-slate-700 text-white text-sm rounded-lg">Cancel</button>
              <button type="submit" disabled={loading || !formData.latitude} className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">{loading ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {filteredDeliveries.length === 0 ? (
          <div className="text-center text-slate-400 py-8">No deliveries<br/><span className="text-xs">Click + Add then click map</span></div>
        ) : (
          <div className="space-y-2">
            {filteredDeliveries.map((d) => (
              <div key={d._id} className="p-3 rounded-lg bg-slate-800 border border-slate-700">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={"w-2 h-2 rounded-full " + getPriorityColor(d.priority)}></span>
                      <h4 className="text-white font-medium text-sm">{d.name}</h4>
                    </div>
                    <p className="text-slate-400 text-xs mt-1">{getAddressString(d.address)}</p>
                  </div>
                  <button onClick={() => handleDelete(d._id)} className="text-red-400 text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-400">{filteredDeliveries.length} deliveries</div>
    </div>
  );
};

export default DeliveryPanel;
