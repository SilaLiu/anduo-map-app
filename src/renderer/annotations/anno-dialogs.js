// ═══════════════════════════════════════════
//  Add / edit annotation dialogs with unified form handling
// ═══════════════════════════════════════════

import { map } from '../map/map.js';
import { state, EMPTY_ADMIN, normalizeAdmin, saveAnnotations } from '../state.js';
import { assignAdminByGeometry, findBestBoundaryForAdmin, resolveAdminForSave } from '../admin/admin-geometry.js';
import { updateBoundaryOptions, updateBoundaryStatus } from '../admin/admin-boundaries.js';

export function setupColorPicker(prefix, onChange) {
  document.querySelectorAll(`#${prefix}-cp span`).forEach(el => {
    el.onclick = () => {
      document.querySelectorAll(`#${prefix}-cp span`).forEach(e => e.classList.remove('on'));
      el.classList.add('on');
      onChange(el.dataset.c);
    };
  });
}

export function readAdminInputs(prefix) {
  return normalizeAdmin({
    province: document.getElementById(`${prefix}-admin-province`).value,
    county: document.getElementById(`${prefix}-admin-county`).value,
    town: document.getElementById(`${prefix}-admin-town`).value,
    village: document.getElementById(`${prefix}-admin-village`).value,
    region: document.getElementById(`${prefix}-admin-region`).value,
  });
}

export function applyAdminToInputs(prefix, admin) {
  const a = normalizeAdmin(admin || EMPTY_ADMIN());
  document.getElementById(`${prefix}-admin-province`).value = a.province;
  document.getElementById(`${prefix}-admin-county`).value = a.county;
  document.getElementById(`${prefix}-admin-town`).value = a.town;
  document.getElementById(`${prefix}-admin-village`).value = a.village;
  document.getElementById(`${prefix}-admin-region`).value = a.region;
  updateAdminStatus(prefix);
}

export function clearAdminInputs(prefix, preserveBoundary) {
  applyAdminToInputs(prefix, EMPTY_ADMIN());
  if (!preserveBoundary) state.currentAdminContext = null;
  updateAdminStatus(prefix);
}

export function bindAdminInputEvents(prefix) {
  ['province', 'county', 'town', 'village', 'region'].forEach(key => {
    const el = document.getElementById(`${prefix}-admin-${key}`);
    if (el) el.addEventListener('input', () => updateAdminStatus(prefix));
  });
}

export function updateAdminStatus(prefix) {
  const admin = readAdminInputs(prefix);
  const boundary = findBestBoundaryForAdmin(admin);
  const el = document.getElementById(`${prefix}-admin-status`);
  if (boundary) {
    const parts = [boundary.admin.province, boundary.admin.county, boundary.admin.town, boundary.admin.village].filter(Boolean);
    el.textContent = `已匹配边界：${parts.length ? parts.join(' / ') : boundary.name} · 点击保存后会绑定该行政区`;
  } else {
    const parts = [admin.province, admin.county, admin.town, admin.village].filter(Boolean);
    el.textContent = parts.length
      ? `已填写行政归属：${parts.join(' / ')}${admin.region ? ` · ${admin.region}` : ''}。当前未找到匹配边界。`
      : '未匹配到行政区边界';
  }
}

export function fillAdminInputsFromCurrentBoundary(prefix) {
  if (state.currentAdminContext && state.currentAdminContext.admin) {
    applyAdminToInputs(prefix, state.currentAdminContext.admin);
    updateAdminStatus(prefix);
  } else {
    alert('当前没有高亮的行政区可填充');
  }
}

// 沙盘清单等入口在进入绘制模式前设置的一次性预填默认值，
// 下一次 showAdd 消费后即清空。defaults = { name, note, sandtableKey, adminVillage } 或 null。
let pendingAddDefaults = null;
export function setAddDefaults(defaults) {
  pendingAddDefaults = defaults;
}

export function showAdd(type, lng, lat, coordinates) {
  const d = document.getElementById('d-add');
  state.curCol = type === 'line' ? '#f59e0b' : type === 'polygon' ? '#8b5cf6' : '#ef4444';
  document.querySelectorAll('#a-cp span').forEach(e => e.classList.toggle('on', e.dataset.c === state.curCol));

  if (type === 'point') {
    document.getElementById('a-pos').textContent = `${lat.toFixed(6)}° N ${lng.toFixed(6)}° E`;
    document.getElementById('add-title').textContent = '📍 添加标注';
  } else if (type === 'line') {
    document.getElementById('a-pos').textContent = `道路 · ${coordinates.length} 个顶点`;
    document.getElementById('add-title').textContent = '🛣️ 添加道路标注';
  } else {
    document.getElementById('a-pos').textContent = `建筑 · ${coordinates.length} 个顶点`;
    document.getElementById('add-title').textContent = '🏢 添加建筑标注';
  }

  document.getElementById('a-name').value = '';
  document.getElementById('a-note').value = '';
  document.getElementById('a-road-class').value = '';
  document.getElementById('a-lanes').value = '';
  document.getElementById('a-surface').value = '';
  document.getElementById('a-building-type').value = '';
  document.getElementById('a-floors').value = '';
  document.getElementById('a-road-fields').style.display = type === 'line' ? 'block' : 'none';
  document.getElementById('a-building-fields').style.display = type === 'polygon' ? 'block' : 'none';

  d._addType = type;
  d._addLng = lng;
  d._addLat = lat;
  d._addCoords = coordinates;

  clearAdminInputs('a', true);
  if (state.currentAdminContext && state.currentAdminContext.type === 'boundary') {
    applyAdminToInputs('a', state.currentAdminContext.admin);
  }
  const tempAnno = type === 'point'
    ? { type, lng, lat, admin: {} }
    : { type, coordinates, admin: {} };
  const autoAdmin = assignAdminByGeometry(tempAnno).admin || EMPTY_ADMIN();
  applyAdminToInputs('a', autoAdmin);

  // 消费一次性预填（在自动行政归属之后应用，保证村名不被几何归属覆盖）
  const pd = pendingAddDefaults;
  pendingAddDefaults = null;
  d._sandtableKey = pd?.sandtableKey || null;
  if (pd) {
    if (pd.name) document.getElementById('a-name').value = pd.name;
    if (pd.note) document.getElementById('a-note').value = pd.note;
    if (pd.adminVillage) {
      document.getElementById('a-admin-village').value = pd.adminVillage;
      updateAdminStatus('a');
    }
  }

  d.classList.remove('hide');
  setTimeout(() => document.getElementById('a-name').focus(), 100);
}

export function showEdit(id) {
  const a = state.annos.find(x => x.id === id);
  if (!a) return;
  state.editId = id;

  if (a.type === 'point') {
    document.getElementById('e-pos').textContent = `${a.lat.toFixed(6)}° N ${a.lng.toFixed(6)}° E`;
    document.getElementById('edit-title').textContent = '✏️ 编辑标注点';
  } else if (a.type === 'line') {
    document.getElementById('e-pos').textContent = `道路 · ${(a.coordinates || []).length} 个顶点`;
    document.getElementById('edit-title').textContent = '✏️ 编辑道路';
  } else {
    document.getElementById('e-pos').textContent = `建筑 · ${(a.coordinates || []).length} 个顶点`;
    document.getElementById('edit-title').textContent = '✏️ 编辑建筑';
  }

  document.getElementById('e-name').value = a.name;
  document.getElementById('e-note').value = a.note || '';
  document.querySelectorAll('#e-cp span').forEach(e => e.classList.toggle('on', e.dataset.c === a.color));

  document.getElementById('e-road-fields').style.display = a.type === 'line' ? 'block' : 'none';
  if (a.type === 'line') {
    document.getElementById('e-road-class').value = a.roadClass || '';
    document.getElementById('e-lanes').value = a.lanes || '';
    document.getElementById('e-surface').value = a.surface || '';
  }
  document.getElementById('e-building-fields').style.display = a.type === 'polygon' ? 'block' : 'none';
  if (a.type === 'polygon') {
    document.getElementById('e-building-type').value = a.buildingType || '';
    document.getElementById('e-floors').value = a.floors || '';
  }
  applyAdminToInputs('e', a.admin || EMPTY_ADMIN());
  document.getElementById('d-edit').classList.remove('hide');
  setTimeout(() => document.getElementById('e-name').focus(), 100);
}

function readForm(prefix) {
  return {
    name: document.getElementById(`${prefix}-name`).value.trim() || '未命名',
    note: document.getElementById(`${prefix}-note`).value.trim(),
    admin: resolveAdminForSave(readAdminInputs(prefix)),
  };
}

export function initAnnoClickHandlers() {
  if (!map) return;
  const layers = ['annos-point', 'annos-point-label', 'annos-line', 'annos-line-label', 'annos-polygon-fill', 'annos-polygon-label'];
  layers.forEach(lid => {
    map.on('click', lid, e => {
      if (state.drawMode) return;
      if (e.features?.[0]) showEdit(e.features[0].properties.id);
    });
    map.on('mouseenter', lid, () => { if (!state.drawMode) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', lid, () => { if (!state.drawMode) map.getCanvas().style.cursor = ''; });
  });
}

export function initDialogButtons() {
  document.getElementById('a-save').onclick = async () => {
    const d = document.getElementById('d-add');
    const type = d._addType;
    const { name, note, admin } = readForm('a');
    let anno = {
      id: Date.now().toString(),
      type,
      name,
      note,
      color: state.curCol,
      created_at: new Date().toISOString(),
      admin,
    };
    if (type === 'point') {
      anno.lat = d._addLat;
      anno.lng = d._addLng;
    } else {
      anno.coordinates = d._addCoords;
      if (type === 'line') {
        anno.roadClass = document.getElementById('a-road-class').value;
        anno.lanes = document.getElementById('a-lanes').value ? parseInt(document.getElementById('a-lanes').value) : '';
        anno.surface = document.getElementById('a-surface').value;
      } else if (type === 'polygon') {
        anno.buildingType = document.getElementById('a-building-type').value;
        anno.floors = document.getElementById('a-floors').value ? parseInt(document.getElementById('a-floors').value) : '';
      }
    }
    anno = assignAdminByGeometry(anno);
    if (d._sandtableKey) anno.sandtableKey = d._sandtableKey;
    state.annos.push(anno);
    d.classList.add('hide');
    await saveAnnotations();
    updateBoundaryOptions();
    updateBoundaryStatus();
  };

  document.getElementById('a-cancel').onclick = () => document.getElementById('d-add').classList.add('hide');

  setupColorPicker('a', c => { state.curCol = c; });

  document.getElementById('e-save').onclick = async () => {
    const a = state.annos.find(x => x.id === state.editId);
    if (!a) return;
    const { name, note, admin } = readForm('e');
    a.name = name;
    a.note = note;
    a.admin = admin;
    if (a.type === 'line') {
      a.roadClass = document.getElementById('e-road-class').value;
      a.lanes = document.getElementById('e-lanes').value ? parseInt(document.getElementById('e-lanes').value) : '';
      a.surface = document.getElementById('e-surface').value;
    }
    if (a.type === 'polygon') {
      a.buildingType = document.getElementById('e-building-type').value;
      a.floors = document.getElementById('e-floors').value ? parseInt(document.getElementById('e-floors').value) : '';
    }
    assignAdminByGeometry(a);
    document.getElementById('d-edit').classList.add('hide');
    await saveAnnotations();
    updateBoundaryOptions();
    updateBoundaryStatus();
  };

  document.getElementById('e-cancel').onclick = () => document.getElementById('d-edit').classList.add('hide');
  document.getElementById('e-del').onclick = async () => {
    state.annos = state.annos.filter(a => a.id !== state.editId);
    document.getElementById('d-edit').classList.add('hide');
    await saveAnnotations();
    updateBoundaryOptions();
    updateBoundaryStatus();
  };

  setupColorPicker('e', c => {
    const a = state.annos.find(x => x.id === state.editId);
    if (a) a.color = c;
  });

  document.getElementById('a-fill-boundary').onclick = () => fillAdminInputsFromCurrentBoundary('a');
  document.getElementById('a-clear-admin').onclick = () => clearAdminInputs('a');
  document.getElementById('e-fill-boundary').onclick = () => fillAdminInputsFromCurrentBoundary('e');
  document.getElementById('e-clear-admin').onclick = () => clearAdminInputs('e');
  bindAdminInputEvents('a');
  bindAdminInputEvents('e');
}
