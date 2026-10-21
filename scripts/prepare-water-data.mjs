import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { booleanIntersects } from '@turf/turf';

const root = new URL('../data/', import.meta.url);
const read = async (name) => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const boundary = await read('admin-geojson/xizang/anduo/540624_安多县.json');
const county = boundary.features.find((f) => String(f.properties.adcode) === '540624');
if (!county) throw new Error('Anduo boundary missing');
for (const [group, cache, category] of [
  ['rivers', 'rivers_v2', 'river'],
  ['lakes', 'lakes', 'lake'],
]) {
  const items = await read(`sandtable-geojson/.cache/${cache}.json`);
  const previous = await read(`sandtable-geojson/${group}.geojson`);
  const known = new Map(previous.features.map((f) => [String(f.properties.osm_id), f.properties]));
  const unique = new Map();
  for (const item of items) {
    const tags = item.tags || {};
    if (category === 'river' && !['river', 'stream'].includes(tags.waterway)) continue;
    if (category === 'lake' && (tags.natural !== 'water' || tags.water !== 'lake')) continue;
    if (
      !item.geometry ||
      !booleanIntersects({ type: 'Feature', properties: {}, geometry: item.geometry }, county)
    )
      continue;
    const old = known.get(String(item.id));
    const name = old?.name || tags['name:zh'] || tags.name || '';
    unique.set(`${item.type}/${item.id}`, {
      type: 'Feature',
      geometry: item.geometry,
      properties: {
        ...old,
        name,
        category,
        source: 'OpenStreetMap 历史缓存',
        osm_id: item.id,
        osm_type: item.type,
        name_status: name ? '来源名称' : '名称待核实',
        note: '与安多县边界相交的历史水系；保留完整水体几何，跨界部分可能在县外。不保证覆盖完整；无名称不补造。',
      },
    });
  }
  if (!unique.size) throw new Error(`No valid ${group}; existing file preserved`);
  const features = [...unique.values()];
  const output = new URL(`sandtable-geojson/${group}.geojson`, root);
  await fs.writeFile(output, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
  console.log(
    `${fileURLToPath(output)}: ${features.length} features, ${features.filter((f) => f.properties.name).length} named`,
  );
}
