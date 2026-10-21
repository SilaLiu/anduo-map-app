import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyRoad } from '../src/web/domain/roadClasses.mjs';

const file = fileURLToPath(new URL('../data/reference/localRoads.geojson', import.meta.url));
const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error('Supply Overpass JSON files');
let old;
try {
  old = JSON.parse(await fs.readFile(file, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const features = new Map((old?.features || []).map((f) => [f.properties.osm_id, f]));
for (const input of inputs) {
  const data = JSON.parse(await fs.readFile(input, 'utf8'));
  if (data.remark || !Array.isArray(data.elements))
    throw new Error(data.remark || 'Invalid response');
  for (const item of data.elements) {
    const tags = item.tags || {};
    if (
      item.type !== 'way' ||
      !item.geometry ||
      item.geometry.length < 2 ||
      classifyRoad(tags) ||
      !/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$/.test(tags.highway)
    )
      continue;
    const coordinates = item.geometry.map((p) => [p.lon, p.lat]);
    if (coordinates.some((p) => !p.every(Number.isFinite))) throw new Error('Invalid coordinates');
    features.set(item.id, {
      type: 'Feature',
      properties: {
        name: tags['name:zh'] || tags.name || '未命名连接道路',
        category: 'road',
        road_type: '地方连接道路（等级待核实）',
        ref: tags.ref || '',
        old_ref: tags.old_ref || '',
        highway: tags.highway,
        source: 'OpenStreetMap',
        osm_id: item.id,
        osmTimestamp: data.osm3s?.timestamp_osm_base,
        note: '真实OSM道路；未确定现行行政等级，旧编号不作为现行编号。未核验实时通行情况。',
      },
      geometry: { type: 'LineString', coordinates },
    });
  }
}
await fs.writeFile(
  file,
  JSON.stringify({ type: 'FeatureCollection', features: [...features.values()] }) + '\n',
);
console.log(`Local roads: ${features.size}`);
