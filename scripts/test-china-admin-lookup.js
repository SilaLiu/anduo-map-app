const fs = require('fs');
const path = require('path');

const mergedPath = path.resolve(__dirname, '../data/admin-geojson/merged/china_all_levels.json');
const data = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));

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

const boundaries = data.features.map(f => ({
  level: f.properties.level,
  admin: {
    province: f.properties.province || '',
    city: f.properties.city || '',
    county: f.properties.county || '',
  },
  geometry: f.geometry,
}));

function getContainingBoundaries(point){
  return boundaries.filter(b => geometryContainsPoint(b.geometry, point));
}

function assignAdmin(point){
  const containing = getContainingBoundaries(point);
  if(!containing.length) return null;
  const levelOrder = ['county', 'city', 'province'];
  const sorted = containing.slice().sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level));
  const merged = { province: '', city: '', county: '' };
  for(const b of sorted){
    if(b.admin.province) merged.province = b.admin.province;
    if(b.admin.city) merged.city = b.admin.city;
    if(b.admin.county) merged.county = b.admin.county;
  }
  const lowest = sorted[0];
  if(lowest && ['county', 'city'].includes(lowest.level)){
    merged.province = lowest.admin.province || merged.province;
  }
  return merged;
}

const cases = [
  { name: '北京市中心', pt: [116.4074, 39.9042], expect: { province: '北京市', city: '', county: '东城区' } },
  { name: '贵阳市中心', pt: [106.7135, 26.5787], expect: { province: '贵州省', city: '贵阳市', county: '云岩区' } },
  { name: '拉萨市中心', pt: [91.1322, 29.6604], expect: { province: '西藏自治区', city: '拉萨市', county: '城关区' } },
  { name: '安多县内部', pt: [91.75, 32.27], expect: { province: '西藏自治区', city: '那曲市', county: '安多县' } },
  { name: '上海外滩', pt: [121.4906, 31.2304], expect: { province: '上海市', city: '', county: '黄浦区' } },
  { name: '广州塔', pt: [113.3245, 23.1065], expect: { province: '广东省', city: '广州市', county: '海珠区' } },
];

let passed = 0, failed = 0;
for(const c of cases){
  const admin = assignAdmin(c.pt);
  const ok = admin && admin.province === c.expect.province && admin.city === c.expect.city && admin.county === c.expect.county;
  if(ok){
    passed++;
    console.log(`✅ ${c.name}: ${admin.province} / ${admin.city} / ${admin.county}`);
  }else{
    failed++;
    console.log(`❌ ${c.name}: got ${admin?.province}/${admin?.city}/${admin?.county}, expected ${c.expect.province}/${c.expect.city}/${c.expect.county}`);
  }
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
