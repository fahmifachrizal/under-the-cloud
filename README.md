# 3D GPM Weather Radar Visualization

**Objective:** A high-performance geospatial engine that renders NASA GPM precipitation data as volumetric, floating 3D cloud structures in the browser. It bypasses standard JSON parsing in favor of a custom binary stream to render high-density weather grids (50k+ points) at 60FPS.

---

## 🏗 Architecture

### Backend (Data Processing)

* **Core:** FastAPI (Python 3.10+)
* **Ingestion:** `xarray` & `h5netcdf` for multi-dimensional slicing of HDF5 files.
* **Optimization:** `numpy` vectorization to filter sparse data (`precipitation > 0.2mm`) and pack into C-struct binary layouts.

### Frontend (Visualization)

* **Core:** Next.js 14 (App Router) & React 18.
* **Render Engine:** [Deck.GL](https://deck.gl/) (WebGL2) overlaying Mapbox GL JS (Dark V11).
* **Technique:** Hybrid 3D rendering using billboarded spheres (`ScatterplotLayer`) with physically modeled altitude and volume.

---

## ⚡ Binary Data Protocol

To minimize latency and parsing overhead, the API serves a custom `application/octet-stream`. This allows the client to map memory directly ("Zero-Copy") without string parsing.

**Byte Layout:**
`[ HEADER (8 Bytes) ] [ LATITUDES (N*4) ] [ LONGITUDES (N*4) ] [ VALUES (N*4) ]`

| Section | Size (Bytes) | Type | Description |
| :--- | :--- | :--- | :--- |
| **Count** | 4 | `Uint32` | Total number of valid data points ($N$). |
| **Max Val** | 4 | `Float32` | Maximum precipitation intensity (for normalization). |
| **Lats** | $N \times 4$ | `Float32Array` | Continuous block of Latitude coordinates. |
| **Lons** | $N \times 4$ | `Float32Array` | Continuous block of Longitude coordinates. |
| **Vals** | $N \times 4$ | `Float32Array` | Continuous block of Rain values (mm/hr). |

---

## 🎨 Visualization Logic

The frontend consumes the binary stream and procedurally generates the 3D scene:

1.  **3D Projection (Altitude):**
    * Points are not clamped to the ground. They are projected to a "Cloud Layer" altitude.
    * *Formula:* `Z_Position = 15,000m + (Intensity * 300m)`
    * Creates a physical gap between the map and the data, emphasized by a secondary "Shadow Layer" at $Z=0$.

2.  **Volumetric Rendering:**
    * Uses **Variable Radius** to simulate volume. Light rain ($0.2mm$) is rendered as 100m mist; heavy storms ($30mm$) as 8km cores.
    * *Formula:* `Radius = 100m + (Value * 200m)`

3.  **Radar Color Scale:**
    * Applies meteorological standard thresholds with alpha blending.
    * `< 0.2mm`: Transparent Blue (Mist)
    * `0.2 - 10mm`: Green (Moderate)
    * `10 - 20mm`: Yellow (Heavy)
    * `> 20mm`: Opaque Red (Severe)

---

## 🚀 Usage

**1. Backend**

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

```

**2. Frontend**

```bash
cd frontend
npm run dev
# Open http://localhost:3000

```

---

## 🗺 Roadmap

* **Volumetric Interpolation:** Implement metaball shaders to merge discrete points into continuous meshes.
* **Temporal Playback:** Backend support for multi-frame binary streams to animate rain movement.
* **Tiling System:** Implement Quadkey/XYZ tiling to load global data progressively.
