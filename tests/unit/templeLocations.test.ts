import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const data = JSON.parse(
  readFileSync(new URL('../../data/sandtable-geojson/temples.geojson', import.meta.url), 'utf8'),
);

it('provides eight unique temple points without hiding uncertain village matches', () => {
  expect(data.features).toHaveLength(8);
  expect(new Set(data.features.map((f: any) => f.properties.name)).size).toBe(8);
  for (const name of ['雪穷寺', '仲巴寺']) {
    const feature = data.features.find((f: any) => f.properties.name === name);
    expect(feature.geometry.type).toBe('Point');
    expect(feature.geometry.coordinates.every(Number.isFinite)).toBe(true);
    expect(feature.properties.location_precision).toBe('village_reference');
    expect(feature.properties.village_match_pending).toBe(true);
    expect(feature.properties.needs_review).toBe(true);
    expect(feature.properties.note).toContain('非寺庙精确位置');
  }
});
