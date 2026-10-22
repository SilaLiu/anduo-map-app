import { expect, it } from 'vitest';
import { polygon } from '@turf/turf';
import { townOuterEdges } from '../../src/web/domain/townOuterEdges';
import { readFileSync } from 'node:fs';

it('retains every real exterior segment despite floating-point midpoint rounding', () => {
  const data = JSON.parse(readFileSync('data/admin-geojson/xizang/anduo/anduo_all_levels.json', 'utf8'));
  const length = (lines: number[][][]) => lines.reduce((total, line) => total + line.slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0), 0);
  for (const name of ['玛曲乡', '雁石坪镇', '多玛乡', '玛荣乡']) {
    const town = data.features.find((f: { properties: { name: string } }) => f.properties.name === name);
    const exterior = town.geometry.type === 'Polygon' ? [town.geometry.coordinates[0]]
      : town.geometry.coordinates.map((p: number[][][]) => p[0]);
    expect(length(townOuterEdges([town])), name).toBeCloseTo(length(exterior), 8);
  }
});

it('generates exterior callouts from the bundled real administrative geometry', () => {
  const data = JSON.parse(readFileSync('data/admin-geojson/xizang/anduo/anduo_all_levels.json', 'utf8'));
  const lines = townOuterEdges(data.features);
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every((line) => line.length >= 2 && line.every((p) => p.every(Number.isFinite)))).toBe(true);
});

it('highlights only selected exterior edges, not shared town borders', () => {
  const west = polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], { level: 'town', name: '玛曲乡' });
  const east = polygon([[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]], { level: 'town', name: '岗尼乡' });
  const lines = townOuterEdges([west, east]);
  const segments = lines.flatMap((line) => line.slice(1).map((p, i) => [line[i], p]));
  expect(segments.length).toBeGreaterThan(0);
  expect(segments.some(([a, b]) => a[0] === 1 && b[0] === 1)).toBe(false);
  expect(segments.some(([a, b]) => a[0] === 2 || b[0] === 2)).toBe(false);
});

it('does not highlight internal borders between two selected towns', () => {
  const a = polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], { level: 'town', name: '多玛乡' });
  const b = polygon([[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]], { level: 'town', name: '玛荣乡' });
  const lines = townOuterEdges([a, b]);
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.flatMap((line) => line.slice(1).map((p, i) => [line[i], p]))
    .some(([p, q]) => p[0] === 1 && q[0] === 1)).toBe(false);
  expect(townOuterEdges([])).toEqual([]);
});