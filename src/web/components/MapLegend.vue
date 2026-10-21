<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { mapLayers } from '../domain/referenceLayers';
import { roadClasses } from '../domain/roadClasses.mjs';
import type { Layers } from '../types';

defineProps<{ visibility: Record<string, boolean>; layers: Layers }>();
const expanded = ref(true);
const entries = [
  ...roadClasses.map((road) => ({ key: road.key, name: road.name, symbol: 'line' })),
  { key: 'localRoads', name: '地方连接道路（等级待核实）', symbol: 'line' },
  { key: 'railways', name: '铁路', symbol: 'rail' },
  { key: 'countySeats', name: '县城参考定位', symbol: 'point' },
  { key: 'towns', name: '乡镇驻地', symbol: 'point' },
  { key: 'villages', name: '行政村', symbol: 'point' },
  { key: 'rivers', name: '河流', symbol: 'line' },
  { key: 'lakes', name: '湖泊', symbol: 'area' },
  { key: 'boundaries', name: '县 / 乡镇界', symbol: 'line' },
  { key: 'neighborCounties', name: '周边县界', symbol: 'line' },
].map((entry) => ({
  ...entry,
  color:
    entry.key === 'boundaries'
      ? '#f46c82'
      : mapLayers.find((layer) => layer.key === entry.key)!.color,
}));
</script>

<template>
  <section class="map-legend" aria-label="地图图例" @pointerdown.stop @dblclick.stop>
    <button
      class="map-legend-heading"
      :aria-expanded="expanded"
      aria-controls="map-legend-items"
      @click="expanded = !expanded"
    >
      <span>图例</span>
      <component :is="expanded ? ChevronDown : ChevronUp" :size="15" />
    </button>
    <div v-show="expanded" id="map-legend-items">
      <ul class="map-legend-grid">
        <li
          v-for="entry in entries"
          :key="entry.key"
          :class="{ 'is-hidden': visibility[entry.key] === false }"
          :title="visibility[entry.key] === false ? `${entry.name}图层已关闭` : entry.name"
        >
          <span
            class="map-legend-symbol"
            :class="`symbol-${entry.symbol}`"
            :style="{ '--symbol-color': entry.color }"
            aria-hidden="true"
          ></span>
          <span>{{ entry.name }}</span>
          <small
            v-if="
              roadClasses.some((road) => road.key === entry.key) &&
              !layers[entry.key]?.features.length
            "
            >暂无数据</small
          >
          <span v-if="visibility[entry.key] === false" class="sr-only">（图层已关闭）</span>
        </li>
      </ul>
      <p>颜色与地图一致 · 灰显表示图层关闭 · 县道放大后显示</p>
    </div>
  </section>
</template>

<style scoped>
.map-legend {
  position: absolute;
  right: 16px;
  bottom: 0;
  width: 272px;
  max-width: calc(100% - 84px);
  max-height: 40%;
  flex: 0 0 auto;
  overflow: auto;
  border: 1px solid #d6dedc;
  border-radius: 6px;
  background: #fffffff2;
  box-shadow: 0 3px 16px #0002;
  color: #29383b;
}
.map-legend-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  font-weight: 600;
  letter-spacing: 3px;
}
.map-legend-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px 10px;
  margin: 0 12px;
  padding: 12px 0;
  border-top: 1px solid #e5eae8;
  list-style: none;
}
.map-legend-grid li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  white-space: nowrap;
}
.is-hidden {
  opacity: 0.4;
}
.map-legend-symbol {
  display: inline-block;
  flex: 0 0 34px;
}
.symbol-line {
  height: 3px;
  background: var(--symbol-color);
  box-shadow: 0 0 0 1px #00000012;
}
.symbol-rail {
  height: 5px;
  border: 1px solid #354052;
  background: repeating-linear-gradient(90deg, #354052 0 8px, #fff 8px 16px);
}
.symbol-point {
  height: 12px;
  position: relative;
}
.symbol-point::after {
  content: '';
  position: absolute;
  left: 11px;
  width: 10px;
  height: 10px;
  border: 2px solid #29383b;
  border-radius: 50%;
  background: var(--symbol-color);
}
.symbol-area {
  height: 12px;
  border: 1px solid var(--symbol-color);
  border-radius: 45% 30% 50% 25%;
  background: color-mix(in srgb, var(--symbol-color) 30%, transparent);
}
.map-legend p {
  margin: 0;
  padding: 0 12px 10px;
  font-size: 10px;
  color: #74817e;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
@media (max-width: 680px) {
  .map-legend {
    width: 246px;
    right: 10px;
    bottom: 0;
    max-height: 30%;
  }
  .map-legend-grid {
    gap: 10px 6px;
  }
  .map-legend-heading {
    padding: 6px 12px;
  }
}
</style>
