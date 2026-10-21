export function labelHierarchy(group: string) {
  if (group === 'countySeats') return { size: 18, range: 3000000, priority: 0 };
  if (group === 'towns') return { size: 15, range: 300000, priority: 1 };
  if (group === 'villages') return { size: 12, range: 50000, priority: 4 };
  if (group === 'lakes') return { size: 13, range: 600000, priority: 3 };
  if (group === 'rivers') return { size: 12, range: 100000, priority: 5 };
  if (['highways', 'provincialRoads', 'railways'].includes(group))
    return { size: 13, range: 250000, priority: 2 };
  return { size: 11, range: 40000, priority: 6 };
}

export type LabelBox = { x: number; y: number; width: number; height: number };
export function overlapsLabel(a: LabelBox, b: LabelBox) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
