import { categories } from './tasks';
import { roadClasses } from './roadClasses.mjs';

export const referenceLayers = [
  { key: 'militiaDeployment', name: '民兵部署图（安多县）', color: '#bf8060' },
  ...roadClasses.map((road) => ({ ...road, name: `${road.name}（区域参考）` })),
  { key: 'localRoads', name: '地方连接道路（等级待核实）', color: '#ff8c42' },
  { key: 'railways', name: '铁路（区域参考）', color: '#ffffff' },
  { key: 'countySeats', name: '县城参考定位', color: '#ff9870' },
  { key: 'neighborCounties', name: '周边县级行政区', color: '#a8b7d4' },
] as const;

export const mapLayers = [
  ...categories.map((layer) => ({
    ...layer,
    name:
      layer.key === 'temples'
        ? '寺庙分布图（安多县）'
        : layer.key === 'roads'
          ? '道路交通图（安多县）'
          : layer.name,
  })),
  ...referenceLayers,
];
