/**
 * Traffic Service
 * Uses Google Gemini AI for traffic prediction and analysis
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const NodeCache = require('node-cache');

class TrafficService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 300 }); // 5 min cache
    this.genAI = process.env.GEMINI_API_KEY 
      ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      : null;
  }

  /**
   * Get current traffic conditions for a location
   */
  async getCurrentTraffic(lat, lng, radius = 5000) {
    const cacheKey = `traffic:${lat}:${lng}:${radius}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Simulate real-time traffic data
    // In production, integrate with traffic APIs like TomTom, HERE, or Google
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    
    // Traffic patterns based on time
    let baseLevel = 'moderate';
    let congestionIndex = 50;

    // Rush hours (7-9 AM, 5-7 PM on weekdays)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        baseLevel = 'heavy';
        congestionIndex = 75 + Math.random() * 20;
      } else if (hour >= 10 && hour <= 16) {
        baseLevel = 'moderate';
        congestionIndex = 40 + Math.random() * 20;
      } else {
        baseLevel = 'light';
        congestionIndex = 20 + Math.random() * 20;
      }
    } else {
      // Weekends
      baseLevel = 'light';
      congestionIndex = 25 + Math.random() * 25;
    }

    const result = {
      location: { lat, lng },
      timestamp: new Date(),
      level: baseLevel,
      congestionIndex: Math.round(congestionIndex),
      averageSpeed: Math.round(60 - (congestionIndex * 0.4)), // km/h
      incidents: [],
      segments: this.generateTrafficSegments(lat, lng, radius, congestionIndex)
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  generateTrafficSegments(centerLat, centerLng, radius, baseCongestion) {
    const segments = [];
    const numSegments = 8;
    
    for (let i = 0; i < numSegments; i++) {
      const angle = (i / numSegments) * 2 * Math.PI;
      const segmentLat = centerLat + (radius / 111000) * Math.cos(angle);
      const segmentLng = centerLng + (radius / 111000 / Math.cos(centerLat * Math.PI / 180)) * Math.sin(angle);
      
      const variation = (Math.random() - 0.5) * 30;
      const segmentCongestion = Math.max(0, Math.min(100, baseCongestion + variation));
      
      segments.push({
        id: `seg-${i}`,
        coordinates: [segmentLng, segmentLat],
        congestion: Math.round(segmentCongestion),
        level: segmentCongestion > 70 ? 'heavy' : segmentCongestion > 40 ? 'moderate' : 'light',
        speed: Math.round(60 - segmentCongestion * 0.4)
      });
    }
    
    return segments;
  }

  /**
   * Generate road names based on location (supports Indian cities like Jaipur)
   */
  generateRoadName(coordinates, index, city = 'Jaipur') {
    const roadPrefixes = {
      'Jaipur': ['MI Road', 'JLN Marg', 'Tonk Road', 'Ajmer Road', 'Sikar Road', 'Amber Road', 'Agra Road', 'SMS Highway', 'Station Road', 'Gopalbari'],
      'Delhi': ['NH-8', 'Ring Road', 'MG Road', 'Rajpath', 'Lodhi Road', 'Aurobindo Marg'],
      'Mumbai': ['Marine Drive', 'SV Road', 'LBS Marg', 'Eastern Express Highway', 'Western Express Highway'],
      'default': ['Main Road', 'Highway', 'Ring Road', 'Bypass Road', 'Central Avenue']
    };
    
    const roads = roadPrefixes[city] || roadPrefixes['default'];
    const roadName = roads[index % roads.length];
    const segment = Math.floor(Math.random() * 10) + 1;
    return `${roadName} - Segment ${segment}`;
  }

  /**
   * Predict traffic using Google Gemini AI with comprehensive Indian city context
   */
  async predictTraffic(coordinates, dateTime, historicalData = null, city = 'Jaipur') {
    if (!this.genAI) {
      // Fallback prediction without AI
      return this.fallbackPrediction(coordinates, dateTime, city);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateTime.getDay()];
      const isWeekday = dateTime.getDay() >= 1 && dateTime.getDay() <= 5;
      const hour = dateTime.getHours();
      const currentTime = `${hour}:${String(dateTime.getMinutes()).padStart(2, '0')}`;

      const prompt = `
You are a traffic prediction AI system for ${city}, India.

Given the following information:
- Location coordinates: ${JSON.stringify(coordinates)}
- Current Date and Time: ${dateTime.toISOString()}
- Day of week: ${dayName} (${isWeekday ? 'Weekday' : 'Weekend'})
- Current Time: ${currentTime}
- City: ${city}, India
${historicalData ? `- Historical traffic data: ${JSON.stringify(historicalData)}` : ''}

Predict traffic conditions for the next 2 hours.

Return output as JSON with the following structure for each road segment:
{
  "predictions": [
    {
      "roadName": "Road name in ${city}",
      "coordinates": [lng, lat],
      "congestionLevel": "Low" | "Medium" | "High",
      "expectedDelayMinutes": number,
      "confidenceScore": 0.0 to 1.0,
      "averageSpeed": number in km/h,
      "predictedFor": "next 2 hours",
      "timeOfDay": "current hour",
      "factors": ["rush hour", "weather", "events", etc]
    }
  ],
  "overallPrediction": {
    "level": "Low|Medium|High",
    "avgCongestion": 0-100,
    "totalExpectedDelay": number in minutes,
    "bestTimeWindow": "HH:MM-HH:MM",
    "recommendation": "string"
  }
}

Consider:
- ${city} traffic patterns (rush hours 8-10 AM and 6-8 PM on weekdays)
- Indian road conditions and driver behavior
- Time of day: ${currentTime} (${dayName})
- Weekend vs weekday differences

Only respond with valid JSON, no additional text.
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const predictions = JSON.parse(jsonMatch[0]);
        return {
          ...predictions,
          source: 'gemini-ai',
          generatedAt: new Date()
        };
      }
    } catch (error) {
      console.error('Gemini AI prediction error:', error.message);
    }

    // Fallback if AI fails
    return this.fallbackPrediction(coordinates, dateTime);
  }

  /**
   * Fallback prediction using time-based heuristics with realistic variation
   * Includes road names, proper congestion levels, and 2-hour predictions
   */
  fallbackPrediction(coordinates, dateTime, city = 'Jaipur') {
    const hour = dateTime.getHours();
    const minute = dateTime.getMinutes();
    const dayOfWeek = dateTime.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    
    // More detailed time-based traffic patterns for Indian cities
    let trafficPattern = 'normal';
    let baseCongestion = 35;
    let recommendation = 'Good time for deliveries';
    let bestTimeWindow = 'current';
    let factors = ['time_of_day', dayName.toLowerCase()];

    if (isWeekday) {
      if (hour >= 8 && hour <= 10) {
        trafficPattern = 'morning_rush';
        baseCongestion = 70 + Math.random() * 20;
        factors = ['morning_rush_hour', 'office_commute', 'school_traffic', city.toLowerCase()];
        recommendation = `Heavy morning traffic in ${city}. Consider starting after 10:30 AM`;
        bestTimeWindow = '10:30 AM - 12:00 PM';
      } else if (hour >= 18 && hour <= 20) {
        trafficPattern = 'evening_rush';
        baseCongestion = 75 + Math.random() * 20;
        factors = ['evening_rush_hour', 'return_commute', 'market_hours', city.toLowerCase()];
        recommendation = `Peak evening traffic in ${city}. Plan for delays or wait until 8:30 PM`;
        bestTimeWindow = '8:30 PM - 10:00 PM';
      } else if (hour >= 12 && hour <= 14) {
        trafficPattern = 'lunch_hour';
        baseCongestion = 45 + Math.random() * 15;
        factors = ['lunch_traffic', 'moderate_flow'];
        recommendation = 'Moderate lunch hour traffic. Generally good for deliveries';
        bestTimeWindow = 'current';
      } else if (hour >= 10 && hour < 12) {
        trafficPattern = 'mid_morning';
        baseCongestion = 30 + Math.random() * 15;
        factors = ['light_traffic', 'good_conditions'];
        recommendation = 'Excellent time for deliveries! Light traffic expected';
        bestTimeWindow = 'current';
      } else if (hour >= 14 && hour < 17) {
        trafficPattern = 'afternoon';
        baseCongestion = 40 + Math.random() * 15;
        factors = ['normal_traffic', 'school_traffic'];
        recommendation = 'Good conditions. Some school traffic after 3 PM';
        bestTimeWindow = 'current';
      } else if (hour >= 20 || hour < 6) {
        trafficPattern = 'night';
        baseCongestion = 15 + Math.random() * 15;
        factors = ['minimal_traffic', 'night_hours'];
        recommendation = 'Very light traffic. Best time for long-distance deliveries';
        bestTimeWindow = 'current';
      } else {
        trafficPattern = 'early_morning';
        baseCongestion = 25 + Math.random() * 15;
        factors = ['light_traffic', 'early_hours'];
        recommendation = 'Light traffic. Good time to start deliveries';
        bestTimeWindow = 'current';
      }
    } else {
      // Weekend patterns
      if (hour >= 10 && hour <= 14) {
        trafficPattern = 'weekend_midday';
        baseCongestion = 40 + Math.random() * 20;
        factors = ['weekend_shopping', 'leisure_traffic'];
        recommendation = 'Moderate weekend traffic near shopping areas';
        bestTimeWindow = 'Before 10 AM or after 6 PM';
      } else if (hour >= 18 && hour <= 21) {
        trafficPattern = 'weekend_evening';
        baseCongestion = 45 + Math.random() * 15;
        factors = ['weekend_dining', 'entertainment_traffic'];
        recommendation = 'Moderate traffic near restaurants and entertainment areas';
        bestTimeWindow = 'current';
      } else {
        trafficPattern = 'weekend_off_peak';
        baseCongestion = 20 + Math.random() * 20;
        factors = ['weekend', 'light_traffic'];
        recommendation = 'Light weekend traffic. Great time for deliveries!';
        bestTimeWindow = 'current';
      }
    }

    // Generate varied predictions for each coordinate with road names
    const predictions = coordinates.map((coord, index) => {
      // Add variation based on position in route
      const positionFactor = Math.sin(index * 0.5) * 15;
      const randomVariation = (Math.random() - 0.5) * 20;
      const congestion = Math.max(5, Math.min(95, Math.round(baseCongestion + positionFactor + randomVariation)));
      
      // Map congestion to Low/Medium/High as required
      const congestionLevel = congestion > 65 ? 'High' : congestion > 35 ? 'Medium' : 'Low';
      const level = congestion > 70 ? 'heavy' : congestion > 50 ? 'moderate' : congestion > 30 ? 'light' : 'very_light';
      const delay = Math.round(congestion / 12); // Expected delay in minutes
      const averageSpeed = Math.round(60 - (congestion * 0.5)); // Speed in km/h
      const confidenceBase = isWeekday ? 0.75 : 0.65; // Higher confidence on weekdays
      const confidenceScore = Math.min(0.95, Math.max(0.50, confidenceBase + (Math.random() * 0.2 - 0.1)));
      
      return {
        roadName: this.generateRoadName(coord, index, city),
        coordinates: coord,
        congestionLevel, // Low/Medium/High as required
        expectedDelayMinutes: delay,
        confidenceScore: parseFloat(confidenceScore.toFixed(2)), // 0-1 as required
        averageSpeed, // km/h
        predictedFor: 'next 2 hours',
        timeOfDay: `${hour}:${String(minute).padStart(2, '0')}`,
        // Legacy fields for backward compatibility
        predictedLevel: level,
        congestionIndex: congestion,
        confidence: Math.round(confidenceScore * 100),
        estimatedDelay: delay,
        factors: [...factors, `segment_${index + 1}`]
      };
    });

    // Calculate overall stats with proper formatting
    const avgCongestion = Math.round(predictions.reduce((sum, p) => sum + p.congestionIndex, 0) / predictions.length);
    const totalDelay = predictions.reduce((sum, p) => sum + p.expectedDelayMinutes, 0);
    const overallLevel = avgCongestion > 70 ? 'heavy' : avgCongestion > 50 ? 'moderate' : avgCongestion > 30 ? 'light' : 'very_light';
    const overallCongestionLevel = avgCongestion > 65 ? 'High' : avgCongestion > 35 ? 'Medium' : 'Low';

    return {
      predictions,
      overallPrediction: {
        level: overallCongestionLevel, // Low/Medium/High format
        legacyLevel: overallLevel, // Keep legacy format
        avgCongestion,
        totalExpectedDelay: totalDelay, // Total delay in minutes
        bestTimeWindow,
        recommendation,
        trafficPattern,
        city,
        predictedFor: 'next 2 hours',
        analyzedAt: `${hour}:${String(minute).padStart(2, '0')} ${dayName}`
      },
      source: 'smart-heuristic',
      generatedAt: new Date()
    };
  }

  /**
   * Analyze traffic along a route
   */
  async analyzeRouteTraffic(routeCoordinates, departureTime) {
    const predictions = await this.predictTraffic(routeCoordinates, departureTime);
    
    // Calculate route-specific metrics
    const segments = [];
    let totalDelay = 0;
    let worstSegment = null;
    let worstCongestion = 0;

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const start = routeCoordinates[i];
      const end = routeCoordinates[i + 1];
      
      const segmentPrediction = predictions.predictions.find(
        p => p.coordinates && 
        Math.abs(p.coordinates[0] - start[0]) < 0.01 &&
        Math.abs(p.coordinates[1] - start[1]) < 0.01
      ) || predictions.predictions[0];

      const segment = {
        from: start,
        to: end,
        level: segmentPrediction?.predictedLevel || 'moderate',
        congestion: segmentPrediction?.congestionIndex || 50,
        estimatedDelay: segmentPrediction?.estimatedDelay || 0
      };

      segments.push(segment);
      totalDelay += segment.estimatedDelay;

      if (segment.congestion > worstCongestion) {
        worstCongestion = segment.congestion;
        worstSegment = segment;
      }
    }

    return {
      segments,
      summary: {
        totalSegments: segments.length,
        totalEstimatedDelay: totalDelay,
        averageCongestion: Math.round(
          segments.reduce((sum, s) => sum + s.congestion, 0) / segments.length
        ),
        worstSegment,
        overallLevel: predictions.overallPrediction?.level || 'moderate'
      },
      recommendation: this.generateRouteRecommendation(segments, predictions),
      departureTime,
      analyzedAt: new Date()
    };
  }

  generateRouteRecommendation(segments, predictions) {
    const avgCongestion = segments.reduce((sum, s) => sum + s.congestion, 0) / segments.length;
    const heavySegments = segments.filter(s => s.congestion > 70).length;
    
    if (avgCongestion > 70 || heavySegments > segments.length * 0.5) {
      return {
        action: 'consider_delay',
        message: 'Heavy traffic expected. Consider delaying departure or finding alternate routes.',
        suggestedDelay: 30
      };
    } else if (avgCongestion > 50) {
      return {
        action: 'proceed_with_caution',
        message: 'Moderate traffic. Allow extra time for deliveries.',
        suggestedDelay: 15
      };
    }
    
    return {
      action: 'proceed',
      message: 'Traffic conditions are favorable for deliveries.',
      suggestedDelay: 0
    };
  }

  /**
   * Get traffic incidents in an area
   */
  async getIncidents(lat, lng, radius = 10000) {
    // Simulate incidents - in production, integrate with traffic incident APIs
    const numIncidents = Math.floor(Math.random() * 3);
    const incidents = [];

    const incidentTypes = ['accident', 'road_work', 'congestion', 'event', 'weather'];
    const severities = ['low', 'medium', 'high'];

    for (let i = 0; i < numIncidents; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * radius;
      
      incidents.push({
        id: `inc-${Date.now()}-${i}`,
        type: incidentTypes[Math.floor(Math.random() * incidentTypes.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        location: {
          lat: lat + (distance / 111000) * Math.cos(angle),
          lng: lng + (distance / 111000 / Math.cos(lat * Math.PI / 180)) * Math.sin(angle)
        },
        description: this.generateIncidentDescription(incidentTypes[Math.floor(Math.random() * incidentTypes.length)]),
        reportedAt: new Date(Date.now() - Math.random() * 3600000),
        estimatedClearTime: new Date(Date.now() + Math.random() * 7200000),
        affectedLanes: Math.ceil(Math.random() * 3),
        delayMinutes: Math.round(5 + Math.random() * 25)
      });
    }

    return {
      location: { lat, lng },
      radius,
      incidents,
      count: incidents.length,
      queriedAt: new Date()
    };
  }

  generateIncidentDescription(type) {
    const descriptions = {
      accident: 'Vehicle collision reported',
      road_work: 'Road maintenance in progress',
      congestion: 'Heavy traffic congestion',
      event: 'Special event causing delays',
      weather: 'Weather-related slowdown'
    };
    return descriptions[type] || 'Traffic incident reported';
  }

  /**
   * Get optimal departure time
   */
  async getOptimalDepartureTime(origin, destination, preferredTimeRange = null) {
    const now = new Date();
    const timeSlots = [];
    
    // Analyze next 12 hours in 30-minute intervals
    for (let i = 0; i < 24; i++) {
      const slotTime = new Date(now.getTime() + i * 30 * 60 * 1000);
      
      if (preferredTimeRange) {
        const [startHour, endHour] = preferredTimeRange;
        const hour = slotTime.getHours();
        if (hour < startHour || hour > endHour) continue;
      }
      
      const prediction = await this.predictTraffic(
        [[origin.lng, origin.lat], [destination.lng, destination.lat]],
        slotTime
      );
      
      timeSlots.push({
        departureTime: slotTime,
        congestion: prediction.overallPrediction?.avgCongestion || 50,
        level: prediction.overallPrediction?.level || 'moderate',
        estimatedDelay: prediction.predictions?.[0]?.estimatedDelay || 10
      });
    }

    // Sort by congestion to find best time
    timeSlots.sort((a, b) => a.congestion - b.congestion);
    const optimal = timeSlots[0];
    const worst = timeSlots[timeSlots.length - 1];

    return {
      optimalDeparture: optimal,
      worstTime: worst,
      allSlots: timeSlots.slice(0, 5), // Top 5 best times
      timeSavings: worst.estimatedDelay - optimal.estimatedDelay,
      recommendation: `Depart at ${optimal.departureTime.toLocaleTimeString()} for best traffic conditions`
    };
  }

  /**
   * AI Traffic Incident Analyzer
   * Analyzes incidents and determines if re-routing is required
   */
  async analyzeIncidentImpact(currentRoute, incident, vehicleLocation, city = 'Jaipur') {
    const incidentLocation = incident.location;
    const routeCoordinates = currentRoute.coordinates || currentRoute.routeGeometry || [];
    
    // Calculate distances from incident to route segments
    const affectedSegments = [];
    const impactRadius = this.getIncidentImpactRadius(incident.type, incident.severity);
    
    routeCoordinates.forEach((coord, index) => {
      const distanceToIncident = this.calculateDistance(
        coord[1], coord[0],
        incidentLocation.lat, incidentLocation.lng
      );
      
      if (distanceToIncident <= impactRadius) {
        affectedSegments.push({
          segmentIndex: index,
          coordinates: coord,
          distanceToIncident: Math.round(distanceToIncident),
          roadName: this.generateRoadName([coord], index, city),
          estimatedDelay: this.calculateIncidentDelay(incident.type, incident.severity, distanceToIncident)
        });
      }
    });

    // Determine if re-routing is required
    const reroutingRequired = this.shouldReroute(incident, affectedSegments, vehicleLocation);
    
    // Calculate updated traffic penalties
    const trafficPenalties = this.calculateTrafficPenalties(incident, affectedSegments);
    
    // Get roads to avoid
    const roadsToAvoid = affectedSegments.map(seg => ({
      roadName: seg.roadName,
      reason: `${incident.type} reported`,
      severity: incident.severity,
      estimatedDelay: seg.estimatedDelay
    }));

    // AI Analysis using Gemini (if available)
    let aiRecommendation = null;
    if (this.genAI && affectedSegments.length > 0) {
      try {
        aiRecommendation = await this.getAIIncidentAnalysis(
          incident, 
          affectedSegments, 
          vehicleLocation,
          currentRoute
        );
      } catch (error) {
        console.error('AI analysis error:', error.message);
      }
    }

    return {
      analysisTimestamp: new Date(),
      incident: {
        type: incident.type,
        severity: incident.severity,
        location: incidentLocation,
        description: incident.description || this.generateIncidentDescription(incident.type)
      },
      reroutingRequired: reroutingRequired.required,
      reroutingReason: reroutingRequired.reason,
      confidence: reroutingRequired.confidence,
      affectedSegments: {
        count: affectedSegments.length,
        details: affectedSegments
      },
      roadsToAvoid,
      trafficPenalties: {
        totalDelay: trafficPenalties.totalDelay,
        congestionIncrease: trafficPenalties.congestionIncrease,
        speedReduction: trafficPenalties.speedReduction,
        segments: trafficPenalties.segmentPenalties
      },
      vehicleStatus: {
        currentLocation: vehicleLocation,
        distanceToIncident: vehicleLocation ? this.calculateDistance(
          vehicleLocation.lat, vehicleLocation.lng,
          incidentLocation.lat, incidentLocation.lng
        ) : null,
        estimatedTimeToIncident: vehicleLocation ? this.estimateTimeToIncident(vehicleLocation, incidentLocation) : null
      },
      recommendations: aiRecommendation || this.generateFallbackRecommendations(reroutingRequired, affectedSegments),
      alternativeRouteAvailable: affectedSegments.length > 0,
      source: aiRecommendation ? 'gemini-ai' : 'rule-based-analysis'
    };
  }

  /**
   * Get AI-powered incident analysis using Gemini
   */
  async getAIIncidentAnalysis(incident, affectedSegments, vehicleLocation, currentRoute) {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `
You are an AI traffic incident analyzer for delivery route optimization.

**Current Situation:**
- Incident Type: ${incident.type}
- Severity: ${incident.severity}
- Location: ${JSON.stringify(incident.location)}
- Affected Road Segments: ${affectedSegments.length}
${vehicleLocation ? `- Vehicle Location: Lat ${vehicleLocation.lat}, Lng ${vehicleLocation.lng}` : ''}

**Affected Segments:**
${affectedSegments.map((seg, i) => `${i + 1}. ${seg.roadName} - Distance to incident: ${seg.distanceToIncident}m`).join('\n')}

**Analysis Required:**
Based on the incident type (${incident.type}) and severity (${incident.severity}):

1. Should the vehicle re-route? (Consider: severity, distance, type of incident)
2. What are the specific risks?
3. What is your confidence level in this recommendation?
4. Provide actionable recommendations

Return JSON format:
{
  "reroutingRecommended": true/false,
  "reasoning": "detailed explanation",
  "confidence": 0.0-1.0,
  "risks": ["risk1", "risk2"],
  "actionableSteps": ["step1", "step2"],
  "estimatedSavings": "time saved by re-routing in minutes",
  "urgency": "low|medium|high|critical"
}

Only respond with valid JSON, no additional text.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return null;
  }

  /**
   * Determine if re-routing should be required
   */
  shouldReroute(incident, affectedSegments, vehicleLocation) {
    if (affectedSegments.length === 0) {
      return {
        required: false,
        reason: 'Incident does not affect current route',
        confidence: 0.95
      };
    }

    const severityScore = { low: 1, medium: 2, high: 3, critical: 4 }[incident.severity] || 2;
    const typeScore = {
      accident: 3,
      road_closure: 4,
      weather: 2,
      road_work: 2,
      congestion: 1,
      event: 2
    }[incident.type] || 2;

    const totalScore = severityScore + typeScore;
    const affectedPercentage = affectedSegments.length;

    if (incident.type === 'road_closure' || (incident.severity === 'high' && totalScore >= 6)) {
      return {
        required: true,
        reason: `${incident.severity} severity ${incident.type} blocking route`,
        confidence: 0.9
      };
    }

    if (totalScore >= 5 && affectedPercentage >= 2) {
      return {
        required: true,
        reason: `Multiple segments affected by ${incident.severity} ${incident.type}`,
        confidence: 0.8
      };
    }

    if (totalScore >= 4) {
      return {
        required: true,
        reason: `Significant delay expected from ${incident.type}`,
        confidence: 0.7
      };
    }

    return {
      required: false,
      reason: 'Minor impact - proceed with caution',
      confidence: 0.75
    };
  }

  /**
   * Calculate traffic penalties from incident
   */
  calculateTrafficPenalties(incident, affectedSegments) {
    const basePenalty = {
      accident: { delay: 15, congestion: 30, speedReduction: 40 },
      road_closure: { delay: 45, congestion: 80, speedReduction: 90 },
      weather: { delay: 10, congestion: 20, speedReduction: 30 },
      road_work: { delay: 12, congestion: 25, speedReduction: 35 },
      congestion: { delay: 8, congestion: 40, speedReduction: 25 },
      event: { delay: 10, congestion: 30, speedReduction: 30 }
    }[incident.type] || { delay: 10, congestion: 20, speedReduction: 25 };

    const severityMultiplier = { low: 0.5, medium: 1.0, high: 1.5, critical: 2.0 }[incident.severity] || 1.0;

    const segmentPenalties = affectedSegments.map(seg => ({
      segmentIndex: seg.segmentIndex,
      roadName: seg.roadName,
      additionalDelay: Math.round(basePenalty.delay * severityMultiplier),
      congestionIncrease: Math.round(basePenalty.congestion * severityMultiplier),
      speedReduction: Math.round(basePenalty.speedReduction * severityMultiplier)
    }));

    return {
      totalDelay: segmentPenalties.reduce((sum, p) => sum + p.additionalDelay, 0),
      congestionIncrease: Math.round(segmentPenalties.reduce((sum, p) => sum + p.congestionIncrease, 0) / Math.max(segmentPenalties.length, 1)),
      speedReduction: Math.round(segmentPenalties.reduce((sum, p) => sum + p.speedReduction, 0) / Math.max(segmentPenalties.length, 1)),
      segmentPenalties
    };
  }

  /**
   * Get incident impact radius in meters
   */
  getIncidentImpactRadius(type, severity) {
    const baseRadius = {
      accident: 500,
      road_closure: 1000,
      weather: 2000,
      road_work: 300,
      congestion: 800,
      event: 500
    }[type] || 500;

    const severityMultiplier = { low: 0.7, medium: 1.0, high: 1.5, critical: 2.0 }[severity] || 1.0;
    return baseRadius * severityMultiplier;
  }

  /**
   * Calculate delay from incident
   */
  calculateIncidentDelay(type, severity, distance) {
    const baseDelay = {
      accident: 10,
      road_closure: 30,
      weather: 8,
      road_work: 12,
      congestion: 6,
      event: 8
    }[type] || 10;

    const severityMultiplier = { low: 0.5, medium: 1.0, high: 1.8, critical: 2.5 }[severity] || 1.0;
    const distanceMultiplier = distance < 200 ? 1.5 : distance < 500 ? 1.0 : 0.7;

    return Math.round(baseDelay * severityMultiplier * distanceMultiplier);
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Estimate time to reach incident location
   */
  estimateTimeToIncident(vehicleLocation, incidentLocation) {
    const distance = this.calculateDistance(
      vehicleLocation.lat, vehicleLocation.lng,
      incidentLocation.lat, incidentLocation.lng
    );
    const averageSpeed = 40; // km/h
    const timeInHours = (distance / 1000) / averageSpeed;
    return Math.round(timeInHours * 60); // minutes
  }

  /**
   * Generate fallback recommendations without AI
   */
  generateFallbackRecommendations(reroutingDecision, affectedSegments) {
    return {
      reroutingRecommended: reroutingDecision.required,
      reasoning: reroutingDecision.reason,
      confidence: reroutingDecision.confidence,
      risks: this.identifyRisks(reroutingDecision, affectedSegments),
      actionableSteps: this.generateActionSteps(reroutingDecision, affectedSegments),
      estimatedSavings: reroutingDecision.required ? `${Math.round(affectedSegments.reduce((sum, s) => sum + s.estimatedDelay, 0) * 0.7)} minutes` : '0 minutes',
      urgency: reroutingDecision.required && reroutingDecision.confidence > 0.85 ? 'high' : reroutingDecision.required ? 'medium' : 'low'
    };
  }

  /**
   * Identify risks from incident
   */
  identifyRisks(reroutingDecision, affectedSegments) {
    const risks = [];
    
    if (affectedSegments.length > 0) {
      risks.push(`${affectedSegments.length} road segment(s) affected`);
      const totalDelay = affectedSegments.reduce((sum, s) => sum + s.estimatedDelay, 0);
      if (totalDelay > 20) {
        risks.push(`Significant delay of ${totalDelay} minutes expected`);
      }
    }
    
    if (reroutingDecision.confidence < 0.7) {
      risks.push('Uncertain traffic conditions - monitor situation');
    }
    
    if (risks.length === 0) {
      risks.push('Minimal impact on delivery schedule');
    }
    
    return risks;
  }

  /**
   * Generate actionable steps
   */
  generateActionSteps(reroutingDecision, affectedSegments) {
    const steps = [];
    
    if (reroutingDecision.required) {
      steps.push('🔄 Initiate route recalculation immediately');
      steps.push(`⚠️ Avoid ${affectedSegments.map(s => s.roadName).join(', ')}`);
      steps.push('📱 Notify driver of route change');
      steps.push('⏱️ Update delivery ETA for affected customers');
    } else {
      steps.push('✓ Continue on current route');
      steps.push('👀 Monitor traffic conditions');
      if (affectedSegments.length > 0) {
        steps.push('⚡ Prepare alternative route as backup');
      }
    }
    
    return steps;
  }
}

module.exports = TrafficService;
