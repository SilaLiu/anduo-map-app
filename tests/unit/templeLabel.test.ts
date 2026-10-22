import { expect, it } from 'vitest';
import { templeRoster } from '../../src/web/domain/templeRoster';
import { templeLabelColor } from '../../src/web/domain/templeLabel';

it('uses red labels for every Gelug temple and purple for Kagyu', () => {
  for (const temple of templeRoster) {
    expect(templeLabelColor(temple.name)).toBe(temple.details[2] === '格鲁派' ? '#d32f2f' : '#7b1fa2');
  }
  expect(templeLabelColor('穷宗寺')).toBe('#7b1fa2');
  expect(templeLabelColor(' 乃母寺 ')).toBe('#d32f2f');
});

it('does not guess the sect of an unknown temple', () => {
  expect(templeLabelColor('未知寺庙')).toBeUndefined();
});