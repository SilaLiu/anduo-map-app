// ═══════════════════════════════════════════
//  Sand table data loader
// ═══════════════════════════════════════════

const CATEGORIES = ['towns', 'villages', 'roads', 'rivers', 'lakes', 'mountains', 'temples'];

export const sandtableData = {
  loaded: false,
  categories: {},
};

export async function loadSandTableGeoJSON() {
  if (sandtableData.loaded) return sandtableData.categories;
  const result = {};
  for (const cat of CATEGORIES) {
    try {
      const res = await fetch(`data/sandtable-geojson/${cat}.geojson`);
      if (res.ok) {
        const fc = await res.json();
        result[cat] = fc;
      } else {
        result[cat] = { type: 'FeatureCollection', features: [] };
      }
    } catch (e) {
      console.warn(`加载沙盘数据 ${cat}.geojson 失败`, e);
      result[cat] = { type: 'FeatureCollection', features: [] };
    }
  }
  sandtableData.categories = result;
  sandtableData.loaded = true;
  return result;
}

export function getSandTableFeatureCount(cat) {
  return sandtableData.categories[cat]?.features?.length || 0;
}

export function getAllSandTableFeatures() {
  const all = [];
  for (const fc of Object.values(sandtableData.categories)) {
    all.push(...(fc.features || []));
  }
  return all;
}

// ── 沙盘需求清单元数据（requirements + missing）──

export const sandtableMeta = {
  loaded: false,
  requirements: null,
  missing: [],
};

export async function loadSandTableMeta() {
  if (sandtableMeta.loaded) return sandtableMeta;
  try {
    const [reqRes, missRes] = await Promise.all([
      fetch('data/sandtable-requirements.json'),
      fetch('data/sandtable-geojson/missing.json'),
    ]);
    if (reqRes.ok) sandtableMeta.requirements = await reqRes.json();
    if (missRes.ok) sandtableMeta.missing = (await missRes.json()).items || [];
    sandtableMeta.loaded = true;
  } catch (e) {
    console.warn('加载沙盘需求元数据失败', e);
  }
  return sandtableMeta;
}

// 按名称在已定位要素中查找需求项对应要素。cat 为复数文件名（villages 等）；
// 村按 (town, name) 双键匹配，避免跨镇重名。
export function findSandTableFeature(cat, name, town) {
  const features = sandtableData.categories[cat]?.features || [];
  return features.find(f => {
    const p = f.properties || {};
    if (p.name !== name) return false;
    if (town && p.town && p.town !== town) return false;
    return true;
  }) || null;
}
