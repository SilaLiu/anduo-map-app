<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { X, Trash2, Save } from 'lucide-vue-next';
import type { Annotation } from '../types';
import { normalizeGeometry } from '../domain/geo';

const props = defineProps<{ annotation: Annotation; existing: boolean }>();
const emit = defineEmits<{
  save: [annotation: Annotation];
  close: [];
  delete: [id: string];
  assign: [annotation: Annotation];
}>();
const dialog = ref<HTMLDialogElement>();
const draft = ref<Annotation>(JSON.parse(JSON.stringify(props.annotation)));
const error = ref('');
const colors = ['#e34b62', '#ecac35', '#139c80', '#2787cd', '#9564c8', '#e782b2'];
onMounted(() => dialog.value?.showModal());
function save() {
  try {
    if (!draft.value.properties.name.trim()) throw new Error('请填写名称');
    draft.value.geometry = normalizeGeometry(draft.value.geometry);
    emit('save', draft.value);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="editor-dialog"
    aria-labelledby="editor-title"
    @cancel.prevent="$emit('close')"
  >
    <form @submit.prevent="save">
      <header class="dialog-header">
        <h2 id="editor-title">{{ existing ? '编辑标注' : '新建标注' }}</h2>
        <button
          type="button"
          class="icon-button"
          title="关闭"
          aria-label="关闭"
          @click="$emit('close')"
        >
          <X :size="19" />
        </button>
      </header>
      <div class="dialog-content">
        <label
          >名称<input v-model="draft.properties.name" required maxlength="160" autofocus
        /></label>
        <label
          >备注<textarea v-model="draft.properties.note" rows="2" maxlength="4000"></textarea>
        </label>
        <fieldset class="swatches">
          <legend>标注颜色</legend>
          <button
            v-for="color in colors"
            :key="color"
            type="button"
            :style="{ background: color }"
            :class="{ selected: draft.properties.color === color }"
            :title="color"
            :aria-label="color"
            :aria-pressed="draft.properties.color === color"
            @click="draft.properties.color = color"
          ></button
          ><input
            v-model="draft.properties.color"
            type="color"
            aria-label="自定义颜色"
            title="自定义颜色"
          />
        </fieldset>
        <div v-if="draft.geometry.type === 'Point'" class="field-grid">
          <label
            >经度<input
              v-model.number="draft.geometry.coordinates[0]"
              type="number"
              step="any"
              min="-180"
              max="180"
              required /></label
          ><label
            >纬度<input
              v-model.number="draft.geometry.coordinates[1]"
              type="number"
              step="any"
              min="-90"
              max="90"
              required
          /></label>
        </div>
        <div
          v-if="['LineString', 'MultiLineString'].includes(draft.geometry.type)"
          class="field-grid"
        >
          <label
            >道路等级<select v-model="draft.properties.roadClass">
              <option value="">未指定</option>
              <option value="motorway">高速公路</option>
              <option value="primary">主干道</option>
              <option value="secondary">次干道</option>
              <option value="residential">居民区道路</option>
              <option value="path">小路</option>
            </select></label
          >
          <label
            >车道数<input v-model.number="draft.properties.lanes" type="number" min="1" max="30"
          /></label>
          <label
            >路面类型<select v-model="draft.properties.surface">
              <option value="">未指定</option>
              <option value="asphalt">沥青</option>
              <option value="concrete">水泥</option>
              <option value="gravel">碎石</option>
              <option value="dirt">土路</option>
            </select></label
          >
        </div>
        <div v-if="['Polygon', 'MultiPolygon'].includes(draft.geometry.type)" class="field-grid">
          <label
            >建筑类型<select v-model="draft.properties.buildingType">
              <option value="">未指定</option>
              <option value="residential">住宅</option>
              <option value="commercial">商业</option>
              <option value="industrial">工业</option>
              <option value="public">公共建筑</option>
              <option value="other">其他</option>
            </select></label
          >
          <label
            >楼层数<input v-model.number="draft.properties.floors" type="number" min="1" max="200"
          /></label>
        </div>
        <div class="subheading">
          <h3>行政归属</h3>
          <button type="button" @click="$emit('assign', draft)">自动匹配</button>
        </div>
        <div class="field-grid">
          <label>省 / 自治区<input v-model="draft.properties.admin.province" /></label
          ><label>县 / 区<input v-model="draft.properties.admin.county" /></label>
          <label>乡镇<input v-model="draft.properties.admin.town" /></label
          ><label>行政村<input v-model="draft.properties.admin.village" /></label>
          <label class="span-two"
            >区域 / 片区<input v-model="draft.properties.admin.region"
          /></label>
        </div>
        <p v-if="draft.properties.adminEstimated" class="inline-notice">
          行政归属包含推算边界，待核实。
        </p>
        <p v-if="draft.properties.sandtableKey" class="linked-task">
          关联任务：{{ draft.properties.sandtableKey }}
        </p>
        <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      </div>
      <footer class="dialog-footer">
        <button
          v-if="existing"
          type="button"
          class="danger icon-button"
          title="删除标注"
          aria-label="删除标注"
          @click="$emit('delete', draft.id)"
        >
          <Trash2 :size="17" /></button
        ><span></span><button type="button" @click="$emit('close')">取消</button
        ><button class="primary" type="submit"><Save :size="16" />保存</button>
      </footer>
    </form>
  </dialog>
</template>
