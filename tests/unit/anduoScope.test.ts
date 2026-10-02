import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Feature, FeatureCollection } from 'geojson';
import { anduoBoundaries, isAnduoBoundary, isAnduoFeature } from '../../src/web/domain/anduoScope';
import { featureDetails } from '../../src/web/domain/featureDetails';

const source = JSON.parse(
  readFileSync('data/admin-geojson/xizang/anduo/anduo_all_levels.json', 'utf8'),
) as FeatureCollection;
const scoped = anduoBoundaries(source.features);

describe('Anduo data scope', () => {
  it('keeps the county and all 13 towns, excluding the province and other counties', () => {
    expect(scoped).toHaveLength(14);
    expect(scoped.filter((f) => f.properties?.level === 'town')).toHaveLength(13);
    expect(
      scoped.filter((f) => f.properties?.level === 'county').map((f) => f.properties?.name),
    ).toEqual(['安多县']);
    const foreign = {
      ...scoped[0],
      properties: { adcode: '130105', name: '新华区', level: 'county' },
    };
    expect(isAnduoBoundary(foreign)).toBe(false);
    expect(
      isAnduoBoundary({
        ...scoped[0],
        properties: { name: '别处乡镇', county: '其他县', level: 'town' },
      }),
    ).toBe(false);
  });

  it('accepts local points without metadata and all explicitly owned towns', () => {
    const local: Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [91.682, 32.262] },
    };
    expect(isAnduoFeature(local, scoped)).toBe(true);
    expect(
      isAnduoFeature({ ...local, geometry: { type: 'Point', coordinates: [116.4, 39.9] } }, scoped),
    ).toBe(false);
    const towns = JSON.parse(
      readFileSync('data/sandtable-geojson/towns.geojson', 'utf8'),
    ) as FeatureCollection;
    expect(towns.features.every((f) => isAnduoFeature(f, scoped))).toBe(true);
    expect(isAnduoFeature({ ...local, properties: { admin: { county: '其他县' } } }, scoped)).toBe(
      false,
    );
  });

  it('stages only Anduo boundaries and required application data', () => {
    const data = JSON.parse(
      readFileSync('web-data/data/admin-geojson/xizang/anduo/anduo_all_levels.json', 'utf8'),
    ) as FeatureCollection;
    expect(data.features).toHaveLength(14);
    expect(data.features.every(isAnduoBoundary)).toBe(true);
    const library = JSON.parse(readFileSync('web-data/data/web-boundary-library.json', 'utf8')) as {
      path: string;
    }[];
    expect(library).toHaveLength(14);
    expect(library.every((item) => item.path.startsWith('admin-geojson/xizang/anduo/'))).toBe(true);
  });
});

describe('feature information', () => {
  it('shows independent building fields and reads imported OSM tags', () => {
    const feature: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [91.682, 32.262] },
      properties: {
        name: '安多县教学楼',
        category: 'building',
        buildingType: 'public',
        floors: 3,
        admin: { county: '安多县', town: '帕那镇' },
        note: '教学与办公',
        source: '现场核实',
        tags: { 'addr:full': '测试街 1 号', phone: '123456', opening_hours: '09:00-17:00' },
      },
    };
    expect(featureDetails(feature)).toEqual(
      expect.arrayContaining([
        { label: '类型', value: '公共建筑' },
        { label: '楼层', value: '3' },
        { label: '行政归属', value: '安多县 / 帕那镇' },
        { label: '备注', value: '教学与办公' },
        { label: '来源', value: '现场核实' },
        { label: '地址', value: '测试街 1 号' },
        { label: '电话', value: '123456' },
        { label: '开放时间', value: '09:00-17:00' },
      ]),
    );
  });

  it('omits missing information and provides a representative coordinate for areas', () => {
    const details = featureDetails({ ...scoped[0], properties: {} });
    expect(details).toHaveLength(1);
    expect(details[0].label).toBe('坐标');
    expect(details[0].value).toMatch(/^\d+\.\d{6}, \d+\.\d{6}$/);
  });
});
