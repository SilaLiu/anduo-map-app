// ═══════════════════════════════════════════
//  Draw preview source/layer management
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { map } from '../map/map.js';

export function addDrawPreviewLayer() {
  removeDrawPreviewLayer();
  if (!map) return;
  state.drawSourceId = 'draw-preview-' + Date.now();
  map.addSource(state.drawSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const c = state.drawMode === 'extract' ? '#10b981' : state.drawMode === 'polygon' ? '#8b5cf6' : '#f59e0b';
  map.addLayer({
    id: state.drawSourceId + '-line',
    type: 'line',
    source: state.drawSourceId,
    paint: { 'line-color': c, 'line-width': 2.5, 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: state.drawSourceId + '-dash',
    type: 'line',
    source: state.drawSourceId,
    paint: { 'line-color': c, 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [4, 4] },
    filter: ['==', ['get', 'isDash'], true],
  });
  map.addLayer({
    id: state.drawSourceId + '-pt',
    type: 'circle',
    source: state.drawSourceId,
    paint: { 'circle-radius': 5, 'circle-color': c, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
    filter: ['==', ['get', 'isPoint'], true],
  });
}

export function removeDrawPreviewLayer() {
  if (!map || !state.drawSourceId) return;
  [state.drawSourceId + '-pt', state.drawSourceId + '-dash', state.drawSourceId + '-line'].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(state.drawSourceId)) map.removeSource(state.drawSourceId);
  state.drawSourceId = null;
}

export function updateDrawPreview() {
  if (!map || !state.drawSourceId || state.drawVertices.length === 0) return;
  const features = [];
  state.drawVertices.forEach(c => features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: c },
    properties: { isPoint: true, isDash: false },
  }));
  if (state.drawVertices.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: state.drawVertices },
      properties: { isPoint: false, isDash: false },
    });
  }
  if (state.drawCursor[0] !== 0 || state.drawCursor[1] !== 0) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [state.drawVertices[state.drawVertices.length - 1], state.drawCursor] },
      properties: { isPoint: false, isDash: true },
    });
  }
  if ((state.drawMode === 'polygon' || state.drawMode === 'extract') && state.drawVertices.length >= 2 && (state.drawCursor[0] !== 0 || state.drawCursor[1] !== 0)) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [state.drawVertices[0], state.drawCursor] },
      properties: { isPoint: false, isDash: true },
    });
  }
  const src = map.getSource(state.drawSourceId);
  if (src) src.setData({ type: 'FeatureCollection', features });
}

export function addDrawVertex(lng, lat) {
  if (!state.drawMode) return;
  state.drawVertices.push([lng, lat]);
  state.drawCursor = [lng, lat];
  document.getElementById('vtx-count').textContent = state.drawVertices.length + ' 个顶点';
  updateDrawPreview();
}

export function undoLastVertex() {
  if (state.drawVertices.length === 0) return;
  state.drawVertices.pop();
  document.getElementById('vtx-count').textContent = state.drawVertices.length + ' 个顶点';
  updateDrawPreview();
}
