// ═══════════════════════════════════════════
//  Extraction result preview: list, map preview, import
// ═══════════════════════════════════════════

import { state, EMPTY_ADMIN, normalizeAdmin, saveAnnotations } from '../state.js';
import { map } from '../map/map.js';
import { updateExtractPreview } from '../map/sources.js';
import { addExtractPreviewLayers, bringAnnosToFront } from '../map/layers.js';
import { switchTab } from '../ui/ui-events.js';
import { assignAdminByGeometry } from '../admin/admin-geometry.js';
import { categoryNames } from './categories.js';
import { esc } from '../ui/ui-utils.js';

const catLabels = { buildings: '🏢 建筑物', roads: '🛣️ 道路', water: '💧 水体', vegetation: '🌿 植被', farmland: '🌾 农田' };
const tagClasses = { buildings: 'bld', roads: 'road', water: 'water', vegetation: 'veg', farmland: 'veg' };

export function renderPreviewList() {
  const list = document.getElementById('preview-list');
  if (!state.extractionResults.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">无提取结果</div>';
    switchTab('extract');
    return;
  }

  switchTab('extract');
  const groups = { buildings: [], roads: [], water: [], vegetation: [], farmland: [] };
  state.extractionResults.forEach(r => { if (groups[r.category]) groups[r.category].push(r); });

  let html = '';
  for (const [cat, items] of Object.entries(groups)) {
    if (!items.length) continue;
    html += `<div style="font-size:11px;color:var(--text-dim);padding:6px 2px 2px;font-weight:500;">${catLabels[cat]} (${items.length})</div>`;
    for (const item of items.slice(0, 30)) {
      html += `<div class="preview-item" data-id="${item.id}">
        <input type="checkbox" class="cb" ${item.selected ? 'checked' : ''} onchange="window._toggleResultSelect('${item.id}',this.checked)">
        <span class="info"><span class="type-tag ${tagClasses[cat] || 'bld'}">${catLabels[cat].slice(0, 2)}</span>${esc(item.name)}</span>
        <span style="font-size:9px;color:var(--text-dim)">${(item.coordinates || []).length}顶点</span>
      </div>`;
    }
    if (items.length > 30) {
      html += `<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:4px;">... 还有 ${items.length - 30} 项</div>`;
    }
  }
  list.innerHTML = html;
  showExtractPreviewOnMap();
}

export function toggleResultSelect(id, checked) {
  const r = state.extractionResults.find(x => x.id === id);
  if (r) r.selected = checked;
  showExtractPreviewOnMap();
}

export async function showExtractPreviewOnMap() {
  if (!map.getSource('extract-preview')) {
    addExtractPreviewLayers();
  }
  const features = state.extractionResults.filter(r => r.selected).map(r => {
    let geom;
    if (r.type === 'polygon') geom = { type: 'Polygon', coordinates: [r.coordinates] };
    else if (r.type === 'line') geom = { type: 'LineString', coordinates: r.coordinates };
    else geom = { type: 'Point', coordinates: r.coordinates[0] ? r.coordinates[0] : [0, 0] };
    return { type: 'Feature', geometry: geom, properties: { color: r.color, type: r.type, name: r.name } };
  });
  updateExtractPreview(features);
  if (features.length && state.extractPolygon) {
    const allCoords = [...state.extractPolygon];
    state.extractionResults.filter(r => r.selected).forEach(r => allCoords.push(...(r.coordinates || [])));
    if (allCoords.length) {
      const b = allCoords.reduce((b, c) => {
        b[0][0] = Math.min(b[0][0], c[0]);
        b[0][1] = Math.min(b[0][1], c[1]);
        b[1][0] = Math.max(b[1][0], c[0]);
        b[1][1] = Math.max(b[1][1], c[1]);
        return b;
      }, [[allCoords[0][0], allCoords[0][1]], [allCoords[0][0], allCoords[0][1]]]);
      map.fitBounds(b, { padding: 40, maxZoom: 18 });
    }
  }
  bringAnnosToFront();
}

export async function importExtractedResults() {
  const selected = state.extractionResults.filter(r => r.selected);
  if (!selected.length) { alert('请选择要导入的标注'); return; }

  let imported = 0;
  selected.forEach(r => {
    const anno = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      type: r.type,
      name: r.name || '提取地物',
      note: r.source ? `来源: ${r.source}` : '',
      color: r.color || '#3b82f6',
      created_at: new Date().toISOString(),
      coordinates: r.coordinates,
      admin: resolveAdminForImport(),
    };
    if (r.type === 'line') {
      anno.roadClass = r.roadClass || ''; anno.lanes = r.lanes || ''; anno.surface = r.surface || '';
    } else if (r.type === 'polygon') {
      anno.buildingType = r.buildingType || ''; anno.floors = r.floors || '';
    }
    state.annos.push(assignAdminByGeometry(anno));
    imported++;
  });

  await saveAnnotations();
  document.getElementById('d-extract-config').classList.add('hide');
  switchTab('fav');
  updateExtractPreview([]);
  state.extractionResults = [];
  alert(`已导入 ${imported} 个标注`);
}

function resolveAdminForImport() {
  if (state.currentAdminContext && state.currentAdminContext.admin) {
    const a = normalizeAdmin(state.currentAdminContext.admin);
    a.boundaryKey = state.currentAdminContext.boundaryKey || '';
    a.boundaryLevel = state.currentAdminContext.boundaryLevel || '';
    return a;
  }
  return normalizeAdmin(EMPTY_ADMIN());
}

export function initExtractPreview() {
  window._toggleResultSelect = toggleResultSelect;
  document.getElementById('extract-import').onclick = importExtractedResults;
}
