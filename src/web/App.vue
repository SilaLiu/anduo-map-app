<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, shallowRef } from 'vue';
import {
  Globe2,
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
import type { Feature, FeatureCollection } from 'geojson';
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
const tab = ref('tasks');
const search = ref('');
const sidebar = ref(true);
const map = ref<InstanceType<typeof MapScene>>();
const editor = ref<Annotation | null>(null);
const editorVersion = ref(0);
const selection = ref<{ feature: Feature; group: string } | null>(null);
const basemap = ref('satellite');
const mode = ref<'2D' | '3D'>('3D');
const terrainAvailable = !!(
  import.meta.env.VITE_TERRAIN_URL || import.meta.env.VITE_CESIUM_ION_TOKEN
);
const tiandituAvailable = !!import.meta.env.VITE_TIANDITU_KEY;
const terrain = ref(terrainAvailable),
  terrainStatus = ref('椭球地表');
const exaggeration = ref(1),
  labels = ref(true);
const drawMode = ref<DrawMode | null>(null),
  vertexCount = ref(0);
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
const coordinate = ref([91.682, 32.262, 0]);
const visibility = reactive<Record<string, boolean>>({
  annotations: true,
  boundaries: true,
  preview: true,
  towns: true,
  villages: true,
  roads: true,
  rivers: true,
  lakes: true,
  mountains: true,
  temples: true,
});
const online = ref(navigator.onLine);
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
  return { version: 2, annotations: annotations.value, boundaries: boundaries.value };
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
  if (!ready.value || loadFailed.value) return;
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
  selection.value = { feature, group };
  map.value?.focus(feature);
  if (speechEnabled.value) speakSelection();
  else stopFeatureSpeech();
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
          `恢复备份将替换当前 ${annotations.value.length} 个标注与 ${boundaries.value.length} 个边界，继续？`,
        )
      )
        return;
      annotations.value = annos;
      boundaries.value = bounds;
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
function locateSearch() {
  const match = search.value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (match) {
    try {
      const f = toAnnotation({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [+match[1], +match[2]] },
        properties: { name: search.value },
      });
      map.value?.focus(f);
    } catch (e) {
      report(e);
    }
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
  void init();
  if (speechSupported.value) window.speechSynthesis.getVoices();
  window.addEventListener('online', networkChanged);
  window.addEventListener('offline', networkChanged);
  window.addEventListener('keydown', keydown);
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  stopFeatureSpeech();
  window.removeEventListener('online', networkChanged);
  window.removeEventListener('offline', networkChanged);
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <div class="application">
    <header class="app-header">
      <div class="brand">
        <Globe2 :size="26" />
        <div>
          <h1>安多县三维沙盘</h1>
          <span>西藏自治区 · 那曲市</span>
        </div>
      </div>
      <form class="search-box" @submit.prevent="locateSearch">
        <Search :size="17" /><input
          v-model="search"
          aria-label="搜索名称或经纬度"
          placeholder="搜索名称或经度,纬度"
        /><button
          v-if="search"
          class="icon-button"
          type="button"
          title="清除搜索"
          aria-label="清除搜索"
          @click="search = ''"
        >
          <X :size="15" />
        </button>
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
              <button class="feature-main" @click="pickFeature(a, 'annotations')">
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
            <div v-for="b in filteredBoundaries" :key="boundaryKey(b)" class="feature-row">
              <button class="feature-main" @click="pickFeature(b, 'boundaries')">
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
              <option value="street">街道地图 · OpenStreetMap</option>
              <option v-if="tiandituAvailable" value="tianditu">天地图</option>
            </select>
            <h3>场景</h3>
            <label class="toggle-row"
              ><span>真实地形</span
              ><input v-model="terrain" type="checkbox" :disabled="!terrainAvailable"
            /></label>
            <p class="setting-value">
              {{ terrainAvailable ? terrainStatus : '未配置高程数据源 · 椭球地表' }}
            </p>
            <label class="range-label"
              >地形夸张 <output>{{ exaggeration.toFixed(1) }}×</output
              ><input
                v-model.number="exaggeration"
                type="range"
                min="1"
                max="5"
                step="0.1"
                :disabled="!terrain"
            /></label>
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
            <label v-for="c in categories" :key="c.key" class="toggle-row"
              ><span
                ><i class="legend-swatch" :style="{ background: c.color }"></i>{{ c.name
                }}<small>{{ layers[c.key]?.features.length || 0 }}</small></span
              ><input v-model="visibility[c.key]" type="checkbox"
            /></label>
            <h3>工作区</h3>
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
      <main class="map-area">
        <MapScene
          v-if="!loading && !loadFailed"
          ref="map"
          :annotations="annotations"
          :boundaries="boundaries"
          :layers="layers"
          :visibility="visibility"
          :basemap="basemap"
          :mode="mode"
          :draw-mode="drawMode"
          :terrain="terrain"
          :exaggeration="exaggeration"
          :labels="labels"
          :preview="preview"
          :highlight="selection?.feature"
          @ready="ready = true"
          @error="report"
          @select="pickFeature"
          @draw="drawn"
          @vertices="vertexCount = $event"
          @position="(lng, lat, height) => (coordinate = [lng, lat, height])"
          @terrain-status="terrainStatus = $event"
        />
        <div v-if="loading || loadFailed" class="loading-state">
          <Globe2 :size="38" /><strong>{{
            loading ? '正在载入安多县沙盘' : '工作区读取失败'
          }}</strong
          ><button v-if="loadFailed" @click="init"><RefreshCw :size="16" />重新加载</button>
        </div>
        <div class="map-top-left">
          <button
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
        </div>
        <div class="map-tools">
          <div class="tool-group">
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
              <Route :size="19" /></button
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
              <Compass :size="19" />
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
        <div v-if="selection && !drawMode" class="selection-panel">
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
            v-else
            @click="openEditor(assignAdmin(toAnnotation(selection.feature), boundaries))"
          >
            <Plus :size="15" />存为我的标注
          </button>
        </div>
        <div class="map-caption">
          <span class="live-dot"></span>{{ terrainStatus
          }}<span class="caption-divider"></span>WGS84
        </div>
      </main>
    </div>
    <footer class="statusbar">
      <span>{{ coordinate[0].toFixed(5) }}° E &nbsp; {{ coordinate[1].toFixed(5) }}° N</span
      ><span v-if="terrain && terrainStatus === '真实地形'"
        >地表高程 {{ coordinate[2].toFixed(0) }} m</span
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
