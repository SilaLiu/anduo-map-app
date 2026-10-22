import { describe, expect, it } from 'vitest';
import { defaultDeploymentRows, deploymentMarkerLayout } from '../../src/web/domain/deployment';
import { deploymentMarker } from '../../src/web/domain/deploymentMarker';

describe('shared township deployment callout', () => {
  it('uses a five-point star for local militia and keeps its caption and count', () => {
    const row = { ...defaultDeploymentRows()[0], level: '地方民兵' as const, name: '乡镇民兵', count: 25 };
    const svg = decodeURIComponent(deploymentMarker([row]).image.split(',')[1]);
    expect(svg).toContain('<polygon points=');
    expect(svg.match(/<polygon/g)).toHaveLength(1);
    expect(svg).toContain('乡镇民兵');
    expect(svg).toContain('25人');
    expect(svg).not.toContain('<circle');
  });
  it('places all symbols above one shared leader and captions below it', () => {
    const rows = defaultDeploymentRows();
    const marker = deploymentMarker(rows);
    const svg = decodeURIComponent(marker.image.split(',')[1]);
    const width = deploymentMarkerLayout(rows).width;
    expect(svg).toContain(`M2 56H${width + 12}L${marker.width - 2} ${marker.height - 2}`);
    expect(svg.match(/<text y="79">/g)).toHaveLength(3);
    expect(svg.match(/<text y="100">/g)).toHaveLength(3);
    expect(svg).toContain('90人');
    expect(svg).not.toContain('<rect');
    expect(marker.width - width).toBeGreaterThan(60);
  });

  it('escapes unit names and normalizes counts', () => {
    const row = { ...defaultDeploymentRows()[0], name: '<连>&"', count: -3 };
    const svg = decodeURIComponent(deploymentMarker([row]).image.split(',')[1]);
    expect(svg).toContain('&lt;连&gt;&amp;&quot;');
    expect(svg).toContain('0人');
  });
});