<script setup lang="ts">
import { ref } from 'vue';
import UnitSymbol from './UnitSymbol.vue';

const canvas = ref<HTMLElement>();
const labels = ref([
  { name: '演示连 A', level: '连', x: 18, y: 25, anchorX: 30, anchorY: 72 },
  { name: '演示排 B', level: '排', x: 50, y: 25, anchorX: 55, anchorY: 65 },
  { name: '演示班 C', level: '班', x: 80, y: 25, anchorX: 85, anchorY: 76 },
]);
const dragging = ref<number | null>(null);
function start(event: PointerEvent, index: number) {
  dragging.value = index;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (dragging.value === null || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const label = labels.value[dragging.value];
  label.x = Math.max(15, Math.min(85, ((event.clientX - rect.left) / rect.width) * 100));
  label.y = Math.max(18, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100));
}
</script>

<template>
  <section class="illustration" @pointerdown.stop @dblclick.stop>
    <strong>虚构标记联动示意</strong>
    <p>拖动标签查看指示线效果 · 无真实坐标 · 不读取或保存部署资料</p>
    <div ref="canvas" class="illustration-canvas">
      <svg class="connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line
          v-for="label in labels"
          :key="label.name"
          :x1="label.x"
          :y1="label.y"
          :x2="label.anchorX"
          :y2="label.anchorY"
        />
      </svg>
      <template v-for="(label, index) in labels" :key="label.name">
        <span
          class="anchor"
          :style="{ left: `${label.anchorX}%`, top: `${label.anchorY}%` }"
          aria-hidden="true"
        />
        <button
          class="illustration-label"
          :style="{ left: `${label.x}%`, top: `${label.y}%` }"
          :aria-label="`拖动${label.name}标签`"
          @pointerdown="start($event, index)"
          @pointermove="move"
          @pointerup="dragging = null"
          @pointercancel="dragging = null"
          @lostpointercapture="dragging = null"
          @keydown.left.prevent="label.x = Math.max(15, label.x - 2)"
          @keydown.right.prevent="label.x = Math.min(85, label.x + 2)"
          @keydown.up.prevent="label.y = Math.max(18, label.y - 2)"
          @keydown.down.prevent="label.y = Math.min(82, label.y + 2)"
        >
          <UnitSymbol :level="label.level" /><span>{{ label.name }}</span>
        </button>
      </template>
      <small>示意画布 · 非地理位置</small>
    </div>
  </section>
</template>

<style scoped>
.illustration {
  padding: 6px 8px;
  color: #263638;
  font-size: 12px;
}
p {
  font-size: 10px;
  color: #687b76;
  margin: 4px 0;
}
.illustration-canvas {
  position: relative;
  height: 180px;
  background: #eef4f1;
  border: 1px dashed #96b3a9;
  border-radius: 4px;
  overflow: hidden;
}
.connectors {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
line {
  stroke: #127b64;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}
.anchor {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #127b64;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.illustration-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  transform: translate(-50%, -50%);
  touch-action: none;
  cursor: grab;
  background: #fffffff2;
  border: 0;
  padding: 3px 5px;
  font-size: 11px;
  color: #127b64;
  white-space: nowrap;
}
.illustration-label:active {
  cursor: grabbing;
}
.illustration-label svg {
  width: 20px;
  height: 26px;
}
small {
  position: absolute;
  bottom: 4px;
  right: 6px;
  color: #687b76;
  font-size: 10px;
  pointer-events: none;
}
</style>
