import { expect, it } from 'vitest';
import { thematicBasemaps, thematicVisibility } from '../../src/web/domain/thematicBasemaps';

it('isolates each thematic map without changing ordinary layer preferences', () => {
  const original = { highways: true, temples: false, annotations: true };
  for (const theme of thematicBasemaps) {
    const result = thematicVisibility(theme.key, original);
    expect(result[theme.layer]).toBe(true);
    expect(result.highways).toBe(false);
    expect(result.annotations).toBe(false);
    expect(result.boundaries).toBe(true);
  }
  expect(original).toEqual({ highways: true, temples: false, annotations: true });
  expect(thematicVisibility('satellite', original)).toBe(original);
  expect(thematicVisibility('street', original)).toBe(original);
});
