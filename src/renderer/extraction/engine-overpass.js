// ═══════════════════════════════════════════
//  Overpass API (OSM data) extraction engine
// ═══════════════════════════════════════════

import { state } from '../state.js';
import { coordsToBbox } from '../utils/geo.js';
import { categoryNames } from './categories.js';

export async function runOverpassEngine(targets, setProgress) {
  setProgress(10, '查询 OSM 数据库...');
  const bbox = coordsToBbox(state.extractPolygon);
  const queries = [];
  if (targets.includes('buildings')) queries.push('way[building](' + bbox + ');');
  if (targets.includes('roads')) queries.push('way[highway](' + bbox + ');');
  if (targets.includes('water')) queries.push('way[natural=water](' + bbox + ');way[waterway](' + bbox + ');');
  if (targets.includes('vegetation') || targets.includes('farmland')) {
    queries.push('way[landuse=forest](' + bbox + ');way[natural=wood](' + bbox + ');way[landuse=farmland](' + bbox + ');way[landuse=grass](' + bbox + ');way[natural=scrub](' + bbox + ');');
  }

  const query = '[out:json][timeout:25];(' + queries.join('') + ');out body;>;out skel qt;';

  setProgress(20, '请求 Overpass API...');
  const data = await overpassFetch(query, setProgress);

  setProgress(60, '解析 OSM 数据...');
  const nodes = {};
  data.elements.forEach(e => { if (e.type === 'node') nodes[e.id] = [e.lon, e.lat]; });

  let processed = 0;
  data.elements.forEach(e => {
    if (e.type !== 'way' || !e.nodes || e.nodes.length < 2) return;
    const coords = e.nodes.map(nid => nodes[nid]).filter(Boolean);
    if (coords.length < 2) return;

    let category = null, props = {}, color, type;
    if (targets.includes('buildings') && e.tags && e.tags.building) {
      category = 'buildings'; type = 'polygon'; color = '#8b5cf6';
      props.buildingType = e.tags.building || '';
      if (e.tags['building:levels']) props.floors = parseInt(e.tags['building:levels']);
      props.name = e.tags.name || '';
    } else if (targets.includes('roads') && e.tags && e.tags.highway) {
      category = 'roads'; type = 'line'; color = '#f59e0b';
      props.roadClass = e.tags.highway;
      if (e.tags.lanes) props.lanes = parseInt(e.tags.lanes);
      if (e.tags.surface) props.surface = e.tags.surface;
      props.name = e.tags.name || '';
    } else if (targets.includes('water') && e.tags && (e.tags.natural === 'water' || e.tags.waterway)) {
      category = 'water'; type = 'polygon'; color = '#3b82f6';
      props.name = e.tags.name || (e.tags.waterway || '水体');
    } else if ((targets.includes('vegetation') || targets.includes('farmland')) && e.tags) {
      if (e.tags.landuse === 'farmland') { category = 'farmland'; type = 'polygon'; color = '#eab308'; props.name = e.tags.name || '农田'; }
      else if (e.tags.landuse === 'forest' || e.tags.natural === 'wood') { category = 'vegetation'; type = 'polygon'; color = '#22c55e'; props.name = e.tags.name || '林地'; }
      else if (e.tags.landuse === 'grass' || e.tags.natural === 'scrub') { category = 'vegetation'; type = 'polygon'; color = '#4ade80'; props.name = e.tags.name || '绿地'; }
    }
    if (!category) return;

    if (type === 'polygon') {
      const f = coords[0], l = coords[coords.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) coords.push([...f]);
      if (coords.length < 4) return;
    }

    state.extractionResults.push({
      id: 'extr_o_' + Date.now() + '_' + processed,
      category, type, coordinates: coords, color,
      name: props.name || categoryNames[category], note: '',
      roadClass: props.roadClass || '', lanes: props.lanes || '', surface: props.surface || '',
      buildingType: props.buildingType || '', floors: props.floors || '',
      source: 'Overpass API (OSM)',
      selected: true,
    });
    processed++;
  });

  setProgress(100, '完成: ' + processed + ' 个地物');
}

async function overpassFetch(query, setProgress) {
  const urls = [
    { url: 'https://overpass-api.de/api/interpreter', method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' } },
  ];
  const proxies = [
    (q) => 'https://corsproxy.io/?' + encodeURIComponent('https://overpass-api.de/api/interpreter'),
    (q) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://overpass-api.de/api/interpreter'),
  ];

  for (const opt of urls) {
    try {
      const resp = await fetch(opt.url, { method: opt.method, body: opt.body, headers: opt.headers });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('Direct Overpass fetch failed:', e.message);
    }
  }

  setProgress(25, '通过代理请求...');
  for (const proxyFn of proxies) {
    try {
      const proxyUrl = proxyFn('');
      const resp = await fetch(proxyUrl, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (resp.ok) {
        const text = await resp.text();
        try { return JSON.parse(text); } catch (e) { continue; }
      }
    } catch (e) {
      console.warn('Proxy fetch failed:', e.message);
    }
  }

  setProgress(28, '尝试备用节点...');
  const overpassMirrors = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];
  for (const mirror of overpassMirrors) {
    try {
      const resp = await fetch(mirror, { method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' } });
      if (resp.ok) return await resp.json();
    } catch (e) { continue; }
  }

  throw new Error('无法连接到 Overpass API（可能是网络或跨域限制）。\n建议使用「图像分割」引擎。');
}
