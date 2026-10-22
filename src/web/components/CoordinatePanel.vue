<script setup lang="ts">
import { ref } from 'vue';
import type { CoordinateShape } from '../domain/coordinateAnnotations';
defineProps<{ busy: boolean; error: string }>();
const emit = defineEmits<{
  close: [];
  create: [text: string, name: string, shape: CoordinateShape];
}>();
const text = ref('');
const name = ref('坐标标注');
const shape = ref<CoordinateShape>('points');
</script>

<template>
  <section class="coordinate-panel" aria-label="经纬度批量标注" @pointerdown.stop @dblclick.stop>
    <header><strong>经纬度批量标注</strong><button type="button" :disabled="busy" @click="emit('close')">关闭</button></header>
    <label>标注名称<input v-model="name" aria-label="坐标标注名称" maxlength="80" /></label>
    <label>经纬度（每行一个点）<textarea v-model="text" aria-label="批量经纬度" rows="6" placeholder="91.682,32.262&#10;91.692,32.262&#10;91.692,32.272" /></label>
    <p>WGS84 十进制度，经度在前、纬度在后，逗号或空格分隔。按输入顺序编号；区域会自动连接首尾。每批最多 500 个点，仅支持安多县范围。</p>
    <label>生成方式<select v-model="shape" aria-label="坐标生成方式"><option value="points">仅旗帜点位</option><option value="line">旗帜点位 + 依次连线</option><option value="polygon">旗帜点位 + 闭合区域</option></select></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" :disabled="busy || !text.trim()" @click="emit('create', text, name, shape)">{{ busy ? '正在保存…' : '生成并保存标注' }}</button>
  </section>
</template>

<style scoped>
.coordinate-panel { position: absolute; top: 74px; left: 12px; z-index: 30; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 100px); overflow: auto; padding: 16px; border-radius: 10px; background: #fff; color: #263238; box-shadow: 0 4px 24px #0005; }
header { display: flex; align-items: center; justify-content: space-between; }
label { display: grid; gap: 6px; margin: 12px 0; }
input, textarea, select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #aab7bf; border-radius: 6px; font: inherit; }
button { min-height: 44px; padding: 8px 12px; touch-action: manipulation; }
p { font-size: 12px; line-height: 1.6; }
[role=alert] { color: #b42318; }
</style>