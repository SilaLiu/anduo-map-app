import { booleanIntersects } from '@turf/turf';
import type { Feature } from 'geojson';
export { isAnduoBoundary, anduoBoundaries } from './anduoBoundary.mjs';

export function isAnduoFeature(feature: Feature, boundaries: Feature[]): boolean {
  const county = feature.properties?.admin?.county || feature.properties?.county;
  if (county) return county === '安多县';
  // Town boundaries extend beyond the county outline from the other source.
  return boundaries.some((boundary) => booleanIntersects(feature, boundary));
}
