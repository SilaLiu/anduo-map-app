import { expect, it } from 'vitest';
import { flagMarkerImage } from '../../src/web/domain/flagMarker';
import { toAnnotation } from '../../src/web/domain/geo';

it('creates a local SVG with the selected color and rejects injected markup', () => {
  expect(decodeURIComponent(flagMarkerImage('#139c80'))).toContain('fill="#139c80"');
  expect(decodeURIComponent(flagMarkerImage('<script>'))).not.toContain('<script>');
});

it('preserves flag style through annotation import and leaves old points unchanged', () => {
  const feature = {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [91, 32] },
    properties: { markerStyle: 'flag' },
  };
  expect(toAnnotation(feature).properties.markerStyle).toBe('flag');
  expect(toAnnotation({ ...feature, properties: {} }).properties.markerStyle).toBeUndefined();
});
