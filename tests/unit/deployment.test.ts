import { describe, expect, it } from 'vitest';
import {
  defaultDeploymentRows,
  deploymentCount,
  deploymentLabels,
  deploymentSummary,
  nextDeploymentId,
  deploymentMarkerLayout,
  type DeploymentByTown,
} from '../../src/web/domain/deployment';

describe('deployment summary', () => {
  it('allocates IDs after restored rows across towns', () => {
    expect(nextDeploymentId({ 帕那镇: defaultDeploymentRows(), 岗尼乡: [{ ...defaultDeploymentRows()[0], id: 20 }] })).toBe(21);
    expect(nextDeploymentId({})).toBe(1);
  });

  it('spaces units by name width with a gap and centers the group', () => {
    const rows = defaultDeploymentRows();
    rows[1].name = '名称比较长的乡镇支援连队';
    const layout = deploymentMarkerLayout(rows);
    expect(layout.items[1].width).toBeGreaterThan(layout.items[0].width);
    for (let i = 1; i < layout.items.length; i++) {
      const previous = layout.items[i - 1];
      const current = layout.items[i];
      expect(current.x - current.width / 2 - (previous.x + previous.width / 2)).toBe(12);
    }
    const last = layout.items.at(-1)!;
    expect(last.x + last.width / 2).toBe(layout.width);
  });
  it('summarizes the current Pana town deployment rows', () => {
    const rows = defaultDeploymentRows();
    expect(deploymentCount(rows)).toBe(130);
    expect(deploymentSummary(rows)).toBe('帕那镇 · 130人 · 某某连 90人、某某排 30人、某某班 10人');
  });

  it('normalizes invalid or negative counts before updating the map label', () => {
    const rows = defaultDeploymentRows();
    rows[0].count = -4;
    rows[1].count = Number.NaN;
    expect(deploymentCount(rows)).toBe(10);
    expect(deploymentSummary(rows)).toContain('帕那镇 · 10人');
  });

  it('keeps independent labels for multiple towns', () => {
    const deployments: DeploymentByTown = {
      帕那镇: defaultDeploymentRows(),
      扎仁镇: [{ ...defaultDeploymentRows()[0], region: '扎仁镇', name: '支援连', count: 60 }],
    };

    const labels = deploymentLabels(deployments);
    expect(labels['帕那镇']).toContain('帕那镇 · 130人');
    expect(labels['扎仁镇']).toContain('扎仁镇 · 60人');
    expect(labels['扎仁镇']).toContain('支援连 60人');
  });
});