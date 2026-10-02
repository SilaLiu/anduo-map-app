// ═══════════════════════════════════════════
//  AI extraction orchestrator and UI wiring
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { swLayer } from '../map/map.js';
import { polygonArea } from '../utils/geo.js';
import { runOverpassEngine } from './engine-overpass.js';
import { runColorEngine } from './engine-color.js';
import { runONNXEngine } from './engine-onnx.js';
import { categoryNames } from './categories.js';

export function openExtractConfig(coords) {
  state.extractPolygon = coords;
  state.extractionResults = [];
  const area = polygonArea(coords);
  document.getElementById('extract-area-info').textContent = `圈选区域 · ${coords.length} 个顶点 · 面积约 ${(area * 1e6).toFixed(1)} m² (${area.toFixed(3)} km²)`;
  document.getElementById('extract-progress').style.display = 'none';
  document.getElementById('extract-results').style.display = 'none';
  document.getElementById('extract-start').style.display = '';
  document.getElementById('extract-import').style.display = 'none';
  document.getElementById('d-extract-config').classList.remove('hide');
  if (state.curLayer !== 'satellite') swLayer('satellite');
}

export function getTargets() {
  return Array.from(document.querySelectorAll('#target-btns .target-btn.on')).map(b => b.dataset.target);
}

export function setProgress(pct, text) {
  document.getElementById('bar-fill').style.width = pct + '%';
  document.getElementById('bar-text').textContent = text;
  if (pct >= 100) document.getElementById('extract-progress').style.display = 'none';
}

export function updateResultStats() {
  const cats = { buildings: 0, roads: 0, water: 0, vegetation: 0, farmland: 0 };
  state.extractionResults.forEach(r => { if (cats[r.category] !== undefined) cats[r.category]++; });
  document.getElementById('cnt-buildings').textContent = cats.buildings;
  document.getElementById('cnt-roads').textContent = cats.roads;
  document.getElementById('cnt-water').textContent = cats.water;
  document.getElementById('cnt-vegetation').textContent = cats.vegetation;
  document.getElementById('cnt-farmland').textContent = cats.farmland;
  document.getElementById('extract-results').style.display = 'block';
}

export async function startExtraction() {
  if (state.isExtracting) return;
  state.isExtracting = true;

  if (state.curLayer !== 'satellite') swLayer('satellite');

  const targets = getTargets();
  if (!targets.length) { alert('请至少选择一项提取目标'); state.isExtracting = false; return; }

  document.getElementById('extract-progress').style.display = 'block';
  document.getElementById('extract-results').style.display = 'none';
  document.getElementById('extract-start').style.display = 'none';
  document.getElementById('extract-import').style.display = 'none';
  setProgress(0, '准备中...');

  state.extractionResults = [];

  const engines = state.extractEngine === 'overpass' ? ['overpass', 'color'] :
                  state.extractEngine === 'onnx' ? ['onnx', 'color'] : ['color'];

  let lastError = null;
  for (const eng of engines) {
    try {
      if (eng === 'overpass') await runOverpassEngine(targets, setProgress);
      else if (eng === 'color') await runColorEngine(targets, setProgress);
      else if (eng === 'onnx') await runONNXEngine(targets, setProgress);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      console.warn(`Engine ${eng} failed:`, e.message);
      setProgress(0, `${eng} 引擎失败，尝试备用引擎...`);
      state.extractionResults = [];
      document.getElementById('extract-progress').style.display = 'block';
      document.getElementById('extract-results').style.display = 'none';
      document.getElementById('extract-start').style.display = 'none';
      document.getElementById('extract-import').style.display = 'none';
    }
  }

  if (lastError) {
    setProgress(100, '提取失败');
    alert('提取失败: ' + (lastError.message || '未知错误') + '\n\n建议：\n1. 检查网络连接\n2. 尝试使用「图像分割」引擎（完全离线）\n3. 缩小圈选区域');
    state.isExtracting = false;
    return;
  }

  document.getElementById('extract-start').style.display = 'none';
  document.getElementById('extract-import').style.display = '';
  updateResultStats();
  const { renderPreviewList } = await import('./extract-preview.js');
  renderPreviewList();

  state.isExtracting = false;
}

export function initExtractDialog() {
  document.getElementById('extract-cancel').onclick = () => document.getElementById('d-extract-config').classList.add('hide');
  document.getElementById('extract-start').onclick = startExtraction;
  document.getElementById('preview-import-all').onclick = () => {
    document.querySelectorAll('#preview-list .cb').forEach(cb => cb.checked = true);
    import('./extract-preview.js').then(m => m.importExtractedResults());
  };
  document.querySelectorAll('.engine-opt').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.engine-opt').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      state.extractEngine = btn.dataset.engine;
    };
  });
  document.querySelectorAll('#target-btns .target-btn').forEach(btn => {
    btn.onclick = () => btn.classList.toggle('on');
  });
}
