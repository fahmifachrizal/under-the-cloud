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

export default function App() {
  const mapRef = useRef(null);
  
  // State
  const [viewState, setViewState] = useState({
    longitude: 107.0,
    latitude: -7.0,
    zoom: 5,
    pitch: 45,
    bearing: 0
  });

  const [geojson, setGeojson] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [showScatter, setShowScatter] = useState(false); // <--- New Toggle State

  // 1. Fetch Vector Data (On Mount)
  useEffect(() => {
    async function fetchVectorData() {
      setStatus("Fetching 3D Vectors...");
      
      const params = new URLSearchParams({
        filename: FILENAME,
        ...BOUNDS,
        draw: 'vector' // Explicitly ask for vectors
      });

      try {
        const res = await fetch(`http://localhost:8000/api/gpm?${params}`);
        if (!res.ok) throw new Error(res.statusText);

        const data = await res.json();
        
        if (data.features.length === 0) {
          setStatus("⚠️ No rain polygons found");
        } else {
          setGeojson(data);
          setStatus(`✅ Loaded ${data.features.length} 3D layers`);
          
          // Auto-Zoom to Data
          if (mapRef.current) {
            const bbox = new mapboxgl.LngLatBounds();
            // Flatten the deep GeoJSON structure to find bounds
            data.features.forEach(f => {
              const coords = f.geometry.coordinates; // [ [ [x,y] ] ]
              coords.forEach(poly => {
                poly.forEach(ring => {
                  ring.forEach(pt => bbox.extend(pt));
                });
              });
            });

            if (!bbox.isEmpty()) {
              mapRef.current.fitBounds(bbox, { padding: 100, pitch: 45, duration: 2000 });
            }
          }
        }
      } catch (e) {
        console.error(e);
        setStatus("❌ Error: " + e.message);
      }
    }

    fetchVectorData();
  }, []);

  // 2. Construct Scatter Plot URL
  // Mapbox Image Source needs specific corner coordinates: [TL, TR, BR, BL]
  const imageCoordinates = [
    [BOUNDS.leftlon, BOUNDS.toplat],  // Top-Left
    [BOUNDS.rightlon, BOUNDS.toplat], // Top-Right
    [BOUNDS.rightlon, BOUNDS.bottomlat], // Bottom-Right
    [BOUNDS.leftlon, BOUNDS.bottomlat] // Bottom-Left
  ];
  
  const scatterPlotUrl = `http://localhost:8000/api/gpm?filename=${FILENAME}&toplat=${BOUNDS.toplat}&bottomlat=${BOUNDS.bottomlat}&leftlon=${BOUNDS.leftlon}&rightlon=${BOUNDS.rightlon}&draw=plot`;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection="globe"
        terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
      >
        <NavigationControl />

        {/* --- 3D TERRAIN --- */}
        <Source
          id="mapbox-dem"
          type="raster-dem"
          url="mapbox://mapbox.mapbox-terrain-dem-v1"
          tileSize={512}
          maxzoom={14}
        />

        {/* --- LAYER 1: 3D VECTORS (Default) --- */}
        {geojson && (
          <Source id="gpm-vector-source" type="geojson" data={geojson}>
            <Layer
              id="gpm-extrusion"
              type="fill-extrusion"
              paint={{
                'fill-extrusion-color': [
                  'interpolate', ['linear'], ['get', 'level'],
                  0.5, '#00aaff', 
                  5.0, '#00ff00', 
                  10.0, '#ffff00', 
                  20.0, '#ff0000'
                ],
                'fill-extrusion-height': [
                  'interpolate', ['linear'], ['get', 'level'],
                  0.5, 4000,
                  5.0, 12000,
                  10.0, 20000,
                  20.0, 35000
                ],
                'fill-extrusion-opacity': 0.8,
                'fill-extrusion-base': 0
              }}
            />
          </Source>
        )}

        {/* --- LAYER 2: SCATTER PLOT OVERLAY (Optional) --- */}
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
              beforeId="gpm-extrusion" // Draw BEHIND the 3D blocks if possible
            />
          </Source>
        )}
      </Map>

      {/* --- CONTROL PANEL --- */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(20, 20, 20, 0.9)', 
        color: 'white',
        padding: '20px', 
        borderRadius: '12px', 
        border: '1px solid #333',
        fontFamily: 'system-ui, sans-serif',
        minWidth: '250px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#44AAFF', fontWeight: '600' }}>
          🌧️ GPM 3D Visualizer
        </h3>
        
        <div style={{ marginBottom: '15px', fontSize: '13px', color: '#ccc' }}>
          <strong>Status:</strong> {status}
        </div>

        {/* CHECKBOX */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ 
            display: 'flex', alignItems: 'center', cursor: 'pointer', 
            fontSize: '14px', fontWeight: '500' 
          }}>
            <input 
              type="checkbox" 
              checked={showScatter}
              onChange={(e) => setShowScatter(e.target.checked)}
              style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
            />
            Show Debug Scatter Plot
          </label>
        </div>

        <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
          Check box to compare 3D polygons vs Raw Data points.
        </div>
      </div>
    </div>
  );
}