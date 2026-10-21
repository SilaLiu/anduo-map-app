<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { Position } from 'geojson';
import { buildDriveTrack } from '../domain/driveSimulation';

const props = defineProps<{ route: Position[] }>();
const emit = defineEmits<{ position: [value: Position | null] }>();
const playing = ref(false),
  progress = ref(0),
  speed = ref(1);
let track = buildDriveTrack([]);
let frame = 0,
  previous = 0;
function pause() {
  playing.value = false;
  cancelAnimationFrame(frame);
  previous = 0;
}
function tick(time: number) {
  if (!playing.value) return;
  // Cap background-tab gaps so returning to the page does not teleport the vehicle.
  const elapsed = previous ? Math.min(time - previous, 250) : 0;
  previous = time;
  progress.value = Math.min(1, progress.value + (elapsed * speed.value) / 60000);
  emit('position', track.at(progress.value));
  if (progress.value >= 1) pause();
  else frame = requestAnimationFrame(tick);
}
function play() {
  if (playing.value) return;
  if (progress.value >= 1) progress.value = 0;
  playing.value = true;
  emit('position', track.at(progress.value));
  frame = requestAnimationFrame(tick);
}
function replay() {
  pause();
  progress.value = 0;
  play();
}
watch(
  () => props.route,
  () => {
    pause();
    progress.value = 0;
    track = buildDriveTrack(props.route);
    emit('position', null);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  pause();
  emit('position', null);
});
</script>

<template>
  <section v-if="route.length >= 2" aria-label="模拟行车" class="drive-simulation">
    <div class="drive-actions">
      <button @click="playing ? pause() : play()">
        {{ playing ? '暂停模拟' : progress >= 1 ? '再次播放' : '模拟行车' }}
      </button>
      <button @click="replay">从起点重播</button>
      <select v-model.number="speed" aria-label="模拟倍速">
        <option :value="1">1×</option>
        <option :value="2">2×</option>
        <option :value="4">4×</option>
      </select>
    </div>
    <progress :value="progress" max="1" aria-label="行车进度"></progress>
    <span>{{ progress >= 1 ? '已到达终点' : `模拟进度 ${(progress * 100).toFixed(0)}%` }}</span>
    <small>演示模式：1× 约 60 秒走完全程，非实际车速或实时定位。</small>
  </section>
</template>

<style scoped>
.drive-simulation {
  display: grid;
  gap: 6px;
  max-width: 320px;
}
.drive-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.drive-actions select {
  width: 66px;
  padding: 3px;
}
progress {
  width: 100%;
  accent-color: #26d36b;
}
small {
  white-space: normal;
  color: #637a73;
}
</style>
