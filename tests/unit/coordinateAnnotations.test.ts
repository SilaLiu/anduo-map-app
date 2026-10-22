import { expect, it } from 'vitest';
import { coordinateAnnotations, parseCoordinateRows } from '../../src/web/domain/coordinateAnnotations';

it('parses ordered WGS84 rows with Chinese commas, spaces and blank lines', () => {
  expect(parseCoordinateRows('91.682，32.262\n\n91.692 32.272')).toEqual([[91.682, 32.262], [91.692, 32.272]]);
});

it('rejects invalid rows and out-of-range coordinates', () => {
  for (const value of ['', '181,32', '91,91', 'NaN,32', '91,32,4'])
    expect(() => parseCoordinateRows(value)).toThrow();
  expect(() => parseCoordinateRows('91,32\ninvalid')).toThrow('第 2 行');
});

it('creates persisted flag properties, sequential names and unique IDs', () => {
  const rows = coordinateAnnotations('91.682,32.262\n91.692,32.262', '测试', 'line');
  expect(rows.map((f) => f.properties.name)).toEqual(['测试-1', '测试-2', '测试-连线']);
  expect(rows[0].properties.markerStyle).toBe('flag');
  expect(rows[2].geometry).toEqual({ type: 'LineString', coordinates: [[91.682, 32.262], [91.692, 32.262]] });
  expect(new Set(rows.map((f) => f.id)).size).toBe(3);
});

it('closes a region and rejects insufficient, collinear or crossed boundaries', () => {
  const rows = coordinateAnnotations('91,32\n92,32\n92,33', '', 'polygon');
  expect(rows[3].geometry).toEqual({ type: 'Polygon', coordinates: [[[91,32],[92,32],[92,33],[91,32]]] });
  for (const text of ['91,32', '91,32\n91,32\n91,32', '91,32\n92,32\n93,32', '91,32\n92,33\n91,33\n92,32'])
    expect(() => coordinateAnnotations(text, '', 'polygon')).toThrow();
  expect(() => coordinateAnnotations('91,32\n91,32', '', 'line')).toThrow();
});