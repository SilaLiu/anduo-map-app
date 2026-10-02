// ═══════════════════════════════════════════
//  Sand table checklist model (pure data, no DOM)
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { sandtableMeta, findSandTableFeature } from './sandtable-data.js';

// key 格式：`${category}:${town}:${name}`，非村类 town 为空串；
// 未知村用槽位序号占位（village:扎仁镇:#3）。该 key 持久化在标注的 sandtableKey 字段上。
export function makeKey(category, town, name) {
  return `${category}:${town || ''}:${name}`;
}

// 类别 → 复数 geojson 文件名 / 默认绘制类型
const CAT_FILES = { town: 'towns', village: 'villages', road: 'roads', river: 'rivers', lake: 'lakes', mountain: 'mountains', temple: 'temples' };
const CAT_DRAW = { town: 'point', village: 'point', road: 'line', river: 'line', lake: 'polygon', mountain: 'point', temple: 'point', building: 'polygon' };

function findMissingReason(category, town, name) {
  const rec = (sandtableMeta.missing || []).find(m =>
    m.category === category && m.name === name && (!town || !m.town || m.town === town));
  return rec ? rec.reason : '';
}

function makeItem(category, town, name, extra = {}) {
  return {
    key: makeKey(category, town, name),
    category,
    town: town || '',
    name,
    drawType: CAT_DRAW[category] || 'point',
    unnamed: false,
    ...extra,
  };
}

// 附加运行时状态：annotated ✏️ / located ✅ / estimated 📍 / missing ⚠️
export function resolveItemStatus(item) {
  const anno = state.annos.find(a => a.sandtableKey === item.key);
  if (anno) return { status: 'annotated', anno, feature: null };
  if (item.category !== 'building' && !item.unnamed) {
    const feature = findSandTableFeature(CAT_FILES[item.category], item.name, item.town);
    if (feature) {
      const estimated = !!(feature.properties && feature.properties.needs_review);
      return { status: estimated ? 'estimated' : 'located', anno: null, feature };
    }
  }
  return { status: 'missing', anno: null, feature: null, reason: findMissingReason(item.category, item.town, item.displayName || item.name) };
}

function withStatus(item) {
  return Object.assign(item, resolveItemStatus(item));
}

function progressOf(items) {
  const p = { done: 0, estimated: 0, total: items.length };
  for (const it of items) {
    if (it.status === 'annotated' || it.status === 'located') p.done++;
    else if (it.status === 'estimated') p.estimated++;
  }
  return p;
}

// 从 requirements 枚举全部需求项，联动 geojson / 标注实时状态
export function buildChecklist() {
  const req = sandtableMeta.requirements;
  if (!req) return { sections: [], progress: { done: 0, estimated: 0, total: 0 } };

  const sections = [];

  // 县级要素：县政府大楼（房子模型+灯+标牌）
  const countyItems = [withStatus(makeItem('building', req.county?.county_seat?.town || '', '县政府大楼', {
    note: `${req.county?.county_seat?.town || ''}（县政府所在地）· 房子模型+亮灯+标牌`,
  }))];
  sections.push({ key: 'county', label: '县级要素', items: countyItems, progress: progressOf(countyItems) });

  const towns = req.towns || [];

  // 乡镇驻地
  const townItems = towns.map(t => withStatus(makeItem('town', '', t.name, {
    note: `${t.type} · 政府大楼亮灯+标牌`,
  })));
  sections.push({ key: 'town', label: '乡镇驻地', items: townItems, progress: progressOf(townItems) });

  // 行政村：按镇分组，known 村 + 未知槽位
  const groups = towns.map(t => {
    const items = [
      ...(t.villages_known || []).map(v => withStatus(makeItem('village', t.name, v))),
      ...Array.from({ length: t.villages_unknown || 0 }, (_, i) =>
        withStatus(makeItem('village', t.name, `#${i + 1}`, { unnamed: true, displayName: `未知行政村${i + 1}` }))),
    ];
    return { town: t.name, items, progress: progressOf(items) };
  });
  const allVillageItems = groups.flatMap(g => g.items);
  sections.push({ key: 'village', label: '行政村', groups, items: allVillageItems, progress: progressOf(allVillageItems) });

  // 平铺类别
  const flat = [
    ['road', '道路 / 铁路', (req.roads || []).map(r => makeItem('road', '', r.name, { note: r.light_color ? `${r.category} · ${r.light_color}` : r.category }))],
    ['river', '河流', (req.rivers || []).map(r => makeItem('river', '', r.name, { note: r.section ? `${r.section} · 加灯+标牌` : '加灯+标牌' }))],
    ['lake', '湖泊', (req.lakes || []).map(l => makeItem('lake', '', l.name, { note: '加灯+标牌' }))],
    ['mountain', '山峰', (req.mountains || []).map(m => makeItem('mountain', '', m.name, { note: m.elevation_m ? `海拔 ${m.elevation_m}m · 标牌` : '标牌+海拔（待补充）' }))],
    ['temple', '寺庙', (req.temples || []).map(t => makeItem('temple', '', t.name, { note: '按教派区分 · 标牌+寺庙房子' }))],
  ];
  for (const [key, label, items] of flat) {
    items.forEach(withStatus);
    sections.push({ key, label, items, progress: progressOf(items) });
  }

  const allItems = sections.flatMap(s => s.items);
  return { sections, progress: progressOf(allItems) };
}
