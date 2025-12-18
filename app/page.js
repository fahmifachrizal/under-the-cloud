'use client';

import React, { useState, useEffect } from 'react';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function App() {
  const [viewState, setViewState] = useState({
    longitude: 108.0,
    latitude: -7.0,
    zoom: 6.5,
    pitch: 55,
    bearing: 0
  });

  const [geojson, setGeojson] = useState(null);
  const [status, setStatus] = useState("Idle");

  useEffect(() => {
    async function fetchVectorData() {
      setStatus("Requesting Vector Data...");
      
      const filename = "3B-HHR-E.MS.MRG.3IMERG.20251218-S023000-E025959.0150.V07B.HDF5";
      // Bounds for Java/Indonesia
      const params = new URLSearchParams({
        filename: filename,
        toplat: -5,
        bottomlat: -10,
        leftlon: 105,
        rightlon: 115
      });

      try {
        const res = await fetch(`http://localhost:8000/api/gpm/vector?${params}`);
        if (!res.ok) throw new Error("Backend Failed");
        
        const data = await res.json();
        setGeojson(data);
        setStatus(`Loaded ${data.features.length} polygons`);
      } catch (e) {
        console.error(e);
        setStatus("Error: " + e.message);
      }
    }

    fetchVectorData();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
      >
        <NavigationControl />

        {/* 3D Terrain Source */}
        <Source
          id="mapbox-dem"
          type="raster-dem"
          url="mapbox://mapbox.mapbox-terrain-dem-v1"
          tileSize={512}
          maxzoom={14}
        />

        {/* GPM VECTOR LAYER */}
        {geojson && (
          <Source id="gpm-source" type="geojson" data={geojson}>
            <Layer
              id="gpm-extrusion"
              type="fill-extrusion"
              paint={{
                // COLOR RAMP (Matches Backend Thresholds)
                'fill-extrusion-color': [
                  'interpolate', ['linear'], ['get', 'level'],
                  0.5, '#0000ff', // Blue
                  5.0, '#00ff00', // Green
                  10.0, '#ffff00', // Yellow
                  20.0, '#ff0000'  // Red
                ],
                // HEIGHT RAMP
                'fill-extrusion-height': [
                  'interpolate', ['linear'], ['get', 'level'],
                  0.5, 2000,
                  5.0, 8000,
                  10.0, 15000,
                  20.0, 30000
                ],
                'fill-extrusion-opacity': 0.9,
                'fill-extrusion-base': 0
              }}
            />
          </Source>
        )}
      </Map>

      {/* STATUS PANEL */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(0,0,0,0.8)', color: 'white',
        padding: '15px', borderRadius: '8px',
        fontFamily: 'monospace', border: '1px solid #333'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#88AAFF' }}>Server-Side Vectorizer</h3>
        <div><strong>Status:</strong> {status}</div>
        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '5px' }}>
          Pipeline: Python Matplotlib → GeoJSON → Mapbox Extrusion
        </div>
      </div>
    </div>
  );
}