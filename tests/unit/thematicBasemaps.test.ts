import { expect, it } from 'vitest';
import { thematicBasemaps, thematicVisibility } from '../../src/web/domain/thematicBasemaps';

it('shows county and township landmarks with temples without enabling deployment or changing preferences', () => {
  const original = { countySeats: false, towns: false, villages: true, temples: false, militiaDeployment: true };
  const result = thematicVisibility('theme-temples', original);
  expect(Object.keys(result).filter((key) => result[key]).sort()).toEqual([
    'boundaries', 'countySeats', 'temples', 'towns',
  ]);
  expect(original).toEqual({ countySeats: false, towns: false, villages: true, temples: false, militiaDeployment: true });
  expect(thematicVisibility('', original)).toBe(original);
});

it('shows existing settlement landmarks in the militia theme without changing preferences', () => {
  const original = { countySeats: false, towns: false, villages: false, temples: true };
  const result = thematicVisibility('theme-militia', original);
  expect(
    Object.keys(result)
      .filter((key) => result[key])
      .sort(),
  ).toEqual(['boundaries', 'countySeats', 'militiaDeployment', 'towns', 'villages']);
  expect(original).toEqual({ countySeats: false, towns: false, villages: false, temples: true });
  expect(thematicVisibility('', original)).toBe(original);
});

it('isolates each thematic map without changing ordinary layer preferences', () => {
  const original = { highways: true, temples: false, annotations: true };
  for (const theme of thematicBasemaps) {
    const result = thematicVisibility(theme.key, original);
    expect(result[theme.layer]).toBe(theme.key !== 'theme-roads');
    expect(result.highways).toBe(theme.key === 'theme-roads');
    expect(result.annotations).toBe(false);
    expect(result.boundaries).toBe(true);
  }
  expect(original).toEqual({ highways: true, temples: false, annotations: true });
  expect(thematicVisibility('satellite', original)).toBe(original);
  expect(thematicVisibility('street', original)).toBe(original);
});

it('shows transport and settlement layers and preserves preferences', () => {
  const original = {
    highways: false,
    provincialRoads: false,
    railways: false,
    temples: true,
    roads: true,
    countyRoads: true,
    countySeats: false,
    towns: false,
    villages: false,
  };
  const result = thematicVisibility('theme-roads', original);
  expect(
    Object.keys(result)
      .filter((key) => result[key])
      .sort(),
  ).toEqual([
    'boundaries',
    'countyRoads',
    'countySeats',
    'highways',
    'lakes',
    'localRoads',
    'provincialRoads',
    'railways',
    'towns',
    'townshipRoads',
    'villages',
  ]);
  expect(thematicVisibility('', original)).toBe(original);
  expect(original.highways).toBe(false);
  expect(original.countySeats).toBe(false);
  expect(original.towns).toBe(false);
  expect(original.villages).toBe(false);
});
