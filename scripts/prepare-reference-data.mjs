import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bbox, booleanIntersects, buffer, featureCollection, lineString, union } from '@turf/turf';
import { classifyRoad, roadClasses } from '../src/web/domain/roadClasses.mjs';

// Refresh explicitly, not during builds: nationwide archives are local-only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const boundaries = await read(
  path.join(root, 'data/admin-geojson/xizang/anduo/anduo_all_levels.json'),
);
const extent = union(featureCollection(boundaries.features));
const region = buffer(extent, 50, { units: 'kilometers' });
const osm = await read(process.argv[2] || '/tmp/anduo-transport-osm.json');
if (osm.remark || !Array.isArray(osm.elements))
  throw new Error(osm.remark || 'Invalid OSM response');
const roads = Object.fromEntries(roadClasses.map((kind) => [kind.key, []]));
const railways = [],
  counties = [];
for (const item of osm.elements) {
  if (!item.geometry || item.geometry.length < 2) continue;
  const tags = item.tags || {};
  const rail = tags.railway === 'rail';
  const road = classifyRoad(tags);
  if (!rail && !road) continue;
  const feature = lineString(
    item.geometry.map((p) => [p.lon, p.lat]),
    {
      name: tags.name || tags['name:zh'] || tags.ref || (rail ? '铁路' : road.name),
      ref: tags.ref || '',
      category: 'road',
      road_type: rail ? '铁路' : road.name,
      source: 'OpenStreetMap',
      osm_id: item.id,
      note: osm.cacheFallback
        ? '本机历史OSM缓存，采集日期未知；周边50公里覆盖尚不完整，保留原始路段，缺失处不补线。'
        : '安多县及周边50公里参考线路；保留与范围相交的完整OSM路段。',
    },
  );
  if (booleanIntersects(feature, region)) (rail ? railways : roads[road.key]).push(feature);
}
for (const province of ['54000', '63000']) {
  const folder = path.join(root, 'data/admin-geojson/county', province);
  for (const city of await fs.readdir(folder)) {
    for (const filename of await fs.readdir(path.join(folder, city))) {
      if (!filename.endsWith('.json')) continue;
      const data = await read(path.join(folder, city, filename));
      for (const feature of data.features || []) {
        if (String(feature.properties?.adcode) === '540624') continue;
        if (booleanIntersects(feature, region)) counties.push(feature);
      }
    }
  }
}
if (!roads.highways.length || !railways.length || !counties.length)
  throw new Error('Reference data is incomplete');
const output = path.join(root, 'data/reference');
await fs.mkdir(output, { recursive: true });
for (const [name, features] of [
  ...Object.entries(roads),
  ['railways', railways],
  ['neighborCounties', counties],
]) {
  await fs.writeFile(
    path.join(output, `${name}.geojson`),
    JSON.stringify(featureCollection(features)) + '\n',
  );
  console.log(name, features.length);
}
await fs.writeFile(
  path.join(output, 'metadata.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      cacheFallback: !!osm.cacheFallback,
      coverage: osm.cacheFallback
        ? '历史缓存，周边50公里覆盖不完整'
        : '按50公里范围筛选OSM返回数据',
      bufferKm: 50,
      roadCounts: Object.fromEntries(
        Object.entries(roads).map(([key, items]) => [key, items.length]),
      ),
      bounds: bbox(region),
      sources: ['OpenStreetMap / Overpass', 'DataV Atlas'],
      osmTimestamp: osm.osm3s?.timestamp_osm_base,
      note: '参考图层，不参与安多县行政归属。不同来源边界可能不一致；线路为与缓冲区相交的完整路段，非完整道路数据库。',
    },
    null,
    2,
  ) + '\n',
);
