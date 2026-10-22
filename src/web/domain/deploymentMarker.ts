import { deploymentMarkerLayout, type DeploymentRow } from './deployment';

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
}

// Bottom-right is the geographic anchor. All unit content is above and left
// of it, leaving the township caption beside the anchor unobstructed.
export function deploymentMarker(rows: DeploymentRow[]) {
  const layout = deploymentMarkerLayout(rows);
  const width = layout.width + 74;
  const height = 170;
  const units = layout.items.map(({ row, x }) => {
    const symbol = row.level === '地方民兵'
      ? '<polygon points="18,5 22.2,16.4 34.4,17 24.8,24.8 28.2,36.8 18,29.8 7.8,36.8 11.2,24.8 1.6,17 13.8,16.4" fill="#d32f2f"/>'
      : row.level === '班'
      ? '<path d="M18 5v24M11 14h14M11 43h14"/><circle cx="18" cy="31" r="8"/>'
      : `<path d="M18 5v16L5 37h26L18 21M7 43h22M13 12h10${row.level === '连' ? 'M13 18h10' : ''}"/>`;
    return `<g transform="translate(${x + 2},0)">
      <g transform="translate(-18,3)" fill="none" stroke="#d32f2f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${symbol}</g>
      <g text-anchor="middle" fill="#d32f2f" font-family="sans-serif" font-size="14" font-weight="bold">
        <text y="79">${escapeXml(row.name || '未命名编组')}</text>
        <text y="100">${Math.max(0, Math.floor(Number(row.count) || 0))}人</text>
      </g></g>`;
  }).join('');
  const path = `M2 56H${layout.width + 12}L${width - 2} ${height - 2}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <path d="${path}" fill="none" stroke="#d32f2f" stroke-width="3" stroke-linejoin="round"/>
    ${units}</svg>`;
  return { width, height, image: 'data:image/svg+xml,' + encodeURIComponent(svg) };
}