export type DeploymentLevel = '连' | '排' | '班' | '地方民兵';

export type DeploymentRow = {
  id: number;
  level: DeploymentLevel;
  name: string;
  count: number;
  region: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
};

export type DeploymentByTown = Record<string, DeploymentRow[]>;

export function nextDeploymentId(deployments: DeploymentByTown): number {
  return Math.max(0, ...Object.values(deployments).flat().map((row) =>
    Number.isSafeInteger(row.id) ? row.id : 0,
  )) + 1;
}

export function deploymentMarkerLayout(rows: DeploymentRow[]) {
  const widths = rows.map((row) => Math.max(92, Array.from(row.name || '未命名编组')
    .reduce((sum, char) => sum + (/[\u2e80-\u9fff]/.test(char) ? 14 : 9), 0) + 24));
  const width = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, rows.length - 1) * 12;
  let left = 0;
  return {
    width,
    items: rows.map((row, index) => {
      const item = { row, width: widths[index], x: left + widths[index] / 2 };
      left += widths[index] + 12;
      return item;
    }),
  };
}

export const defaultDeploymentRows = (): DeploymentRow[] => [
  { id: 1, level: '连', name: '某某连', count: 90, region: '帕那镇', x: 18, y: 23, anchorX: 31, anchorY: 76 },
  { id: 2, level: '排', name: '某某排', count: 30, region: '帕那镇', x: 50, y: 23, anchorX: 55, anchorY: 68 },
  { id: 3, level: '班', name: '某某班', count: 10, region: '帕那镇', x: 81, y: 23, anchorX: 83, anchorY: 76 },
];

export function deploymentCount(rows: DeploymentRow[]) {
  return rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.count) || 0)), 0);
}

export function deploymentSummary(rows: DeploymentRow[]) {
  const units = rows
    .filter((row) => row.name.trim())
    .map((row) => `${row.name.trim()} ${Math.max(0, Math.floor(Number(row.count) || 0))}人`)
    .join('、');
  return `${rows[0]?.region || '未命名乡镇'} · ${deploymentCount(rows)}人${units ? ` · ${units}` : ''}`;
}

export function defaultDeployments(): DeploymentByTown {
  return { 帕那镇: defaultDeploymentRows() };
}

export function deploymentLabels(deployments: DeploymentByTown): Record<string, string> {
  return Object.fromEntries(Object.entries(deployments).map(([town, rows]) => [
    town,
    deploymentSummary(rows.map((row) => ({ ...row, region: town }))),
  ]));
}