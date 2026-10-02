// ═══════════════════════════════════════════
//  GeoJSON source management (incremental updates)
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { map } from './map.js';
import { fixPolygonRingOrientation } from '../utils/geometry.js';

export function featureFromAnno(a) {
  let geom;
  if (a.type === 'point') geom = { type: 'Point', coordinates: [a.lng, a.lat] };
  else if (a.type === 'line') geom = { type: 'LineString', coordinates: a.coordinates || [] };
  else geom = { type: 'Polygon', coordinates: [a.coordinates || []] };
  return {
    type: 'Feature',
    geometry: geom,
    properties: { id: a.id, name: a.name, color: a.color, type: a.type },
  };
}

export function getAnnotationCollection() {
  return {
    type: 'FeatureCollection',
    features: state.annos.map(featureFromAnno),
  };
}

export function getBoundaryFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: state.boundaries.map(b => ({
      type: 'Feature',
      geometry: fixPolygonRingOrientation(b.geometry),
      properties: {
        key: b.key,
        name: b.name,
        level: b.level,
        province: b.admin.province,
        county: b.admin.county,
        town: b.admin.town,
        village: b.admin.village,
        region: b.admin.region || '',
      },
    })),
  };
}

export function getHighlightedBoundaryCollection() {
  const target = state.boundaries.find(b => b.key === state.highlightedBoundaryKey);
  return {
    type: 'FeatureCollection',
    features: target
      ? [{
          type: 'Feature',
          geometry: fixPolygonRingOrientation(target.geometry),
          properties: { key: target.key, name: target.name, level: target.level },
        }]
      : [],
  };
}

function ensureSource(id, data) {
  if (!map) return null;
  const src = map.getSource(id);
  if (src) {
    src.setData(data);
    return src;
  }
  map.addSource(id, { type: 'geojson', data });
  return map.getSource(id);
}

export function initAnnotationSource() {
  ensureSource('annos', getAnnotationCollection());
}

export function updateAnnotations() {
  ensureSource('annos', getAnnotationCollection());
}

export function initBoundarySources() {
  ensureSource('admin-boundaries', getBoundaryFeatureCollection());
  ensureSource('admin-highlight', getHighlightedBoundaryCollection());
}

export function updateBoundarySources() {
  ensureSource('admin-boundaries', getBoundaryFeatureCollection());
  ensureSource('admin-highlight', getHighlightedBoundaryCollection());
}

export function initExtractPreviewSource() {
  ensureSource('extract-preview', { type: 'FeatureCollection', features: [] });
}

export function updateExtractPreview(features) {
  ensureSource('extract-preview', { type: 'FeatureCollection', features: features || [] });
}
