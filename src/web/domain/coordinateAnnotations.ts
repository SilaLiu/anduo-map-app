import { area, kinks } from '@turf/turf';
import type { Position } from 'geojson';
import { toAnnotation } from './geo';

export type CoordinateShape = 'points' | 'line' | 'polygon';

export function parseCoordinateRows(text: string): Position[] {
  const rows = text.trim().split(/\r?\n/).filter((row) => row.trim());
  if (!rows.length) throw new Error('请输入至少一组经纬度');
  if (rows.length > 500) throw new Error('每批最多输入 500 个点');
  return rows.map((row, index) => {
    const match = row.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[,，\s]\s*([+-]?\d+(?:\.\d+)?)$/);
    if (!match) throw new Error(`第 ${index + 1} 行格式错误，请输入“经度,纬度”`);
    const coordinates = [Number(match[1]), Number(match[2])];
    if (Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90)
      throw new Error(`第 ${index + 1} 行经纬度超出有效范围`);
    return coordinates;
  });
}

export function coordinateAnnotations(text: string, name: string, shape: CoordinateShape) {
  const positions = parseCoordinateRows(text);
  const title = name.trim() || '坐标标注';
  const annotations = positions.map((coordinates, index) => toAnnotation({
    type: 'Feature', geometry: { type: 'Point', coordinates },
    properties: { name: `${title}-${index + 1}`, markerStyle: 'flag' },
  }));
  if (shape === 'line') {
    if (new Set(positions.map((p) => p.join(','))).size < 2) throw new Error('连线至少需要两个不同的点');
    annotations.push(toAnnotation({ type: 'Feature', properties: { name: `${title}-连线` },
      geometry: { type: 'LineString', coordinates: positions } }));
  } else if (shape === 'polygon') {
    const polygon = toAnnotation({ type: 'Feature', properties: { name: `${title}-区域` },
      geometry: { type: 'Polygon', coordinates: [positions] } });
    if (polygon.geometry.type !== 'Polygon') throw new Error('区域几何无效');
    if (kinks(polygon.geometry).features.length || area(polygon) < 0.01)
      throw new Error('区域不能交叉或退化为直线，请按边界顺序输入点位');
    annotations.push(polygon);
  }
  return annotations;
}