import { expect, it } from 'vitest';
import { townColors, isAnduoCounty } from '../../src/web/domain/townColors';

it('assigns distinct stable colors to all 13 towns', () => {
  expect(Object.keys(townColors)).toHaveLength(13);
  expect(new Set(Object.values(townColors)).size).toBe(13);
});
it('only keeps Anduo county highlighted', () => {
  expect(isAnduoCounty({ level: 'county', adcode: 540624 })).toBe(true);
  expect(isAnduoCounty({ level: 'town', name: '扎仁镇' })).toBe(false);
});
