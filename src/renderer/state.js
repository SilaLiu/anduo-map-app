// ═══════════════════════════════════════════
//  Central state + persistence
// ═══════════════════════════════════════════

export const TYPE_ICONS = { point: '📍', line: '🛣️', polygon: '🏢' };
export const TYPE_LABELS = { point: '标注点', line: '道路', polygon: '建筑' };
export const ADMIN_LEVELS = ['province', 'county', 'town', 'village'];
export const ADMIN_LABELS = { province: '省', county: '县区', town: '乡镇', village: '村' };
export const ADMIN_PATH_KEYS = ['province', 'county', 'town', 'village'];

export const EMPTY_ADMIN = () => ({
  province: '', county: '', town: '', village: '', region: '', boundaryKey: '', boundaryLevel: '',
});

export function normalizeAdmin(admin) {
  return {
    province: String((admin && admin.province) || '').trim(),
    county: String((admin && admin.county) || '').trim(),
    town: String((admin && admin.town) || '').trim(),
    village: String((admin && admin.village) || '').trim(),
    region: String((admin && admin.region) || '').trim(),
    boundaryKey: String((admin && admin.boundaryKey) || '').trim(),
    boundaryLevel: String((admin && admin.boundaryLevel) || '').trim(),
  };
}

export const state = {
  annos: [],
  boundaries: [],
  curCol: '#ef4444',
  curLayer: 'satellite',
  editId: null,

  drawMode: null,
  drawVertices: [],
  drawCursor: [0, 0],
  drawSourceId: null,
  clickTimer: null,

  boundaryOptions: { province: [], county: [], town: [], village: [] },
  selectedAdminNode: null,
  highlightedBoundaryKey: '',
  currentAdminContext: null,
  treeOpenState: {},
  activeTreeFilterKey: '',
  localBoundaryLibrary: [],

  extractionResults: [],
  extractPolygon: null,
  extractEngine: 'overpass',
  isExtracting: false,
};

// Subscribers for cross-module reactivity
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(key) {
  listeners.forEach(fn => fn(key));
}

// ═══════════════════════════════════════════
//  Persistence
// ═══════════════════════════════════════════
async function loadAnnotations() {
  try {
    return await window.api.loadAnnotations() || [];
  } catch (e) {
    console.error('加载标注失败', e);
    return [];
  }
}

async function loadBoundariesFromStore() {
  try {
    return await window.api.loadBoundaries() || [];
  } catch (e) {
    console.error('加载边界失败', e);
    return [];
  }
}

export async function saveAnnotations() {
  try {
    await window.api.saveAnnotations(state.annos);
    notify('annos');
  } catch (e) {
    console.error('保存标注失败', e);
  }
}

export async function saveBoundaries() {
  try {
    await window.api.saveBoundaries(state.boundaries);
    notify('boundaries');
  } catch (e) {
    console.error('保存边界失败', e);
  }
}

async function migrateAnnotationsFromLocalStorage() {
  try {
    const raw = localStorage.getItem('anduo_annos');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem('anduo_annos');
      return null;
    }
    await window.api.saveAnnotations(parsed);
    localStorage.removeItem('anduo_annos');
    console.log('已迁移 localStorage 标注数据到 IPC 存储');
    return parsed;
  } catch (e) {
    console.error('迁移标注数据失败', e);
    return null;
  }
}

async function migrateBoundariesFromLocalStorage() {
  try {
    const raw = localStorage.getItem('anduo_boundaries');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem('anduo_boundaries');
      return null;
    }
    await window.api.saveBoundaries(parsed);
    localStorage.removeItem('anduo_boundaries');
    console.log('已迁移 localStorage 边界数据到 IPC 存储');
    return parsed;
  } catch (e) {
    console.error('迁移边界数据失败', e);
    return null;
  }
}

export function migrateData(data) {
  let changed = false;
  data.forEach(a => {
    if (!a.type) { a.type = 'point'; changed = true; }
    if (a.type === 'point' && a.lat === undefined && a.coordinates && a.coordinates.length) {
      a.lat = a.coordinates[1];
      a.lng = a.coordinates[0];
      changed = true;
    }
    const normalizedAdmin = normalizeAdmin(a.admin || EMPTY_ADMIN());
    if (JSON.stringify(a.admin || {}) !== JSON.stringify(normalizedAdmin)) {
      a.admin = normalizedAdmin;
      changed = true;
    }
  });
  if (changed) {
    window.api.saveAnnotations(data).catch(e => console.error('迁移后保存失败', e));
  }
  return data;
}

export async function loadInitialData() {
  let rawAnnos = await loadAnnotations();
  if (!Array.isArray(rawAnnos) || rawAnnos.length === 0) {
    const migrated = await migrateAnnotationsFromLocalStorage();
    if (migrated) rawAnnos = migrated;
  }
  state.annos = migrateData(rawAnnos || []);

  let rawBoundaries = await loadBoundariesFromStore();
  if (!Array.isArray(rawBoundaries) || rawBoundaries.length === 0) {
    const migrated = await migrateBoundariesFromLocalStorage();
    if (migrated) rawBoundaries = migrated;
  }
  state.boundaries = (rawBoundaries || []).filter(Boolean);

  notify('annos');
  notify('boundaries');
}
