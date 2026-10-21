import { categories } from './tasks';
import { roadClasses } from './roadClasses.mjs';

export const referenceLayers = [
  ...roadClasses.map((road) => ({ ...road, name: `${road.name}（区域参考）` })),
  { key: 'railways', name: '铁路（区域参考）', color: '#ffffff' },
  { key: 'countySeats', name: '县城参考定位', color: '#ff9870' },
  { key: 'neighborCounties', name: '周边县级行政区', color: '#a8b7d4' },
] as const;

export const mapLayers = [...categories, ...referenceLayers];
