"use client"

import React, { useEffect, useRef, useState } from "react"
import Map, { Source, Layer } from "react-map-gl/mapbox"
import "mapbox-gl/dist/mapbox-gl.css"
import * as d3 from "d3"

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

// Configuration
const RADAR_HOST = "https://tilecache.rainviewer.com"
const ZOOM_LEVEL = 5 // The zoom level of the tiles we fetch to vectorize

export default function VectorRadarMap() {
  const mapRef = useRef(null)
  const [geojson, setGeojson] = useState({
    type: "FeatureCollection",
    features: [],
  })
  const [loading, setLoading] = useState(false)
  const [timestamp, setTimestamp] = useState(null)

  // 1. Initial Load: Get RainViewer Metadata to find the latest time
  useEffect(() => {
    async function init() {
      const res = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json"
      )
      const data = await res.json()
      if (data.radar && data.radar.past) {
        const past = data.radar.past
        setTimestamp(past[past.length - 1].time) // Use latest available time
      }
    }
    init()
  }, [])

  // 2. The Vectorizer Logic (Triggered when timestamp changes)
  useEffect(() => {
    if (!timestamp) return

    // We define a fixed bounding box for this demo (US West Coast / Global view)
    // In production, you would calculate this based on the current map view.
    const tileBounds = { minX: 4, maxX: 10, minY: 10, maxY: 15 } // Rough Grid

    vectorizeRadar(tileBounds, timestamp)
  }, [timestamp])

  const vectorizeRadar = async ({ minX, maxX, minY, maxY }, ts) => {
    setLoading(true)

    // A. Setup Canvas
    const tileW = 256
    const tilesX = maxX - minX + 1
    const tilesY = maxY - minY + 1
    const totalW = tilesX * tileW
    const totalH = tilesY * tileW

    const canvas = document.createElement("canvas")
    canvas.width = totalW
    canvas.height = totalH
    const ctx = canvas.getContext("2d", { willReadFrequently: true })

    // B. Fetch All Tiles
    const promises = []
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        promises.push(
          new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = "Anonymous"
            img.onload = () => {
              ctx.drawImage(img, (x - minX) * tileW, (y - minY) * tileW)
              resolve()
            }
            img.onerror = resolve // Skip failed tiles
            // RainViewer URL Structure
            img.src = `${RADAR_HOST}/v2/radar/${ts}/256/${ZOOM_LEVEL}/${x}/${y}/6/1_1.png`
          })
        )
      }
    }

    await Promise.all(promises)

    // C. Read Pixel Data
    const imgData = ctx.getImageData(0, 0, totalW, totalH)
    const data = imgData.data // Raw RGBA array
    const grid = new Float64Array(totalW * totalH)

    // Extract "Intensity" from the image (RainViewer uses color to encode intensity)
    // We simplify by just taking the Alpha channel or Red channel depending on format
    // Here we normalize standard RGBA to a 0-1 value
    for (let i = 0; i < data.length; i += 4) {
      // Simple heuristic: if pixel is transparent, it's 0. Otherwise use Alpha.
      grid[i / 4] = data[i + 3] / 255.0
    }

    // D. D3 Contours (Marching Squares)
    // We create contours at specific thresholds (0.1 = light rain, 0.5 = heavy)
    const thresholds = [0.1, 0.3, 0.5, 0.7]
    const contours = d3
      .contours()
      .size([totalW, totalH])
      .thresholds(thresholds)(grid)

    // E. Geo-Referencing (Pixels -> Lat/Lon)
    const n = Math.pow(2, ZOOM_LEVEL)

    // Helper to converting Tile coordinates to Lat/Lon
    const tileToLon = (x) => (x / n) * 360 - 180
    const tileToLat = (y) => {
      const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, ZOOM_LEVEL)
      return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
    }

    const lon1 = tileToLon(minX)
    const lat1 = tileToLat(minY)
    const lon2 = tileToLon(maxX + 1)
    const lat2 = tileToLat(maxY + 1)
    const widthDeg = lon2 - lon1
    const heightDeg = lat2 - lat1

    // F. Transform Contours to GeoJSON Features
    const features = []
    contours.forEach((contour) => {
      // Convert D3 MultiPolygons to GeoJSON MultiPolygons
      const coordinates = contour.coordinates.map((polygon) =>
        polygon.map((ring) => {
          return ring
            .map(([px, py]) => {
              // Normalize pixel to 0-1 range within the canvas
              const u = px / totalW
              const v = py / totalH
              // Map to Lat/Lon
              const lon = lon1 + u * widthDeg
              const lat = lat1 + v * heightDeg // Note: Lat calculation might need inversion depending on projection
              return [lon, lat]
            })
            .reverse() // D3 rings might need winding order reversal for Mapbox
        })
      )

      features.push({
        type: "Feature",
        properties: { level: contour.value }, // The threshold value (rain intensity)
        geometry: { type: "MultiPolygon", coordinates },
      })
    })

    setGeojson({ type: "FeatureCollection", features })
    setLoading(false)
  }

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: -95,
          latitude: 38,
          zoom: 4,
          pitch: 45,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection="globe">
        <Source type="geojson" data={geojson}>
          <Layer
            id="radar-extrusion"
            type="fill-extrusion"
            paint={{
              // Color based on 'level' property (0.1 to 0.7)
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["get", "level"],
                0.1,
                "#0000ff", // Blue
                0.3,
                "#00ff00", // Green
                0.5,
                "#ffff00", // Yellow
                0.7,
                "#ff0000", // Red
              ],
              // Height based on level
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["get", "level"],
                0.1,
                5000,
                0.7,
                40000,
              ],
              "fill-extrusion-opacity": 0.8,
              "fill-extrusion-base": 0,
            }}
          />
        </Source>
      </Map>

      {/* UI Overlay */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(0,0,0,0.8)",
          color: "white",
          padding: 20,
          borderRadius: 8,
        }}>
        <h3>Vector Radar</h3>
        <div>Status: {loading ? "Vectorizing..." : "Ready"}</div>
        <div>
          Time:{" "}
          {timestamp
            ? new Date(timestamp * 1000).toLocaleTimeString()
            : "Loading..."}
        </div>
      </div>
    </div>
  )
}
