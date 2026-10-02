import { area, bbox, booleanIntersects } from '@turf/turf';
import type { Feature, Polygon, Position } from 'geojson';
import { normalizeGeometry, toAnnotation } from '../domain/geo';

export const targets = {
  buildings: '建筑',
  roads: '道路',
  water: '水体',
  vegetation: '植被',
  farmland: '农田',
};
export type Target = keyof typeof targets;
export type Engine = 'overpass' | 'color' | 'onnx';
type Progress = (percent: number, message: string) => void;
interface OsmElement {
  type: string;
  id: number;
  geometry?: { lon: number; lat: number }[];
  tags?: Record<string, string>;
}

export function osmFeatures(
  elements: OsmElement[],
  selected: Target[],
  region: Feature<Polygon>,
): Feature[] {
  const features: Feature[] = [];
  for (const element of elements) {
    const tags = element.tags || {};
    const coordinates = element.geometry?.map((p) => [p.lon, p.lat]);
    if (!coordinates || coordinates.length < 2) continue;
    let target: Target | undefined;
    if (tags.building) target = 'buildings';
    else if (tags.highway) target = 'roads';
    else if (tags.waterway || tags.natural === 'water') target = 'water';
    else if (tags.landuse === 'farmland') target = 'farmland';
    else if (['forest', 'grass'].includes(tags.landuse) || ['wood', 'scrub'].includes(tags.natural))
      target = 'vegetation';
    if (!target || !selected.includes(target)) continue;
    const isLine =
      target === 'roads' || (target === 'water' && !!tags.waterway && tags.area !== 'yes');
    try {
      const geometry = normalizeGeometry(
        isLine
          ? { type: 'LineString', coordinates }
          : { type: 'Polygon', coordinates: [coordinates] },
      );
      const f: Feature = {
        type: 'Feature',
        geometry,
        properties: {
          name: tags.name || targets[target],
          category: target,
          source: 'OpenStreetMap / Overpass',
          osm_id: element.id,
          color: {
            buildings: '#e34b62',
            roads: '#ecac35',
            water: '#2787cd',
            vegetation: '#139c80',
            farmland: '#b59d3d',
          }[target],
          buildingType: tags.building || '',
          floors: tags['building:levels'] || '',
          roadClass: tags.highway || '',
          lanes: tags.lanes || '',
          surface: tags.surface || '',
        },
      };
      if (booleanIntersects(f, region)) features.push(f);
    } catch {
      /* OSM may include incomplete ways; retain only valid geometries. */
    }
  }
  return features;
}

async function overpass(
  region: Feature<Polygon>,
  selected: Target[],
  signal: AbortSignal,
  progress: Progress,
): Promise<Feature[]> {
  const [w, s, e, n] = bbox(region);
  const bounds = `${s},${w},${n},${e}`;
  const filters: Record<Target, string[]> = {
    buildings: ['[building]'],
    roads: ['[highway]'],
    water: ['[natural=water]', '[waterway]'],
    vegetation: ['[landuse=forest]', '[landuse=grass]', '[natural=wood]', '[natural=scrub]'],
    farmland: ['[landuse=farmland]'],
  };
  const query = `[out:json][timeout:25];(${selected.flatMap((t) => filters[t].map((f) => `way${f}(${bounds});`)).join('')});out geom;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastError = '';
  for (const endpoint of endpoints) {
    signal.throwIfAborted();
    progress(20, '正在查询 OpenStreetMap');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error('服务返回了无效数据');
      if (data.remark) throw new Error(`查询未完整完成：${data.remark}`);
      progress(80, '正在解析地物');
      return osmFeatures(data.elements, selected, region);
    } catch (e) {
      signal.throwIfAborted();
      lastError = (e as Error).message;
    }
  }
  throw new Error(`OSM 查询失败：${lastError}`);
}

export async function extract(
  region: Feature,
  engine: Engine,
  selected: Target[],
  signal: AbortSignal,
  progress: Progress,
): Promise<Feature[]> {
  if (region.geometry.type !== 'Polygon') throw new Error('请选择面状提取范围');
  if (!selected.length) throw new Error('至少选择一种地物');
  if (area(region) > 25000000) throw new Error('单次提取范围不能超过 25 平方公里');
  if (engine === 'overpass')
    return overpass(region as Feature<Polygon>, selected, signal, progress);
  const { state, extractionView, SRC } = await import('../../renderer/extraction/context.js');
  // The legacy classifiers are reused through an explicit extraction context, never through map APIs.
  Object.assign(state, {
    extractPolygon: region.geometry.coordinates[0],
    extractionResults: [],
    signal,
  });
  extractionView.zoom = 15;
  if (import.meta.env.VITE_IMAGERY_URL) SRC.satellite.tiles[0] = import.meta.env.VITE_IMAGERY_URL;
  const report = (percent: number, message: string) => {
    signal.throwIfAborted();
    progress(percent, message);
  };
  if (engine === 'color') {
    const { runColorEngine } = await import('../../renderer/extraction/engine-color.js');
    await runColorEngine(selected, report);
  } else {
    const { runONNXEngine } = await import('../../renderer/extraction/engine-onnx.js');
    await runONNXEngine(selected, report);
  }
  signal.throwIfAborted();
  return (
    state.extractionResults as { type: string; coordinates: Position[]; [key: string]: unknown }[]
  ).flatMap((item) => {
    try {
      const f = toAnnotation({
        type: 'Feature',
        properties: { ...item },
        geometry: normalizeGeometry(
          item.type === 'line'
            ? { type: 'LineString', coordinates: item.coordinates }
            : { type: 'Polygon', coordinates: [item.coordinates] },
        ),
      });
      return booleanIntersects(f, region) ? [f] : [];
    } catch {
      return [];
    }
  });
}
