import fs from 'node:fs/promises';
const root = new URL('../data/', import.meta.url);
const read = async (name) => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const names = ['乃母寺', '唐卡寺', '白日寺', '多玛寺', '卓古寺', '雪穷寺', '仲巴寺', '穷宗寺'];
const data = await read('sandtable-geojson/temples.geojson');
const cache = await read('sandtable-geojson/.cache/temples_v2.json');
data.features = data.features.filter(
  (f) =>
    names.slice(0, 3).includes(f.properties.name) ||
    (names.includes(f.properties.name) && f.properties.location_precision === 'village_reference'),
);
for (const name of ['卓古寺', '穷宗寺']) {
  const item = cache.find((i) => i.tags['name:zh'] === name);
  if (!item) throw new Error(`Missing source: ${name}`);
  data.features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
    properties: {
      name,
      category: 'temple',
      source: 'OpenStreetMap',
      osm_id: item.id,
      note: '历史OSM来源坐标，未经实地核验。',
    },
  });
}
await fs.writeFile(
  new URL('sandtable-geojson/temples.geojson', root),
  JSON.stringify(data, null, 2) + '\n',
);
const requirements = await read('sandtable-requirements.json');
requirements.temples = names.map((name) => ({
  ...requirements.temples.find((t) => t.name === name),
  name,
}));
await fs.writeFile(
  new URL('sandtable-requirements.json', root),
  JSON.stringify(requirements, null, 2) + '\n',
);
