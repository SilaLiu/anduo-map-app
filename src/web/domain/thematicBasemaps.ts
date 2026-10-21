import { mapLayers } from './referenceLayers';

export const thematicBasemaps = [
  { key: 'theme-temples', layer: 'temples', name: '寺庙分布图（安多县）' },
  { key: 'theme-roads', layer: 'roads', name: '道路交通图（安多县）' },
  { key: 'theme-militia', layer: 'militiaDeployment', name: '民兵部署图（安多县）' },
] as const;

export function thematicVisibility(basemap: string, original: Record<string, boolean>) {
  const theme = thematicBasemaps.find((item) => item.key === basemap);
  if (!theme) return original;
  return {
    ...Object.fromEntries(Object.keys(original).map((key) => [key, false])),
    ...Object.fromEntries(mapLayers.map((layer) => [layer.key, layer.key === theme.layer])),
    boundaries: true,
    annotations: false,
    preview: false,
    highlight: false,
  };
}
