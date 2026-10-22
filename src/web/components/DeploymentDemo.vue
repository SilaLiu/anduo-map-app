<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UnitSymbol from './UnitSymbol.vue';
import { nextDeploymentId, type DeploymentByTown } from '../domain/deployment';

const props = defineProps<{
  deployments: DeploymentByTown;
  townNames: string[];
  saveStatus: string;
}>();
const emit = defineEmits<{
  'update:deployments': [deployments: DeploymentByTown];
  dirty: [];
  save: [];
  locate: [town: string];
}>();
const expanded = ref(true);
const selectedTown = ref('帕那镇');
const selectedId = ref(1);
const deployments = computed({
  get: () => props.deployments,
  set: (value: DeploymentByTown) => emit('update:deployments', value),
});
const rows = computed(() => deployments.value[selectedTown.value] || []);
const selected = computed(() => rows.value.find((row) => row.id === selectedId.value) || rows.value[0]);
const total = computed(() => rows.value.reduce((sum, row) => sum + safeCount(row.count), 0));
watch(() => props.townNames, (names) => {
  if (!names.includes(selectedTown.value)) selectedTown.value = names[0] || '帕那镇';
}, { immediate: true });
watch(() => props.deployments, () => emit('dirty'), { deep: true });
watch(rows, (value) => {
  if (value.length && !value.some((row) => row.id === selectedId.value)) selectedId.value = value[0].id;
}, { deep: true });
function safeCount(value: unknown) { return Math.max(0, Math.floor(Number(value) || 0)); }
function selectRow(id: number) { selectedId.value = id; }
function addRow() {
  const id = nextDeploymentId(deployments.value);
  deployments.value = {
    ...deployments.value,
    [selectedTown.value]: [
      ...rows.value,
      { id, level: '班', name: '新编组', count: 0, region: selectedTown.value, x: 50, y: 48, anchorX: 68, anchorY: 76 },
    ],
  };
  selectedId.value = id;
  emit('dirty');
}
function removeRow(id: number) {
  deployments.value = { ...deployments.value, [selectedTown.value]: rows.value.filter((row) => row.id !== id) };
  if (selectedId.value === id) selectedId.value = deployments.value[selectedTown.value][0]?.id || 0;
  emit('dirty');
}
function saveDeployment() {
  emit('save');
}
</script>

<template>
  <section class="deployment-demo" aria-label="兵力部署编组资料表" @pointerdown.stop @dblclick.stop @keydown.stop>
    <button class="demo-heading" :aria-expanded="expanded" @click="expanded = !expanded">
      <strong>兵力部署 · {{ selectedTown }}</strong><span>{{ expanded ? '收起' : '展开' }}</span>
    </button>
    <template v-if="expanded">
      <div class="town-toolbar"><label>部署乡镇<select v-model="selectedTown" aria-label="部署乡镇"><option v-for="town in townNames" :key="town" :value="town">{{ town }}</option></select></label><button type="button" class="save-button" :disabled="saveStatus === '保存中'" @click.stop.prevent="saveDeployment">{{ saveStatus === '保存中' ? '保存中…' : '保存部署' }}</button></div>
      <button type="button" @click="emit('locate', selectedTown)">定位乡镇</button>
      <p class="demo-note">不同乡镇分别保存编组数据；修改后地图标志立即同步，点击“保存部署”后可在刷新页面后恢复。若乡镇不在视野内，可点击“定位乡镇”查看。</p>
      <div class="deployment-summary">
        <strong>{{ selected?.name || '未选择编组' }}</strong><span>{{ selected?.level || '—' }} · {{ selected?.count || 0 }} 人 · {{ selected?.region || '—' }}</span><b>当前地点合计 {{ total }} 人</b>
      </div>
      <div class="demo-table">
        <table><thead><tr><th>图标 / 层级</th><th>编组</th><th>人数</th><th>部署地域</th><th>操作</th></tr></thead>
          <tbody><tr v-for="entry in rows" :key="entry.id" :class="{ selected: selectedId === entry.id }" @click="selectRow(entry.id)">
            <td><div class="level-cell"><span class="demo-symbol small"><UnitSymbol :level="entry.level" /></span><select v-model="entry.level" aria-label="层级" @click.stop><option>连</option><option>排</option><option>班</option><option>地方民兵</option></select></div></td>
            <td><input v-model="entry.name" aria-label="编组名称" placeholder="填写编组" @click.stop /></td>
            <td><input v-model.number="entry.count" class="count-input" aria-label="人数" type="number" min="0" step="1" @click.stop @change="entry.count = safeCount(entry.count)" /></td>
            <td><input v-model="entry.region" aria-label="部署地域" placeholder="填写地域" @click.stop /></td>
            <td><button @click.stop="removeRow(entry.id)">删除</button></td>
          </tr></tbody>
        </table>
      </div>
      <div class="toolbar"><button @click="addRow">＋ 添加编组</button></div>
    </template>
  </section>
</template>

<style scoped>
.deployment-demo { position: absolute; right: 16px; bottom: 16px; z-index: 12; width: min(700px, calc(100% - 90px)); max-height: 46%; overflow: auto; background: #fffffff2; color: #263638; border: 1px solid #dce5e1; border-radius: 10px; box-shadow: 0 6px 24px #0005; }
.demo-heading { display: flex; justify-content: space-between; width: 100%; padding: 7px 8px; color: inherit; background: transparent; border: 0; cursor: pointer; font-size: 13px; }
.town-toolbar { display: flex; align-items: end; gap: 8px; padding: 4px 10px 0; }.town-toolbar label { display: grid; gap: 3px; flex: 1; color: #52635f; font-size: 10px; }.town-toolbar select { max-width: 240px; }.save-button { min-height: 25px; padding: 4px 9px; color: white; background: #127b64; border-color: #127b64; font-size: 11px; }
.demo-note { margin: 4px 0; padding: 0 10px; color: #687b76; font-size: 10px; line-height: 1.5; }
.deployment-summary { display: flex; align-items: baseline; gap: 8px; padding: 4px 12px; color: #52635f; font-size: 11px; }.deployment-summary strong { color: #9a6500; font-size: 12px; }.deployment-summary b { margin-left: auto; color: #127b64; }
.demo-table { overflow-x: auto; padding: 2px 10px 4px; } table { width: 100%; border-collapse: collapse; font-size: 11px; white-space: nowrap; } th, td { padding: 4px 6px; text-align: left; border-bottom: 1px solid #dce5e1; } tbody tr { cursor: pointer; } tbody tr.selected { background: #fff6dc; }
input, select { display: inline-block; box-sizing: border-box; height: 25px; min-height: 0; min-width: 0; width: 100%; padding: 2px 5px; background: white; color: #263638; border: 1px solid #dce5e1; font-size: 11px; }.level-cell { display: flex; align-items: center; gap: 4px; }.level-cell select { width: 46px; }.demo-symbol { display: inline-flex; width: 24px; height: 24px; padding: 2px; color: #127b64; }.demo-symbol svg { width: 100%; height: 100%; }.count-input { max-width: 65px; }
td button, .toolbar button { min-height: 0; padding: 4px 6px; color: #127b64; font-size: 11px; }.toolbar { padding: 2px 10px 7px; }
.level-cell select { width: 94px; }
@media (max-width: 700px) { .deployment-demo { right: 10px; width: calc(100% - 70px); max-height: 48%; } .deployment-summary { flex-wrap: wrap; }.deployment-summary b { margin-left: 0; width: 100%; } }
</style>