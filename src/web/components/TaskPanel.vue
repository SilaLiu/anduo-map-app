<script setup lang="ts">
import { computed, ref } from 'vue';
import { MapPin, Pencil, Download, ChevronRight } from 'lucide-vue-next';
import type { Task, TaskSection } from '../types';
import { statusLabels } from '../domain/tasks';

const props = defineProps<{ sections: TaskSection[]; search: string }>();
defineEmits<{ focus: [task: Task]; annotate: [task: Task]; export: [] }>();
const filter = ref('all');
const tasks = computed(() => props.sections.flatMap((s) => s.items));
const done = computed(
  () => tasks.value.filter((t) => ['annotated', 'located'].includes(t.status)).length,
);
const estimated = computed(() => tasks.value.filter((t) => t.status === 'estimated').length);
const sections = computed(() =>
  props.sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (t) =>
          (filter.value === 'all' ||
            (filter.value === 'pending' && ['estimated', 'missing'].includes(t.status)) ||
            t.status === filter.value) &&
          `${t.annotation?.properties.name || ''} ${t.label} ${t.town} ${t.note}`
            .toLowerCase()
            .includes(props.search.toLowerCase()),
      ),
    }))
    .filter((s) => s.items.length),
);
</script>

<template>
  <div class="panel-heading">
    <h2>任务清单</h2>
    <button
      class="icon-button"
      title="导出任务报告"
      aria-label="导出任务报告"
      @click="$emit('export')"
    >
      <Download :size="17" />
    </button>
  </div>
  <div class="task-progress">
    <div>
      <strong
        >{{ done }}<small> / {{ tasks.length }}</small></strong
      ><span>已完成定位</span>
    </div>
    <progress :value="done" :max="tasks.length || 1" aria-label="任务完成进度"></progress>
    <div class="progress-caption">
      <span>{{ estimated }} 项待核实</span
      ><span>{{ tasks.length - done - estimated }} 项待补充</span>
    </div>
  </div>
  <div class="panel-filter">
    <label for="task-filter">状态</label
    ><select id="task-filter" v-model="filter">
      <option value="all">全部任务</option>
      <option value="pending">待核实与待补充</option>
      <option value="annotated">已标注</option>
      <option value="located">已定位</option>
      <option value="estimated">待核实</option>
      <option value="missing">待补充</option>
    </select>
  </div>
  <div class="panel-scroll task-scroll" data-testid="task-scroll">
    <details
      v-for="section in sections"
      :key="section.key"
      class="task-section"
      :open="section.key === 'town' || !!search || filter !== 'all'"
    >
      <summary>
        <ChevronRight :size="15" /><span>{{ section.label }}</span
        ><small
          >{{ section.items.filter((t) => ['annotated', 'located'].includes(t.status)).length }}/{{
            section.items.length
          }}</small
        >
      </summary>
      <div v-for="task in section.items" :key="task.key" class="task-row">
        <button
          class="task-main"
          :disabled="!task.feature && !task.annotation"
          :title="task.reason || task.note || task.label"
          @click="$emit('focus', task)"
        >
          <span class="status-dot" :class="task.status"></span
          ><span
            ><b>{{ task.annotation?.properties.name || task.label }}</b
            ><small :class="task.status">{{ statusLabels[task.status] }}</small></span
          >
        </button>
        <button
          v-if="task.feature || task.annotation"
          class="icon-button"
          :title="`定位${task.label}`"
          :aria-label="`定位${task.label}`"
          @click="$emit('focus', task)"
        >
          <MapPin :size="15" />
        </button>
        <button
          class="icon-button"
          :title="task.annotation ? `编辑${task.label}` : `标注${task.label}`"
          :aria-label="task.annotation ? `编辑${task.label}` : `标注${task.label}`"
          @click="$emit('annotate', task)"
        >
          <Pencil :size="15" />
        </button>
      </div>
    </details>
    <p v-if="!sections.length" class="empty-state">没有匹配的任务</p>
  </div>
</template>
