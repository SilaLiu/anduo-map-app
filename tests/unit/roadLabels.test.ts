import { expect, it } from 'vitest';
import { roadLabelText } from '../../src/web/domain/roadLabels';

it('uses source road references without inventing numbers', () => {
  expect(roadLabelText('highways', { ref: 'G318' })).toBe('G318');
  expect(roadLabelText('provincialRoads', { ref: 'S301' })).toBe('S301');
  expect(roadLabelText('countyRoads', { ref: 'X001' })).toBe('X001');
  expect(roadLabelText('highways', { name: '未编号道路' })).toBe('');
  expect(roadLabelText('annotations', { ref: 'G109' })).toBe('');
});

it('preserves railway leading zeros and includes its name', () => {
  expect(roadLabelText('railways', { name: '青藏线', ref: '0907' })).toBe('青藏线 · 0907');
  expect(roadLabelText('railways', { name: '青藏线' })).toBe('青藏线');
  expect(roadLabelText('railways', {})).toBe('');
});
