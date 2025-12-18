// utils/weatherParser.js

/**
 * Helper to interleave separate lat/lon arrays into [lon, lat, lon, lat...]
 * required by Deck.GL's binary mode for positions.
 */
export function interleaveCoords(lats, lons, count) {
  const interleaved = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    interleaved[i * 2] = lons[i];     // X
    interleaved[i * 2 + 1] = lats[i]; // Y
  }
  return interleaved;
}

export async function parseWeatherBinary(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const HEADER_SIZE = 8;
  const view = new DataView(buffer);

  // Read Header
  const count = view.getUint32(0, true);
  const maxVal = view.getFloat32(4, true);

  if (count === 0) return null;

  // Map Arrays (Zero-copy view into the buffer)
  const bytesPerArray = count * 4;
  const lats = new Float32Array(buffer, HEADER_SIZE, count);
  const lons = new Float32Array(buffer, HEADER_SIZE + bytesPerArray, count);
  const vals = new Float32Array(buffer, HEADER_SIZE + bytesPerArray * 2, count);

  return { count, maxVal, lats, lons, vals };
}

/**
 * Creates a single Float32Array with [lon, lat, z, lon, lat, z...]
 * This is extremely fast because it allocates memory once.
 */
export function interleaveCoordsWithZ(lats, lons, count, fixedAltitude) {
  const interleaved = new Float32Array(count * 3); // 3 items per point
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    interleaved[i3] = lons[i];      // X
    interleaved[i3 + 1] = lats[i];  // Y
    interleaved[i3 + 2] = fixedAltitude; // Z (Hardcoded)
  }
  
  return interleaved;
}