import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRoad } from '../src/web/domain/roadClasses.mjs';
import { bbox } from '@turf/turf';

// Explicit refresh only. Keep full OSM ways, never synthesize connecting segments.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data/reference');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/extend-reference-data.mjs <overpass-json>');
const osm = JSON.parse(await fs.readFile(input, 'utf8'));
if (osm.remark || !Array.isArray(osm.elements) || !osm.elements.length)
  throw new Error(osm.remark || 'Empty or invalid Overpass response; existing data preserved');
const groups = ['highways', 'provincialRoads', 'countyRoads', 'townshipRoads', 'railways'];
const incoming = Object.fromEntries(groups.map((key) => [key, new Map()]));
for (const item of osm.elements) {
  const tags = item.tags || {};
  const group = tags.railway === 'rail' ? 'railways' : classifyRoad(tags)?.key;
  if (item.type !== 'way' || !incoming[group] || !item.geometry || item.geometry.length < 2)
    continue;
  const coordinates = item.geometry.map((p) => [p.lon, p.lat]);
  if (coordinates.some((p) => !p.every(Number.isFinite)))
    throw new Error(`Invalid geometry: ${item.id}`);
  incoming[group].set(item.id, {
    type: 'Feature',
    properties: {
      name: tags['name:zh'] || tags.name || tags.ref || '铁路',
      ref: tags.ref || '',
      category: 'road',
      road_type: group === 'railways' ? '铁路' : classifyRoad(tags).name,
      source: 'OpenStreetMap',
      osm_id: item.id,
      osmTimestamp: osm.osm3s?.timestamp_osm_base,
      note: '周边县城区域OSM参考线路；保留完整OSM路段，不补线。OSM可能存在缺漏。',
    },
    geometry: { type: 'LineString', coordinates },
  });
}
if (groups.every((key) => !incoming[key].size))
  throw new Error('No classified transport data; existing data preserved');
const prepared = [];
for (const group of groups) {
  const file = path.join(output, `${group}.geojson`);
  const old = JSON.parse(await fs.readFile(file, 'utf8'));
  const merged = new Map(old.features.map((f) => [f.properties.osm_id, f]));
  for (const [id, feature] of incoming[group]) merged.set(id, feature);
  const data = { type: 'FeatureCollection', features: [...merged.values()] };
  prepared.push({ group, file, data, previous: old.features.length });
}
for (const { group, file, data, previous } of prepared) {
  await fs.writeFile(file, JSON.stringify(data) + '\n');
  console.log(`${group}: ${previous} -> ${data.features.length}`);
}
const metadataFile = path.join(output, 'metadata.json');
const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
metadata.generatedAt = new Date().toISOString();
metadata.coverage = '历史安多缓存 + 六个周边县城区域OSM线路；不保证路网完整或可通行';
metadata.bounds = bbox({
  type: 'FeatureCollection',
  features: prepared.flatMap(({ data }) => data.features),
});
metadata.note =
  '范围为实际线路包围盒；bufferKm仅描述原始历史缓存筛选条件。周边县界仍为原有参考数据，线路不按安多县界裁切。';
metadata.extension = metadata.extension || {
  counties: ['色尼区', '聂荣县', '比如县', '班戈县', '双湖县', '当雄县'],
  queryBounds: [88.5, 30.25, 94, 33.5],
  osmTimestamp: osm.osm3s?.timestamp_osm_base,
  source: 'OpenStreetMap / https://maps.mail.ru/osm/tools/overpass/api/interpreter',
};
metadata.lastImport = {
  osmTimestamp: osm.osm3s?.timestamp_osm_base,
  counts: Object.fromEntries(groups.map((key) => [key, incoming[key].size])),
};
for (const { group, data } of prepared) {
  if (group === 'railways') metadata.railwayCount = data.features.length;
  else metadata.roadCounts[group] = data.features.length;
}
await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
