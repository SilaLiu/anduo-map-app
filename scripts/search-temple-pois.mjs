// Explicit server-side lookup. Never print request URLs or credentials.
import fs from 'node:fs/promises';
import { toWgs } from '../server/routing.mjs';
import { booleanPointInPolygon, point } from '@turf/turf';

const key = process.env.AMAP_WEB_KEY;
if (!key) throw new Error('AMAP_WEB_KEY is not configured');
const boundary = JSON.parse(
  await fs.readFile(
    new URL('../data/admin-geojson/xizang/anduo/540624_安多县.json', import.meta.url),
    'utf8',
  ),
);
const county = boundary.features.find((f) => String(f.properties.adcode) === '540624');
if (!county) throw new Error('Anduo boundary missing');
const names = process.argv.slice(2);
const results = [];
for (const name of names.length ? names : ['多玛寺', '雪穷寺', '仲巴寺', '唐卡寺', '白日寺']) {
  const url = new URL('https://restapi.amap.com/v3/place/text');
  url.search = new URLSearchParams({
    key,
    keywords: name,
    city: '540624',
    citylimit: 'true',
    offset: '25',
    page: '1',
    extensions: 'base',
    output: 'JSON',
  }).toString();
  let data;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error();
    data = await response.json();
  } catch {
    console.log(JSON.stringify({ name, error: '高德POI请求失败，未更新点位' }));
    continue;
  }
  if (data.status !== '1') {
    console.log(
      JSON.stringify({
        name,
        error: '高德POI拒绝请求',
        code: String(data.infocode).replace(/[^0-9]/g, ''),
      }),
    );
    break;
  }
  const pois = (data.pois || []).map((p) => {
    const gcj = typeof p.location === 'string' ? p.location.split(',').map(Number) : [];
    const coordinates = gcj.length === 2 && gcj.every(Number.isFinite) ? toWgs(gcj) : null;
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      adcode: p.adcode,
      adname: p.adname,
      type: p.type,
      sourceCoordinatesGcj02: gcj,
      coordinates,
      insideAnduo: coordinates ? booleanPointInPolygon(point(coordinates), county) : false,
    };
  });
  const result = { query: name, count: data.count, pois };
  results.push(result);
  console.log(JSON.stringify(result));
  await new Promise((resolve) => setTimeout(resolve, 400));
}
await fs.writeFile(
  '/tmp/anduo-temple-pois.json',
  JSON.stringify({ queriedAt: new Date().toISOString(), results }, null, 2),
);
