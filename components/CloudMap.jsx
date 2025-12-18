import React, { useState, useEffect } from 'react';
import Map from 'react-map-gl/mapbox';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers'; // ✅ Best for variable 3D blobs
import { parseWeatherBinary } from '../utils/weatherParser';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const INITIAL_VIEW_STATE = {
  longitude: 105.5,
  latitude: -6.5,
  zoom: 8,
  pitch: 60, // Keep the 3D tilt
  bearing: 20
};

export default function CloudMap() {
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState("Initializing...");
  const [debugStats, setDebugStats] = useState(null);

  // Radar Color: More transparency for light rain
  function getRadarColor(val) {
    const normalized = Math.min(val, 30) / 30;
    
    // Light rain: Almost invisible blue (Alpha 40)
    if (normalized < 0.1) return [0, 150, 255, 40]; 
    
    // Moderate: Green
    if (normalized < 0.3) return [0, 255, 100, 150];
    
    // Heavy: Yellow
    if (normalized < 0.5) return [255, 255, 0, 200];
    
    // Storm: Red (Opaque)
    return [255, 50, 50, 255];
  }

  useEffect(() => {
    async function load() {
      setStatus("Fetching Data...");
      const filename = "3B-HHR-E.MS.MRG.3IMERG.20251218-S023000-E025959.0150.V07B.HDF5";
      const url = `http://localhost:8000/api/gpm/data?filename=${filename}&toplat=-5&bottomlat=-12&leftlon=104&rightlon=115&format=bin`;
      
      try {
        const raw = await parseWeatherBinary(url);
        
        if (raw && raw.count > 0) {
          setStatus(`✅ Loaded ${raw.count.toLocaleString()} points`);

          const simplePoints = [];
          let maxVal = 0;

          for(let i=0; i < raw.count; i++) {
             const val = raw.vals[i];
             
             // OPTIMIZATION: Skip very light rain to clear the map
             // If it's less than 0.2mm, don't even render it
             if (val < 0.2) continue; 

             if(val > maxVal) maxVal = val;

             // Altitude: 15km + height boost for storms
             const altitude = 15000 + (val * 300);

             simplePoints.push({
               position: [raw.lons[i], raw.lats[i], altitude], 
               value: val
             });
          }

          setDebugStats({ count: simplePoints.length, peak: maxVal.toFixed(2) });
          setPoints(simplePoints);

        } else {
          setStatus("⚠️ No Data Found");
        }
      } catch (e) {
        setStatus("❌ Error: " + e.message);
      }
    }
    load();
  }, []);

  const layers = [
    // 1. CLOUD LAYER (Variable Sized Blobs)
    new ScatterplotLayer({
      id: 'rain-3d-blobs',
      data: points,
      
      // POSITION (x, y, z)
      getPosition: d => d.position,
      
      // RADIUS (The Key Fix)
      // Light rain = 100m (tiny)
      // Heavy rain = 8000m (big)
      getRadius: d => {
        // Logarithmic scaling works best for weather
        // Base 100m + (Value * 200m)
        return 100 + (d.value * 200);
      },
      
      // COLOR
      getFillColor: d => getRadarColor(d.value),

      // VISUALS
      radiusUnits: 'meters',
      stroked: false,
      filled: true,
      radiusMinPixels: 1, // Allow them to be tiny
      radiusMaxPixels: 1000,
      
      // OPTIONAL: Blur effect for "Cloud" look
      // (DeckGL doesn't have native blur, but we simulate it with transparent overlapping circles)
      pickable: true,
    }),

    // 2. SHADOW LAYER (Ground reference)
    new ScatterplotLayer({
      id: 'cloud-shadows',
      data: points,
      getPosition: d => [d.position[0], d.position[1], 0], // Ground
      getRadius: d => 100 + (d.value * 200), // Same size as cloud
      getFillColor: [0, 0, 0, 30], // Faint black
      radiusUnits: 'meters',
      pickable: false
    })
  ];

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        style={{ width: '100%', height: '100%' }}
        getTooltip={({object}) => object && `${object.value.toFixed(1)} mm/hr`}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          reuseMaps
        />
      </DeckGL>

      <div style={{
        position: 'absolute', top: 20, left: 20, 
        background: 'rgba(0,0,0,0.8)', color: '#0f0', padding: '15px', 
        borderRadius: '8px', border: '1px solid #444', fontFamily: 'monospace'
      }}>
        <div><strong>Layer:</strong> 3D Variable Blobs</div>
        <div><strong>Status:</strong> {status}</div>
        {debugStats && <div><strong>Points Rendered:</strong> {debugStats.count.toLocaleString()}</div>}
      </div>
    </div>
  );
}