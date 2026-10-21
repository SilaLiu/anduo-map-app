import { describe, expect, it } from 'vitest';
import type { Feature } from 'geojson';
import { featureSpeechText } from '../../src/web/domain/featureDetails';
import { templeRoster } from '../../src/web/domain/templeRoster';

it('reads every temple from the same roster used by the table', () => {
  for (const entry of templeRoster) {
    const spoken = featureSpeechText({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [91, 32] },
      properties: { name: entry.name, category: 'temple', note: '旧定位技术说明' },
    });
    expect(spoken).toContain(entry.name);
    for (const value of entry.details.filter((value) => value !== '—'))
      expect(spoken).toContain(value);
    expect(spoken).not.toContain('旧定位技术说明');
    expect(spoken).not.toContain('—');
  }
});

it('omits positioning status from temple narration', () => {
  const spoken = featureSpeechText({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [91, 32] },
    properties: {
      name: '雪穷寺',
      category: 'temple',
      village_match_pending: true,
      location_precision: 'village_reference',
      needs_review: true,
    },
  });
  expect(spoken).not.toContain('待核实');
  expect(spoken).not.toContain('参考点');
  expect(spoken).not.toContain('精确位置');
  expect(spoken).toContain('75公里');
});

describe('feature speech text', () => {
  it('uses the same information fields shown in the feature details panel', () => {
    const feature: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [91.682, 32.262] },
      properties: {
        name: '安多县教学楼',
        buildingType: 'public',
        admin: { county: '安多县', town: '帕那镇' },
        note: '教学与办公',
        source: '现场核实',
      },
    };
    const spoken = featureSpeechText(feature);
    expect(spoken).toContain('安多县教学楼');
    expect(spoken).toContain('类型是公共建筑');
    expect(spoken).toContain('行政归属为安多县，帕那镇');
    expect(spoken).toContain('备注，教学与办公');
    expect(spoken).not.toContain('坐标');
    expect(spoken).not.toContain('现场核实');
  });
});
