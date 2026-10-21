export function roadLabelText(group: string, properties: Record<string, unknown>): string {
  if (!['highways', 'provincialRoads', 'countyRoads', 'townshipRoads', 'railways'].includes(group))
    return '';
  const ref = String(properties.ref ?? '').trim();
  const name = String(properties.name ?? '').trim();
  if (group === 'railways') return [name, ref].filter(Boolean).join(' · ');
  return ref;
}
