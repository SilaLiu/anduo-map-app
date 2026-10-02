// Archived desktop entry; the active app is src/web/main.ts.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const LOCAL_BOUNDARY_ROOT = path.join(__dirname, 'data', 'admin-geojson');
const DEFAULT_BOUNDARY_FILE = path.join(LOCAL_BOUNDARY_ROOT, 'merged', 'china_all_levels.json');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMinimumSize(800, 600);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: 保存标注
ipcMain.handle('save-annotations', (_, annotations) => {
  const filePath = path.join(app.getPath('userData'), 'annotations.json');
  fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2), 'utf-8');
  return true;
});

// IPC: 加载标注
ipcMain.handle('load-annotations', () => {
  const filePath = path.join(app.getPath('userData'), 'annotations.json');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
});

// IPC: 保存行政区边界
ipcMain.handle('save-boundaries', (_, boundaries) => {
  const filePath = path.join(app.getPath('userData'), 'boundaries.json');
  fs.writeFileSync(filePath, JSON.stringify(boundaries, null, 2), 'utf-8');
  return true;
});

// IPC: 加载行政区边界
ipcMain.handle('load-boundaries', () => {
  const filePath = path.join(app.getPath('userData'), 'boundaries.json');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
});

// IPC: 导出标注为 GeoJSON
ipcMain.handle('export-geojson', async (_, annotations) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'annotations.geojson',
    filters: [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }],
  });
  if (!filePath) return false;

  const geojson = {
    type: 'FeatureCollection',
    features: annotations.map(a => {
      const props = {
        name: a.name, note: a.note, color: a.color,
        type: a.type, created_at: a.created_at,
      };
      let geom;
      if (a.type === 'point') {
        geom = { type: 'Point', coordinates: [a.lng, a.lat] };
      } else if (a.type === 'line') {
        geom = { type: 'LineString', coordinates: a.coordinates || [] };
        if (a.roadClass) props.roadClass = a.roadClass;
        if (a.lanes) props.lanes = a.lanes;
        if (a.surface) props.surface = a.surface;
      } else {
        geom = { type: 'Polygon', coordinates: [a.coordinates || []] };
        if (a.buildingType) props.buildingType = a.buildingType;
        if (a.floors) props.floors = a.floors;
      }
      return { type: 'Feature', geometry: geom, properties: props };
    }),
  };
  fs.writeFileSync(filePath, JSON.stringify(geojson, null, 2), 'utf-8');
  return true;
});

function isPathInsideRoot(targetPath, rootPath) {
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  const normalizedRoot = path.normalize(path.resolve(rootPath));
  // Ensure root ends with separator to prevent partial directory name matching
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  return normalizedTarget === normalizedRoot ||
         normalizedTarget.toLowerCase().startsWith(rootWithSep.toLowerCase());
}

function scanBoundaryFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanBoundaryFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const base = entry.name.toLowerCase();
      if (base === 'index.json' || base === 'meta.json') continue;
      // 跳过全层级合并文件，避免与单文件重复计数
      if (base.endsWith('_all_levels.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
          const sourceInfo = inferBoundarySourcePrecision(data, fullPath);
          results.push({
            path: path.relative(__dirname, fullPath),
            name: guessBoundaryName(fullPath, data),
            features: data.features.length,
            level: guessBoundaryLevel(data),
            source: sourceInfo.source,
            precision: sourceInfo.precision,
            method: sourceInfo.method,
          });
        }
      } catch (e) {
        console.warn(`Skip invalid boundary file: ${fullPath}`, e.message);
      }
    }
  }
  return results;
}

function guessBoundaryLevel(data) {
  const features = data.features || [];
  const levels = features.map(f => f.properties && f.properties.level).filter(Boolean);
  const unique = [...new Set(levels)];
  if (unique.length === 1) return String(unique[0]);
  if (unique.length > 1) return 'combined';
  return 'unknown';
}

function inferBoundarySourcePrecision(data, filePath) {
  const fileSource = (data.properties && data.properties.source) || (data.metadata && data.metadata.source) || '';
  const lowerSource = String(fileSource).toLowerCase();
  const features = data.features || [];
  const featureSource = features.length
    ? String(features[0].properties && features[0].properties.source || '').toLowerCase()
    : '';

  // Voronoi 生成的乡镇边界（低精度/推算）
  if (lowerSource.includes('voronoi') || featureSource.includes('voronoi')) {
    return { source: 'Voronoi-AMap', precision: 'low', method: 'derived' };
  }

  // OpenStreetMap 社区维护边界（中等精度/众包）
  if (lowerSource.includes('openstreetmap') || lowerSource.includes('osm') ||
      featureSource.includes('openstreetmap') || featureSource.includes('osm')) {
    return { source: 'OpenStreetMap', precision: 'medium', method: 'crowdsourced' };
  }

  // DataV Atlas 实测边界（高精度）
  if (lowerSource.includes('datav')) {
    return { source: 'DataV Atlas', precision: 'high', method: 'surveyed' };
  }

  // 根据路径推断：安多县乡镇目录下的文件
  const lowerPath = String(filePath).toLowerCase();
  if (lowerPath.includes('xizang/anduo/towns')) {
    return { source: 'OpenStreetMap', precision: 'medium', method: 'crowdsourced' };
  }

  // 默认全国/省/市 GeoJSON 来自 geojson.cn（DataV 聚合），按高精度处理
  return { source: 'geojson.cn (DataV)', precision: 'high', method: 'surveyed' };
}

function guessBoundaryName(filePath, data) {
  const features = data.features || [];
  if (features.length === 1 && features[0].properties && features[0].properties.name) {
    return features[0].properties.name;
  }
  if (features.length > 1) {
    const levels = features.map(f => f.properties && f.properties.level).filter(Boolean);
    if (levels.length) return `${path.basename(filePath, '.json')}（${[...new Set(levels)].join('/')}）`;
  }
  return path.basename(filePath, '.json');
}

ipcMain.handle('list-local-boundary-library', () => {
  try {
    const rootIndexPath = path.join(LOCAL_BOUNDARY_ROOT, 'index.json');
    let downloaded = [];
    if (fs.existsSync(rootIndexPath)) {
      const rootIndex = JSON.parse(fs.readFileSync(rootIndexPath, 'utf-8'));
      downloaded = rootIndex.downloaded || [];
    }
    // Also recursively discover any GeoJSON files in subdirectories (e.g. xizang/anduo)
    const scanned = scanBoundaryFiles(LOCAL_BOUNDARY_ROOT);
    const scannedMap = new Map(scanned.map(s => [s.path, s]));
    const existingPaths = new Set(downloaded.map(d => d.path));

    // Enrich existing entries with source/precision info, and append newly discovered files
    for (const item of scanned) {
      if (!existingPaths.has(item.path)) {
        downloaded.push(item);
      } else {
        const existing = downloaded.find(d => d.path === item.path);
        if (existing) {
          existing.level = item.level;
          existing.source = item.source;
          existing.precision = item.precision;
          existing.method = item.method;
        }
      }
    }

    return {
      ok: true,
      root: LOCAL_BOUNDARY_ROOT,
      downloaded,
      failureCount: 0,
      source: 'local scan',
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      root: LOCAL_BOUNDARY_ROOT,
      downloaded: [],
    };
  }
});

ipcMain.handle('load-local-boundary-file', (_, relativePath) => {
  try {
    if (!relativePath || typeof relativePath !== 'string') {
      return { ok: false, error: '非法路径' };
    }
    const ext = path.extname(relativePath).toLowerCase();
    if (!['.json', '.geojson'].includes(ext)) {
      return { ok: false, error: '仅支持 .json / .geojson 文件' };
    }
    const resolved = path.normalize(path.resolve(__dirname, relativePath));
    if (!isPathInsideRoot(resolved, LOCAL_BOUNDARY_ROOT)) {
      return { ok: false, error: '非法路径' };
    }
    const data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    return { ok: true, data, relativePath };
  } catch (error) {
    return { ok: false, error: error.message, relativePath };
  }
});

// IPC: 一次性加载所有本地边界文件
ipcMain.handle('load-all-boundary-files', () => {
  try {
    const allFeatures = [];
    const loadedFiles = [];
    const items = scanBoundaryFiles(LOCAL_BOUNDARY_ROOT);

    for (const item of items) {
      const resolved = path.resolve(__dirname, item.path);
      if (!isPathInsideRoot(resolved, LOCAL_BOUNDARY_ROOT)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
          allFeatures.push(...data.features);
          loadedFiles.push(item.path);
        }
      } catch (e) {
        console.warn(`Failed to load boundary: ${item.path}`, e.message);
      }
    }

    // 统计数据来源与精度分布
    const sourceStats = {};
    const precisionStats = {};
    for (const item of items) {
      sourceStats[item.source] = (sourceStats[item.source] || 0) + item.features;
      precisionStats[item.precision] = (precisionStats[item.precision] || 0) + item.features;
    }

    return {
      ok: true,
      data: { type: 'FeatureCollection', features: allFeatures },
      loadedFiles,
      totalFeatures: allFeatures.length,
      sourceStats,
      precisionStats,
    };
  } catch (error) {
    return { ok: false, error: error.message, loadedFiles: [], totalFeatures: 0 };
  }
});

// IPC: 优先加载合并后的全国边界文件
ipcMain.handle('load-default-boundary', () => {
  try {
    if (!fs.existsSync(DEFAULT_BOUNDARY_FILE)) {
      return { ok: false, error: '默认边界文件不存在', path: DEFAULT_BOUNDARY_FILE };
    }
    const data = JSON.parse(fs.readFileSync(DEFAULT_BOUNDARY_FILE, 'utf-8'));
    return { ok: true, data, path: DEFAULT_BOUNDARY_FILE, totalFeatures: data.features?.length || 0 };
  } catch (error) {
    return { ok: false, error: error.message, path: DEFAULT_BOUNDARY_FILE };
  }
});
