// ═══════════════════════════════════════════
//  Administrative boundary data import / library
// ═══════════════════════════════════════════

import { state, EMPTY_ADMIN, normalizeAdmin, saveBoundaries, saveAnnotations } from '../state.js';
import { updateBoundarySources } from '../map/sources.js';
import { updateBoundaryVisibilityFilters } from '../map/layers.js';
import { assignAdminByGeometry, computeSharedTownPolygons } from './admin-geometry.js';
import { esc } from '../ui/ui-utils.js';

export function normalizeLookupKey(text) {
  return String(text || '').toLowerCase().replace(/[_\-\s]/g, '');
}

export function getPropValue(props, keys) {
  const entries = Object.entries(props || {});
  const lookup = new Map(entries.map(([k, v]) => [normalizeLookupKey(k), v]));
  for (const key of keys) {
    const direct = props[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
    const loose = lookup.get(normalizeLookupKey(key));
    if (loose !== undefined && loose !== null && String(loose).trim()) return String(loose).trim();
  }
  return '';
}

export function inferBoundaryLevel(props) {
  const raw = getPropValue(props, ['level', 'LEVEL', 'admin_level', 'adminLevel', '层级', '级别', 'xzqhdm']).toLowerCase();
  if (raw.includes('province') || raw.includes('sheng') || raw.includes('省') || raw === '1') return 'province';
  if (raw.includes('county') || raw.includes('district') || raw.includes('xian') || raw.includes('县') || raw.includes('区') || raw === '2') return 'county';
  if (raw.includes('town') || raw.includes('township') || raw.includes('xiang') || raw.includes('zhen') || raw.includes('乡') || raw.includes('镇') || raw.includes('street') || raw === '3') return 'town';
  if (raw.includes('village') || raw.includes('cun') || raw.includes('村') || raw.includes('community') || raw === '4') return 'village';
  if (getPropValue(props, ['village', '村', '村名', '村名称', 'village_name', 'cun', 'cun_name', 'xzcmc'])) return 'village';
  if (getPropValue(props, ['town', 'township', '镇', '乡镇', '乡名称', '镇名称', 'town_name', 'xiang', 'zhen', 'xzjdm'])) return 'town';
  if (getPropValue(props, ['county', 'district', '县', '区', '县区', 'county_name', 'xian', 'qu'])) return 'county';
  return getPropValue(props, ['province', '省', 'province_name', 'sheng']) ? 'province' : 'town';
}

export function inferBoundaryPrecision(sourceRaw, level) {
  const s = String(sourceRaw || '').toLowerCase();
  if (s.includes('voronoi')) return { source: 'Voronoi-AMap', precision: 'low', method: 'derived' };
  if (s.includes('openstreetmap') || s.includes('osm')) return { source: 'OpenStreetMap', precision: 'medium', method: 'crowdsourced' };
  if (s.includes('datav')) return { source: 'DataV Atlas', precision: 'high', method: 'surveyed' };
  if (level === 'province' || level === 'county' || level === 'city' || level === 'prefecture' || String(level) === '1' || String(level) === '2' || String(level) === '3') {
    return { source: 'geojson.cn (DataV)', precision: 'high', method: 'surveyed' };
  }
  return { source: '未知', precision: 'unknown', method: 'unknown' };
}

export function normalizeBoundaryFeature(feature, idx) {
  if (!feature || !feature.geometry) return null;
  if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return null;
  const props = feature.properties || {};
  const level = inferBoundaryLevel(props);
  const province = getPropValue(props, ['province', '省', 'province_name', '省份', 'sheng', 'sheng_name', 'provincename']);
  const county = getPropValue(props, ['county', 'district', '县', '区', 'county_name', '县区', 'xian', 'qu', 'xian_name', 'district_name']);
  const town = getPropValue(props, ['town', 'township', '乡镇', '镇', '乡', 'town_name', 'xiang', 'zhen', 'xiang_name', 'zhen_name', 'street_name']);
  const village = getPropValue(props, ['village', '村', 'village_name', '村名', '村名称', 'cun', 'cun_name', 'community_name']);
  const region = getPropValue(props, ['region', '区域', '片区', 'zone', 'area']);
  const fullName = getPropValue(props, ['fullname', 'full_name', '全称', '全名']);
  const shortName = getPropValue(props, ['name', 'NAME', '名称', 'label', 'title', 'mc', 'xzqmc']);
  const name = fullName || shortName || ({ province, county, town, village }[level] || '未命名边界');
  const admin = normalizeAdmin({ province, county, town, village, region });
  if (level === 'province' && !admin.province) admin.province = name;
  if (level === 'county' && !admin.county) admin.county = name;
  if (level === 'town' && !admin.town) admin.town = name;
  if (level === 'village' && !admin.village) admin.village = name;

  const sourceRaw = getPropValue(props, ['source', '数据来源', 'source_name']) || '';
  const sourceInfo = inferBoundaryPrecision(sourceRaw, level);

  return {
    key: `boundary_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    id: getPropValue(props, ['id', 'ID', 'adcode', 'code']) || `${idx}`,
    name,
    level,
    geometry: feature.geometry,
    admin,
    source: sourceInfo.source,
    precision: sourceInfo.precision,
    method: sourceInfo.method,
  };
}

export function boundaryDisplayName(boundary) {
  const parts = [boundary.admin.province, boundary.admin.county, boundary.admin.town, boundary.admin.village].filter(Boolean);
  return parts.length ? parts.join(' / ') : boundary.name;
}

export function updateBoundaryOptions() {
  const next = { province: new Set(), county: new Set(), town: new Set(), village: new Set() };
  [...state.annos.map(a => a.admin || EMPTY_ADMIN()), ...state.boundaries.map(b => b.admin || EMPTY_ADMIN())].forEach(admin => {
    const a = normalizeAdmin(admin);
    if (a.province) next.province.add(a.province);
    if (a.county) next.county.add(a.county);
    if (a.town) next.town.add(a.town);
    if (a.village) next.village.add(a.village);
  });
  state.boundaryOptions = {
    province: [...next.province].sort(),
    county: [...next.county].sort(),
    town: [...next.town].sort(),
    village: [...next.village].sort(),
  };
  Object.entries(state.boundaryOptions).forEach(([level, items]) => {
    const list = document.getElementById(`admin-${level}-list`);
    if (list) list.innerHTML = items.map(item => `<option value="${esc(item)}"></option>`).join('');
  });
}

export function updateBoundaryStatus(extraText) {
  const el = document.getElementById('boundary-status');
  if (!state.boundaries.length) {
    el.textContent = '未导入行政区边界数据。当前可按省 / 县区 / 乡镇 / 村录入并树形管理，导入边界后可高亮区域。';
    return;
  }
  const counts = { province: 0, county: 0, town: 0, village: 0 };
  const precisionCounts = { high: 0, medium: 0, low: 0, unknown: 0 };
  state.boundaries.forEach(b => {
    if (counts[b.level] !== undefined) counts[b.level]++;
    const p = b.precision || 'unknown';
    precisionCounts[p] = (precisionCounts[p] || 0) + 1;
  });
  const precisionText = `实测 ${precisionCounts.high} · 众包 ${precisionCounts.medium} · 估算 ${precisionCounts.low} · 未知 ${precisionCounts.unknown}`;
  el.textContent = `已导入 ${state.boundaries.length} 个行政区边界：省 ${counts.province} · 县区 ${counts.county} · 乡镇 ${counts.town} · 村 ${counts.village} · ${precisionText}${extraText ? ` · ${extraText}` : ''}`;
}

export async function applyBoundaryCollection(data, sourceLabel) {
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('仅支持 GeoJSON FeatureCollection');
  }
  const parsed = data.features.map(normalizeBoundaryFeature).filter(Boolean);
  if (!parsed.length) throw new Error('未识别到 Polygon / MultiPolygon 行政区边界');
  state.boundaries = parsed;
  state.highlightedBoundaryKey = '';
  state.currentAdminContext = null;
  computeSharedTownPolygons();
  state.annos = state.annos.map(assignAdminByGeometry);
  await saveBoundaries();
  await saveAnnotations();
  updateBoundaryOptions();
  updateBoundaryStatus(sourceLabel ? `来源：${sourceLabel}` : '');
  updateBoundarySources();
  updateBoundaryVisibilityFilters();
  return parsed.length;
}

export async function importBoundaryFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.geojson,.json';
  inp.onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      const count = await applyBoundaryCollection(data, file.name);
      alert(`已导入 ${count} 个行政区边界，并尝试自动归属现有标注`);
    } catch (err) {
      alert('边界导入失败: ' + err.message);
    }
  };
  inp.click();
}

function pathBasename(p) {
  return p ? p.split('/').pop().replace(/\.json$/, '') : '';
}

export async function loadAllBoundaries() {
  const btn = document.getElementById('btn-load-all-boundaries');
  if (!btn) return;
  btn.textContent = '⏳ 加载中...';
  btn.disabled = true;
  try {
    let resp = await window.api.loadDefaultBoundary();
    let sourceLabel = '默认全国边界';
    if (!resp.ok) {
      resp = await window.api.loadAllBoundaries();
      sourceLabel = '本地边界库';
    }
    if (!resp.ok) throw new Error(resp.error || '加载失败');
    const count = await applyBoundaryCollection(resp.data, `${sourceLabel} (${resp.totalFeatures || resp.data?.features?.length || 0} 个要素)`);
    alert(`已加载 ${count} 个行政区边界`);
  } catch (err) {
    alert('一键加载失败: ' + err.message);
  } finally {
    btn.textContent = '🌏 一键加载全部';
    btn.disabled = false;
  }
}

export async function openLocalBoundaryLibrary() {
  const dialog = document.getElementById('d-local-boundary-library');
  const list = document.getElementById('local-boundary-list');
  const info = document.getElementById('local-boundary-info');
  dialog.classList.remove('hide');
  list.innerHTML = '<div class="empty">正在读取本地边界库...</div>';
  try {
    const resp = await window.api.listLocalBoundaryLibrary();
    if (!resp.ok) throw new Error(resp.error || '读取失败');
    state.localBoundaryLibrary = resp.downloaded || [];

    const precisionCounts = { high: 0, medium: 0, low: 0, unknown: 0 };
    state.localBoundaryLibrary.forEach(item => {
      const p = item.precision || 'unknown';
      precisionCounts[p] = (precisionCounts[p] || 0) + (item.features || 0);
    });

    info.textContent = `本地路径：${resp.root} · 共 ${state.localBoundaryLibrary.length} 个可加载文件 · 实测 ${precisionCounts.high || 0} / 众包 ${precisionCounts.medium || 0} / 估算 ${precisionCounts.low || 0} / 未知 ${precisionCounts.unknown || 0}`;
    if (!state.localBoundaryLibrary.length) {
      list.innerHTML = '<div class="empty">本地边界库为空<br>请先运行 npm run download:china-geojson</div>';
      return;
    }
    list.innerHTML = state.localBoundaryLibrary.map(item => {
      const tag = item.level === 'national' ? '全国省级' :
                  item.level === 'province' ? '省市级' :
                  item.level === 'county' ? '县区级' :
                  item.level === 'town' ? '乡镇级' :
                  item.level === 'combined' ? '全层级合并' :
                  (item.child_level === 'direct-controlled county/district' ? '直辖市区县' : '省内市级');
      const precisionTag = item.precision === 'high' ? '实测' :
                           item.precision === 'medium' ? '众包' :
                           item.precision === 'low' ? '估算' : '未知';
      const precisionClass = `precision-${item.precision || 'unknown'}`;
      const sourceText = item.source ? ` · ${item.source}` : '';
      return `<div class="boundary-lib-item" data-boundary-path="${esc(item.path)}"><div class="meta"><span class="name">${esc(item.name || pathBasename(item.path))}</span><span class="desc">${esc(item.path)}${esc(sourceText)} · ${item.features} 个要素</span></div><div class="tags"><span class="tag">${esc(tag)}</span><span class="tag ${esc(precisionClass)}">${esc(precisionTag)}</span></div></div>`;
    }).join('');
    list.querySelectorAll('[data-boundary-path]').forEach(el => {
      el.onclick = () => loadLocalBoundaryFile(el.dataset.boundaryPath);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty">读取本地边界库失败<br>${esc(err.message)}</div>`;
  }
}

async function loadLocalBoundaryFile(relativePath) {
  try {
    const resp = await window.api.loadLocalBoundaryFile(relativePath);
    if (!resp.ok) throw new Error(resp.error || '加载失败');
    const count = await applyBoundaryCollection(resp.data, relativePath);
    document.getElementById('d-local-boundary-library').classList.add('hide');
    alert(`已从本地边界库加载 ${count} 个行政区边界`);
  } catch (err) {
    alert('加载本地边界文件失败: ' + err.message);
  }
}

export async function clearBoundaries() {
  if (!state.boundaries.length) return;
  if (confirm('清空当前行政区边界数据？')) {
    state.boundaries = [];
    state.highlightedBoundaryKey = '';
    state.currentAdminContext = null;
    localStorage.removeItem('anduo_boundaries');
    await saveBoundaries();
    updateBoundaryOptions();
    updateBoundaryStatus();
    updateBoundarySources();
    updateBoundaryVisibilityFilters();
  }
}
