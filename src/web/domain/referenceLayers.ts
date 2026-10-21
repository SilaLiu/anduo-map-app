import { categories } from './tasks';
import { roadClasses } from './roadClasses.mjs';

export const referenceLayers = [
  ...roadClasses.map((road) => ({ ...road, name: `${road.name}（周边50公里）` })),
  { key: 'railways', name: '铁路（周边50公里）', color: '#ffffff' },
  { key: 'neighborCounties', name: '周边县级行政区', color: '#a8b7d4' },
] as const;

export const mapLayers = [...categories, ...referenceLayers];
