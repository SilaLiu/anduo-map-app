import type { Feature, Geometry } from 'geojson';
import { cleanBundledBoundaries, collection } from './geo';

export interface BoundaryRepair {
  adcode: string;
  originalGeometry: Geometry;
  geometry: Geometry;
}

export function repairBoundaries(
  features: Feature[],
  repairs: BoundaryRepair[],
): { features: Feature[]; repaired: number } {
  const known = new Map(repairs.map((r) => [r.adcode, r]));
  let repaired = 0;
  const result = features.map((feature) => {
    const p = feature.properties || {};
    const repair = known.get(String(p.adcode || p.id || ''));
    if (
      !repair ||
      p.source !== 'OpenStreetMap' ||
      p.level !== 'town' ||
      (p.admin?.county || p.county) !== '安多县'
    )
      return feature;
    const original: Feature = { ...feature, geometry: repair.originalGeometry };
    const cleaned = cleanBundledBoundaries(collection([original])).features[0];
    const geometry = JSON.stringify(feature.geometry);
    // Match both historical loaders; edited geometries must remain untouched.
    if (
      geometry !== JSON.stringify(repair.originalGeometry) &&
      geometry !== JSON.stringify(cleaned?.geometry)
    )
      return feature;
    repaired++;
    return {
      ...feature,
      geometry: repair.geometry,
      properties: { ...p, geometry_revision: 2 },
    };
  });
  return { features: result, repaired };
}
