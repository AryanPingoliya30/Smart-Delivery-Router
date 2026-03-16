import React, { useState } from 'react';
import useStore from '../store/useStore';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const TrafficPanel = () => {
  const showTraffic = useStore((state) => state.showTraffic);
  const setShowTraffic = useStore((state) => state.setShowTraffic);
  const setTrafficData = useStore((state) => state.setTrafficData);
  const deliveryPoints = useStore((state) => state.deliveryPoints) || [];
  const optimizedRoute = useStore((state) => state.optimizedRoute);
  
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);

  const toggleTraffic = () => {
    if (setShowTraffic) setShowTraffic(!showTraffic);
  };

  const analyzeTraffic = async () => {
    // Get coordinates from optimized route or delivery points
    let coordinates = [];
    
    if (optimizedRoute?.routeGeometry && optimizedRoute.routeGeometry.length > 0) {
      // Use optimized route coordinates
      coordinates = optimizedRoute.routeGeometry;
    } else if (deliveryPoints.length > 0) {
      // Use delivery points
      coordinates = deliveryPoints
        .filter(dp => dp.location?.coordinates)
        .map(dp => dp.location.coordinates);
    }
    
    if (coordinates.length === 0) {
      alert('Please add delivery points or optimize a route first');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(API_URL + '/traffic/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          coordinates: coordinates.slice(0, 10), // Send up to 10 points
          dateTime: new Date().toISOString()
        })
      });
      const data = await response.json();
      if (data.success) {
        setPrediction(data.data);
        if (setTrafficData) setTrafficData(data.data);
      } else {
        alert('Could not analyze traffic');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error analyzing traffic');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">Traffic Analysis</h2>
        
        <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg mb-4">
          <span className="text-white text-sm">Show Traffic Layer</span>
          <button onClick={toggleTraffic} className={"w-12 h-6 rounded-full transition-colors " + (showTraffic ? 'bg-blue-600' : 'bg-slate-600')}>
            <span className={"block w-5 h-5 bg-white rounded-full transform transition-transform " + (showTraffic ? 'translate-x-6' : 'translate-x-1')}></span>
          </button>
        </div>

        <button onClick={analyzeTraffic} disabled={loading} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
          {loading ? 'Analyzing...' : 'Analyze Traffic (AI)'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <div className="p-3 bg-slate-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-white text-sm">Light Traffic</span>
            </div>
            <p className="text-slate-400 text-xs">Normal flow, no delays expected</p>
          </div>
          
          <div className="p-3 bg-slate-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="text-white text-sm">Moderate Traffic</span>
            </div>
            <p className="text-slate-400 text-xs">Some congestion, minor delays</p>
          </div>
          
          <div className="p-3 bg-slate-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-white text-sm">Heavy Traffic</span>
            </div>
            <p className="text-slate-400 text-xs">Significant delays expected</p>
          </div>
        </div>

        {prediction && (
          <div className="mt-4 p-4 bg-blue-900/30 border border-blue-500 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-blue-400 font-medium text-sm">🤖 AI Traffic Prediction</h3>
              {prediction.overallPrediction?.predictedFor && (
                <span className="text-xs text-blue-300 bg-blue-900/50 px-2 py-1 rounded">
                  📅 {prediction.overallPrediction.predictedFor}
                </span>
              )}
            </div>
            
            {/* City & Time Context */}
            {(prediction.overallPrediction?.city || prediction.overallPrediction?.analyzedAt) && (
              <div className="mb-3 flex items-center gap-2 text-xs">
                {prediction.overallPrediction.city && (
                  <span className="text-slate-400">
                    📍 {prediction.overallPrediction.city}, India
                  </span>
                )}
                {prediction.overallPrediction.analyzedAt && (
                  <span className="text-slate-500">
                    • {prediction.overallPrediction.analyzedAt}
                  </span>
                )}
              </div>
            )}
            
            {/* Overall Status */}
            {prediction.overallPrediction && (
              <div className="mb-4 p-3 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-3 h-3 rounded-full ${
                    (prediction.overallPrediction.level === 'Low' || prediction.overallPrediction.legacyLevel === 'very_light' || prediction.overallPrediction.legacyLevel === 'light') ? 'bg-green-500' :
                    (prediction.overallPrediction.level === 'Medium' || prediction.overallPrediction.legacyLevel === 'moderate') ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}></span>
                  <span className="text-white font-medium">
                    {prediction.overallPrediction.level || prediction.overallPrediction.legacyLevel?.replace('_', ' ')} Traffic
                  </span>
                </div>
                <p className={`text-sm mb-2 ${
                  (prediction.overallPrediction.level === 'High' || prediction.overallPrediction.legacyLevel === 'heavy')
                    ? 'text-orange-400' : 'text-green-400'
                }`}>
                  {(prediction.overallPrediction.level === 'High' || prediction.overallPrediction.legacyLevel === 'heavy') ? '⚠️' : '✓'} {prediction.overallPrediction.recommendation}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-700/50 p-2 rounded">
                    <span className="text-slate-400">Congestion</span>
                    <p className="text-white font-medium">{prediction.overallPrediction.avgCongestion}%</p>
                  </div>
                  <div className="bg-slate-700/50 p-2 rounded">
                    <span className="text-slate-400">Total Delay</span>
                    <p className="text-white font-medium">{prediction.overallPrediction.totalExpectedDelay || prediction.overallPrediction.totalEstimatedDelay || 0} min</p>
                  </div>
                </div>
                {prediction.overallPrediction.bestTimeWindow && prediction.overallPrediction.bestTimeWindow !== 'current' && (
                  <p className="text-blue-400 text-xs mt-2">
                    🕐 Best time: {prediction.overallPrediction.bestTimeWindow}
                  </p>
                )}
                {prediction.overallPrediction.trafficPattern && (
                  <p className="text-slate-500 text-xs mt-1 capitalize">
                    Pattern: {prediction.overallPrediction.trafficPattern.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            )}

            {/* Route Points Analysis with ALL Required Fields */}
            {prediction.predictions && prediction.predictions.length > 0 && (
              <div className="space-y-2">
                <p className="text-slate-400 text-xs font-medium mb-2">
                  Road Segments ({prediction.predictions.length} analyzed):
                </p>
                {prediction.predictions.slice(0, 5).map((point, index) => (
                  <div key={index} className="p-2 bg-slate-800/50 rounded border border-slate-700">
                    {/* Road Name */}
                    {point.roadName && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-blue-400 text-xs font-medium">🛣️ {point.roadName}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          point.congestionLevel === 'Low' || point.predictedLevel === 'very_light' || point.predictedLevel === 'light' ? 'bg-green-500' :
                          point.congestionLevel === 'Medium' || point.predictedLevel === 'moderate' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}></span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          point.congestionLevel === 'Low' || point.predictedLevel === 'very_light' || point.predictedLevel === 'light' ? 'bg-green-500/20 text-green-400' :
                          point.congestionLevel === 'Medium' || point.predictedLevel === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {point.congestionLevel || point.predictedLevel?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {point.averageSpeed && (
                          <span className="text-slate-400" title="Average Speed">
                            🚗 {point.averageSpeed} km/h
                          </span>
                        )}
                        <span className="text-slate-400">
                          {point.congestionIndex}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Additional Details Row */}
                    <div className="flex items-center justify-between mt-1 text-xs">
                      <div className="flex items-center gap-2">
                        {point.expectedDelayMinutes !== undefined && (
                          <span className="text-yellow-400">
                            ⏱️ +{point.expectedDelayMinutes}m delay
                          </span>
                        )}
                        {point.confidenceScore !== undefined && (
                          <span className="text-blue-400" title="AI Confidence Score">
                            🎯 {(point.confidenceScore * 100).toFixed(0)}% confidence
                          </span>
                        )}
                      </div>
                      {point.timeOfDay && (
                        <span className="text-slate-500">
                          {point.timeOfDay}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {prediction.predictions.length > 5 && (
                  <p className="text-slate-500 text-xs text-center">... and {prediction.predictions.length - 5} more segments</p>
                )}
              </div>
            )}

            {/* Timestamp */}
            {prediction.generatedAt && (
              <p className="text-slate-500 text-xs mt-3 flex justify-between">
                <span>Source: {prediction.source === 'gemini-ai' ? '🤖 Gemini AI' : '📊 Smart Analysis'}</span>
                <span>{new Date(prediction.generatedAt).toLocaleTimeString()}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-700 text-xs text-slate-400 text-center">
        Traffic data powered by AI prediction
      </div>
    </div>
  );
};

export default TrafficPanel;
