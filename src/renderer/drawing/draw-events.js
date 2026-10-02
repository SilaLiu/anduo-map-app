// ═══════════════════════════════════════════
//  Map event wiring for drawing modes
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { map } from '../map/map.js';
import { setDrawMode, cancelDrawing } from './draw-mode.js';
import { addDrawVertex, updateDrawPreview } from './draw-preview.js';
import { showAdd } from '../annotations/anno-dialogs.js';

export function initDrawEvents() {
  if (!map) return;

  map.on('click', onMapClick);
  map.on('dblclick', onMapDblClick);
  map.on('contextmenu', onMapContextMenu);
  map.on('touchstart', onMapTouchStart);
  map.on('touchend', onMapTouchEnd);
  map.on('touchmove', onMapTouchMove);
  map.on('mousemove', onMapMouseMove);

  document.getElementById('dt-point').onclick = () => setDrawMode('point');
  document.getElementById('dt-line').onclick = () => setDrawMode('line');
  document.getElementById('dt-polygon').onclick = () => setDrawMode('polygon');
  document.getElementById('dt-extract').onclick = () => setDrawMode('extract');
  document.getElementById('dt-undo').onclick = undoLastVertex;
  document.getElementById('dt-finish').onclick = finishDrawing;
  document.getElementById('dt-cancel').onclick = () => cancelDrawing();
}

function onMapClick(e) {
  if (!state.drawMode) return;
  if (e.originalEvent.target.closest('.dialog')) return;

  if (state.drawMode === 'point') {
    const { lng, lat } = e.lngLat;
    cancelDrawing(true);
    showAdd('point', lng, lat);
    return;
  }

  if (state.clickTimer) {
    clearTimeout(state.clickTimer);
    state.clickTimer = null;
    return;
  }
  const lng = e.lngLat.lng;
  const lat = e.lngLat.lat;
  state.clickTimer = setTimeout(() => {
    state.clickTimer = null;
    addDrawVertex(lng, lat);
  }, 250);
}

function onMapDblClick(e) {
  if (!state.drawMode || state.drawMode === 'point') return;
  e.originalEvent.preventDefault();
  if (e.originalEvent.target.closest('.dialog')) return;
  if (state.clickTimer) {
    clearTimeout(state.clickTimer);
    state.clickTimer = null;
  }
  finishDrawing();
}

function onMapContextMenu(e) {
  e.originalEvent.preventDefault();
  if (state.drawMode) {
    cancelDrawing();
    return;
  }
  showAdd('point', e.lngLat.lng, e.lngLat.lat);
}

let holdTimer = null;
function onMapTouchStart(e) {
  if (state.drawMode) return;
  if (e.point && e.originalEvent.touches.length === 1) {
    holdTimer = setTimeout(() => {
      const p = map.unproject([e.point.x, e.point.y]);
      showAdd('point', p.lng, p.lat);
    }, 600);
  }
}
function onMapTouchEnd() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
}
function onMapTouchMove() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
}

function onMapMouseMove(e) {
  const lat = e.lngLat.lat.toFixed(4);
  const lng = e.lngLat.lng.toFixed(4);
  document.getElementById('coord-display').textContent = `${lat}° N ${lng}° E`;
  document.getElementById('sb-coord').textContent = `${lat}°N ${lng}°E`;
  if (state.drawMode && state.drawVertices.length > 0) {
    state.drawCursor = [e.lngLat.lng, e.lngLat.lat];
    updateDrawPreview();
  }
}

function undoLastVertex() {
  if (state.drawVertices.length === 0) return;
  state.drawVertices.pop();
  document.getElementById('vtx-count').textContent = state.drawVertices.length + ' 个顶点';
  updateDrawPreview();
}

export async function finishDrawing() {
  if (!state.drawMode) return;
  const minVtx = (state.drawMode === 'polygon' || state.drawMode === 'extract') ? 3 : 2;
  if (state.drawVertices.length < minVtx) {
    alert(((state.drawMode === 'extract') ? '圈选区域' : (state.drawMode === 'polygon' ? '建筑' : '道路')) + '至少需要 ' + minVtx + ' 个顶点');
    return;
  }
  const coords = [...state.drawVertices];
  if (state.drawMode === 'polygon' || state.drawMode === 'extract') {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  }
  const mode = state.drawMode;
  cancelDrawing(true);
  if (mode === 'extract') {
    const { openExtractConfig } = await import('../extraction/extract.js');
    openExtractConfig(coords);
  } else {
    showAdd(mode, null, null, coords);
  }
}
