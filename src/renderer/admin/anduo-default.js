// ═══════════════════════════════════════════
//  Anduo county default boundaries + startup focus
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { map } from '../map/map.js';
import { applyBoundaryCollection } from './admin-boundaries.js';
import { getBoundaryBounds } from './admin-geometry.js';

const ANDUO_ALL_LEVELS = 'data/admin-geojson/xizang/anduo/anduo_all_levels.json';
const ANDUO_COUNTY_FILE = 'data/admin-geojson/xizang/anduo/540624_安多县.json';

// 首次启动（无已保存边界）时自动加载安多县县界 + 13 个乡镇边界。
// applyBoundaryCollection 会持久化到 userData，下次启动门卫直接跳过 —— 天然幂等。
export async function ensureAnduoDefaultBoundaries() {
  if (state.boundaries.length > 0) return false;
  try {
    const res = await fetch(ANDUO_ALL_LEVELS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // 源文件含那曲市其他县及重复的安多县要素：只保留安多县并按 level+name 去重
    const seen = new Set();
    const features = (data.features || []).filter(f => {
      const p = f.properties || {};
      if (p.county !== '安多县') return false;
      const key = `${p.level}:${p.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!features.length) throw new Error('未找到安多县边界要素');
    await applyBoundaryCollection({ type: 'FeatureCollection', features }, '安多县默认边界');
    return true;
  } catch (e) {
    console.warn('自动加载安多县默认边界失败', e);
    return false;
  }
}

// 视野聚焦安多县全境。优先用 state 中的县界；不存在时直接读县界文件计算范围（不写入 state）。
export async function focusAnduoCounty() {
  try {
    let boundary = state.boundaries.find(b => b.level === 'county' && b.admin.county === '安多县');
    if (!boundary) {
      const res = await fetch(ANDUO_COUNTY_FILE);
      if (!res.ok) return;
      const data = await res.json();
      const f = (data.features || [])[0];
      if (!f) return;
      boundary = { geometry: f.geometry };
    }
    const bounds = getBoundaryBounds(boundary);
    if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 10 });
  } catch (e) {
    console.warn('聚焦安多县失败', e);
  }
}
