import { expect, it } from 'vitest';
import { labelHierarchy, overlapsLabel } from '../../src/web/domain/labelHierarchy';

it('progressively reveals smaller places with smaller fonts', () => {
  const levels = ['countySeats', 'towns', 'villages'].map(labelHierarchy);
  expect(levels[0].range).toBeGreaterThan(levels[1].range);
  expect(levels[1].range).toBeGreaterThan(levels[2].range);
  expect(levels[0].size).toBeGreaterThan(levels[1].size);
  expect(levels[1].size).toBeGreaterThan(levels[2].size);
  expect(labelHierarchy('rivers').range).toBeLessThan(levels[1].range);
});

it('rejects intersecting text boxes, not separated boxes', () => {
  const box = { x: 0, y: 0, width: 100, height: 20 };
  expect(overlapsLabel(box, { ...box, x: 50 })).toBe(true);
  expect(overlapsLabel(box, { ...box, x: 110 })).toBe(false);
});
