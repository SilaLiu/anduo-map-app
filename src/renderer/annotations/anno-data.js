// ═══════════════════════════════════════════
//  Annotation data operations, import/export
// ═══════════════════════════════════════════

import { state, TYPE_ICONS, EMPTY_ADMIN, normalizeAdmin, saveAnnotations } from '../state.js';
import { assignAdminByGeometry } from '../admin/admin-geometry.js';

export const ROAD_CLASS_LABELS = {
  highway: '高速', primary: '主干道', secondary: '次干道', residential: '住宅区', path: '小路',
};
export const SURFACE_LABELS = {
  asphalt: '沥青', concrete: '水泥', gravel: '碎石', dirt: '土路',
};
export const BUILDING_TYPE_LABELS = {
  residential: '住宅', commercial: '商业', industrial: '工业', public: '公共建筑', other: '其他',
};

export function buildAnnoMeta(a) {
  const meta = [];
  if (a.admin) {
    const parts = [a.admin.province, a.admin.county, a.admin.town, a.admin.village].filter(Boolean);
    if (parts.length) meta.push(parts.join(' / '));
    if (a.admin.region) meta.push(a.admin.region);
  }
  if (a.type === 'line') {
    const parts = [];
    if (a.roadClass) parts.push(ROAD_CLASS_LABELS[a.roadClass] || a.roadClass);
    if (a.lanes) parts.push(a.lanes + '车道');
    if (a.surface) parts.push(SURFACE_LABELS[a.surface] || a.surface);
    if (parts.length) meta.push(parts.join(' · '));
  } else if (a.type === 'polygon') {
    const parts = [];
    if (a.buildingType) parts.push(BUILDING_TYPE_LABELS[a.buildingType] || a.buildingType);
    if (a.floors) parts.push(a.floors + '层');
    if (parts.length) meta.push(parts.join(' · '));
  }
  return meta.filter(Boolean).join(' · ');
}

export function matchesSearchAnno(a, q) {
  if (!q) return true;
  const keyword = q.toLowerCase();
  const bag = [a.name, a.note, a.admin?.province, a.admin?.county, a.admin?.town, a.admin?.village, a.admin?.region, buildAnnoMeta(a)]
    .filter(Boolean).join(' ').toLowerCase();
  return bag.includes(keyword);
}

export function exportAnnotations() {
  const features = state.annos.map(a => {
    let geom;
    if (a.type === 'point') geom = { type: 'Point', coordinates: [a.lng, a.lat] };
    else if (a.type === 'line') geom = { type: 'LineString', coordinates: a.coordinates || [] };
    else geom = { type: 'Polygon', coordinates: [a.coordinates || []] };
    const props = {
      name: a.name,
      note: a.note,
      color: a.color,
      type: a.type,
      created_at: a.created_at,
      admin: a.admin || EMPTY_ADMIN(),
    };
    if (a.sandtableKey) props.sandtableKey = a.sandtableKey;
    if (a.type === 'line') {
      if (a.roadClass) props.roadClass = a.roadClass;
      if (a.lanes) props.lanes = a.lanes;
      if (a.surface) props.surface = a.surface;
    }
    if (a.type === 'polygon') {
      if (a.buildingType) props.buildingType = a.buildingType;
      if (a.floors) props.floors = a.floors;
    }
    return { type: 'Feature', geometry: geom, properties: props };
  });
  return { type: 'FeatureCollection', features };
}

export function initExportButton() {
  document.getElementById('btn-export').onclick = async () => {
    try {
      const ok = await window.api.exportGeoJSON(state.annos);
      if (!ok) return;
    } catch (e) {
      console.warn('主进程导出失败，回退到浏览器下载', e);
      const gj = exportAnnotations();
      const b = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
      const u = URL.createObjectURL(b);
      const lnk = document.createElement('a');
      lnk.href = u;
      lnk.download = 'anduo-annotations.geojson';
      lnk.click();
      URL.revokeObjectURL(u);
    }
  };
}

export function initImportButton() {
  document.getElementById('btn-import').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.geojson,.json';
    inp.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const d = JSON.parse(text);
        if (d.type === 'FeatureCollection' && d.features) {
          const im = [];
          d.features.forEach(f => {
            const geom = f.geometry;
            if (!geom) return;
            const props = f.properties || {};
            const base = {
              id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
              name: props.name || '导入',
              note: props.note || '',
              color: props.color || '#3b82f6',
              created_at: props.created_at || new Date().toISOString(),
              admin: normalizeAdmin(props.admin || EMPTY_ADMIN()),
            };
            if (props.sandtableKey) base.sandtableKey = props.sandtableKey;
            if (geom.type === 'Point') {
              im.push(assignAdminByGeometry({ ...base, type: 'point', lat: geom.coordinates[1], lng: geom.coordinates[0] }));
            } else if (geom.type === 'LineString') {
              im.push(assignAdminByGeometry({
                ...base, type: 'line', coordinates: geom.coordinates,
                roadClass: props.roadClass || '', lanes: props.lanes || '', surface: props.surface || '',
              }));
            } else if (geom.type === 'Polygon') {
              const ring = geom.coordinates[0] || [];
              if (ring.length >= 3) {
                const first = ring[0], last = ring[ring.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
              }
              im.push(assignAdminByGeometry({
                ...base, type: 'polygon', coordinates: ring,
                buildingType: props.buildingType || '', floors: props.floors || '',
              }));
            }
          });
          if (im.length) {
            state.annos.push(...im);
            await saveAnnotations();
            alert(`导入 ${im.length} 个标注`);
          } else {
            alert('未找到有效标注');
          }
        }
      } catch (e) {
        alert('导入失败: ' + e.message);
      }
    };
    inp.click();
  };
}

export function initClearButton() {
  document.getElementById('btn-clear').onclick = async () => {
    if (confirm('清空所有标注？')) {
      state.annos = [];
      state.selectedAdminNode = null;
      state.highlightedBoundaryKey = '';
      state.currentAdminContext = null;
      state.extractionResults = [];
      state.extractPolygon = null;
      await saveAnnotations();
    }
  };
}
