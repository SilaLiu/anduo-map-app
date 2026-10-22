<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { loadAMap, type AMapAPI, type AMapInstance } from '../services/amap';
import { toGcj } from '../../../server/routing.mjs';

// No Cesium, business overlays, custom map styles or setFeatures calls in this experiment.
const container = ref<HTMLDivElement>();
const terrain = ref(true);
const satellite = ref(false);
const locationName = ref('anduo');
const state = ref('正在加载 SDK');
const sdkVersion = ref('未读取');
const actualPitch = ref('未读取');
const completions = ref(0);
let api: AMapAPI | undefined;
let map: AMapInstance | undefined;
let observer: ResizeObserver | undefined;
let disposed = false;
let generation = 0;
const locations: Record<string, [number, number]> = {
  anduo: [91.68, 32.26],
  everest: [86.925, 27.988],
};

function recreate() {
  if (!api || !container.value) return;
  const current = ++generation;
  map?.destroy();
  map = undefined;
  actualPitch.value = '未读取';
  completions.value = 0;
  state.value = '已创建地图，等待 complete 事件（不代表地形加载成功）';
  const options: Record<string, unknown> = {
    viewMode: '3D',
    terrain: terrain.value,
    center: toGcj(locations[locationName.value]),
    zoom: 12,
    pitch: 65,
    rotateEnable: true,
    pitchEnable: true,
  };
  // Baseline intentionally omits layers, exactly as in the official terrain example.
  if (satellite.value) options.layers = [new api.TileLayer.Satellite()];
  try {
    const instance = new api.Map(container.value, options);
    map = instance;
    const readPitch = () => {
      if (disposed || current !== generation) return;
      const diagnostic = instance as AMapInstance & { getPitch?: () => number };
      actualPitch.value = diagnostic.getPitch
        ? String(diagnostic.getPitch())
        : 'SDK 未提供 getPitch';
    };
    readPitch();
    instance.on('pitchchange', readPitch);
    instance.on('complete', () => {
      if (disposed || current !== generation) return;
      completions.value++;
      readPitch();
      state.value = '地图触发 complete；请观察山体轮廓，对比地形开/关，不能据此确认高程成功';
    });
  } catch {
    state.value = '地图初始化异常；请检查浏览器控制台（不要分享含 Key 的请求地址）';
  }
}

onMounted(async () => {
  try {
    const loaded = await loadAMap();
    if (disposed) return;
    api = loaded;
    const version = (api as AMapAPI & { version?: string }).version;
    sdkVersion.value = typeof version === 'string' ? version : 'SDK 未公开 version 字段';
    recreate();
    observer = new ResizeObserver(() => map?.resize());
    if (container.value) observer.observe(container.value);
  } catch (error) {
    if (!disposed) state.value = error instanceof Error ? error.message : 'SDK 加载失败';
  }
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  observer?.disconnect();
  map?.destroy();
});
</script>

<template>
  <main>
    <aside>
      <h1>高德地形最小实验</h1>
      <p>独立于主地图，无业务覆盖物。先验证默认底图的地形，再加入卫星影像。</p>
      <label
        >观察位置
        <select v-model="locationName" @change="recreate">
          <option value="anduo">安多县城附近</option>
          <option value="everest">珠峰山地（起伏对照）</option>
        </select>
      </label>
      <label><input v-model="terrain" type="checkbox" @change="recreate" />开启 terrain</label>
      <label><input v-model="satellite" type="checkbox" @change="recreate" />使用卫星图层</label>
      <button @click="recreate">重建地图</button>
      <dl>
        <dt>请求版本</dt>
        <dd>2.1Beta</dd>
        <dt>SDK 返回版本</dt>
        <dd data-testid="sdk-version">{{ sdkVersion }}</dd>
        <dt>请求模式</dt>
        <dd>3D</dd>
        <dt>请求地形</dt>
        <dd>{{ terrain }}</dd>
        <dt>实际 pitch</dt>
        <dd data-testid="actual-pitch">{{ actualPitch }}</dd>
        <dt>complete 次数</dt>
        <dd>{{ completions }}</dd>
      </dl>
      <p role="status">{{ state }}</p>
      <p>
        判断方法：在珠峰位置依次对比地形开/关、卫星开/关；保持相同初始中心、缩放和倾角。右键拖动可旋转、倾斜。
      </p>
      <p><strong>地图 complete、卫星瓦片成功、pitch 大于零，都不等于真实地形已渲染。</strong></p>
      <a href="/">返回主地图</a>
    </aside>
    <div ref="container" class="lab-map" aria-label="地形实验地图"></div>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  font-family: system-ui, sans-serif;
  color: #233537;
}
main {
  display: flex;
  height: 100vh;
}
aside {
  width: 320px;
  box-sizing: border-box;
  padding: 20px;
  overflow: auto;
  background: #f3f7f6;
}
h1 {
  font-size: 21px;
}
p {
  font-size: 14px;
  line-height: 1.6;
}
label {
  display: block;
  margin: 18px 0;
}
select {
  display: block;
  padding: 8px;
  margin-top: 8px;
}
button {
  padding: 8px 20px;
  cursor: pointer;
}
dt {
  font-size: 13px;
  color: #627777;
  margin-top: 10px;
}
dd {
  margin: 2px 0;
  overflow-wrap: anywhere;
}
.lab-map {
  flex: 1;
  min-width: 0;
  background: #dde5e5;
}
</style>
