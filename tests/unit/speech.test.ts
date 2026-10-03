import { describe, expect, it } from 'vitest';
import type { Feature } from 'geojson';
import { featureSpeechText } from '../../src/web/domain/featureDetails';

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
