export const roadClasses = [
  { key: 'highways', name: '国道', prefix: 'G', color: '#ffd580' },
  { key: 'provincialRoads', name: '省道', prefix: 'S', color: '#36c98f' },
  { key: 'countyRoads', name: '县道', prefix: 'X', color: '#54baff' },
  { key: 'townshipRoads', name: '乡道', prefix: 'Y', color: '#d98ae8' },
];

/** Use current route references, never infer administrative rank from highway=* or old_ref. */
export function classifyRoad(tags) {
  if (!tags.highway || typeof tags.ref !== 'string') return undefined;
  const refs = tags.ref
    .toUpperCase()
    .split(/[;；,，]/)
    .map((ref) => ref.trim());
  return roadClasses.find((kind) =>
    refs.some((ref) => new RegExp(`^${kind.prefix}\\d{3,6}$`).test(ref)),
  );
}
