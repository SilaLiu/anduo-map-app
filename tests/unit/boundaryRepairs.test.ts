import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import manifest from '../../data/anduo-boundary-repairs.json';
import { repairBoundaries, type BoundaryRepair } from '../../src/web/domain/boundaryRepairs';
import { cleanBundledBoundaries, collection, parseFeatures } from '../../src/web/domain/geo';

const originals: Feature[] = manifest.repairs.map((r) => ({
  type: 'Feature',
  id: `custom-${r.adcode}`,
  geometry: r.originalGeometry as Geometry,
  properties: {
    adcode: r.adcode,
    name: r.name,
    county: '安多县',
    level: 'town',
    source: 'OpenStreetMap',
    note: 'user note',
  },
}));
const repairs = manifest.repairs as BoundaryRepair[];

describe('known boundary migration', () => {
  it('repairs raw and historical cleaned geometries without losing user metadata', () => {
    for (const input of [originals, cleanBundledBoundaries(collection(originals)).features]) {
      const result = repairBoundaries(input, repairs);
      expect(result.repaired).toBe(13);
      expect(parseFeatures(result.features)).toHaveLength(13);
      result.features.forEach((feature, i) => {
        expect(feature.geometry).toEqual(manifest.repairs[i].geometry);
        expect(feature.id).toBe(originals[i].id);
        expect(feature.properties).toMatchObject({ note: 'user note', geometry_revision: 2 });
      });
      expect(repairBoundaries(result.features, repairs).repaired).toBe(0);
    }
    expect(originals[0].geometry).toEqual(manifest.repairs[0].originalGeometry);
  });

  it('leaves edited geometry and unrelated sources untouched', () => {
    const edited = structuredClone(originals[0]);
    const coordinates = (edited.geometry as { coordinates: number[][][][] }).coordinates;
    coordinates[0][0][1][0] += 0.00001;
    const unrelated = {
      ...originals[1],
      properties: { ...originals[1].properties, source: 'manual' },
    };
    const result = repairBoundaries([edited, unrelated], repairs);
    expect(result.repaired).toBe(0);
    expect(result.features[0]).toBe(edited);
    expect(result.features[1]).toBe(unrelated);
  });
});
