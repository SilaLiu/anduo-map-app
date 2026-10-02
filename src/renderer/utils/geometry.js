/**
 * Ray-casting point-in-polygon test.
 * @param {[number, number]} point [x, y]
 * @param {Array<[number, number]>} poly
 * @returns {boolean}
 */
export function pointInPolygon(point, poly) {
  if (!poly || !poly.length) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculate polygon ring area using shoelace formula.
 * Positive for CCW, negative for CW in planar coords.
 */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    a += (x2 - x1) * (y2 + y1);
  }
  return -a / 2;
}

/**
 * Ensure outer rings are CCW and holes are CW (GeoJSON spec).
 */
export function fixPolygonRingOrientation(geom) {
  if (!geom) return geom;
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: orientPolygonRings(geom.coordinates) };
  }
  if (geom.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geom.coordinates.map(orientPolygonRings) };
  }
  return geom;
}

function orientPolygonRings(rings) {
  if (!Array.isArray(rings) || !rings.length) return rings;
  const result = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = [...rings[i]];
    if (!ring.length) continue;
    const area = ringArea(ring);
    if (i === 0) {
      result.push(area < 0 ? ring.reverse() : ring);
    } else {
      result.push(area > 0 ? ring.reverse() : ring);
    }
  }
  return result;
}

export function polygonContainsLngLat(rings, point) {
  if (!rings || !rings.length) return false;
  if (!pointInPolygon(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInPolygon(point, rings[i])) return false;
  }
  return true;
}

export function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

export function distancePoints(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/**
 * Douglas-Peucker line simplification.
 */
export function simplifyLine(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyLine(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyLine(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

/**
 * Compute 2D convex hull (Graham scan / monotone chain variant).
 */
export function convexHull(points) {
  if (points.length < 3) return points;
  const uniq = [...new Set(points.map(p => p.join(',')))].map(s => s.split(',').map(Number));
  uniq.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}
