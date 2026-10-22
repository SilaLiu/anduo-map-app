<script setup lang="ts">
import DeploymentDemo from './components/DeploymentDemo.vue';
import CoordinatePanel from './components/CoordinatePanel.vue';
import { coordinateAnnotations, type CoordinateShape } from './domain/coordinateAnnotations';
import { defaultDeployments, type DeploymentByTown } from './domain/deployment';
import { templeRoster } from './domain/templeRoster';
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue';
import {
  Globe2,
  Maximize,
  Minimize,
  Search,
  ListChecks,
  Layers as LayersIcon,
  MapPin,
  Route,
  Pentagon,
  ScanSearch,
  Upload,
  Download,
  Plus,
  Minus,
  LocateFixed,
  Compass,
  X,
  Undo2,
  Check,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  FolderOpen,
  Crosshair,
  Save,
  RefreshCw,
  Volume2,
  VolumeX,
  Square,
} from 'lucide-vue-next';
import type { Feature, FeatureCollection, Position } from 'geojson';
import type {
  Annotation,
  DrawMode,
  DrawResult,
  Layers,
  LibraryItem,
  Requirements,
  Task,
  Workspace,
} from './types';
import MapScene from './components/MapScene.vue';
import AMapScene from './components/AMapScene.vue';
import DriveSimulation from './components/DriveSimulation.vue';
import MapLegend from './components/MapLegend.vue';
import TaskPanel from './components/TaskPanel.vue';
import AnnotationEditor from './components/AnnotationEditor.vue';
import ExtractionPanel from './components/ExtractionPanel.vue';
import {
  assignAdmin,
  boundaryKey,
  cleanBundledBoundaries,
  collection,
  fromDrawing,
  mergeBoundaries,
  parseFeatures,
  toAnnotation,
} from './domain/geo';
import { buildTasks, categories, statusLabels, type MissingItem } from './domain/tasks';
import { anduoBoundaries, isAnduoFeature } from './domain/anduoScope';
import { featureDetails, featureSpeechText } from './domain/featureDetails';
import { mapLayers, referenceLayers } from './domain/referenceLayers';
import { thematicBasemaps, thematicVisibility, thematicLayerKeys } from './domain/thematicBasemaps';
import { loadAnduoBoundaryData } from './services/anduoData';
import { isSpeechSynthesisSupported, speakText, stopSpeaking } from './services/speech';
import {
  dataJson,
  downloadJson,
  loadWorkspace,
  repairStoredBoundaries,
  saveWorkspace,
} from './services/storage';

const annotations = shallowRef<Annotation[]>([]);
const boundaries = shallowRef<Feature[]>([]);
const layers = shallowRef<Layers>({});
const requirements = shallowRef<Requirements | null>(null);
const missing = shallowRef<MissingItem[]>([]);
const loading = ref(true),
  loadFailed = ref(false),
  ready = ref(false);
const saveStatus = ref('未载入');
const notice = ref('');
const coordinatePanel = ref(false);
const coordinateBusy = ref(false);
const coordinateError = ref('');
async function addCoordinateAnnotations(text: string, name: string, shape: CoordinateShape) {
  coordinateBusy.value = true;
  coordinateError.value = '';
  try {
    if (loadFailed.value || loading.value) throw new Error('工作区尚未成功读取，请稍后重试');
    const incoming = coordinateAnnotations(text, name, shape);
    const defaults = await loadAnduoBoundaryData();
    if (incoming.some((feature) => !isAnduoFeature(feature, defaults)))
      throw new Error('输入中包含安多县范围外的点位或区域，请检查经纬度');
    annotations.value = [...annotations.value, ...incoming.map((a) => assignAdmin(a, boundaries.value))];
    activeTheme.value = '';
    visibility.annotations = true;
    await nextTick();
    map.value?.focus(incoming[incoming.length - 1]);
    if (await persist()) {
      notice.value = `已保存 ${incoming.filter((a) => a.geometry.type === 'Point').length} 个旗帜点位${shape === 'points' ? '' : shape === 'line' ? '及连线' : '及区域'}`;
      coordinatePanel.value = false;
    } else coordinateError.value = '标注已显示但保存失败，请重试保存或导出完整备份';
  } catch (e) {
    coordinateError.value = (e as Error).message;
  } finally { coordinateBusy.value = false; }
}
const tab = ref('boundaries');
const search = ref('');
const sidebar = ref(true);
const mapOnly = ref(true);
const mapContainer = ref<HTMLElement>();
const desktopControls = (window as Window & {
  anduoDesktop?: {
    getFullscreen: () => Promise<boolean>;
    toggleFullscreen: () => Promise<boolean>;
    onFullscreenChange: (callback: (value: boolean) => void) => () => void;
  };
}).anduoDesktop;
let stopFullscreenListener: (() => void) | undefined;
const mapFullscreen = ref(false);
function syncFullscreen() {
  if (desktopControls) return;
  mapFullscreen.value = document.fullscreenElement === mapContainer.value;
}
async function toggleMapFullscreen() {
  try {
    if (desktopControls) {
      await desktopControls.toggleFullscreen();
      return;
    }
    if (mapFullscreen.value) await document.exitFullscreen();
    else if (mapContainer.value?.requestFullscreen) await mapContainer.value.requestFullscreen();
    else window.alert('当前浏览器不支持沙盘全屏，请使用新版 Chrome。');
  } catch {
    window.alert('无法进入或退出全屏，请检查浏览器权限后重试。');
  }
}
const map = ref<InstanceType<typeof MapScene> | InstanceType<typeof AMapScene>>();
const editor = ref<Annotation | null>(null);
const editorVersion = ref(0);
const selection = ref<{ feature: Feature; group: string } | null>(null);
const popupPosition = ref<{ x: number; y: number } | null>(null);
const basemap = ref('satellite');
const amapActive = computed(() => basemap.value === 'amap3d');
watch(amapActive, () => {
  ready.value = false;
  cancelDraw();
  selection.value = null;
  popupPosition.value = null;
  coordinate.value = null;
});
const activeTheme = ref('home');
const deployments = ref<DeploymentByTown>(defaultDeployments());
const visibleDeployments = computed<DeploymentByTown>(() =>
  activeTheme.value === 'theme-militia' ? deployments.value : {},
);
const deploymentTowns = computed(() => {
  const names = (layers.value.towns?.features || [])
    .map((feature) => String(feature.properties?.name || '').trim())
    .filter(Boolean);
  return [...new Set([...names, ...Object.keys(deployments.value)])];
});
function selectTheme(key: string) {
  activeTheme.value = key;
  basemap.value = !key || key === 'home' ? 'satellite' : key === 'theme-militia' ? 'topographic' : 'street';
  if (key === 'home') {
    mode.value = '3D';
    void nextTick(() => map.value?.fitHomepage());
  }
  if (!key) {
    const county = boundaries.value.find((feature) =>
      feature.properties?.level === 'county' &&
      (String(feature.properties?.adcode) === '540624' || feature.properties?.name === '安多县'),
    );
    if (county) map.value?.focus(county);
    else map.value?.fitCountyTraffic();
  }
  if (key === 'theme-temples') map.value?.fitTemples();
  if (key === 'theme-roads') map.value?.fitCountyTraffic();
  if (key === 'theme-militia') map.value?.fitCentralTowns();
}
const mode = ref<'2D' | '3D'>('3D');
const terrainAvailable = !!(
  import.meta.env.VITE_TERRAIN_URL || import.meta.env.VITE_CESIUM_ION_TOKEN
);
const terrain = ref(terrainAvailable),
  terrainStatus = ref('椭球地表');
const exaggeration = ref(1),
  buildings3d = ref(true),
  labels = ref(true);
const drawMode = ref<DrawMode | null>(null),
  vertexCount = ref(0);
const routeMode = ref(false);
const vehiclePosition = shallowRef<Position | null>(null);
const routePoints = shallowRef<Position[]>([]);
const routeGeometry = shallowRef<Position[]>([]);
const routeDistance = ref<number | null>(null);
const routeStatus = ref('');
const routeDuration = ref<number | null>(null);
let routeRequest: AbortController | undefined;
let routeVersion = 0;
const pendingTask = ref<Task | null>(null);
const extractionArea = shallowRef<Feature | null>(null);
const preview = shallowRef<Feature[]>([]);
const fileInput = ref<HTMLInputElement>();
const importKind = ref<'annotations' | 'boundaries' | 'workspace'>('annotations');
const library = shallowRef<LibraryItem[]>([]),
  libraryOpen = ref(false),
  librarySearch = ref('');
const libraryBusy = ref(false),
  libraryLoaded = ref(false);
const coordinate = ref<[number, number] | null>(null);
const visibility = reactive<Record<string, boolean>>({
  annotations: true,
  boundaries: true,
  preview: true,
  towns: true,
  villages: true,
  roads: false,
  militiaDeployment: false,
  highways: true,
  provincialRoads: true,
  countyRoads: true,
  townshipRoads: true,
  localRoads: true,
  railways: true,
  neighborCounties: true,
  rivers: true,
  lakes: true,
  mountains: true,
  temples: true,
});
const online = ref(navigator.onLine);
const selectedTheme = computed(() =>
  thematicBasemaps.find((item) => item.key === activeTheme.value),
);
const themeFeatureCount = computed(() =>
  thematicLayerKeys(activeTheme.value).reduce(
    (total, key) => total + (layers.value[key]?.features.length || 0),
    0,
  ),
);
const sceneVisibility = computed(() => thematicVisibility(activeTheme.value, visibility));
const templeEntries = computed(() =>
  templeRoster.map((entry) => ({
    ...entry,
    feature: layers.value.temples?.features.find(
      (feature) => feature.properties?.name === entry.name,
    ),
  })),
);
const businessLayers = mapLayers.filter(
  (layer) => !thematicBasemaps.some((theme) => theme.layer === layer.key),
);
const sections = computed(() =>
  buildTasks(requirements.value, layers.value, annotations.value, missing.value),
);
const filteredAnnotations = computed(() =>
  annotations.value.filter((a) =>
    JSON.stringify(a.properties).toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const filteredBoundaries = computed(() =>
  boundaries.value.filter((b) => String(b.properties?.name).includes(search.value)),
);
const selectedDetails = computed(() =>
  selection.value ? featureDetails(selection.value.feature) : [],
);
const speechSupported = ref(isSpeechSynthesisSupported());
const speechEnabled = ref(true);
const speechActive = ref(false);
const filteredLibrary = computed(() =>
  library.value
    .filter((i) => `${i.name} ${i.path}`.toLowerCase().includes(librarySearch.value.toLowerCase()))
    .slice(0, 100),
);
const tabs = [
  { key: 'tasks', label: '任务', icon: ListChecks },
  { key: 'annotations', label: '标注', icon: MapPin },
  { key: 'boundaries', label: '行政区', icon: Globe2 },
  { key: 'extraction', label: '提取', icon: ScanSearch },
  { key: 'layers', label: '图层', icon: LayersIcon },
];
let revision = 0;
function report(error: unknown) {
  notice.value = error instanceof Error ? error.message : String(error);
}
let speechToken = 0;
function stopFeatureSpeech() {
  speechToken++;
  stopSpeaking();
  speechActive.value = false;
}
function speakSelection() {
  if (!selection.value || !speechEnabled.value || !speechSupported.value) return;
  stopFeatureSpeech();
  const token = speechToken;
  const started = speakText(featureSpeechText(selection.value.feature), {
    onStart: () => {
      if (token === speechToken) speechActive.value = true;
    },
    onEnd: () => {
      if (token === speechToken) speechActive.value = false;
    },
    onError: () => {
      if (token === speechToken) speechActive.value = false;
    },
  });
  if (!started) speechActive.value = false;
}
function toggleSpeech() {
  speechEnabled.value = !speechEnabled.value;
  if (speechEnabled.value) speakSelection();
  else stopFeatureSpeech();
}
function snapshot(): Workspace {
  return {
    version: 2,
    annotations: annotations.value,
    boundaries: boundaries.value,
    deployments: deployments.value,
  };
}
async function persist(): Promise<boolean> {
  if (loadFailed.value) {
    saveStatus.value = '未保存';
    report('原工作区未成功读取，请先重新加载或恢复工作区备份');
    return false;
  }
  const current = ++revision;
  saveStatus.value = '保存中';
  try {
    await saveWorkspace(snapshot());
    if (current === revision) saveStatus.value = '已保存到浏览器';
    return true;
  } catch (e) {
    if (current === revision) saveStatus.value = '未保存';
    report(`保存失败，请导出备份：${(e as Error).message}`);
    return false;
  }
}
async function loadReferenceData() {
  const results = await Promise.allSettled([
    dataJson<Requirements>('sandtable-requirements.json'),
    dataJson<{ items: MissingItem[] }>('sandtable-geojson/missing.json'),
    ...categories.map((c) => dataJson<FeatureCollection>(`sandtable-geojson/${c.key}.geojson`)),
  ]);
  const req = results[0];
  if (req.status === 'fulfilled') requirements.value = req.value as Requirements;
  else report(req.reason);
  const miss = results[1];
  if (miss.status === 'fulfilled')
    missing.value = (miss.value as { items: MissingItem[] }).items || [];
  const next: Layers = {};
  results.slice(2).forEach((r, index) => {
    if (r.status === 'fulfilled') next[categories[index].key] = r.value as FeatureCollection;
    else report(r.reason);
  });
  layers.value = next;
  const references = await Promise.allSettled(
    referenceLayers.map((c) => dataJson<FeatureCollection>(`reference/${c.key}.geojson`)),
  );
  references.forEach((result, index) => {
    if (result.status === 'fulfilled') next[referenceLayers[index].key] = result.value;
    else report(result.reason);
  });
  layers.value = { ...next };
}
async function init() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const saved = await loadWorkspace();
    const defaults = await loadAnduoBoundaryData();
    let scopeChanged = false;
    if (saved) {
      const scoped = anduoBoundaries(saved.boundaries);
      scopeChanged = scoped.length !== saved.boundaries.length;
      boundaries.value = scopeChanged ? mergeBoundaries(defaults, scoped) : scoped;
      annotations.value = saved.annotations.filter((f) => isAnduoFeature(f, defaults));
      scopeChanged ||= annotations.value.length !== saved.annotations.length;
      if (scopeChanged) notice.value = '工作区已限定为安多县及下属乡镇';
    } else {
      boundaries.value = mergeBoundaries([], defaults);
    }
    await loadReferenceData();
    if (saved?.deployments) deployments.value = saved.deployments;
    saveStatus.value = '已保存到浏览器';
    if (!saved || saved.boundariesRepaired || scopeChanged) await persist();
  } catch (e) {
    loadFailed.value = true;
    saveStatus.value = '读取失败';
    report(e);
  } finally {
    loading.value = false;
  }
}
function openEditor(a: Annotation) {
  editor.value = JSON.parse(JSON.stringify(a));
  editorVersion.value++;
  stopFeatureSpeech();
  selection.value = null;
}
function startDraw(value: DrawMode, task?: Task) {
  if (amapActive.value) {
    report('高德模式暂不支持绘制和提取，请切回卫星影像或街道底图');
    return;
  }
  if (!ready.value || loadFailed.value) return;
  if (routeMode.value) clearRoute();
  pendingTask.value = task || null;
  drawMode.value = value;
  stopFeatureSpeech();
  selection.value = null;
  if (value === 'extract') {
    tab.value = 'extraction';
    extractionArea.value = null;
    preview.value = [];
  }
}
function cancelDraw() {
  drawMode.value = null;
  pendingTask.value = null;
}
function drawn(result: DrawResult) {
  try {
    const annotation = assignAdmin(fromDrawing(result), boundaries.value);
    drawMode.value = null;
    if (result.mode === 'extract') {
      extractionArea.value = annotation;
      tab.value = 'extraction';
      return;
    }
    if (pendingTask.value) {
      const task = pendingTask.value;
      annotation.properties.name = task.name.startsWith('#') ? '' : task.name;
      annotation.properties.sandtableKey = task.key;
      annotation.properties.note = task.note;
      if (task.town) annotation.properties.admin.town = task.town;
    } else annotation.properties.name = '';
    openEditor(annotation);
    pendingTask.value = null;
  } catch (e) {
    report(e);
  }
}
async function saveAnnotation(annotation: Annotation) {
  const defaults = await loadAnduoBoundaryData();
  if (!isAnduoFeature(annotation, defaults)) {
    report('此标注不属于安多县，请调整位置或行政归属');
    return;
  }
  const exists = annotations.value.some((a) => a.id === annotation.id);
  annotations.value = exists
    ? annotations.value.map((a) => (a.id === annotation.id ? annotation : a))
    : [...annotations.value, annotation];
  editor.value = null;
  await persist();
}
async function deleteAnnotation(id: string) {
  if (!confirm('删除此标注？')) return;
  annotations.value = annotations.value.filter((a) => a.id !== id);
  editor.value = null;
  stopFeatureSpeech();
  selection.value = null;
  await persist();
}
function autoAssignEditor(a: Annotation) {
  openEditor(assignAdmin(a, boundaries.value));
}
async function annotateTask(task: Task) {
  if (task.annotation) {
    openEditor(task.annotation);
    return;
  }
  startDraw(task.drawType, task);
  await nextTick();
  if (task.feature) map.value?.focus(task.feature);
}
function focusTask(task: Task) {
  const f = task.annotation || task.feature;
  if (f) {
    map.value?.focus(f);
    selection.value = { feature: f, group: task.annotation ? 'annotations' : task.category };
    if (speechEnabled.value) speakSelection();
  }
}
function pickFeature(feature: Feature, group: string) {
  if (selection.value?.feature === feature && selection.value.group === group) return;
  selection.value = { feature, group };
  if (speechEnabled.value) speakSelection();
  else stopFeatureSpeech();
}
function startRoute() {
  clearRoute();
  drawMode.value = null;
  routeMode.value = true;
  routePoints.value = [];
  routeGeometry.value = [];
  routeDistance.value = null;
  routeStatus.value = '请在地图上点击起点';
  selection.value = null;
}
function clearRoute() {
  routeVersion++;
  routeRequest?.abort();
  routeDuration.value = null;
  routeMode.value = false;
  routePoints.value = [];
  routeGeometry.value = [];
  routeDistance.value = null;
  routeStatus.value = '';
}
async function chooseRoutePoint(position: Position) {
  if (!routeMode.value) return;
  routeRequest?.abort();
  const version = ++routeVersion;
  routePoints.value =
    routePoints.value.length === 1 ? [routePoints.value[0], position] : [position];
  routeGeometry.value = [];
  routeDistance.value = null;
  routeDuration.value = null;
  if (routePoints.value.length === 1) {
    routeStatus.value = '起点已设置，请点击终点';
    return;
  }
  const [start, end] = routePoints.value;
  routeRequest = new AbortController();
  const controller = routeRequest;
  const timer = setTimeout(() => controller.abort(), 20000);
  routeStatus.value = '正在请求高德驾车路线…';
  try {
    const query = new URLSearchParams({
      origin: start.slice(0, 2).join(','),
      destination: end.slice(0, 2).join(','),
    });
    const response = await fetch(`/api/route?${query}`, { signal: controller.signal });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('路线代理未启动或未部署，请启动 pnpm routing 并配置 /api/route 代理');
    }
    if (!response.ok) throw new Error(data.error || '路线代理不可用，请检查后台服务');
    if (
      !Array.isArray(data.coordinates) ||
      data.coordinates.length < 2 ||
      !data.coordinates.every(
        (p: unknown) => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite),
      ) ||
      !Number.isFinite(data.distance) ||
      data.distance < 0 ||
      !Number.isFinite(data.duration)
    )
      throw new Error('路线服务返回数据无效');
    if (version !== routeVersion) return;
    routeGeometry.value = data.coordinates;
    routeDistance.value = data.distance / 1000;
    routeDuration.value = Math.ceil(data.duration / 60);
    routeStatus.value = '高德驾车路线 · 仅供参考，请以实际通行情况为准';
  } catch (error) {
    if (version !== routeVersion) return;
    routeStatus.value = controller.signal.aborted
      ? '路线请求超时，请重新选择起终点'
      : `未获得道路路线：${(error as Error).message === 'Failed to fetch' ? '无法连接路线代理，请检查网络和后台服务' : (error as Error).message}`;
  } finally {
    clearTimeout(timer);
  }
}
function chooseImport(kind: typeof importKind.value) {
  importKind.value = kind;
  fileInput.value?.click();
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  try {
    const file = input.files?.[0];
    if (!file) return;
    const raw = JSON.parse(await file.text());
    if (importKind.value === 'workspace') {
      if (raw.version !== 2 || !Array.isArray(raw.annotations) || !Array.isArray(raw.boundaries))
        throw new Error('请选择本应用导出的工作区备份');
      const defaults = await loadAnduoBoundaryData();
      const annos = parseFeatures(raw.annotations)
        .filter((f) => isAnduoFeature(f, defaults))
        .map((f) => toAnnotation(f, true));
      const bounds = mergeBoundaries(
        [],
        anduoBoundaries(parseFeatures((await repairStoredBoundaries(raw.boundaries)).features)),
      );
      if (
        !confirm(
          `恢复备份将替换当前 ${annotations.value.length} 个标注、${boundaries.value.length} 个边界及全部兵力部署数据，继续？`,
        )
      )
        return;
      annotations.value = annos;
      boundaries.value = bounds;
      deployments.value = raw.deployments ?? defaultDeployments();
      await loadReferenceData();
      loadFailed.value = false;
    } else {
      const parsed = parseFeatures(raw);
      const defaults = await loadAnduoBoundaryData();
      const features =
        importKind.value === 'boundaries'
          ? anduoBoundaries(parsed)
          : parsed.filter((f) => isAnduoFeature(f, defaults));
      if (importKind.value === 'boundaries')
        boundaries.value = mergeBoundaries(boundaries.value, features);
      else
        annotations.value = [
          ...annotations.value,
          ...features.map((f) => {
            const a = toAnnotation(f);
            return Object.values(a.properties.admin).some(Boolean)
              ? a
              : assignAdmin(a, boundaries.value);
          }),
        ];
      notice.value = `已导入 ${features.length} 个要素${parsed.length > features.length ? `，已排除 ${parsed.length - features.length} 个安多县范围外要素` : ''}`;
    }
    await persist();
  } catch (e) {
    report(e);
  } finally {
    input.value = '';
  }
}
async function clearAnnotations() {
  if (!annotations.value.length || !confirm(`清空全部 ${annotations.value.length} 个标注？`))
    return;
  annotations.value = [];
  stopFeatureSpeech();
  selection.value = null;
  await persist();
}
async function clearBoundaries() {
  if (!boundaries.value.length || !confirm('清空全部行政边界？')) return;
  boundaries.value = [];
  stopFeatureSpeech();
  selection.value = null;
  await persist();
}
async function autoAssignAll() {
  annotations.value = annotations.value.map((a) => assignAdmin(a, boundaries.value));
  if (await persist()) notice.value = `已更新 ${annotations.value.length} 个标注的行政归属`;
}
async function openLibrary() {
  libraryOpen.value = true;
  if (libraryLoaded.value) return;
  libraryBusy.value = true;
  try {
    library.value = await dataJson<LibraryItem[]>('web-boundary-library.json');
    libraryLoaded.value = true;
  } catch (e) {
    report(e);
  } finally {
    libraryBusy.value = false;
  }
}
async function importLibrary(item: LibraryItem) {
  libraryBusy.value = true;
  try {
    const cleaned = cleanBundledBoundaries(await dataJson<FeatureCollection>(item.path));
    const features = anduoBoundaries(cleaned.features);
    boundaries.value = mergeBoundaries(boundaries.value, features);
    if (await persist()) notice.value = `已加载 ${item.name}：${features.length} 个边界`;
  } catch (e) {
    report(e);
  } finally {
    libraryBusy.value = false;
  }
}
async function loadAnduoBoundaries() {
  await importLibrary({
    path: 'admin-geojson/xizang/anduo/anduo_all_levels.json',
    name: '安多县全部边界',
  });
}
async function locateSearch() {
  const match = search.value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (match) {
    if (coordinateBusy.value) return;
    await addCoordinateAnnotations(search.value, '坐标标注', 'points');
    if (coordinateError.value) report(coordinateError.value);
    return;
  }
  const f =
    filteredAnnotations.value[0] ||
    sections.value.flatMap((s) => s.items).find((t) => t.label.includes(search.value))?.feature ||
    filteredBoundaries.value[0];
  if (f) map.value?.focus(f);
  else notice.value = '没有找到匹配的位置';
}
function exportTasks() {
  downloadJson(
    {
      generated_at: new Date().toISOString(),
      sections: sections.value.map((s) => ({
        name: s.label,
        items: s.items.map((t) => ({
          key: t.key,
          name: t.annotation?.properties.name || t.label,
          town: t.town,
          status: statusLabels[t.status],
          reason: t.reason,
          note: t.note,
        })),
      })),
    },
    '安多县任务报告.json',
  );
}
async function importExtracted(features: Feature[]) {
  const defaults = await loadAnduoBoundaryData();
  const scoped = features.filter((f) => isAnduoFeature(f, defaults));
  annotations.value = [
    ...annotations.value,
    ...scoped.map((f) => assignAdmin(toAnnotation(f), boundaries.value)),
  ];
  preview.value = [];
  if (await persist())
    notice.value = `已导入 ${scoped.length} 个提取结果${scoped.length < features.length ? `，已排除 ${features.length - scoped.length} 个安多县范围外要素` : ''}`;
}
function networkChanged() {
  online.value = navigator.onLine;
}
function keydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, select, dialog')) return;
  if (event.key === 'Escape') cancelDraw();
  if (event.key === 'Enter' && drawMode.value) {
    event.preventDefault();
    map.value?.finish();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && drawMode.value) {
    event.preventDefault();
    map.value?.undo();
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (saveStatus.value === '未保存' || saveStatus.value === '保存中') event.preventDefault();
}
onMounted(() => {
  if (desktopControls) {
    stopFullscreenListener = desktopControls.onFullscreenChange((value) => { mapFullscreen.value = value; });
    void desktopControls.getFullscreen().then((value) => { mapFullscreen.value = value; });
  }
  document.addEventListener('fullscreenchange', syncFullscreen);
  void init();
  if (speechSupported.value) window.speechSynthesis.getVoices();
  window.addEventListener('online', networkChanged);
  window.addEventListener('offline', networkChanged);
  window.addEventListener('keydown', keydown);
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  stopFullscreenListener?.();
  document.removeEventListener('fullscreenchange', syncFullscreen);
  routeVersion++;
  routeRequest?.abort();
  stopFeatureSpeech();
  window.removeEventListener('online', networkChanged);
  window.removeEventListener('offline', networkChanged);
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <div class="application" :class="{ 'map-only': mapOnly }">
    <header class="app-header">
      <div class="brand">
        <Globe2 :size="26" />
        <div>
          <h1>安多县电子三维沙盘</h1>
          <span>西藏自治区 · 那曲市</span>
        </div>
      </div>
      <form class="search-box" @submit.prevent="locateSearch">
        <Search :size="17" /><input
          v-model="search"
          aria-label="搜索名称或经纬度"
          placeholder="搜索名称或经度,纬度"
        /><button
          class="search-clear"
          type="button"
          :disabled="!search"
          title="清除搜索"
          aria-label="清除搜索"
          @click="search = ''"
        >
          <X :size="15" />清空
        </button>
        <button class="search-submit" type="submit" :disabled="!search.trim()">搜索</button>
      </form>
      <div class="header-actions">
        <span class="connection" :class="{ offline: !online }"
          ><i></i>{{ online ? '在线' : '离线' }}</span
        ><button
          class="icon-button"
          title="导出工作区备份"
          aria-label="导出工作区备份"
          @click="downloadJson(snapshot(), '安多县工作区.json')"
        >
          <Save :size="19" /></button
        ><button
          class="icon-button"
          title="图层与场景设置"
          aria-label="图层与场景设置"
          @click="
            tab = 'layers';
            sidebar = true;
          "
        >
          <Settings2 :size="19" />
        </button>
      </div>
    </header>
    <div v-if="notice" class="notice" role="status">
      <span>{{ notice }}</span
      ><button class="icon-button" title="关闭提示" aria-label="关闭提示" @click="notice = ''">
        <X :size="16" />
      </button>
    </div>
    <div class="workspace" :class="{ 'sidebar-hidden': !sidebar }">
      <aside v-show="sidebar" class="sidebar">
        <nav class="panel-tabs" aria-label="工作面板">
          <button
            v-for="item in tabs"
            :key="item.key"
            :class="{ active: tab === item.key }"
            :aria-pressed="tab === item.key"
            @click="tab = item.key"
          >
            <component :is="item.icon" :size="18" /><span>{{ item.label }}</span>
          </button>
        </nav>
        <section v-if="tab === 'tasks'" class="panel">
          <TaskPanel
            :sections="sections"
            :search="search"
            @focus="focusTask"
            @annotate="annotateTask"
            @export="exportTasks"
          />
        </section>
        <section v-if="tab === 'annotations'" class="panel">
          <div class="panel-heading">
            <h2>
              我的标注 <small>{{ annotations.length }}</small>
            </h2>
            <button
              class="icon-button"
              title="新建点标注"
              aria-label="新建点标注"
              @click="startDraw('point')"
            >
              <Plus :size="18" />
            </button>
          </div>
          <div class="panel-actions">
            <button @click="chooseImport('annotations')"><Upload :size="15" />导入</button
            ><button @click="downloadJson(collection(annotations), '安多县标注.geojson')">
              <Download :size="15" />导出</button
            ><button
              class="icon-button danger"
              title="清空标注"
              aria-label="清空标注"
              @click="clearAnnotations"
            >
              <Trash2 :size="16" />
            </button>
          </div>
          <div class="panel-scroll">
            <div v-for="a in filteredAnnotations" :key="a.id" class="feature-row">
              <button
                class="feature-main"
                @click="pickFeature(a, 'annotations')"
                @dblclick="map?.focus(a)"
              >
                <span class="feature-dot" :style="{ background: a.properties.color }"></span
                ><span
                  ><b>{{ a.properties.name }}</b
                  ><small>{{
                    [a.properties.admin.county, a.properties.admin.town, a.properties.admin.village]
                      .filter(Boolean)
                      .join(' / ') || a.geometry.type
                  }}</small></span
                ></button
              ><button
                class="icon-button"
                :title="`编辑${a.properties.name}`"
                :aria-label="`编辑${a.properties.name}`"
                @click="openEditor(a)"
              >
                <Pencil :size="16" />
              </button>
            </div>
            <p v-if="!filteredAnnotations.length" class="empty-state">暂无匹配的标注</p>
          </div>
        </section>
        <section v-if="tab === 'boundaries'" class="panel">
          <div class="panel-heading">
            <h2>
              行政边界 <small>{{ boundaries.length }}</small>
            </h2>
            <button
              class="icon-button danger"
              title="清空边界"
              aria-label="清空边界"
              @click="clearBoundaries"
            >
              <Trash2 :size="16" />
            </button>
          </div>
          <div class="panel-actions wrap">
            <button @click="chooseImport('boundaries')"><Upload :size="15" />导入边界</button
            ><button @click="openLibrary"><FolderOpen :size="15" />边界库</button
            ><button :disabled="libraryBusy" @click="loadAnduoBoundaries">安多县全部边界</button
            ><button @click="autoAssignAll"><Crosshair :size="15" />自动归属</button
            ><button @click="downloadJson(collection(boundaries), '安多县行政边界.geojson')">
              <Download :size="15" />导出
            </button>
          </div>
          <div class="panel-scroll">
            <div
              v-for="b in filteredBoundaries"
              :key="boundaryKey(b)"
              class="feature-row"
              :class="{ 'boundary-town-row': /[乡镇]$/.test(String(b.properties?.name || '')) }"
            >
              <button
                class="feature-main"
                @click="
                  pickFeature(b, 'boundaries');
                  map?.focus(b);
                "
                @dblclick="map?.focus(b)"
              >
                <Globe2 :size="17" /><span
                  ><b>{{ b.properties?.name }}</b
                  ><small
                    >{{ b.properties?.source || '来源未标注'
                    }}<template
                      v-if="
                        /voronoi|derived/i.test(
                          String(b.properties?.source || b.properties?.method),
                        )
                      "
                    >
                      · 推算边界</template
                    ></small
                  ></span
                >
              </button>
            </div>
            <p v-if="!filteredBoundaries.length" class="empty-state">暂无匹配的行政边界</p>
          </div>
        </section>
        <section v-show="tab === 'extraction'" class="panel">
          <ExtractionPanel
            :area="extractionArea"
            @draw="startDraw('extract')"
            @preview="preview = $event"
            @import="importExtracted"
            @error="report"
          />
        </section>
        <section v-if="tab === 'layers'" class="panel">
          <div class="panel-heading">
            <h2>图层与场景</h2>
            <LayersIcon :size="18" />
          </div>
          <div class="panel-scroll settings">
            <h3>底图</h3>
            <select v-model="basemap" aria-label="底图">
              <option value="satellite">卫星影像 · Esri</option>
              <option value="street">街道地图 · 优先本地 OSM</option>
              <option value="street-online">在线街道 · OpenStreetMap</option>
              <!-- 高德卫星地形尚未验证真实高程渲染，暂不开放，保留实验页供后续迭代。 -->
              <option
                value="topographic"
              >
                地形地貌 · OpenTopoMap
              </option>
            </select>
            <p v-if="basemap === 'street'" class="setting-value">
              混合发布包优先使用本地 OSM 简化街道：安多周边（88.5°–93.8°E、31.2°–36.5°N），
              0–12 级，无中文地图文字。超出范围或继续放大不会增加细节。
              未安装本地资源时使用在线 OSM。
            </p>
            <p v-if="['street-online', 'topographic'].includes(basemap)" class="setting-value">
              在线地图需联网，受服务可用性和使用政策限制；加载失败可切回本地街道。
              地形地貌为二维地形制图，不代表已提供三维高程。
            </p>
            <p v-if="amapActive" class="setting-value">
              卫星影像＋三维地形：使用高德 2.1Beta
              地形能力，默认启用。按住鼠标右键上下拖动可查看山体起伏；县城附近较平坦，可缩小后移向周边山地。暂不支持绘制、提取、兵力部署展示和标注建筑挤出。实际地形效果受高德服务、数据覆盖和浏览器
              WebGL 支持影响。
            </p>
            <p v-if="selectedTheme" class="setting-value">
              当前底图叠加安多县专题；点击地图上方“全览”恢复业务图层设置。
              {{
                themeFeatureCount ? `已加载 ${themeFeatureCount} 条，覆盖可能不完整。` : '暂无数据'
              }}
            </p>
            <h3>场景</h3>
            <label class="toggle-row"
              ><span>真实地形</span
              ><input
                v-if="amapActive"
                type="checkbox"
                checked
                disabled
                aria-label="高德地形默认启用" />
              <input v-else v-model="terrain" type="checkbox" :disabled="!terrainAvailable"
            /></label>
            <p class="setting-value">
              {{
                amapActive
                  ? '已请求高德三维地形 · 2.1Beta（实际加载以地图为准）'
                  : terrainAvailable
                    ? terrainStatus
                    : '未配置高程数据源 · 椭球地表'
              }}
            </p>
            <label class="range-label"
              >地形夸张 <output>{{ exaggeration.toFixed(1) }}×</output
              ><input
                v-model.number="exaggeration"
                type="range"
                min="1"
                max="5"
                step="0.1"
                :disabled="amapActive || !terrain"
            /></label>
            <p v-if="amapActive" class="setting-value">高德模式不提供本项目的地形夸张调节。</p>
            <label class="toggle-row"
              ><span>建筑物立体显示</span><input v-model="buildings3d" type="checkbox"
            /></label>
            <p class="setting-value">
              {{
                amapActive
                  ? '控制高德原生建筑显示，放大后是否有立体建筑取决于当地数据覆盖。'
                  : '已有建筑面且填写楼层数时，按每层约 3 米示意挤出。'
              }}
            </p>
            <label class="toggle-row"
              ><span>地名标签</span><input v-model="labels" type="checkbox"
            /></label>
            <h3>业务图层</h3>
            <label class="toggle-row"
              ><span><i class="legend-swatch" style="background: #f46c82"></i>行政边界</span
              ><input v-model="visibility.boundaries" type="checkbox" /></label
            ><label class="toggle-row"
              ><span><i class="legend-swatch" style="background: #e34b62"></i>我的标注</span
              ><input v-model="visibility.annotations" type="checkbox"
            /></label>
            <label v-for="c in businessLayers" :key="c.key" class="toggle-row"
              ><span
                ><i class="legend-swatch" :style="{ background: c.color }"></i>{{ c.name
                }}<small>{{ layers[c.key]?.features.length || '暂无数据' }}</small></span
              ><input v-model="visibility[c.key]" type="checkbox"
            /></label>
            <h3>工作区</h3>
            <p class="muted">
              完整备份包含标注、行政边界及兵力部署，可在其他机器上恢复。恢复会替换当前工作区数据，建议先导出当前备份。寺庙和道路复用现有县域数据，部分寺庙位置为估算，待核实。
            </p>
            <p class="muted">
              交通参考数据来自历史 OSM
              缓存，周边50公里覆盖尚不完整；缺失处不补线。国道黄色、省道绿色、县道蓝色、乡道紫色，铁路黑白相间。道路按G/S/X/Y现行编号分类，暂无数据不代表当地没有该类道路。
            </p>
            <div class="stack-actions">
              <button @click="downloadJson(snapshot(), '安多县工作区.json')">
                <Download :size="16" />导出完整备份</button
              ><button @click="chooseImport('workspace')">
                <Upload :size="16" />恢复工作区备份</button
              ><button v-if="saveStatus === '未保存'" @click="persist">
                <RefreshCw :size="16" />重试保存
              </button>
            </div>
            <div class="author">
              作者：Teddy<a href="mailto:qingyiliu0@gmail.com">qingyiliu0@gmail.com</a>
            </div>
          </div>
        </section>
      </aside>
      <main ref="mapContainer" class="map-area">
        <CoordinatePanel v-if="coordinatePanel" :busy="coordinateBusy" :error="coordinateError" @close="coordinatePanel = false" @create="addCoordinateAnnotations" />
        <component
          :is="amapActive ? AMapScene : MapScene"
          v-if="!loading && !loadFailed"
          ref="map"
          :annotations="annotations"
          :boundaries="boundaries"
          :layers="layers"
          :visibility="sceneVisibility"
          :basemap="basemap"
          :mode="mode"
          :draw-mode="drawMode"
          :terrain="terrain"
          :exaggeration="exaggeration"
          :buildings3d="buildings3d"
          :route-mode="routeMode"
          :route="routeGeometry"
          :vehicle-position="vehiclePosition"
          :labels="labels"
          :temple-theme="activeTheme === 'theme-temples'"
          :preview="preview"
          :highlight="selection?.feature"
          :deployments="visibleDeployments"
          @popup-position="popupPosition = $event"
          @ready="ready = true; activeTheme === 'home' && map?.fitHomepage()"
          @error="report"
          @select="pickFeature"
          @route-point="chooseRoutePoint"
          @draw="drawn"
          @vertices="vertexCount = $event"
          @position="(lng, lat) => (coordinate = [lng, lat])"
          @position-clear="coordinate = null"
          @terrain-status="terrainStatus = $event"
          @basemap-fallback="basemap = 'street'"
        />
        <div v-if="loading || loadFailed" class="loading-state">
          <Globe2 :size="38" /><strong>{{
            loading ? '正在载入安多县沙盘' : '工作区读取失败'
          }}</strong
          ><button v-if="loadFailed" @click="init"><RefreshCw :size="16" />重新加载</button>
        </div>
        <div class="map-top-left">
          <button type="button" class="map-button" :disabled="!ready || loadFailed" @click="coordinateError = ''; coordinatePanel = !coordinatePanel">经纬度标注</button>
          <button v-if="!mapFullscreen" class="map-button" @click="mapOnly = !mapOnly">
            {{ mapOnly ? '恢复完整界面' : '只显示沙盘' }}
          </button>
          <button
            class="icon-button map-button fullscreen-toggle"
            :title="mapFullscreen ? '退出沙盘全屏' : '沙盘全屏'"
            :aria-label="mapFullscreen ? '退出沙盘全屏' : '沙盘全屏'"
            :aria-pressed="mapFullscreen"
            @click="toggleMapFullscreen"
          >
            <Minimize v-if="mapFullscreen" :size="18" />
            <Maximize v-else :size="18" />
          </button>
          <button
            v-if="!mapFullscreen && !mapOnly"
            class="icon-button map-button"
            :title="sidebar ? '收起面板' : '展开面板'"
            :aria-label="sidebar ? '收起面板' : '展开面板'"
            @click="sidebar = !sidebar"
          >
            <PanelLeftClose v-if="sidebar" :size="18" /><PanelLeftOpen v-else :size="18" />
          </button>
          <div class="segmented" aria-label="地图维度">
            <button
              :class="{ active: mode === '3D' }"
              :aria-pressed="mode === '3D'"
              @click="mode = '3D'"
            >
              3D</button
            ><button
              :class="{ active: mode === '2D' }"
              :aria-pressed="mode === '2D'"
              @click="mode = '2D'"
            >
              2D
            </button>
          </div>
          <div
            class="segmented thematic-tabs"
            role="group"
            aria-label="安多县专题切换"
            @pointerdown.stop
            @dblclick.stop
          >
            <button
              :class="{ active: activeTheme === 'home' }"
              :aria-pressed="activeTheme === 'home'"
              @click="selectTheme('home')"
            >
              主页
            </button>
            <button
              :class="{ active: !activeTheme }"
              :aria-pressed="!activeTheme"
              @click="selectTheme('')"
            >
              全览
            </button>
            <button
              v-for="theme in thematicBasemaps"
              :key="theme.key"
              :class="{ active: activeTheme === theme.key }"
              :aria-pressed="activeTheme === theme.key"
              :title="theme.name"
              @click="selectTheme(theme.key)"
            >
              {{ theme.name.replace('图（安多县）', '') }}
            </button>
          </div>
        </div>
        <section
          v-if="activeTheme === 'theme-temples'"
          class="temple-roster"
          aria-label="安多县八寺分布"
        >
          <strong>安多县寺庙 · 8 座</strong>
          <p>
            资料由用户提供，未经独立核验；距离不是导航计算值。无坐标且所属村未匹配的寺庙仍待定位。
          </p>
          <div class="temple-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>寺庙名称</th>
                  <th>位置</th>
                  <th>距县城距离</th>
                  <th>教派</th>
                  <th>核定人员</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(entry, index) in templeEntries"
                  :key="entry.name"
                  @click="entry.feature && pickFeature(entry.feature, 'temples')"
                  @dblclick="entry.feature && map?.focus(entry.feature)"
                >
                  <td>{{ index + 1 }}</td>
                  <td>
                    <button
                      :disabled="!entry.feature"
                      @click.stop="entry.feature && pickFeature(entry.feature, 'temples')"
                      @dblclick.stop="entry.feature && map?.focus(entry.feature)"
                    >
                      {{ entry.name }}
                    </button>
                  </td>
                  <td v-for="(value, column) in entry.details" :key="column">{{ value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <div class="map-tools">
          <div class="tool-group">
            <button
              class="icon-button"
              :class="{ active: routeMode }"
              title="路线规划：点击起点和终点"
              aria-label="路线规划：点击起点和终点"
              :disabled="!ready"
              @click="routeMode ? clearRoute() : startRoute()"
            >
              <Route :size="19" />
            </button>
            <button
              class="icon-button"
              :class="{ active: drawMode === 'point' }"
              title="绘制点标注"
              aria-label="绘制点标注"
              :disabled="!ready"
              @click="startDraw('point')"
            >
              <MapPin :size="19" /></button
            ><button
              class="icon-button"
              :class="{ active: drawMode === 'line' }"
              title="绘制道路"
              aria-label="绘制道路"
              :disabled="!ready"
              @click="startDraw('line')"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="4" cy="19" r="2" />
                <polyline points="4.67 17.12 9 5 15 19 19.33 6.88" />
                <circle cx="20" cy="5" r="2" />
              </svg></button
            ><button
              class="icon-button"
              :class="{ active: drawMode === 'polygon' }"
              title="绘制建筑或区域"
              aria-label="绘制建筑或区域"
              :disabled="!ready"
              @click="startDraw('polygon')"
            >
              <Pentagon :size="19" /></button
            ><button
              class="icon-button"
              :class="{ active: drawMode === 'extract' }"
              title="圈选提取范围"
              aria-label="圈选提取范围"
              :disabled="!ready"
              @click="startDraw('extract')"
            >
              <ScanSearch :size="19" />
            </button>
          </div>
          <div class="tool-group">
            <button class="icon-button" title="放大" aria-label="放大" @click="map?.zoom(1)">
              <Plus :size="20" /></button
            ><button class="icon-button" title="缩小" aria-label="缩小" @click="map?.zoom(-1)">
              <Minus :size="20" /></button
            ><button
              class="icon-button"
              title="回到安多县"
              aria-label="回到安多县"
              @click="map?.home()"
            >
              <LocateFixed :size="19" /></button
            ><button
              class="icon-button"
              title="正北俯视"
              aria-label="正北俯视"
              @click="map?.north()"
            >
              <Compass :size="19" /></button
            ><button
              class="icon-button"
              title="倾斜观察三维地形"
              aria-label="倾斜观察三维地形"
              @click="
                mode = '3D';
                map?.tilt();
              "
            >
              <Globe2 :size="19" />
            </button>
          </div>
        </div>
        <div v-if="drawMode" class="draw-bar">
          <span
            >{{
              pendingTask?.label ||
              { point: '点标注', line: '道路', polygon: '建筑 / 区域', extract: '提取范围' }[
                drawMode
              ]
            }}<small>{{ vertexCount }} 个顶点</small></span
          ><button
            class="icon-button"
            title="撤销顶点"
            aria-label="撤销顶点"
            :disabled="!vertexCount"
            @click="map?.undo()"
          >
            <Undo2 :size="18" /></button
          ><button
            class="icon-button primary"
            title="完成绘制"
            aria-label="完成绘制"
            :disabled="vertexCount < (drawMode === 'line' ? 2 : drawMode === 'point' ? 1 : 3)"
            @click="map?.finish()"
          >
            <Check :size="18" /></button
          ><button class="icon-button" title="取消绘制" aria-label="取消绘制" @click="cancelDraw">
            <X :size="18" />
          </button>
        </div>
        <div v-if="routeMode || routeDistance !== null" class="route-card">
          <strong>路线规划</strong>
          <span>{{ routeStatus }}</span>
          <b v-if="routeDistance !== null">道路里程：{{ routeDistance.toFixed(2) }} 公里</b>
          <span v-if="routeDuration !== null">预计 {{ routeDuration }} 分钟</span>
          <button @click="clearRoute">清除路线</button>
          <DriveSimulation :route="routeGeometry" @position="vehiclePosition = $event" />
        </div>
        <div
          v-show="!drawMode && popupPosition && selection"
          class="map-point-popup"
          :class="{ 'popup-below': (popupPosition?.y || 0) < 330 }"
          :style="{ '--anchor-x': `${popupPosition?.x || 0}px`, top: `${popupPosition?.y || 0}px` }"
          @pointerdown.stop
          @dblclick.stop
          role="dialog"
          aria-label="地点详情"
        >
          <div v-if="selection" class="selection-panel">
            <header>
              <h2>{{ selection.feature.properties?.name || '未命名要素' }}</h2>
              <button
                class="icon-button"
                title="关闭详情"
                aria-label="关闭详情"
                @click="
                  stopFeatureSpeech();
                  selection = null;
                "
              >
                <X :size="16" />
              </button>
            </header>
            <div class="speech-controls" aria-label="语音播报">
              <button
                class="icon-button"
                :class="{ active: speechEnabled }"
                :disabled="!speechSupported"
                :title="speechEnabled ? '关闭自动播报' : '开启自动播报'"
                :aria-label="speechEnabled ? '关闭自动播报' : '开启自动播报'"
                :aria-pressed="speechEnabled"
                @click="toggleSpeech"
              >
                <Volume2 v-if="speechEnabled" :size="16" /><VolumeX v-else :size="16" />
              </button>
              <button
                class="icon-button"
                :disabled="!speechSupported"
                title="重新播报"
                aria-label="重新播报"
                @click="speakSelection"
              >
                <Volume2 :size="16" />
              </button>
              <button
                class="icon-button"
                :disabled="!speechActive"
                title="停止播报"
                aria-label="停止播报"
                @click="stopFeatureSpeech"
              >
                <Square :size="14" />
              </button>
              <span v-if="speechSupported" class="speech-status">{{
                speechActive ? '正在播报' : speechEnabled ? '点击后自动播报' : '自动播报已关闭'
              }}</span>
              <span v-else class="speech-status">当前浏览器不支持语音</span>
            </div>
            <dl class="feature-details">
              <div v-for="row in selectedDetails" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
            <p v-if="selection.feature.properties?.needs_review" class="estimated">
              估算位置，待核实
            </p>
            <button
              v-if="selection.group === 'annotations'"
              @click="openEditor(selection.feature as Annotation)"
            >
              <Pencil :size="15" />编辑标注</button
            ><button
              v-else-if="selection.group !== 'neighborCounties'"
              @click="openEditor(assignAdmin(toAnnotation(selection.feature), boundaries))"
            >
              <Plus :size="15" />存为我的标注
            </button>
          </div>
        </div>
        <DeploymentDemo
          v-if="activeTheme === 'theme-militia' && !drawMode"
          v-model:deployments="deployments"
          :town-names="deploymentTowns"
          :save-status="saveStatus"
          @dirty="saveStatus = '未保存'"
          @save="void persist()"
          @locate="
            (town) => {
              const feature = layers.towns?.features.find((item) => item.properties?.name === town);
              if (feature) map?.focus(feature);
            }
          "
        />
        <MapLegend
          v-show="!drawMode && !['theme-temples', 'theme-militia'].includes(activeTheme)"
          :visibility="sceneVisibility"
          :layers="layers"
        />
        <div class="map-caption">
          <span class="cursor-coordinate" aria-label="鼠标经纬度">
            <template v-if="coordinate"
              >经度 {{ coordinate[0].toFixed(6) }}° · 纬度 {{ coordinate[1].toFixed(6) }}°</template
            >
            <template v-else>移动鼠标到地图查看经纬度</template>
          </span>
          <span class="live-dot"></span>{{ terrainStatus
          }}<span class="caption-divider"></span>WGS84
          <span v-if="selectedTheme">
            · {{ selectedTheme.name }}{{ themeFeatureCount ? '' : ' · 暂无数据' }}</span
          >
        </div>
      </main>
    </div>
    <footer class="statusbar">
      <span>{{
        coordinate
          ? `经度 ${coordinate[0].toFixed(6)}° · 纬度 ${coordinate[1].toFixed(6)}°`
          : '移动鼠标到地图查看经纬度'
      }}</span
      ><span class="save-status" :class="{ 'error-text': saveStatus === '未保存' }">{{
        saveStatus
      }}</span
      ><span class="status-count">{{ annotations.length }} 个标注</span>
    </footer>
    <input ref="fileInput" hidden type="file" accept=".json,.geojson" @change="importFile" />
    <AnnotationEditor
      v-if="editor"
      :key="editorVersion"
      :annotation="editor"
      :existing="annotations.some((a) => a.id === editor?.id)"
      @close="editor = null"
      @save="saveAnnotation"
      @delete="deleteAnnotation"
      @assign="autoAssignEditor"
    />
    <div v-if="libraryOpen" class="modal-backdrop" @click.self="libraryOpen = false">
      <section
        class="library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
      >
        <header class="dialog-header">
          <h2 id="library-title">
            行政边界库 <small>{{ library.length }}</small>
          </h2>
          <button
            class="icon-button"
            title="关闭边界库"
            aria-label="关闭边界库"
            @click="libraryOpen = false"
          >
            <X :size="19" />
          </button>
        </header>
        <input
          v-model="librarySearch"
          class="library-search"
          aria-label="搜索边界库"
          placeholder="名称或行政区代码"
        />
        <div class="panel-scroll">
          <p v-if="libraryBusy" class="empty-state">正在读取边界数据…</p>
          <div v-for="item in filteredLibrary" :key="item.path" class="library-row">
            <span
              ><b>{{ item.name }}</b
              ><small>{{ item.path }}</small></span
            ><button :disabled="libraryBusy" @click="importLibrary(item)">加载</button>
          </div>
          <p v-if="!libraryBusy && !filteredLibrary.length" class="empty-state">没有匹配的边界</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fullscreen-toggle {
  min-height: 48px;
  min-width: 48px;
  touch-action: manipulation;
}
</style>
