import { pointOnFeature } from '@turf/turf';
import type { Feature } from 'geojson';

const labels: Record<string, string> = {
  building: '建筑',
  town: '乡镇',
  village: '行政村',
  road: '道路',
  river: '河流',
  lake: '湖泊',
  mountain: '山峰',
  temple: '寺庙',
  county: '县',
  residential: '住宅',
  commercial: '商业建筑',
  industrial: '工业建筑',
  public: '公共建筑',
  other: '其他建筑',
  motorway: '高速公路',
  primary: '主干道',
  secondary: '次干道',
  path: '小路',
  asphalt: '沥青',
  concrete: '水泥',
  gravel: '碎石',
  dirt: '土路',
};

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function featureDetails(feature: Feature): { label: string; value: string }[] {
  const p = feature.properties || {};
  const tags = p.tags || {};
  const admin = p.admin || p;
  const address =
    p.address ||
    tags['addr:full'] ||
    [tags['addr:city'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const category = text(p.buildingType || p.category || p.level || tags.building);
  const coordinates = pointOnFeature(feature).geometry.coordinates;
  const rows = [
    { label: '类型', value: labels[category] || category },
    {
      label: '行政归属',
      value: [admin.province, admin.county, admin.town, admin.village, admin.region]
        .filter(Boolean)
        .join(' / '),
    },
    { label: '地址', value: text(address) },
    { label: '简介', value: text(p.description || tags.description) },
    { label: '备注', value: text(p.note) },
    { label: '楼层', value: text(p.floors || tags['building:levels']) },
    { label: '道路等级', value: labels[text(p.roadClass)] || text(p.roadClass) },
    { label: '车道数', value: text(p.lanes) },
    { label: '路面', value: labels[text(p.surface)] || text(p.surface) },
    { label: '海拔', value: p.elevation_m ? `${p.elevation_m} 米` : text(tags.ele) },
    { label: '电话', value: text(p.phone || tags.phone || tags['contact:phone']) },
    { label: '开放时间', value: text(p.opening_hours || tags.opening_hours) },
    { label: '来源', value: text(p.source) },
    { label: '坐标', value: `${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}` },
  ];
  return rows.filter((row) => row.value);
}

export function featureSpeechText(feature: Feature): string {
  const name = text(feature.properties?.name) || '未命名要素';
  const rows = featureDetails(feature);
  const details = rows
    .filter((row) => row.label !== '来源' && row.label !== '坐标')
    .map((row) => {
      if (row.label === '类型') return `类型是${row.value}`;
      if (row.label === '行政归属') return `行政归属为${row.value.replaceAll(' / ', '，')}`;
      if (row.label === '地址') return `地址是${row.value}`;
      if (row.label === '简介') return `简介，${row.value}`;
      if (row.label === '备注') return `备注，${row.value}`;
      if (row.label === '楼层') return `楼层为${row.value}层`;
      if (row.label === '道路等级') return `道路等级为${row.value}`;
      if (row.label === '车道数') return `车道数为${row.value}`;
      if (row.label === '路面') return `路面为${row.value}`;
      if (row.label === '海拔') return `海拔约${row.value}`;
      if (row.label === '电话') return `联系电话是${row.value}`;
      if (row.label === '开放时间') return `开放时间是${row.value}`;
      return `${row.label}为${row.value}`;
    });
  if (feature.properties?.needs_review) details.push('位置待核实');
  return [name, ...details].join('。');
}
