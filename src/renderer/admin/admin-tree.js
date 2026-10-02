// ═══════════════════════════════════════════
//  Administrative tree UI: sidebar + navigation + highlight
// ═══════════════════════════════════════════

import { state, ADMIN_LABELS, ADMIN_PATH_KEYS, EMPTY_ADMIN, normalizeAdmin, TYPE_ICONS } from '../state.js';
import { map } from '../map/map.js';
import { buildAnnoMeta, matchesSearchAnno } from '../annotations/anno-data.js';
import { highlightBoundary, getBoundaryBounds, findBestBoundaryForAdmin, findBoundaryByKey } from './admin-geometry.js';
import { boundaryDisplayName } from './admin-boundaries.js';
import { esc } from '../ui/ui-utils.js';

export function getAdminPath(admin) {
  const a = normalizeAdmin(admin || EMPTY_ADMIN());
  return {
    province: a.province || '未分类',
    county: a.county || '未分类',
    town: a.town || '未分类',
    village: a.village || '未分类',
  };
}

export function buildAdminTree(items) {
  const root = [];
  items.forEach(a => {
    const path = getAdminPath(a.admin);
    const levels = [path.province, path.county, path.town, path.village];
    let bucket = root;
    let chain = '';
    levels.forEach((label, idx) => {
      const levelKey = ADMIN_PATH_KEYS[idx];
      chain = chain ? `${chain}__${levelKey}:${label}` : `${levelKey}:${label}`;
      let node = bucket.find(n => n.key === chain && n.type === levelKey);
      if (!node) {
        node = makeNode(levelKey, chain, label, idx);
        bucket.push(node);
      }
      node.count++;
      bucket = node.items;
    });
    bucket.push(a);
  });
  return root;
}

function makeNode(type, key, label, depth) {
  return { type, key, label, depth, count: 0, children: new Map(), items: [] };
}

export function getNodeAdminFromKey(key) {
  const admin = { province: '', county: '', town: '', village: '', region: '', boundaryKey: '', boundaryLevel: '' };
  key.split('__').map(seg => seg.split(':')).forEach(([lvl, val]) => {
    if (admin[lvl] !== undefined) admin[lvl] = val === '未分类' ? '' : val;
  });
  return admin;
}

export function ensureTreePathOpen(key) {
  if (!key) return;
  const parts = key.split('__');
  for (let i = 0; i < parts.length; i++) {
    state.treeOpenState[parts.slice(0, i + 1).join('__')] = true;
  }
}

export function matchesActiveTreeFilter(a) {
  if (!state.activeTreeFilterKey) return true;
  const admin = getAdminPath(a.admin);
  const nodeAdmin = getNodeAdminFromKey(state.activeTreeFilterKey);
  return (!nodeAdmin.province || admin.province === nodeAdmin.province)
    && (!nodeAdmin.county || admin.county === nodeAdmin.county)
    && (!nodeAdmin.town || admin.town === nodeAdmin.town)
    && (!nodeAdmin.village || admin.village === nodeAdmin.village);
}

export function renderTreeNodes(nodes) {
  return nodes.map(node => {
    const isOpen = state.treeOpenState[node.key] !== false;
    const isActive = state.selectedAdminNode && state.selectedAdminNode.key === node.key;
    const children = node.items.filter(x => !x.id);
    const annosOnly = node.items.filter(x => x.id);
    const childHtml = isOpen
      ? `${children.length ? `<div class="tree-children">${renderTreeNodes(children)}</div>` : ''}${annosOnly.length ? `<div class="tree-children">${annosOnly.slice().reverse().map(a => renderTreeItem(a)).join('')}</div>` : ''}`
      : '';
    return `<div class="tree-node ${isOpen ? 'is-open' : ''} ${isActive ? 'is-active' : ''}" data-node-key="${esc(node.key)}"><button class="tree-row" data-node-key="${esc(node.key)}"><span class="tree-arrow" data-node-arrow="${esc(node.key)}">${isOpen ? '▾' : '▸'}</span><span class="tree-label">${esc(node.label)} <small>${esc(ADMIN_LABELS[node.type] || '')}</small></span><span class="tree-count">${node.count}</span></button>${childHtml}</div>`;
  }).join('');
}

export function renderTreeItem(a) {
  const icon = TYPE_ICONS[a.type] || '📍';
  const meta = buildAnnoMeta(a);
  const isActive = state.selectedAdminNode && state.selectedAdminNode.type === 'anno' && state.selectedAdminNode.id === a.id;
  return `<button class="tree-item ${isActive ? 'is-active' : ''}" data-anno-id="${a.id}"><div class="tree-item-name">${icon} ${esc(a.name || '未命名')}</div>${meta ? `<div class="tree-item-meta">${esc(meta)}</div>` : ''}</button>`;
}

export function attachTreeEvents(renderFn) {
  document.querySelectorAll('.tree-row').forEach(el => {
    el.addEventListener('click', e => {
      const key = el.dataset.nodeKey;
      if (e.target.closest('[data-node-arrow]')) toggleTreeOpenOnly(key);
      else activateAdminNode(key);
    });
    el.addEventListener('dblclick', e => { e.preventDefault(); toggleTreeOpenOnly(el.dataset.nodeKey); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); clearTreeFilter(); });
  });
  document.querySelectorAll('.tree-item').forEach(el => {
    el.addEventListener('click', () => focusAnnotation(el.dataset.annoId, true));
  });
  const clearBtn = document.getElementById('clear-tree-filter');
  if (clearBtn) clearBtn.onclick = clearTreeFilter;
  const expandAllBtn = document.getElementById('tree-expand-all');
  if (expandAllBtn) expandAllBtn.onclick = () => { setAllTreeOpen(true); renderFn(); };
  const collapseAllBtn = document.getElementById('tree-collapse-all');
  if (collapseAllBtn) collapseAllBtn.onclick = () => { setAllTreeOpen(false); renderFn(); };
}

export function setAllTreeOpen(open) {
  const collectKeys = (nodes, keys = []) => {
    for (const node of nodes) {
      if (!node.id) {
        keys.push(node.key);
        collectKeys(node.items, keys);
      }
    }
    return keys;
  };
  const tree = buildAdminTree(state.annos);
  for (const key of collectKeys(tree)) state.treeOpenState[key] = open;
}

export function toggleTreeOpenOnly(key) {
  state.treeOpenState[key] = !(state.treeOpenState[key] !== false);
  ensureTreePathOpen(key);
  renderTree();
}

export function clearTreeFilter() {
  state.activeTreeFilterKey = '';
  state.selectedAdminNode = null;
  state.currentAdminContext = null;
  highlightBoundary('', false);
  renderTree();
}

export function activateAdminNode(key, skipLocate) {
  state.selectedAdminNode = { type: 'node', key };
  state.activeTreeFilterKey = key;
  ensureTreePathOpen(key);
  const admin = getNodeAdminFromKey(key);
  const boundary = findBoundaryByAdmin(admin) || findBestBoundaryForAdmin(admin);
  if (boundary) {
    highlightBoundary(boundary.key, !skipLocate);
    state.currentAdminContext = { type: 'boundary', admin: boundary.admin, boundaryKey: boundary.key, boundaryLevel: boundary.level };
  } else {
    highlightBoundary('', false);
    state.currentAdminContext = { type: 'admin', admin };
  }
  renderTree();
}

let lastTreeJson = '';
let lastFilter = '';
let debounceTimer = null;

export function renderTree(query = '') {
  const el = document.getElementById('annotations-list');
  if (!state.annos.length) {
    el.innerHTML = '<div class="empty">暂无标注<br>在地图上右键添加点，或用右上角工具栏绘制道路/建筑/提取</div>';
    lastTreeJson = '';
    lastFilter = '';
    return;
  }
  const items = state.annos.filter(a => matchesSearchAnno(a, query || '')).filter(matchesActiveTreeFilter);
  if (!items.length) {
    el.innerHTML = '<div class="empty">无匹配结果</div>';
    lastTreeJson = '';
    lastFilter = query;
    return;
  }
  const tree = buildAdminTree(items);
  const treeJson = JSON.stringify(tree);
  if (treeJson === lastTreeJson && query === lastFilter) return;

  const compactFilterText = state.activeTreeFilterKey
    ? `当前仅显示：${boundaryDisplayName({ admin: getNodeAdminFromKey(state.activeTreeFilterKey), name: '', level: '' })}`
    : '';
  const treeToolbar = `<div class="tree-toolbar"><button id="tree-expand-all">展开全部</button><button id="tree-collapse-all">折叠全部</button></div>`;
  el.innerHTML = `<div class="admin-tree">${state.activeTreeFilterKey ? `<div class="tree-filter-bar"><span>${esc(compactFilterText)}</span><button id="clear-tree-filter">查看全部</button></div>` : ''}${treeToolbar}${renderTreeNodes(tree)}</div>`;
  attachTreeEvents(() => renderTree(query));
  lastTreeJson = treeJson;
  lastFilter = query;
}

export function debouncedRenderTree(query = '') {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => renderTree(query), 150);
}

export async function focusAnnotation(id, openEdit) {
  const a = state.annos.find(x => x.id === id);
  if (!a) return;
  state.selectedAdminNode = { type: 'anno', id };
  const path = getAdminPath(a.admin);
  const nodeKey = `province:${path.province}__county:${path.county}__town:${path.town}__village:${path.village}`;
  ensureTreePathOpen(nodeKey);
  if (a.admin?.boundaryKey) {
    highlightBoundary(a.admin.boundaryKey, false);
    const boundary = findBoundaryByKey(a.admin.boundaryKey);
    if (boundary) state.currentAdminContext = { type: 'boundary', admin: boundary.admin, boundaryKey: boundary.key, boundaryLevel: boundary.level };
  } else {
    const boundary = findBestBoundaryForAdmin(a.admin || EMPTY_ADMIN());
    if (boundary) {
      highlightBoundary(boundary.key, false);
      state.currentAdminContext = { type: 'boundary', admin: boundary.admin, boundaryKey: boundary.key, boundaryLevel: boundary.level };
    } else {
      highlightBoundary('', false);
      state.currentAdminContext = { type: 'admin', admin: a.admin || EMPTY_ADMIN() };
    }
  }
  if (a.type === 'point') {
    map.flyTo({ center: [a.lng, a.lat], zoom: 16 });
  } else {
    const coords = a.coordinates;
    if (coords && coords.length) {
      const b = coords.reduce((b, c) => {
        b[0][0] = Math.min(b[0][0], c[0]);
        b[0][1] = Math.min(b[0][1], c[1]);
        b[1][0] = Math.max(b[1][0], c[0]);
        b[1][1] = Math.max(b[1][1], c[1]);
        return b;
      }, [[coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]]);
      map.fitBounds(b, { padding: 60, maxZoom: 17 });
    }
  }
  renderTree(document.getElementById('search-input')?.value || '');
  if (openEdit) {
    const { showEdit } = await import('../annotations/anno-dialogs.js');
    showEdit(a.id);
  }
}
