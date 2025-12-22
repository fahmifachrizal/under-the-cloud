'use client';

import React, { useState, useEffect, useRef } from 'react';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/mapbox';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Config Constants
const FILENAME = "3B-HHR-E.MS.MRG.3IMERG.20251218-S023000-E025959.0150.V07B.HDF5";
const BOUNDS = {
  toplat: -5,
  bottomlat: -10,
  leftlon: 104,
  rightlon: 115
};

// 1. HELPER: Calculate Time Synchronously
function getTimeBasedPreset() {
  // Use browser's local time
  const hour = new Date().getHours();
  console.log(`Current Hour: ${hour}`); // Debug log
  
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night'; // 7 PM to 5 AM
}

export default function App() {
  const mapRef = useRef(null);

  // 2. FIX: Initialize State IMMEDIATELY (No waiting for useEffect)
  const [lightPreset, setLightPreset] = useState(() => getTimeBasedPreset());
  
  const [viewState, setViewState] = useState({
    longitude: 107.0,
    latitude: -7.0,
    zoom: 5,
    pitch: 45,
    bearing: 0
  });

  const [geojson, setGeojson] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [showScatter, setShowScatter] = useState(false);

  // 3. NEW: Update Map Config Dynamically whenever lightPreset changes
  useEffect(() => {
    if (mapRef.current) {
        const map = mapRef.current.getMap();
        // Check if map is ready and style is standard
        if (map && map.isStyleLoaded() && map.getStyle().name === 'Mapbox Standard') {
            try {
                console.log(`Updating Light Preset to: ${lightPreset}`);
                map.setConfig('basemap', { lightPreset: lightPreset });
            } catch (err) {
                console.warn("Config update failed:", err);
            }
        }
    }
  }, [lightPreset]); // Runs if preset changes

  // Fetch Data Logic (Same as before)
  useEffect(() => {
    async function fetchVectorData() {
      setStatus("Fetching 3D Vectors...");
      const params = new URLSearchParams({
        filename: FILENAME,
        ...BOUNDS,
        draw: 'vector'
      });

      try {
        const res = await fetch(`http://localhost:8000/api/gpm?${params}`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        
        if (data.features.length > 0) {
          setGeojson(data);
          setStatus(`✅ Loaded ${data.features.length} 3D layers`);
          
          if (mapRef.current) {
            const bbox = new mapboxgl.LngLatBounds();
            data.features.forEach(f => {
              f.geometry.coordinates.forEach(poly => {
                poly.forEach(ring => {
                  ring.forEach(pt => bbox.extend(pt));
                });
              });
            });
            if (!bbox.isEmpty()) {
              mapRef.current.fitBounds(bbox, { padding: 100, pitch: 50, duration: 2000 });
            }
          }
        } else {
            setStatus("⚠️ No rain polygons found");
        }
      } catch (e) {
        console.error(e);
        setStatus("❌ Error: " + e.message);
      }
    }
    fetchVectorData();
  }, []);

  // Map Load Handler
  const onMapLoad = (e) => {
    const map = e.target;
    console.log("Map Loaded. Applying Initial Preset:", lightPreset);
    
    // Apply initial config immediately on load
    if (map.style && map.style.stylesheet) {
       try {
         map.setConfig('basemap', {
            lightPreset: lightPreset,
            showPointOfInterestLabels: false
         });
       } catch (err) {
         console.warn("Could not set basemap config", err);
       }
    }
  };

  const imageCoordinates = [
    [BOUNDS.leftlon, BOUNDS.toplat],
    [BOUNDS.rightlon, BOUNDS.toplat],
    [BOUNDS.rightlon, BOUNDS.bottomlat],
    [BOUNDS.leftlon, BOUNDS.bottomlat]
  ];
  const scatterPlotUrl = `http://localhost:8000/api/gpm?filename=${FILENAME}&toplat=${BOUNDS.toplat}&bottomlat=${BOUNDS.bottomlat}&leftlon=${BOUNDS.leftlon}&rightlon=${BOUNDS.rightlon}&draw=plot`;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onLoad={onMapLoad}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/standard"
        projection="globe"
      >
        <NavigationControl />

        {geojson && (
          <Source id="gpm-vector-source" type="geojson" data={geojson}>
            <Layer
              id="gpm-extrusion"
              type="fill-extrusion"
              paint={{
                'fill-extrusion-color': [
                  'interpolate', ['linear'], ['get', 'level'],
                  0.5, '#00aaff', 5.0, '#00ff00', 10.0, '#ffff00', 20.0, '#ff0000'
                ],
                'fill-extrusion-height': [
                    'interpolate', ['linear'], ['zoom'],
                    4, ['*', ['interpolate', ['linear'], ['get', 'level'], 0.5, 4000, 20.0, 35000], 0.05],
                    6, ['*', ['interpolate', ['linear'], ['get', 'level'], 0.5, 4000, 20.0, 35000], 0.2],
                    8, ['*', ['interpolate', ['linear'], ['get', 'level'], 0.5, 4000, 20.0, 35000], 0.6],
                    10,['interpolate', ['linear'], ['get', 'level'], 0.5, 4000, 20.0, 35000]
                ],
                'fill-extrusion-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {showScatter && (
          <Source 
            id="gpm-scatter-source" 
            type="image" 
            url={scatterPlotUrl} 
            coordinates={imageCoordinates}
          >
            <Layer 
              id="gpm-scatter-layer" 
              type="raster" 
              paint={{ 'raster-opacity': 1.0, 'raster-fade-duration': 0 }} 
              beforeId="gpm-extrusion"
            />
          </Source>
        )}
      </Map>

      {/* --- CONTROL PANEL --- */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(20, 20, 20, 0.85)', 
        color: 'white',
        padding: '20px', 
        borderRadius: '12px', 
        border: '1px solid #444',
        fontFamily: 'system-ui, sans-serif',
        minWidth: '260px',
        backdropFilter: 'blur(10px)'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#44AAFF' }}>
          🌧️ GPM 3D Visualizer
        </h3>
        
        <div style={{ marginBottom: '15px', fontSize: '12px', color: '#aaa' }}>
          <strong>Time Mode:</strong> {lightPreset.toUpperCase()}<br/>
          <strong>Status:</strong> {status}
        </div>

        {/* Manual Time Override (Optional Debugging) */}
        <select 
            value={lightPreset} 
            onChange={(e) => setLightPreset(e.target.value)}
            style={{ marginBottom: '10px', width: '100%', padding: '5px', background: '#333', color: 'white', border: 'none' }}
        >
            <option value="dawn">Dawn</option>
            <option value="day">Day</option>
            <option value="dusk">Dusk</option>
            <option value="night">Night</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}>
            <input 
              type="checkbox" 
              checked={showScatter}
              onChange={(e) => setShowScatter(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Overlay Debug Data
          </label>
        </div>
      </div>
    </div>
  );
}