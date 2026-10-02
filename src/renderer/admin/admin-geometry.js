// ═══════════════════════════════════════════
//  Administrative boundary geometry helpers
// ═══════════════════════════════════════════

import { state, ADMIN_LEVELS, EMPTY_ADMIN, normalizeAdmin } from '../state.js';
import { map } from '../map/map.js';
import { pointInPolygon, distancePointToSegment, distancePoints } from '../utils/geometry.js';
import { updateBoundarySources, getHighlightedBoundaryCollection } from '../map/sources.js';
import { updateBoundaryVisibilityFilters } from '../map/layers.js';

// 各乡镇政府驻地中心点（从 OSM place=town 节点获取），用于在 polygon 共享/缺失时判断归属。
export let townCenters = {};

export async function loadTownCenters() {
  try {
    const res = await fetch('data/admin-geojson/xizang/anduo/town_centers.json');
    if (res.ok) townCenters = await res.json();
  } catch (e) {
    console.warn('加载乡镇中心点失败', e);
  }
}

const sharedTownPolygonIndices = new Map();

export function computeSharedTownPolygons() {
  sharedTownPolygonIndices.clear();
  const towns = state.boundaries.filter(b => b.level === 'town');
  for (const t of towns) {
    const shared = new Set();
    const polys = t.geometry.type === 'Polygon' ? [t.geometry.coordinates] : t.geometry.coordinates;
    for (let i = 0; i < polys.length; i++) {
      const ring = polys[i][0];
      if (!ring.length) continue;
      for (const other of towns) {
        if (other === t) continue;
        const otherPolys = other.geometry.type === 'Polygon' ? [other.geometry.coordinates] : other.geometry.coordinates;
        for (let j = 0; j < otherPolys.length; j++) {
          const otherRing = otherPolys[j][0];
          if (otherRing.length === ring.length && otherRing[0][0] === ring[0][0] && otherRing[0][1] === ring[0][1]) {
            shared.add(i);
            break;
          }
        }
        if (shared.has(i)) break;
      }
    }
    sharedTownPolygonIndices.set(t.key, shared);
  }
}

export function getTownPolygons(townBoundary, excludeShared = true) {
  const polys = townBoundary.geometry.type === 'Polygon' ? [townBoundary.geometry.coordinates] : townBoundary.geometry.coordinates;
  const shared = sharedTownPolygonIndices.get(townBoundary.key) || new Set();
  return polys.map((poly, idx) => ({ poly, idx, shared: shared.has(idx) })).filter(p => !excludeShared || !p.shared);
}

export function geometryContainsPoint(geometry, point) {
  if (!geometry || !point) return false;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some(poly => pointInPolygon(point, poly[0]));
}

export function polygonContainsLngLat(rings, point) {
  if (!rings || !rings.length) return false;
  if (!pointInPolygon(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInPolygon(point, rings[i])) return false;
  }
  return true;
}

export function getBoundaryBounds(boundary) {
  const coords = boundary.geometry.type === 'Polygon'
    ? boundary.geometry.coordinates.flat()
    : boundary.geometry.coordinates.flat(2);
  if (!coords.length) return null;
  return coords.reduce((b, c) => {
    b[0][0] = Math.min(b[0][0], c[0]);
    b[0][1] = Math.min(b[0][1], c[1]);
    b[1][0] = Math.max(b[1][0], c[0]);
    b[1][1] = Math.max(b[1][1], c[1]);
    return b;
  }, [[coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]]);
}

export function getBoundaryArea(boundary) {
  const geom = boundary.geometry;
  const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map(poly => poly[0]);
  let area = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      area += x1 * y2 - x2 * y1;
    }
  }
  return Math.abs(area);
}

export function getContainingPolygonCentroid(geom, point) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    if (pointInPolygon(point, ring)) {
      const sum = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
      return [sum[0] / ring.length, sum[1] / ring.length];
    }
  }
  return null;
}

export function findNearestPolygonInfo(point, geom) {
  let minDist = Infinity, nearestCentroid = null;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    if (pointInPolygon(point, ring)) return { distance: 0, centroid: null };
    for (let i = 0; i < ring.length - 1; i++) {
      const d = distancePointToSegment(point[0], point[1], ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
      if (d < minDist) {
        minDist = d;
        const sum = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
        nearestCentroid = [sum[0] / ring.length, sum[1] / ring.length];
      }
    }
  }
  return { distance: minDist, centroid: nearestCentroid };
}

export function findBestTownForPoint(point) {
  const towns = state.boundaries.filter(b => b.level === 'town');
  if (!towns.length) return null;

  const uniqueContaining = [];
  for (const t of towns) {
    const polys = getTownPolygons(t, true);
    if (polys.some(p => pointInPolygon(point, p.poly[0]))) uniqueContaining.push(t);
  }
  if (uniqueContaining.length === 1) return uniqueContaining[0];
  if (uniqueContaining.length > 1) return nearestTownByCenter(point, uniqueContaining);

  const containing = towns.filter(t => geometryContainsPoint(t.geometry, point));
  if (containing.length === 1) return containing[0];
  if (containing.length > 1) return nearestTownByCenter(point, containing);

  return nearestTownByCenter(point, towns);
}

export function nearestTownByCenter(point, towns) {
  let best = null, bestD = Infinity;
  for (const t of towns) {
    const center = townCenters[t.name] || townCenters[t.admin?.town];
    if (!center) continue;
    const d = distancePoints(point, center);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

export function getAnnoSamplePoints(anno) {
  if (anno.type === 'point' && Number.isFinite(anno.lng) && Number.isFinite(anno.lat)) return [[anno.lng, anno.lat]];
  const coords = (anno.coordinates || []).filter(c => Array.isArray(c) && c.length >= 2);
  if (!coords.length) return [];
  if (anno.type === 'line') return coords;
  if (anno.type === 'polygon') {
    const seen = new Set();
    const pts = [];
    for (const [lng, lat] of coords) {
      const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push([lng, lat]);
    }
    const sum = coords.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
    pts.push([sum[0] / coords.length, sum[1] / coords.length]);
    return pts;
  }
  return coords;
}

export function voteTownForPoints(points) {
  if (!points.length) return null;
  const votes = {};
  for (const point of points) {
    const town = findBestTownForPoint(point);
    if (!town) continue;
    const name = town.admin.town || town.name;
    votes[name] = (votes[name] || 0) + 1;
  }
  if (!Object.keys(votes).length) return null;
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
}

export function getAnnoRepresentativePoint(anno) {
  if (anno.type === 'point' && Number.isFinite(anno.lng) && Number.isFinite(anno.lat)) return [anno.lng, anno.lat];
  const coords = anno.coordinates || [];
  if (!coords.length) return null;
  const pts = coords.filter(c => Array.isArray(c) && c.length >= 2);
  if (!pts.length) return null;
  const sum = pts.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

export function candidateBoundaryLevelsForAnno(anno) {
  if (anno.type === 'point') return ['village', 'town', 'county', 'province'];
  return ['town', 'county', 'province', 'village'];
}

export function getContainingBoundaries(point, filterLevel) {
  if (!point) return [];
  return state.boundaries.filter(b => {
    if (filterLevel && b.level !== filterLevel) return false;
    return geometryContainsPoint(b.geometry, point);
  });
}

export function mergeAdmin(base, extra) {
  const a = normalizeAdmin(base || EMPTY_ADMIN());
  const b = normalizeAdmin(extra || EMPTY_ADMIN());
  return normalizeAdmin({
    province: b.province || a.province,
    county: b.county || a.county,
    town: b.town || a.town,
    village: b.village || a.village,
    region: a.region || b.region,
    boundaryKey: b.boundaryKey || a.boundaryKey,
    boundaryLevel: b.boundaryLevel || a.boundaryLevel,
  });
}

export function findBoundaryByKey(key) {
  return state.boundaries.find(b => b.key === key);
}

export function findBoundaryByAdmin(admin) {
  const a = normalizeAdmin(admin || EMPTY_ADMIN());
  return state.boundaries.find(b => {
    const x = b.admin || EMPTY_ADMIN();
    return (!a.province || x.province === a.province)
      && (!a.county || x.county === a.county)
      && (!a.town || x.town === a.town)
      && (!a.village || x.village === a.village);
  }) || null;
}

export function findBestBoundaryForAdmin(admin) {
  const a = normalizeAdmin(admin || EMPTY_ADMIN());
  const candidates = state.boundaries.filter(b => {
    const x = b.admin || EMPTY_ADMIN();
    return (!a.province || x.province === a.province)
      && (!a.county || x.county === a.county)
      && (!a.town || x.town === a.town)
      && (!a.village || x.village === a.village);
  });
  if (!candidates.length) return null;
  candidates.sort((m, n) => ADMIN_LEVELS.indexOf(n.level) - ADMIN_LEVELS.indexOf(m.level));
  return candidates[0];
}

export function resolveAdminForSave(admin) {
  const a = normalizeAdmin(admin || EMPTY_ADMIN());
  const boundary = findBestBoundaryForAdmin(a);
  if (boundary) {
    a.boundaryKey = boundary.key;
    a.boundaryLevel = boundary.level;
  } else {
    a.boundaryKey = '';
    a.boundaryLevel = '';
  }
  return a;
}

export function assignAdminByGeometry(anno, opts = {}) {
  if (!anno || !state.boundaries.length) return anno;
  opts = { overwrite: true, ...opts };

  const point = getAnnoRepresentativePoint(anno);
  if (!point) return anno;
  const containing = getContainingBoundaries(point);
  if (!containing.length) return anno;

  const levelOrder = ['village', 'town', 'county', 'city', 'province'];
  const sorted = containing.slice().sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level));

  let merged = normalizeAdmin(EMPTY_ADMIN());
  for (const boundary of sorted) {
    merged = mergeAdmin(merged, {
      province: boundary.admin.province,
      county: boundary.admin.county,
      town: boundary.admin.town,
      village: boundary.admin.village,
      boundaryKey: boundary.key,
      boundaryLevel: boundary.level,
    });
  }

  const lowest = sorted[0];
  if (lowest && ['village', 'town', 'county'].includes(lowest.level)) {
    merged.province = lowest.admin.province || merged.province;
    merged.county = lowest.admin.county || merged.county;
  }

  const hasAny = merged.province || merged.county || merged.town || merged.village;
  if (!hasAny) return anno;

  if (opts.overwrite) {
    anno.admin = resolveAdminForSave(merged);
  } else {
    anno.admin = resolveAdminForSave(mergeAdmin(anno.admin || EMPTY_ADMIN(), merged));
  }
  return anno;
}

export async function autoAssignAllAnnotations() {
  if (!state.boundaries.length) {
    alert('请先导入行政区边界数据');
    return;
  }
  let changed = 0;
  state.annos = state.annos.map(a => {
    const before = JSON.stringify(a.admin || EMPTY_ADMIN());
    const updated = assignAdminByGeometry(a);
    if (JSON.stringify(updated.admin || EMPTY_ADMIN()) !== before) changed++;
    return updated;
  });
  await saveAnnotations();
  alert(`自动归属完成，更新 ${changed} 条标注`);
}

export function highlightBoundary(boundaryKey, fit) {
  state.highlightedBoundaryKey = boundaryKey || '';
  const adminHighlight = map?.getSource('admin-highlight');
  if (adminHighlight) adminHighlight.setData(getHighlightedBoundaryCollection());
  updateBoundaryVisibilityFilters();
  if (boundaryKey && fit && map) {
    const boundary = findBoundaryByKey(boundaryKey);
    const bounds = boundary && getBoundaryBounds(boundary);
    if (bounds) map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
  }
}
