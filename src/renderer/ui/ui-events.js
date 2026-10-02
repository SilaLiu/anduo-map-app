// ═══════════════════════════════════════════
//  General UI event wiring: topbar, tabs, keyboard, mobile menu
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { map, swLayer } from '../map/map.js';
import { cancelDrawing, setDrawMode } from '../drawing/draw-mode.js';
import { importBoundaryFile, loadAllBoundaries, openLocalBoundaryLibrary, clearBoundaries } from '../admin/admin-boundaries.js';
import { autoAssignAllAnnotations } from '../admin/admin-geometry.js';
import { setAddDefaults } from '../annotations/anno-dialogs.js';
import { updateExtractPreview } from '../map/sources.js';

import { initSandTablePanel } from '../sandtable/sandtable-panel.js';

export function switchTab(name) {
  document.querySelectorAll('.sb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.sb-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'sandtable') {
    initSandTablePanel();
  }
}

function closeOpenMenus() {
  document.querySelectorAll('.tb-dropdown').forEach(el => el.remove());
}

function createDropdown(anchor, items) {
  closeOpenMenus();
  const rect = anchor.getBoundingClientRect();
  const dd = document.createElement('div');
  dd.className = 'tb-dropdown';
  dd.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:2000;`;
  items.forEach(it => {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'tb-dd-sep';
      dd.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'tb-dd-item';
    btn.innerHTML = (it.icon || '') + ' ' + it.label;
    btn.onclick = () => { it.action(); closeOpenMenus(); };
    dd.appendChild(btn);
  });
  document.body.appendChild(dd);
  requestAnimationFrame(() => {
    const r = dd.getBoundingClientRect();
    if (r.right > window.innerWidth) dd.style.left = (window.innerWidth - r.width - 8) + 'px';
  });
}

function showFileMenu(anchor) {
  createDropdown(anchor, [
    { label: '导入标注', icon: '📥', action: () => document.getElementById('btn-import').click() },
    { label: '导出标注', icon: '📤', action: () => document.getElementById('btn-export').click() },
    '-',
    { label: '导入边界', icon: '🗺️', action: importBoundaryFile },
    { label: '本地边界库', icon: '📚', action: openLocalBoundaryLibrary },
    { label: '一键加载全部边界', icon: '🌏', action: loadAllBoundaries },
    '-',
    { label: '清空标注', icon: '🗑️', action: () => document.getElementById('btn-clear').click() },
  ]);
}

function showViewMenu(anchor) {
  createDropdown(anchor, [
    { label: '卫星影像', icon: '🛰️', action: () => swLayer('satellite') },
    { label: '街道地图', icon: '🗺️', action: () => swLayer('street') },
    { label: '天地图', icon: '🇨🇳', action: () => swLayer('tianditu') },
    '-',
    { label: '收藏夹面板', icon: '⭐', action: () => switchTab('fav') },
    { label: '行政区面板', icon: '🗺️', action: () => switchTab('admin') },
    { label: '沙盘面板', icon: '🏗️', action: () => switchTab('sandtable') },
  ]);
}

function showDrawMenu(anchor) {
  createDropdown(anchor, [
    { label: '标注点', icon: '📍', action: () => setDrawMode('point') },
    { label: '绘制道路', icon: '🛣️', action: () => setDrawMode('line') },
    { label: '绘制建筑', icon: '🏢', action: () => setDrawMode('polygon') },
    { label: 'AI 提取', icon: '🔍', action: () => setDrawMode('extract') },
  ]);
}

function showToolMenu(anchor) {
  createDropdown(anchor, [
    { label: '自动归属全部', icon: '🧭', action: autoAssignAllAnnotations },
    { label: '清空边界', icon: '🧹', action: clearBoundaries },
  ]);
}

export function initUIEvents() {
  // Sidebar tabs
  document.querySelectorAll('.sb-tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  // Topbar menus
  document.querySelectorAll('.tb-menu-item').forEach(item => {
    item.onclick = () => {
      const menu = item.dataset.menu;
      if (menu === 'file') showFileMenu(item);
      else if (menu === 'view') showViewMenu(item);
      else if (menu === 'draw') showDrawMenu(item);
      else if (menu === 'tool') showToolMenu(item);
    };
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.tb-menu-item') && !e.target.closest('.tb-dropdown')) closeOpenMenus();
  });

  // Mobile menu toggle
  document.getElementById('menu-toggle').onclick = () => {
    document.getElementById('sidebar').classList.toggle('show');
    document.getElementById('menu-toggle').classList.toggle('open');
    document.body.classList.toggle('menu-open');
  };
  map.on('click', () => {
    if (window.innerWidth <= 768 && document.getElementById('sidebar').classList.contains('show')) {
      document.getElementById('sidebar').classList.remove('show');
      document.getElementById('menu-toggle').classList.remove('open');
      document.body.classList.remove('menu-open');
    }
  });

  // Admin panel buttons
  document.getElementById('btn-import-boundaries').onclick = importBoundaryFile;
  document.getElementById('btn-load-local-library').onclick = openLocalBoundaryLibrary;
  document.getElementById('btn-load-all-boundaries').onclick = loadAllBoundaries;
  document.getElementById('local-boundary-close').onclick = () => document.getElementById('d-local-boundary-library').classList.add('hide');
  document.getElementById('btn-auto-assign-all').onclick = autoAssignAllAnnotations;
  document.getElementById('btn-clear-boundaries').onclick = clearBoundaries;

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.drawMode) {
        cancelDrawing();
        setAddDefaults(null); // 清除沙盘清单挂起的预填，防止误挂到下一次无关标注
        return;
      }
      document.querySelectorAll('.dialog').forEach(d => d.classList.add('hide'));
      if (state.extractionResults.length > 0) {
        switchTab('fav');
        updateExtractPreview([]);
        state.extractionResults = [];
      }
    }
  });
}

export function updateStatusBar() {
  const z = Math.round(map.getZoom());
  document.getElementById('zoom-display').textContent = 'Z' + z;
  document.getElementById('sb-level').textContent = '级别 ' + z;
}
