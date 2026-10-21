import { expect, it } from 'vitest';
import { buildDriveTrack } from '../../src/web/domain/driveSimulation';

it('follows route segments by distance and reaches endpoints', () => {
  const track = buildDriveTrack([
    [91, 32],
    [91.01, 32],
    [91.04, 32],
  ]);
  expect(track.at(0)).toEqual([91, 32]);
  expect(track.at(1)).toEqual([91.04, 32]);
  expect(track.at(0.5)![0]).toBeCloseTo(91.02, 5);
  expect(track.at(0.5)![1]).toBe(32);
});
it('handles empty and duplicate points safely', () => {
  expect(buildDriveTrack([]).at(0.5)).toBeNull();
  expect(
    buildDriveTrack([
      [91, 32],
      [91, 32],
    ]).at(0.5),
  ).toEqual([91, 32]);
  expect(
    buildDriveTrack([
      [91, 32],
      [91, 32],
      [92, 32],
    ]).at(0.5)![0],
  ).toBeCloseTo(91.5);
});
