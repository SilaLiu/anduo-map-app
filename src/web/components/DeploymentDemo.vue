<script setup lang="ts">
import { ref } from 'vue';
import UnitSymbol from './UnitSymbol.vue';
import DeploymentIllustration from './DeploymentIllustration.vue';
const expanded = ref(true);
let nextId = 0;
const row = () => ({ id: nextId++, level: '班', name: '', count: 0, region: '' });
const groups = ref([
  { id: nextId++, name: '应急力量', rows: [row()] },
  { id: nextId++, name: '支援保障力量', rows: [row()] },
]);
function total(rows: ReturnType<typeof row>[]) {
  return rows.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)), 0);
}
</script>
<template>
  <section
    class="deployment-demo"
    aria-label="编组资料填写表"
    @pointerdown.stop
    @dblclick.stop
    @keydown.stop
  >
    <button class="demo-heading" :aria-expanded="expanded" @click="expanded = !expanded">
      <strong>安多县编组资料表</strong><span>{{ expanded ? '收起' : '展开' }}</span>
    </button>
    <template v-if="expanded">
      <DeploymentIllustration />
      <p>
        空白填写模板 ·
        仅当前页面内存保存，刷新会丢失；未连接本地文件，不会上传或播报。请勿在此联网页面填写正式涉密资料。
      </p>
      <div class="demo-table">
        <table>
          <thead>
            <tr>
              <th>图标 / 层级</th>
              <th>编组</th>
              <th>人数</th>
              <th>部署地域</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody v-for="group in groups" :key="group.id">
            <tr class="group-title">
              <th colspan="5">
                <input v-model="group.name" aria-label="分组名称" />（{{ total(group.rows) }} 人）
              </th>
            </tr>
            <tr v-for="entry in group.rows" :key="entry.id">
              <td>
                <div class="level-cell">
                  <span class="demo-symbol small"><UnitSymbol :level="entry.level" /></span
                  ><select v-model="entry.level" aria-label="层级">
                    <option>连</option>
                    <option>排</option>
                    <option>班</option>
                  </select>
                </div>
              </td>
              <td><input v-model="entry.name" aria-label="编组名称" placeholder="填写编组" /></td>
              <td>
                <input
                  v-model.number="entry.count"
                  class="count-input"
                  aria-label="人数"
                  type="number"
                  min="0"
                  step="1"
                  @change="entry.count = Math.max(0, Math.floor(Number(entry.count) || 0))"
                />
              </td>
              <td><input v-model="entry.region" aria-label="部署地域" placeholder="填写地域" /></td>
              <td>
                <button @click="group.rows = group.rows.filter((item) => item.id !== entry.id)">
                  删除
                </button>
              </td>
            </tr>
            <tr>
              <td colspan="5"><button @click="group.rows.push(row())">＋ 添加一行</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="toolbar">
        <button @click="groups.push({ id: nextId++, name: '新分组', rows: [row()] })">
          ＋ 添加分组
        </button>
      </div>
    </template>
  </section>
</template>
<style scoped>
.deployment-demo {
  position: absolute;
  right: 16px;
  bottom: 0;
  z-index: 12;
  width: min(520px, calc(100% - 32px));
  max-height: 30%;
  overflow: auto;
  background: #fffffff2;
  color: #263638;
  border: 1px solid #516462;
  border-radius: 10px 10px 0 0;
  box-shadow: 0 6px 24px #0005;
}
.demo-heading {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 12px;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}
p {
  padding: 0 12px;
  font-size: 11px;
  color: #c0cfca;
  line-height: 1.6;
}
.demo-symbol {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  color: #caffee;
}
.demo-symbol svg {
  width: 100%;
  height: 100%;
}
.selected .demo-symbol {
  color: #ffe28b;
  filter: drop-shadow(0 0 3px #ffe28b);
}
.small {
  width: 24px;
  height: 24px;
  padding: 2px;
}
.demo-table {
  overflow-x: auto;
  padding: 8px 12px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}
th,
td {
  text-align: left;
  padding: 7px 5px;
  border-bottom: 1px solid #40534f;
}
tr.selected {
  background: #ffffff0b;
}
td button {
  border: 0;
  background: none;
  color: #aff0db;
  cursor: pointer;
  padding: 0;
}
</style>

<style scoped>
input,
select {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  background: #20343b;
  color: #eff6f3;
  border: 1px solid #516462;
  padding: 5px;
}
.group-title {
  background: #314b50;
}
.group-title input {
  width: 60%;
}
.level-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}
.level-cell select {
  width: 46px;
}
.count-input {
  max-width: 65px;
}
.toolbar {
  padding: 4px 8px;
}
.deployment-demo {
  width: min(700px, calc(100% - 90px));
  border-color: #dce5e1;
}
.deployment-demo input,
.deployment-demo select {
  display: inline-block;
  height: 25px;
  min-height: 0;
  padding: 2px 5px;
  font-size: 11px;
  margin: 0;
  background: white;
  color: #263638;
  border-color: #dce5e1;
}
.deployment-demo .group-title input {
  width: 170px;
  max-width: 65%;
}
.deployment-demo .group-title {
  background: #eef4f1;
}
.deployment-demo button {
  min-height: 0;
  padding: 4px 6px;
  font-size: 11px;
  color: #127b64;
}
.deployment-demo .demo-heading {
  font-size: 13px;
  padding: 6px 8px;
}
.deployment-demo p {
  margin: 4px 0;
  color: #687b76;
  font-size: 10px;
}
.deployment-demo table {
  font-size: 11px;
}
.deployment-demo td,
.deployment-demo th {
  padding: 4px 6px;
  border-color: #dce5e1;
}
.deployment-demo .demo-symbol {
  color: #127b64;
}
</style>
