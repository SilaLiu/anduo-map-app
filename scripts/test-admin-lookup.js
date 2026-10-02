const fs = require('fs');
const path = require('path');

function loadJSON(p){
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, p), 'utf8'));
}

// ── pointInPolygon (ray casting) ──
function pointInPolygon(point, vs){
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry, point){
  if(!geometry || !point) return false;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some(poly => pointInPolygon(point, poly[0]));
}

function normalizeAdmin(admin){
  return {
    province: (admin && admin.province || '').trim(),
    county: (admin && admin.county || '').trim(),
    town: (admin && admin.town || '').trim(),
    village: (admin && admin.village || '').trim(),
    region: (admin && admin.region || '').trim(),
    boundaryKey: (admin && admin.boundaryKey || '').trim(),
    boundaryLevel: (admin && admin.boundaryLevel || '').trim(),
  };
}

function boundaryToInternal(feat){
  const p = feat.properties;
  return {
    key: `${p.level}_${p.adcode || p.name}`,
    name: p.name,
    level: p.level,
    admin: {
      province: p.province || '',
      county: p.county || '',
      town: p.town || '',
      village: p.village || '',
    },
    geometry: feat.geometry,
  };
}

// 加载安多县全层级边界（省/县/乡）
const anduoData = loadJSON('../data/admin-geojson/xizang/anduo/anduo_all_levels.json');
const boundaries = anduoData.features.map(boundaryToInternal);

// 加载全国省级边界（结构不同，level 是数字 1，需要单独转换）
const nationalData = loadJSON('../data/admin-geojson/national/100000.json');
const provinceBoundaries = nationalData.features.map(f => ({
  key: `province_${f.properties.code}`,
  name: f.properties.name,
  level: 'province',
  admin: { province: f.properties.fullname || f.properties.name, county: '', town: '', village: '' },
  geometry: f.geometry,
}));

// 用全国省级边界替换 anduo_all_levels 里的西藏自治区（可能更精确）
const provinceNames = new Set(provinceBoundaries.map(b => b.admin.province));
boundaries.push(...provinceBoundaries);

function getContainingBoundaries(point){
  return boundaries.filter(b => geometryContainsPoint(b.geometry, point));
}

function assignAdminByGeometry(anno){
  const point = anno.type === 'point' ? [anno.lng, anno.lat] : null;
  if(!point) return anno;
  const containing = getContainingBoundaries(point);
  if(!containing.length) return anno;

  const levelOrder = ['village', 'town', 'county', 'city', 'province'];
  const sorted = containing.slice().sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level));

  const merged = normalizeAdmin({});
  for(const b of sorted){
    if(b.admin.province) merged.province = b.admin.province;
    if(b.admin.county) merged.county = b.admin.county;
    if(b.admin.town) merged.town = b.admin.town;
    if(b.admin.village) merged.village = b.admin.village;
    merged.boundaryKey = b.key;
    merged.boundaryLevel = b.level;
  }

  // 县/乡/村数据更精确，以其 province/county 为准
  const lowest = sorted[0];
  if(lowest && ['village', 'town', 'county'].includes(lowest.level)){
    merged.province = lowest.admin.province || merged.province;
    merged.county = lowest.admin.county || merged.county;
  }

  anno.admin = merged;
  return anno;
}

// ── 测试点 ──
const cases = [
  // 多玛乡 polygon 0 的 bbox 中心，保证在多玛乡内部
  { name: '多玛乡内部', lng: 93.14267605, lat: 33.9554425, expect: { province: '西藏自治区', county: '安多县', town: '多玛乡' } },
  // 北京市中心
  { name: '北京市中心', lng: 116.4074, lat: 39.9042, expect: { province: '北京市', county: '', town: '' } },
  // 贵阳市中心
  { name: '贵阳市中心', lng: 106.7135, lat: 26.5787, expect: { province: '贵州省', county: '', town: '' } },
];

let passed = 0, failed = 0;
for(const c of cases){
  const anno = assignAdminByGeometry({ type: 'point', lng: c.lng, lat: c.lat, admin: {} });
  const admin = anno.admin;
  const ok = admin.province === c.expect.province && admin.county === c.expect.county && admin.town === c.expect.town;
  if(ok){
    passed++;
    console.log(`✅ ${c.name}: ${admin.province} / ${admin.county} / ${admin.town}`);
  }else{
    failed++;
    console.log(`❌ ${c.name}: got ${admin.province}/${admin.county}/${admin.town}, expected ${c.expect.province}/${c.expect.county}/${c.expect.town}`);
  }
}

// 关键回归测试：旧 admin 里有错误省份时应被覆盖
const badAnno = assignAdminByGeometry({ type: 'point', lng: 93.14267605, lat: 33.9554425, admin: { province: '贵州省', county: '安多县', town: '多玛乡' } });
const badOk = badAnno.admin.province === '西藏自治区' && badAnno.admin.county === '安多县' && badAnno.admin.town === '多玛乡';
console.log(badOk ? '✅ 错误旧 province 已被覆盖' : '❌ 错误旧 province 未被覆盖');
if(badOk) passed++; else failed++;

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
