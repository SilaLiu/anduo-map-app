/**
 * Build bbox from coordinate array.
 * @param {Array<[number, number]>} coords
 * @returns {{minLng:number, minLat:number, maxLng:number, maxLat:number}}
 */
export function bboxFromCoords(coords) {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Convert polygon ring to Overpass bbox string: "s,w,n,e".
 */
export function coordsToBbox(coords) {
  const { minLng, minLat, maxLng, maxLat } = bboxFromCoords(coords);
  return [minLat, minLng, maxLat, maxLng].join(',');
}

/**
 * Approximate polygon area in km².
 */
export function polygonArea(coords) {
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  if (coords.length >= 3) {
    const [x1, y1] = coords[coords.length - 1];
    const [x2, y2] = coords[0];
    area += x1 * y2 - x2 * y1;
  }
  const midLat = ((coords.reduce((s, c) => s + c[1], 0) / coords.length) * Math.PI) / 180;
  const deg2m = 111320 * Math.cos(midLat);
  return (Math.abs(area) * deg2m * deg2m) / 1e6;
}

/**
 * Convert lng/lat to pixel coordinates inside a bbox.
 */
export function lngLatToPixel(lng, lat, bbox, W, H) {
  const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * W;
  const y =
    ((mercatorY(bbox.maxLat) - mercatorY(lat)) /
      (mercatorY(bbox.maxLat) - mercatorY(bbox.minLat))) *
    H;
  return [Math.round(x), Math.round(y)];
}

/**
 * Convert pixel coordinates to lng/lat inside a bbox.
 */
export function pixelToLngLat(px, py, bbox, W, H) {
  const lng = bbox.minLng + (px / W) * (bbox.maxLng - bbox.minLng);
  const y = mercatorY(bbox.maxLat) - (py / H) * (mercatorY(bbox.maxLat) - mercatorY(bbox.minLat));
  const lat = (Math.atan(Math.sinh(y)) * 180) / Math.PI;
  return [lng, lat];
}

function mercatorY(lat) {
  return Math.log(
    Math.tan(Math.PI / 4 + (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 360),
  );
}

export function tileBounds(tiles) {
  const n = 2 ** tiles[0].z;
  const xs = tiles.map((t) => t.x),
    ys = tiles.map((t) => t.y);
  const latitude = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return {
    minLng: (Math.min(...xs) / n) * 360 - 180,
    maxLng: ((Math.max(...xs) + 1) / n) * 360 - 180,
    maxLat: latitude(Math.min(...ys)),
    minLat: latitude(Math.max(...ys) + 1),
  };
}

/**
 * Get tile indices covering a bbox at a given zoom.
 */
export function getTilesForBbox(bbox, zoom, tileSize = 256) {
  const { minLng, minLat, maxLng, maxLat } = bbox;
  const n = 2 ** zoom;
  function lng2x(lng) {
    return Math.floor(((lng + 180) / 360) * n);
  }
  function lat2y(lat) {
    const r = Math.tan((lat * Math.PI) / 180);
    const s = 1 / Math.cos((lat * Math.PI) / 180);
    return Math.floor(((1 - Math.log(r + s) / Math.PI) / 2) * n);
  }
  const x1 = lng2x(minLng),
    x2 = lng2x(maxLng);
  const y1 = lat2y(maxLat),
    y2 = lat2y(minLat);
  if ((Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1) > 16)
    throw new Error('提取范围过大，请缩小范围');
  const tiles = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

/**
 * Fetch and stitch raster tiles into an offscreen canvas.
 */
export function stitchTiles(tiles, urlTemplate, tileSize = 256, timeoutMs = 10000) {
  if (!tiles.length) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const xVals = tiles.map((t) => t.x);
  const yVals = tiles.map((t) => t.y);
  const minX = Math.min(...xVals),
    minY = Math.min(...yVals);
  const cols = Math.max(...xVals) - minX + 1;
  const rows = Math.max(...yVals) - minY + 1;
  canvas.width = cols * tileSize;
  canvas.height = rows * tileSize;

  let loaded = 0,
    failed = 0;
  const promises = tiles.map((t) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        if (!img._done) {
          img._done = true;
          failed++;
          resolve(false);
        }
      }, timeoutMs);
      img.onload = () => {
        if (img._done) return;
        img._done = true;
        clearTimeout(timer);
        ctx.drawImage(img, (t.x - minX) * tileSize, (t.y - minY) * tileSize, tileSize, tileSize);
        loaded++;
        resolve(true);
      };
      img.onerror = () => {
        if (img._done) return;
        img._done = true;
        clearTimeout(timer);
        failed++;
        resolve(false);
      };
      img.src = urlTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
    });
  });
  return Promise.all(promises).then(() => {
    if (failed > 0) return null;
    return canvas;
  });
}
