// ═══════════════════════════════════════════
//  Draw mode state machine
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { map } from '../map/map.js';
import { removeDrawPreviewLayer, addDrawPreviewLayer } from './draw-preview.js';

export function setDrawMode(mode) {
  if (state.drawMode === mode) {
    cancelDrawing();
    return;
  }
  if (state.drawMode) cancelDrawing(false);

  state.drawMode = mode;
  state.drawVertices = [];
  state.drawCursor = [0, 0];

  document.querySelectorAll('#draw-toolbar button').forEach(b => b.classList.remove('active', 'line', 'polygon', 'extract'));
  const btn = document.getElementById('dt-' + mode);
  if (btn) {
    btn.classList.add('active');
    if (mode === 'line') btn.classList.add('line');
    if (mode === 'polygon') btn.classList.add('polygon');
    if (mode === 'extract') btn.classList.add('extract');
  }

  if (map) map.getCanvas().style.cursor = 'crosshair';
  document.getElementById('draw-actions').classList.toggle('show', mode !== 'point');
  document.getElementById('draw-hint').classList.add('show');
  document.getElementById('vtx-count').textContent = '0 个顶点';

  const hintEl = document.getElementById('draw-hint');
  if (mode === 'extract') {
    hintEl.textContent = '🔍 圈选区域进行AI提取 · 点击添加顶点 · 双击完成';
  } else if (mode === 'point') {
    hintEl.textContent = '🖱️ 点击地图添加标注点';
  } else {
    hintEl.textContent = '🖱️ 点击地图添加顶点 · 双击完成 · Esc 取消';
  }

  addDrawPreviewLayer();
}

export function cancelDrawing(silent = false) {
  state.drawMode = null;
  state.drawVertices = [];
  state.drawCursor = [0, 0];
  document.querySelectorAll('#draw-toolbar button').forEach(b => b.classList.remove('active', 'line', 'polygon', 'extract'));
  const pointBtn = document.getElementById('dt-point');
  if (pointBtn) pointBtn.classList.add('active');
  if (map) map.getCanvas().style.cursor = '';
  document.getElementById('draw-actions').classList.remove('show');
  document.getElementById('draw-hint').classList.remove('show');
  removeDrawPreviewLayer();
}
