import { mapLayers } from './referenceLayers';

export const thematicBasemaps = [
  { key: 'theme-temples', layer: 'temples', name: '寺庙分布图（安多县）' },
  { key: 'theme-roads', layer: 'roads', name: '道路交通图（安多县）' },
  { key: 'theme-militia', layer: 'militiaDeployment', name: '民兵部署图（安多县）' },
] as const;

export function thematicLayerKeys(key: string): string[] {
  if (key === 'theme-temples') return ['temples', 'countySeats', 'towns'];
  if (key === 'theme-militia') return ['militiaDeployment', 'countySeats', 'towns', 'villages'];
  if (key === 'theme-roads')
    return [
      'railways',
      'highways',
      'provincialRoads',
      'countyRoads',
      'townshipRoads',
      'localRoads',
      'lakes',
      'countySeats',
      'towns',
      'villages',
    ];
  const theme = thematicBasemaps.find((item) => item.key === key);
  return theme ? [theme.layer] : [];
}

export function thematicVisibility(basemap: string, original: Record<string, boolean>) {
  const theme = thematicBasemaps.find((item) => item.key === basemap);
  if (!theme) return original;
  return {
    ...Object.fromEntries(Object.keys(original).map((key) => [key, false])),
    ...Object.fromEntries(
      mapLayers.map((layer) => [layer.key, thematicLayerKeys(basemap).includes(layer.key)]),
    ),
    boundaries: true,
    annotations: false,
    preview: false,
    highlight: false,
  };
}
