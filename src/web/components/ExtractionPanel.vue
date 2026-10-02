<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { ScanSearch, Play, Square, Download } from 'lucide-vue-next';
import { area as turfArea } from '@turf/turf';
import type { Feature } from 'geojson';
import { extract, targets, type Engine, type Target } from '../services/extraction';

const props = defineProps<{ area: Feature | null }>();
const emit = defineEmits<{
  draw: [];
  preview: [features: Feature[]];
  import: [features: Feature[]];
  error: [message: string];
}>();
const engine = ref<Engine>('overpass');
const selectedTargets = ref<Target[]>(['buildings', 'roads']);
const results = shallowRef<Feature[]>([]);
const selected = ref<number[]>([]);
const running = ref(false),
  progress = ref(0),
  status = ref('');
let controller: AbortController | undefined;
const areaSize = computed(() => (props.area ? turfArea(props.area) / 1000000 : 0));
const selectedFeatures = computed(() => results.value.filter((_, i) => selected.value.includes(i)));
watch(selectedFeatures, (features) => emit('preview', features));
watch(
  () => props.area,
  () => {
    controller?.abort();
    results.value = [];
    selected.value = [];
    status.value = '';
  },
);
async function run() {
  if (!props.area || running.value) return;
  controller = new AbortController();
  running.value = true;
  results.value = [];
  selected.value = [];
  progress.value = 0;
  try {
    const features = await extract(
      props.area,
      engine.value,
      selectedTargets.value,
      controller.signal,
      (pct, message) => {
        progress.value = pct;
        status.value = message;
      },
    );
    controller.signal.throwIfAborted();
    results.value = features;
    selected.value = features.map((_, i) => i);
    progress.value = 100;
    status.value = `找到 ${features.length} 个地物`;
  } catch (e) {
    if (controller.signal.aborted) status.value = '已取消';
    else {
      status.value = (e as Error).message;
      emit('error', status.value);
    }
  } finally {
    running.value = false;
  }
}
function importSelected() {
  emit('import', selectedFeatures.value);
  results.value = [];
  selected.value = [];
  status.value = '已导入选中结果';
}
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div class="panel-heading">
    <h2>地物提取</h2>
    <ScanSearch :size="18" />
  </div>
  <div class="panel-scroll extraction-panel">
    <button class="full-button" :disabled="running" @click="$emit('draw')">
      <ScanSearch :size="17" />{{ area ? '重新圈选范围' : '圈选提取范围' }}
    </button>
    <p class="setting-value">{{ area ? `${areaSize.toFixed(3)} 平方公里` : '尚未选择范围' }}</p>
    <label
      >提取来源<select v-model="engine" :disabled="running">
        <option value="overpass">OpenStreetMap 数据查询</option>
        <option value="color">卫星影像颜色分割</option>
        <option value="onnx">ONNX 语义分割（实验）</option>
      </select></label
    >
    <p v-if="engine === 'onnx'" class="inline-notice">
      通用分割模型，结果需人工核实。首次运行需要下载模型。
    </p>
    <fieldset class="target-options">
      <legend>地物类型</legend>
      <label v-for="(label, key) in targets" :key="key"
        ><input v-model="selectedTargets" :value="key" type="checkbox" :disabled="running" />{{
          label
        }}</label
      >
    </fieldset>
    <div class="panel-actions no-padding">
      <button
        v-if="!running"
        class="primary"
        :disabled="!area || !selectedTargets.length"
        @click="run"
      >
        <Play :size="15" />开始提取</button
      ><button v-else @click="controller?.abort()"><Square :size="15" />取消提取</button>
    </div>
    <progress v-if="running" :value="progress" max="100" aria-label="提取进度"></progress>
    <p v-if="status" class="setting-value" role="status">{{ status }}</p>
    <template v-if="results.length"
      ><div class="subheading">
        <label
          ><input
            type="checkbox"
            :checked="selected.length === results.length"
            @change="selected = selected.length === results.length ? [] : results.map((_, i) => i)"
          />全选</label
        ><button :disabled="!selected.length" @click="importSelected">
          <Download :size="15" />导入 {{ selected.length }}
        </button>
      </div>
      <label v-for="(feature, index) in results" :key="index" class="result-row"
        ><input v-model="selected" :value="index" type="checkbox" /><span
          ><b>{{ feature.properties?.name }}</b
          ><small>{{ feature.properties?.source }}</small></span
        ></label
      ></template
    >
  </div>
</template>
