// ═══════════════════════════════════════════
//  Sand table checklist UI — 需求核对清单
// ═══════════════════════════════════════════

import { state, subscribe } from '../state.js';
import { map } from '../map/map.js';
import { esc } from '../ui/ui-utils.js';
import { bboxFromCoords } from '../utils/geo.js';
import { setDrawMode, cancelDrawing } from '../drawing/draw-mode.js';
import { setAddDefaults } from '../annotations/anno-dialogs.js';
import { townCenters } from '../admin/admin-geometry.js';
import { focusAnduoCounty } from '../admin/anduo-default.js';
import { buildChecklist } from './sandtable-checklist-model.js';

const STATUS_META = {
  annotated: { icon: '✏️', label: '已人工标注', cls: 'st-annotated' },
  located: { icon: '✅', label: '已定位', cls: 'st-located' },
  estimated: { icon: '📍', label: '估算·待核对', cls: 'st-estimated' },
  missing: { icon: '⚠️', label: '待标注', cls: 'st-missing' },
};

// 会话级 UI 状态（折叠 / 过滤），不持久化
const openState = { county: true, town: false, village: true, road: true, river: true, lake: true, mountain: true, temple: true };
const openTowns = {};
let onlyPending = false;
let container = null;
let subscribed = false;

export function initChecklist(el) {
  container = el;
  if (!subscribed) {
    subscribe(key => {
      if (key === 'annos' && container && container.isConnected) renderChecklist();
    });
    subscribed = true;
  }
  container.addEventListener('click', onContainerClick);
  renderChecklist();
}

export function renderChecklist() {
  if (!container) return;
  const { sections, progress } = buildChecklist();
  if (!sections.length) {
    container.innerHTML = '<div class="st-check-empty">未加载沙盘需求数据（data/sandtable-requirements.json）</div>';
    return;
  }
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const annotatedCount = sections.flatMap(s => s.items).filter(i => i.status === 'annotated').length;

  const head = `
    <div class="st-check-head">
      <div class="st-check-progress-text">进度 <strong>${progress.done}/${progress.total}</strong> · 人工标注 ${annotatedCount} · 待核对 ${progress.estimated}</div>
      <div class="st-progress-bar"><div class="st-progress-fill" style="width:${pct}%"></div></div>
      <label class="st-check-filter"><input type="checkbox" id="st-only-pending" ${onlyPending ? 'checked' : ''}> 只看待标注</label>
    </div>`;

  const body = sections.map(sec => renderSection(sec)).join('');
  container.innerHTML = head + body;

  const cb = container.querySelector('#st-only-pending');
  if (cb) cb.onchange = () => { onlyPending = cb.checked; renderChecklist(); };
}

function visibleItems(items) {
  return onlyPending ? items.filter(i => i.status === 'missing' || i.status === 'estimated') : items;
}

function renderSection(sec) {
  const open = openState[sec.key] !== false;
  const done = sec.progress.done === sec.progress.total && sec.progress.total > 0;
  let inner = '';
  if (sec.key === 'village') {
    inner = sec.groups.map(g => {
      const items = visibleItems(g.items);
      const gOpen = openTowns[g.town] === true;
      const gDone = g.progress.done === g.progress.total;
      if (onlyPending && !items.length) return '';
      return `
        <div class="st-town-group">
          <div class="st-town-head" data-town="${esc(g.town)}">
            <span class="st-caret">${gOpen ? '▾' : '▸'}</span>
            <span>${esc(g.town)}</span>
            <span class="st-sec-count ${gDone ? 'done' : ''}">${g.progress.done}/${g.progress.total}${gDone ? ' ✅' : ''}</span>
          </div>
          ${gOpen ? items.map(renderItem).join('') : ''}
        </div>`;
    }).join('');
  } else {
    const items = visibleItems(sec.items);
    if (onlyPending && !items.length) return '';
    inner = items.map(renderItem).join('');
  }
  return `
    <div class="st-check-section">
      <div class="st-sec-head" data-sec="${sec.key}">
        <span class="st-caret">${open ? '▾' : '▸'}</span>
        <span class="st-sec-label">${esc(sec.label)}</span>
        <span class="st-sec-count ${done ? 'done' : ''}">${sec.progress.done}/${sec.progress.total}${done ? ' ✅' : ''}</span>
      </div>
      ${open ? inner : ''}
    </div>`;
}

function renderItem(item) {
  const meta = STATUS_META[item.status];
  const display = item.unnamed
    ? (item.anno ? `${esc(item.displayName)} → 「${esc(item.anno.name)}」` : esc(item.displayName))
    : esc(item.name);
  const sub = item.status === 'missing' && item.reason ? `<span class="st-item-reason">${esc(item.reason)}</span>` : '';
  const canFly = item.status !== 'missing';
  const needAnnotate = item.status === 'missing' || item.status === 'estimated';
  const btn = needAnnotate
    ? `<button class="st-annotate-btn" data-act="annotate" data-key="${esc(item.key)}">✏️ ${item.status === 'estimated' ? '重标' : '标注'}</button>`
    : '';
  return `
    <div class="st-check-item ${meta.cls} ${canFly ? 'flyable' : ''}" data-key="${esc(item.key)}" title="${esc(meta.label)}${item.note ? ' · ' + esc(item.note) : ''}">
      <span class="st-item-icon">${meta.icon}</span>
      <span class="st-item-name">${display}${sub}</span>
      ${btn}
    </div>`;
}

function onContainerClick(e) {
  const secHead = e.target.closest('.st-sec-head');
  if (secHead) {
    openState[secHead.dataset.sec] = openState[secHead.dataset.sec] === false;
    renderChecklist();
    return;
  }
  const townHead = e.target.closest('.st-town-head');
  if (townHead) {
    openTowns[townHead.dataset.town] = !openTowns[townHead.dataset.town];
    renderChecklist();
    return;
  }
  const annotateBtn = e.target.closest('[data-act="annotate"]');
  if (annotateBtn) {
    const item = findItemByKey(annotateBtn.dataset.key);
    if (item) startAnnotateItem(item);
    return;
  }
  const row = e.target.closest('.st-check-item.flyable');
  if (row) {
    const item = findItemByKey(row.dataset.key);
    if (item) flyToItem(item);
  }
}

function findItemByKey(key) {
  const { sections } = buildChecklist();
  return sections.flatMap(s => s.items).find(i => i.key === key) || null;
}

function flyToItem(item) {
  if (item.anno) {
    const a = item.anno;
    if (a.type === 'point') map.flyTo({ center: [a.lng, a.lat], zoom: 15 });
    else fitCoords(a.coordinates || []);
    return;
  }
  if (item.feature) {
    const geom = item.feature.geometry;
    if (geom.type === 'Point') map.flyTo({ center: geom.coordinates, zoom: 15 });
    else fitCoords(flattenCoords(geom));
  }
}

function flattenCoords(geom) {
  if (geom.type === 'LineString') return geom.coordinates;
  if (geom.type === 'Polygon') return geom.coordinates.flat();
  if (geom.type === 'MultiLineString') return geom.coordinates.flat();
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2);
  return [];
}

function fitCoords(coords) {
  if (!coords.length) return;
  const { minLng, minLat, maxLng, maxLat } = bboxFromCoords(coords);
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 15 });
}

// 进入标注工作流：预填 → 绘制模式 → 视野引导 → 提示条
function startAnnotateItem(item) {
  if (item.status === 'annotated' && !confirm(`「${item.name}」已有关联标注，重新标注？`)) return;

  setAddDefaults({
    name: item.unnamed ? '' : item.name,
    note: item.unnamed
      ? `${item.town} 行政村（原：${item.displayName}）`
      : (item.note || item.reason || ''),
    sandtableKey: item.key,
    adminVillage: item.category === 'village' && !item.unnamed ? item.name : '',
  });

  if (state.drawMode) cancelDrawing(false);
  setDrawMode(item.drawType);

  // 视野引导：村飞到所属乡镇中心，其余回县域全境
  const center = item.town && townCenters[item.town];
  if (center) map.flyTo({ center, zoom: 12 });
  else if (!item.feature) focusAnduoCounty();
  else flyToItem(item);

  const hint = document.getElementById('draw-hint');
  const label = item.unnamed ? item.displayName : item.name;
  hint.textContent = `🎯 正在标注「${label}」· 点击地图放置${item.drawType !== 'point' ? '顶点 · 双击完成' : ''} · Esc 取消`;

  // 移动端收起侧边栏，露出地图
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('menu-toggle').classList.remove('open');
    document.body.classList.remove('menu-open');
  }
}
