import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import useStore from '../store/useStore';
import useSocket from '../hooks/useSocket';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const Map = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({});
  const liveVehicleMarkerRef = useRef(null);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [vehicleTracking, setVehicleTracking] = useState(null);
  
  const { socket } = useSocket();
  
  const { 
    deliveryPoints, 
    vehicles, 
    optimizedRoute,
    setSelectedLocation,
    showTraffic,
    setRealRouteStats
  } = useStore();

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [75.7873, 26.9124], // Jaipur, India
      zoom: 10
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'top-right'
    );

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Add main route source (best route only)
      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      // Add main route layer (darker, thicker - best route)
      map.current.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 6,
          'line-opacity': 1
        }
      });
    });

    // Handle map click for adding delivery points
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      setSelectedLocation({ lat, lng });
      
      // Show temporary marker
      new mapboxgl.Popup({ closeOnClick: true })
        .setLngLat([lng, lat])
        .setHTML(`
          <div style="color: black; padding: 5px;">
            <strong>📍 Selected Location</strong><br/>
            <small>Lat: ${lat.toFixed(6)}</small><br/>
            <small>Lng: ${lng.toFixed(6)}</small><br/>
            <small style="color: #666;">Fill the form and click Create</small>
          </div>
        `)
        .addTo(map.current);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [setSelectedLocation]);

  // Real-time GPS tracking for vehicles with progressive route erasing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!vehicles || vehicles.length === 0) return;

    let watchId = null;

    // Start watching GPS position
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          console.log(`📍 GPS Update: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

          // Update vehicle location on server
          for (const vehicle of vehicles) {
            try {
              await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/vehicles/${vehicle._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  currentLocation: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                  }
                })
              });

              // Update progressive route (erase completed segments)
              if (optimizedRoute?.routeGeometry) {
                updateProgressiveRoute([longitude, latitude]);
              }
            } catch (error) {
              console.error('Error updating vehicle location:', error);
            }
          }
        },
        (error) => {
          console.warn('GPS tracking error:', error.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }

    // Cleanup
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [vehicles, optimizedRoute]);

  // Progressive route erasing function (like Google Maps)
  const updateProgressiveRoute = (currentPosition) => {
    if (!map.current || !mapLoaded || !optimizedRoute?.routeGeometry) return;

    const routeCoords = optimizedRoute.routeGeometry;
    if (!routeCoords || routeCoords.length < 2) return;

    // Find the closest point on route to current position
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoords.length; i++) {
      const [lng, lat] = routeCoords[i];
      const distance = Math.sqrt(
        Math.pow(lng - currentPosition[0], 2) + 
        Math.pow(lat - currentPosition[1], 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    // Calculate progress percentage
    const progressPercent = Math.round((closestIndex / routeCoords.length) * 100);
    console.log(`🔄 Route Progress: ${progressPercent}% (${closestIndex}/${routeCoords.length} points)`);

    // Get remaining route (from current position onwards)
    const remainingRoute = routeCoords.slice(closestIndex);

    if (remainingRoute.length < 2) {
      console.log('🏁 Route completed! Arrived at destination.');
      // Optionally hide route completely when arrived
      if (map.current.getSource('route')) {
        map.current.getSource('route').setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        });
      }
      return;
    }

    // Update the main route to show only remaining segment
    if (map.current.getSource('route')) {
      map.current.getSource('route').setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: remainingRoute
        }
      });
      console.log(`✂️ Route erased: showing ${remainingRoute.length} points ahead`);
    }

    // Also update traffic route if visible
    if (showTraffic && window.routeCongestion && window.routeCoordinates) {
      const totalCoords = window.routeCoordinates;
      const totalCongestion = window.routeCongestion;
      
      // Find closest index in original traffic route
      let trafficIndex = 0;
      let minTrafficDistance = Infinity;
      
      for (let i = 0; i < totalCoords.length; i++) {
        const [lng, lat] = totalCoords[i];
        const distance = Math.sqrt(
          Math.pow(lng - currentPosition[0], 2) + 
          Math.pow(lat - currentPosition[1], 2)
        );
        
        if (distance < minTrafficDistance) {
          minTrafficDistance = distance;
          trafficIndex = i;
        }
      }

      // Update traffic route with remaining segments
      const remainingTrafficCoords = totalCoords.slice(trafficIndex);
      const remainingCongestion = totalCongestion.slice(trafficIndex);
      
      if (remainingTrafficCoords.length > 1) {
        updateTrafficRoute(remainingTrafficCoords, remainingCongestion);
      }
    }
  };

  // Update delivery markers + vehicle markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    console.log('🔄 Updating markers:', {
      deliveryPoints: deliveryPoints?.length || 0,
      vehicles: vehicles?.length || 0,
      optimizedRoute: !!optimizedRoute
    });

    // Clear existing markers
    Object.values(markersRef.current).forEach(marker => marker.remove());
    markersRef.current = {};

    // Add vehicle markers (show current location AND depot)
    vehicles.forEach((vehicle, vIndex) => {
      console.log('🚚 Vehicle:', vehicle.name, 'Location:', vehicle.currentLocation);
      // Show current location (where vehicle is now)
      if (vehicle.currentLocation?.coordinates) {
        const [lng, lat] = vehicle.currentLocation.coordinates;
        
        // Create current vehicle marker element (bright green with DRIVER label for high visibility)
        const currentEl = document.createElement('div');
        currentEl.className = 'vehicle-current-marker';
        currentEl.innerHTML = `
          <div style="position: relative; z-index: 1000;">
            <div style="
              background: linear-gradient(135deg, #10b981, #059669);
              color: white;
              width: 60px;
              height: 60px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              border: 5px solid #fff;
              box-shadow: 0 6px 20px rgba(16, 185, 129, 0.8), 0 0 40px rgba(16, 185, 129, 0.6), 0 0 60px rgba(16, 185, 129, 0.4);
              cursor: pointer;
              animation: pulse 2s infinite;
            ">
              🚚
            </div>
            <div style="
              position: absolute;
              bottom: -24px;
              left: 50%;
              transform: translateX(-50%);
              background: linear-gradient(135deg, #10b981, #059669);
              color: white;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              white-space: nowrap;
              box-shadow: 0 4px 8px rgba(0,0,0,0.5);
              border: 2px solid white;
            ">
              🚚 DRIVER HERE
            </div>
          </div>
        `;

        // Create popup for current vehicle location
        const currentPopup = new mapboxgl.Popup({ offset: 35 }).setHTML(`
          <div style="color: black; padding: 12px; min-width: 200px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 24px;">🚚</span>
              <strong style="font-size: 16px;">${vehicle.name}</strong>
            </div>
            <div style="background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; text-align: center; font-weight: bold;">
              📍 CURRENT LOCATION
            </div>
            <div style="font-size: 12px; line-height: 1.6;">
              ${vehicle.driver?.name ? `<div>👤 Driver: <strong>${vehicle.driver.name}</strong></div>` : ''}
              ${vehicle.driver?.phone ? `<div>📱 Phone: ${vehicle.driver.phone}</div>` : ''}
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ddd;">
                <div>Type: ${vehicle.type}</div>
                <div>Capacity: ${vehicle.capacity?.maxWeight || 0}kg</div>
                <div>Status: <span style="color: #10b981; font-weight: bold;">${vehicle.status || 'Available'}</span></div>
              </div>
              <div style="margin-top: 8px; font-size: 11px; color: #666;">
                📍 Lat: ${lat.toFixed(6)}<br/>
                📍 Lng: ${lng.toFixed(6)}
              </div>
            </div>
          </div>
        `);

        const currentMarker = new mapboxgl.Marker(currentEl)
          .setLngLat([lng, lat])
          .setPopup(currentPopup)
          .addTo(map.current);

        markersRef.current[`vehicle-current-${vehicle._id}`] = currentMarker;
      }
    });

    // Determine delivery order: Use optimized route if available, else sort by priority
    let orderedDeliveries = [];
    let orderingMethod = 'database'; // default
    
    if (optimizedRoute?.optimizedOrder && optimizedRoute.optimizedOrder.length > 0) {
      // Use AI-optimized sequence (best route considering distance + priority)
      orderedDeliveries = optimizedRoute.optimizedOrder.map((opt, idx) => ({
        ...opt,
        sequenceNumber: idx + 1
      }));
      orderingMethod = 'optimized';
    } else {
      // Sort by priority if no optimization yet: urgent → high → medium → low
      const priorityOrder = { urgent: 1, high: 2, medium: 3, low: 4 };
      orderedDeliveries = [...deliveryPoints]
        .sort((a, b) => {
          const priorityDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
          if (priorityDiff !== 0) return priorityDiff;
          // If same priority, sort by distance from driver (if vehicle has location)
          if (vehicles.length > 0 && vehicles[0].currentLocation?.coordinates) {
            const driverCoords = vehicles[0].currentLocation.coordinates;
            const distA = Math.hypot(
              a.location.coordinates[0] - driverCoords[0],
              a.location.coordinates[1] - driverCoords[1]
            );
            const distB = Math.hypot(
              b.location.coordinates[0] - driverCoords[0],
              b.location.coordinates[1] - driverCoords[1]
            );
            return distA - distB;
          }
          return 0;
        })
        .map((point, idx) => ({
          ...point,
          sequenceNumber: idx + 1
        }));
      orderingMethod = 'priority+distance';
    }

    // Add delivery point markers with smart numbering
    orderedDeliveries.forEach((point) => {
      if (!point.location?.coordinates) {
        console.warn('⚠️ Delivery point missing coordinates:', point);
        return;
      }
      
      const [lng, lat] = point.location.coordinates;
      const sequenceNum = point.sequenceNumber;
      
      console.log(`📦 Adding delivery marker #${sequenceNum}:`, point.name, 'at', [lng, lat]);
      
      // Create delivery marker element with label
      const el = document.createElement('div');
      el.className = 'delivery-marker';
      el.innerHTML = `
        <div style="position: relative; z-index: 500;">
          <div style="
            background: ${getPriorityColor(point.priority)};
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.3);
            cursor: pointer;
          ">
            ${sequenceNum}
          </div>
          <div style="
            position: absolute;
            bottom: -22px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            border: 1px solid white;
          ">
            📦 RECEIVER
          </div>
        </div>
      `;

      // Determine why this sequence number was chosen
      let sequenceExplanation = '';
      if (orderingMethod === 'optimized') {
        sequenceExplanation = `<div style="background: #10b981; color: white; padding: 4px 6px; border-radius: 4px; font-size: 9px; margin-top: 4px;">
          ✓ AI-Optimized Route (Best Distance + Priority)
        </div>`;
      } else {
        sequenceExplanation = `<div style="background: #f59e0b; color: white; padding: 4px 6px; border-radius: 4px; font-size: 9px; margin-top: 4px;">
          ⚡ Sorted by Priority, then Distance from Driver
        </div>`;
      }

      // Create popup with receiver info
      const popup = new mapboxgl.Popup({ offset: 30 }).setHTML(`
        <div style="color: black; padding: 8px;">
          <strong>📦 Stop #${sequenceNum}: ${point.name}</strong><br/>
          <small><b>Delivery Receiver</b></small><br/>
          <small>${point.address || ''}</small><br/>
          <span style="
            background: ${getPriorityColor(point.priority)};
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            text-transform: uppercase;
            margin-top: 4px;
            display: inline-block;
          ">${point.priority} Priority</span>
          ${sequenceExplanation}
          ${point.contactName ? `<br/><small style="margin-top: 4px; display: block;">👤 Contact: ${point.contactName}</small>` : ''}
          ${point.contactPhone ? `<br/><small>📞 ${point.contactPhone}</small>` : ''}
          ${point.packageDetails?.weight ? `<br/><small>⚖️ Weight: ${point.packageDetails.weight}kg</small>` : ''}
          ${point.estimatedArrival ? `<br/><small>⏱️ ETA: ${new Date(point.estimatedArrival).toLocaleTimeString()}</small>` : ''}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current);

      markersRef.current[point._id || point.id] = marker;
    });

    // Fit bounds to show all markers (vehicles + deliveries)
    const allCoordinates = [];
    
    // Add vehicle depot coordinates
    vehicles.forEach(v => {
      if (v.depot?.coordinates) {
        allCoordinates.push(v.depot.coordinates);
      }
    });
    
    // Add delivery point coordinates
    deliveryPoints.forEach(p => {
      if (p.location?.coordinates) {
        allCoordinates.push(p.location.coordinates);
      }
    });
    
    if (allCoordinates.length > 0) {
      const bounds = allCoordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new mapboxgl.LngLatBounds(allCoordinates[0], allCoordinates[0]));

      map.current.fitBounds(bounds, { padding: 80, maxZoom: 12 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryPoints, vehicles, mapLoaded]);

  // Update route line with actual road directions and traffic
  useEffect(() => {
    if (!map.current || !mapLoaded || !optimizedRoute) return;

    // routeGeometry is an array of [lng, lat] coordinates from the optimizer
    let waypoints = optimizedRoute.routeGeometry || [];
    
    // Fallback: try to extract from optimizedOrder if routeGeometry is empty
    if (waypoints.length === 0 && optimizedRoute.optimizedOrder) {
      waypoints = optimizedRoute.optimizedOrder
        .filter(stop => stop.location?.coordinates)
        .map(stop => stop.location.coordinates);
    }

    if (waypoints.length > 1) {
      // Fetch actual road directions from Mapbox Directions API with alternatives
      const fetchDirections = async () => {
        try {
          // Build coordinates string for Mapbox API (max 25 waypoints)
          const coordsString = waypoints
            .slice(0, 25)
            .map(coord => `${coord[0]},${coord[1]}`)
            .join(';');

          // Request route from Mapbox
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordsString}?geometries=geojson&overview=full&annotations=congestion&access_token=${mapboxgl.accessToken}`
          );
          
          const data = await response.json();
          
          // Check if Mapbox found a valid route (like Google Maps does)
          if (data.code === 'NoRoute' || data.code === 'NoSegment' || !data.routes || data.routes.length === 0) {
            // No drivable route exists
            alert('🚫 No Route Available\n\nCannot find a drivable route between these locations.\n\nPossible reasons:\n• Locations separated by water/ocean\n• No road connection exists\n• Route crosses impassable terrain\n\nThis works like Google Maps - only showing routes where roads actually exist.');
            return;
          }

          if (data.routes && data.routes.length > 0) {
            // Best route (first one) - shown in bold blue
            const route = data.routes[0];
            const routeGeometry = route.geometry;
            const congestion = route.legs?.flatMap(leg => leg.annotation?.congestion || []) || [];
            
            // Store REAL distance and duration from Mapbox
            const realDistanceKm = route.distance / 1000; // Convert meters to km
            const realDurationMins = Math.round(route.duration / 60); // Convert seconds to mins
            
            // Update store with real stats
            if (setRealRouteStats) {
              setRealRouteStats({
                distance: realDistanceKm,
                duration: realDurationMins,
                source: 'Mapbox Directions API'
              });
            }
            
            // Store congestion data for traffic-colored route
            window.routeCongestion = congestion;
            window.routeCoordinates = routeGeometry.coordinates;
            
            // Update the main route (best route)
            map.current.getSource('route')?.setData({
              type: 'Feature',
              properties: {},
              geometry: routeGeometry
            });

            // If traffic display is on, show traffic-colored route
            if (showTraffic && congestion.length > 0) {
              updateTrafficRoute(routeGeometry.coordinates, congestion);
            }

            // Fit the map to show the entire route
            const coordinates = routeGeometry.coordinates;
            const bounds = coordinates.reduce((bounds, coord) => {
              return bounds.extend(coord);
            }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

            map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
          }
        } catch (error) {
          console.error('Error fetching directions:', error);
          // Show user-friendly error message
          alert('⚠️ Route Error\n\nCould not calculate route. This may happen if:\n• Locations are too far apart\n• No road connection exists\n• Network error occurred\n\nPlease try different locations.');
        }
      };

      fetchDirections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimizedRoute, mapLoaded, showTraffic]);

  // Function to create traffic-colored route segments
  const updateTrafficRoute = (coordinates, congestion) => {
    if (!map.current || !mapLoaded || !coordinates || coordinates.length < 2) return;

    // Wait for map style to be fully loaded before adding sources
    if (!map.current.isStyleLoaded()) {
      console.log('⏳ Map style not loaded yet, waiting...');
      map.current.once('idle', () => {
        updateTrafficRoute(coordinates, congestion);
      });
      return;
    }

    // Create line segments with congestion colors
    // Merge consecutive segments with same congestion to avoid dots
    const features = [];
    let currentSegment = null;
    
    for (let i = 0; i < coordinates.length - 1; i++) {
      // Use provided congestion or generate based on time/position
      let congestionLevel = congestion?.[i] || 'unknown';
      
      // If no congestion data, generate realistic traffic based on time
      if (congestionLevel === 'unknown' || !congestion || congestion.length === 0) {
        const hour = new Date().getHours();
        const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
        const isNight = hour >= 21 || hour < 6;
        
        // Add some variation along the route
        const randomFactor = Math.random();
        if (isNight) {
          congestionLevel = randomFactor > 0.8 ? 'low' : 'low';
        } else if (isRushHour) {
          congestionLevel = randomFactor > 0.6 ? 'heavy' : randomFactor > 0.3 ? 'moderate' : 'heavy';
        } else {
          congestionLevel = randomFactor > 0.7 ? 'moderate' : randomFactor > 0.3 ? 'low' : 'moderate';
        }
      }
      
      // If this is the first segment or congestion changed, start new segment
      if (!currentSegment || currentSegment.properties.congestion !== congestionLevel) {
        // Save previous segment if exists
        if (currentSegment) {
          features.push(currentSegment);
        }
        
        // Start new segment
        currentSegment = {
          type: 'Feature',
          properties: { congestion: congestionLevel },
          geometry: {
            type: 'LineString',
            coordinates: [coordinates[i], coordinates[i + 1]]
          }
        };
      } else {
        // Same congestion as previous - extend the current segment
        currentSegment.geometry.coordinates.push(coordinates[i + 1]);
      }
    }
    
    // Don't forget the last segment
    if (currentSegment) {
      features.push(currentSegment);
    }

    // Add or update traffic route source
    if (map.current.getSource('traffic-route')) {
      map.current.getSource('traffic-route').setData({
        type: 'FeatureCollection',
        features
      });
    } else {
      map.current.addSource('traffic-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features }
      });

      // Find a good layer to insert before (markers/labels)
      const layers = map.current.getStyle().layers;
      let firstSymbolLayerId;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') {
          firstSymbolLayerId = layers[i].id;
          break;
        }
      }

      map.current.addLayer({
        id: 'traffic-route-layer',
        type: 'line',
        source: 'traffic-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': [
            'match',
            ['get', 'congestion'],
            'low', '#4ade80',
            'moderate', '#facc15',
            'heavy', '#f97316',
            'severe', '#ef4444',
            'unknown', '#3b82f6',
            '#3b82f6'
          ],
          // Dynamic line width based on zoom level - wider at higher zoom
          'line-width': [
            'interpolate',
            ['exponential', 1.5],
            ['zoom'],
            5, 2,    // At zoom 5 (zoomed out): 2px
            10, 4,   // At zoom 10: 4px
            15, 8,   // At zoom 15 (zoomed in): 8px
            20, 12   // At zoom 20 (very close): 12px
          ],
          'line-opacity': 0.9,
          // Ensure solid line (no gaps)
          'line-gap-width': 0
        }
      }, firstSymbolLayerId); // Insert before symbol layers so labels show on top
    }
  };

  // Toggle traffic display on route only
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (showTraffic) {
      // Show traffic colors on the route - use stored coordinates or generate from route source
      if (window.routeCoordinates) {
        updateTrafficRoute(window.routeCoordinates, window.routeCongestion || []);
      } else {
        // Try to get coordinates from the route source
        const routeSource = map.current.getSource('route');
        if (routeSource && routeSource._data?.geometry?.coordinates) {
          const coords = routeSource._data.geometry.coordinates;
          if (coords.length > 1) {
            updateTrafficRoute(coords, []);
          }
        }
      }
      // Hide the blue route when showing traffic
      if (map.current.getLayer('route')) {
        map.current.setLayoutProperty('route', 'visibility', 'none');
      }
    } else {
      // Remove traffic route layer
      if (map.current.getLayer('traffic-route-layer')) {
        map.current.removeLayer('traffic-route-layer');
      }
      if (map.current.getSource('traffic-route')) {
        map.current.removeSource('traffic-route');
      }
      // Show the blue route
      if (map.current.getLayer('route')) {
        map.current.setLayoutProperty('route', 'visibility', 'visible');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTraffic, mapLoaded]);

  // Real-time vehicle tracking listener
  useEffect(() => {
    if (!socket || !map.current || !mapLoaded) return;

    // Listen for vehicle location updates
    const handleLocationUpdate = (data) => {
      const { vehicleId, location, speed, heading, progress, distanceTraveled, distanceRemaining } = data;
      
      console.log(`🚚 Vehicle update:`, data);

      if (!liveVehicleMarkerRef.current) {
        // Create new live tracking marker
        const el = document.createElement('div');
        el.className = 'live-vehicle-marker';
        el.innerHTML = `
          <div style="
            background: #10b981;
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            border: 4px solid white;
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.6);
            cursor: pointer;
          ">
            🚚
          </div>
        `;

        liveVehicleMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat(location.coordinates)
          .addTo(map.current);
      } else {
        // Update existing marker position
        liveVehicleMarkerRef.current.setLngLat(location.coordinates);
      }

      // Update popup with live data
      const popup = new mapboxgl.Popup({ offset: 30, closeButton: false }).setHTML(`
        <div style="color: black; padding: 12px; min-width: 220px;">
          <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">🚚</span>
            <span>Live Tracking</span>
            <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 999px; font-size: 10px;">● LIVE</span>
          </div>
          <div style="font-size: 12px; line-height: 1.8;">
            <div><strong>Progress:</strong> ${progress}%</div>
            <div><strong>Speed:</strong> ${speed} km/h</div>
            <div><strong>Heading:</strong> ${Math.round(heading)}°</div>
            <div><strong>Traveled:</strong> ${distanceTraveled} km</div>
            <div><strong>Remaining:</strong> ${distanceRemaining} km</div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
              <div style="background: #e5e7eb; height: 10px; border-radius: 4px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #3b82f6, #10b981); height: 100%; width: ${progress}%; transition: width 0.5s;"></div>
              </div>
            </div>
          </div>
        </div>
      `);

      liveVehicleMarkerRef.current.setPopup(popup).togglePopup();

      // Update tracking state
      setVehicleTracking({
        vehicleId,
        speed,
        progress,
        distanceTraveled,
        distanceRemaining,
        location: location.coordinates
      });

      // Center map on vehicle
      map.current.flyTo({
        center: location.coordinates,
        zoom: 13,
        duration: 2000
      });
    };

    const handleVehicleArrived = (data) => {
      console.log('🏁 Vehicle arrived!', data);
      alert(`✅ Vehicle has completed the route!`);
      
      if (liveVehicleMarkerRef.current) {
        const popup = new mapboxgl.Popup({ offset: 30 }).setHTML(`
          <div style="color: black; padding: 12px; text-align: center;">
            <div style="font-size: 48px;">🏁</div>
            <div style="font-weight: bold; font-size: 16px; color: #10b981;">Delivery Complete!</div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">All stops visited</div>
          </div>
        `);
        liveVehicleMarkerRef.current.setPopup(popup).togglePopup();
      }
      
      setVehicleTracking(null);
    };

    const handleTrackingStopped = (data) => {
      console.log('🛑 Tracking stopped', data);
      if (liveVehicleMarkerRef.current) {
        liveVehicleMarkerRef.current.remove();
        liveVehicleMarkerRef.current = null;
      }
      setVehicleTracking(null);
    };

    socket.on('vehicle-location-update', handleLocationUpdate);
    socket.on('vehicle-arrived', handleVehicleArrived);
    socket.on('vehicle-tracking-stopped', handleTrackingStopped);

    return () => {
      socket.off('vehicle-location-update', handleLocationUpdate);
      socket.off('vehicle-arrived', handleVehicleArrived);
      socket.off('vehicle-tracking-stopped', handleTrackingStopped);
    };
  }, [socket, mapLoaded]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'normal': return '#3b82f6';
      case 'low': return '#6b7280';
      default: return '#3b82f6';
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Map instruction */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-slate-800/90 text-white px-4 py-2 rounded-lg text-sm z-10">
        Click on the map to select delivery location
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 left-4 bg-slate-800/90 p-3 rounded-lg z-10">
        <h4 className="text-white text-sm font-medium mb-2">Legend</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span className="text-slate-300">Normal Priority</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            <span className="text-slate-300">High Priority</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-slate-300">Urgent</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="text-slate-300">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500"></span>
            <span className="text-slate-300">Vehicle</span>
          </div>
        </div>
        
        {/* Routes Legend */}
        <div className="border-t border-slate-600 mt-2 pt-2">
          <h5 className="text-white text-xs font-medium mb-1">Route</h5>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-6 h-1 bg-blue-500 rounded"></span>
              <span className="text-slate-300">Best Route</span>
            </div>
          </div>
        </div>

        {/* Live Tracking Status */}
        {vehicleTracking && (
          <div className="border-t border-slate-600 mt-2 pt-2">
            <h5 className="text-white text-xs font-medium mb-1 flex items-center gap-1">
              <span className="animate-pulse text-green-500">●</span> Live Tracking
            </h5>
            <div className="space-y-1 text-xs text-slate-300">
              <div>Speed: {vehicleTracking.speed} km/h</div>
              <div>Progress: {vehicleTracking.progress}%</div>
              <div>Distance: {vehicleTracking.distanceTraveled} km / {vehicleTracking.distanceRemaining} km left</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Map;
