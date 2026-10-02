import type { Annotation, Category, Layers, Requirements, Task, TaskSection } from '../types';

export const categories = [
  { key: 'towns', category: 'town', name: '乡镇驻地', color: '#ffcf5a' },
  { key: 'villages', category: 'village', name: '行政村', color: '#66e3bd' },
  { key: 'roads', category: 'road', name: '道路 / 铁路', color: '#ffd580' },
  { key: 'rivers', category: 'river', name: '河流', color: '#54baff' },
  { key: 'lakes', category: 'lake', name: '湖泊', color: '#299edb' },
  { key: 'mountains', category: 'mountain', name: '山峰', color: '#e4e7ee' },
  { key: 'temples', category: 'temple', name: '寺庙', color: '#ef93bc' },
] as const;
export const statusLabels = {
  annotated: '已标注',
  located: '已定位',
  estimated: '待核实',
  missing: '待补充',
};
export type MissingItem = { category: string; name: string; town?: string; reason?: string };

export function buildTasks(
  req: Requirements | null,
  layers: Layers,
  annotations: Annotation[],
  missing: MissingItem[],
): TaskSection[] {
  if (!req) return [];
  const make = (category: Category, name: string, town = '', note = ''): Task => {
    const key = `${category}:${town}:${name}`;
    const annotation = annotations.find((a) => a.properties.sandtableKey === key);
    const file = categories.find((c) => c.category === category)?.key;
    const feature = file
      ? layers[file]?.features.find(
          (f) => f.properties?.name === name && (!town || f.properties?.town === town),
        )
      : undefined;
    return {
      key,
      category,
      town,
      name,
      label: name.startsWith('#') ? `未知行政村 ${name.slice(1)}` : name,
      drawType: ['road', 'river'].includes(category)
        ? 'line'
        : ['building', 'lake'].includes(category)
          ? 'polygon'
          : 'point',
      note,
      annotation,
      feature,
      status: annotation
        ? 'annotated'
        : feature
          ? feature.properties?.needs_review
            ? 'estimated'
            : 'located'
          : 'missing',
      reason: missing.find(
        (m) => m.category === category && m.name === name && (!town || m.town === town),
      )?.reason,
    };
  };
  return [
    {
      key: 'county',
      label: '县级要素',
      items: [
        make('building', '县政府大楼', req.county?.county_seat?.town || '', '政府大楼、灯光与标牌'),
      ],
    },
    {
      key: 'town',
      label: '乡镇驻地',
      items: req.towns.map((t) => make('town', t.name, '', `${t.type} · 政府大楼与标牌`)),
    },
    ...req.towns.map((t) => ({
      key: `village:${t.name}`,
      label: `${t.name} · 行政村`,
      items: [
        ...t.villages_known.map((v) => make('village', v, t.name)),
        ...Array.from({ length: t.villages_unknown || 0 }, (_, i) =>
          make('village', `#${i + 1}`, t.name),
        ),
      ],
    })),
    {
      key: 'road',
      label: '道路 / 铁路',
      items: req.roads.map((r) =>
        make('road', r.name, '', [r.category, r.light_color].filter(Boolean).join(' · ')),
      ),
    },
    {
      key: 'river',
      label: '河流',
      items: req.rivers.map((r) => make('river', r.name, '', r.section || '')),
    },
    { key: 'lake', label: '湖泊', items: req.lakes.map((r) => make('lake', r.name)) },
    {
      key: 'mountain',
      label: '山峰',
      items: req.mountains.map((r) =>
        make('mountain', r.name, '', r.elevation_m ? `${r.elevation_m} m` : ''),
      ),
    },
    { key: 'temple', label: '寺庙', items: req.temples.map((r) => make('temple', r.name)) },
  ];
}
