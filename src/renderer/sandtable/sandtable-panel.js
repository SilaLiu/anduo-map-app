// ═══════════════════════════════════════════
//  Sand table sidebar panel
// ═══════════════════════════════════════════

import { loadSandTableGeoJSON, loadSandTableMeta, getSandTableFeatureCount } from './sandtable-data.js';
import { addSandTableLayers, setSandTableCategoryVisible } from './sandtable-layers.js';
import { initChecklist } from './sandtable-checklist.js';

const CATEGORIES = [
  { key: 'town', label: '乡镇驻地', icon: '🏛️', color: '#ef4444' },
  { key: 'village', label: '行政村', icon: '📌', color: '#9ca3af' },
  { key: 'road', label: '道路/铁路', icon: '🛣️', color: '#facc15' },
  { key: 'river', label: '河流', icon: '💧', color: '#3b82f6' },
  { key: 'lake', label: '湖泊', icon: '🌊', color: '#3b82f6' },
  { key: 'mountain', label: '山峰', icon: '⛰️', color: '#a3a3a3' },
  { key: 'temple', label: '寺庙', icon: '⛩️', color: '#f59e0b' },
];

let initialized = false;
let visibility = {
  town: true,
  village: true,
  road: true,
  river: true,
  lake: true,
  mountain: true,
  temple: true,
};

export async function initSandTablePanel() {
  if (initialized) return;
  const panel = document.getElementById('tab-sandtable');
  if (!panel) {
    console.warn('沙盘面板 DOM 不存在');
    return;
  }

  await loadSandTableGeoJSON();
  await loadSandTableMeta();

  panel.innerHTML = `
    <div class="panel-toolbar">
      <span class="panel-title">🏗️ 沙盘制作</span>
      <button id="btn-sandtable-load">加载数据</button>
    </div>
    <div class="sandtable-scroll">
      <details class="sandtable-block">
      <summary>🗂 图层控制</summary>
      <div class="sandtable-intro">
        <p>数据来源：<code>data/sandtable-geojson/</code></p>
        <p>红色=灯带/亮灯，灰色=仅标牌，黄色=道路，蓝色=水系。</p>
      </div>
      <div id="sandtable-layer-list" class="sandtable-layer-list"></div>
      <div id="sandtable-stats" class="sandtable-stats"></div>
      </details>
      <details class="sandtable-block" open>
        <summary>📋 任务清单</summary>
        <div id="sandtable-checklist" class="sandtable-checklist"></div>
      </details>
    </div>
  `;

  renderLayerList(panel);
  renderStats(panel);
  initChecklist(document.getElementById('sandtable-checklist'));

  document.getElementById('btn-sandtable-load').onclick = async () => {
    await addSandTableLayers();
    for (const cat of Object.keys(visibility)) {
      setSandTableCategoryVisible(cat, visibility[cat]);
    }
    const btn = document.getElementById('btn-sandtable-load');
    if (btn) {
      btn.textContent = '已加载';
      btn.disabled = true;
    }
  };

  initialized = true;
}

function renderLayerList(panel) {
  const list = panel.querySelector('#sandtable-layer-list');
  if (!list) return;
  list.innerHTML = CATEGORIES.map(cat => {
    const count = getSandTableFeatureCount(cat.key + 's');
    const checked = visibility[cat.key] ? 'checked' : '';
    return `
      <label class="sandtable-layer-item" data-cat="${cat.key}">
        <input type="checkbox" ${checked} data-cat="${cat.key}">
        <span class="layer-icon" style="color:${cat.color}">${cat.icon}</span>
        <span class="layer-name">${cat.label}</span>
        <span class="layer-count">${count}</span>
      </label>
    `;
  }).join('');

  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const cat = cb.dataset.cat;
      visibility[cat] = cb.checked;
      setSandTableCategoryVisible(cat, cb.checked);
    };
  });
}

function renderStats(panel) {
  const stats = panel.querySelector('#sandtable-stats');
  if (!stats) return;
  const total = CATEGORIES.reduce((sum, cat) => sum + getSandTableFeatureCount(cat.key + 's'), 0);
  stats.innerHTML = `
    <div class="sandtable-stat-row"><span>总要素</span><strong>${total}</strong></div>
    <div class="sandtable-stat-note">点击上方“加载数据”后在地图上显示</div>
  `;
}

export function showSandTablePanel() {
  initSandTablePanel();
}
