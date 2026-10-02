import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import {
  assignAdmin,
  cleanBundledBoundaries,
  collection,
  mergeBoundaries,
  normalizeGeometry,
  parseFeatures,
  toAnnotation,
} from '../../src/web/domain/geo';
import { buildTasks } from '../../src/web/domain/tasks';
import type { Requirements } from '../../src/web/types';
import { osmFeatures } from '../../src/web/services/extraction';
import {
  getTilesForBbox,
  tileBounds,
  lngLatToPixel,
  pixelToLngLat,
} from '../../src/renderer/utils/geo.js';

const boundary: Feature<Polygon> = {
  type: 'Feature',
  properties: { name: '测试镇', level: 'town', county: '安多县', source: 'Voronoi-AMap' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [90, 30],
        [92, 30],
        [92, 32],
        [90, 32],
        [90, 30],
      ],
      [
        [90.2, 30.2],
        [90.8, 30.2],
        [90.8, 30.8],
        [90.2, 30.8],
        [90.2, 30.2],
      ],
    ],
  },
};
function point(lng: number, lat: number) {
  return toAnnotation({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lng, lat] },
  });
}

describe('workspace migration and GeoJSON contracts', () => {
  it('preserves task linkage and road metadata from desktop arrays through export and import', () => {
    const old = [
      {
        id: 'old-1',
        type: 'line',
        coordinates: [
          [91, 31],
          [91.1, 31.1],
        ],
        name: '国道',
        sandtableKey: 'road::国道',
        lanes: 2,
        surface: 'asphalt',
        admin: { town: '测试镇' },
      },
    ];
    const migrated = parseFeatures(old).map((f) => toAnnotation(f, true));
    const roundtrip = parseFeatures(JSON.parse(JSON.stringify(collection(migrated)))).map((f) =>
      toAnnotation(f, true),
    );
    expect(roundtrip[0].id).toBe('old-1');
    expect(roundtrip[0].properties).toMatchObject({
      sandtableKey: 'road::国道',
      lanes: 2,
      surface: 'asphalt',
      admin: { town: '测试镇' },
    });
  });
  it('closes polygon rings without losing holes or mutating the source', () => {
    const raw = {
      type: 'Polygon',
      coordinates: [
        [
          [90, 30],
          [92, 30],
          [92, 32],
        ],
        [
          [91, 30.2],
          [91.2, 30.2],
          [91.2, 30.3],
        ],
      ],
    };
    const result = normalizeGeometry(raw) as Polygon;
    expect(result.coordinates).toHaveLength(2);
    expect(result.coordinates.every((r) => r.length === 4)).toBe(true);
    expect(raw.coordinates[0]).toHaveLength(3);
  });
  it('rejects a whole import when any geometry is invalid', () => {
    expect(() =>
      parseFeatures(
        collection([
          point(91, 31),
          { type: 'Feature', geometry: { type: 'Point', coordinates: [191, 31] }, properties: {} },
        ]),
      ),
    ).toThrow('第 2 个要素');
  });
  it('retains MultiPolygon and all rings on roundtrip', () => {
    const geom = {
      type: 'MultiPolygon',
      coordinates: [
        boundary.geometry.coordinates,
        [
          [
            [93, 31],
            [94, 31],
            [94, 32],
            [93, 31],
          ],
        ],
      ],
    };
    const f = toAnnotation({
      type: 'Feature',
      properties: { custom: 'kept' },
      geometry: normalizeGeometry(geom),
    });
    expect(parseFeatures(collection([f]))[0].geometry).toEqual(geom);
    expect(f.properties.custom).toBe('kept');
  });
});
describe('administrative assignment', () => {
  it('cleans collapsed bundled islands without changing the original valid polygon', () => {
    const f: Feature = {
      ...boundary,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          boundary.geometry.coordinates,
          [
            [
              [90, 30],
              [90, 30],
              [90, 30],
            ],
          ],
        ],
      },
    };
    const result = cleanBundledBoundaries(collection([f]));
    expect(result.removed).toBe(1);
    expect(result.features[0].geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [boundary.geometry.coordinates],
    });
    expect((f.geometry as { coordinates: unknown[] }).coordinates).toHaveLength(2);
  });
  it('respects polygon holes and marks estimated boundary attribution', () => {
    expect(assignAdmin(point(90.5, 30.5), [boundary]).properties.admin.town).toBe('');
    expect(assignAdmin(point(91, 31), [boundary]).properties).toMatchObject({
      admin: { town: '测试镇', county: '安多县' },
      adminEstimated: true,
    });
  });
  it('merges boundaries without duplicates and rejects non-area input', () => {
    expect(mergeBoundaries([boundary], [boundary])).toHaveLength(1);
    expect(() => mergeBoundaries([], [point(91, 31)])).toThrow('面');
  });
});
describe('task identities', () => {
  it('keeps same-named villages separate and resolves manual completion', () => {
    const req: Requirements = {
      towns: [
        { name: '甲镇', type: '镇', villages_known: ['同名村'], villages_unknown: 1 },
        { name: '乙镇', type: '镇', villages_known: ['同名村'], villages_unknown: 0 },
      ],
      roads: [],
      rivers: [],
      lakes: [],
      mountains: [],
      temples: [],
    };
    const located = point(91, 31);
    located.properties = { ...located.properties, name: '同名村', town: '乙镇' };
    const anno = point(91, 31);
    anno.properties.sandtableKey = 'village:甲镇:#1';
    const tasks = buildTasks(req, { villages: collection([located]) }, [anno], []).flatMap(
      (s) => s.items,
    );
    expect(tasks.find((t) => t.key === 'village:甲镇:同名村')?.status).toBe('missing');
    expect(tasks.find((t) => t.key === 'village:乙镇:同名村')?.status).toBe('located');
    expect(tasks.find((t) => t.key === 'village:甲镇:#1')?.status).toBe('annotated');
  });
});
describe('extraction geography', () => {
  it('keeps rivers as lines, filters requested categories and excludes outside ways', () => {
    const results = osmFeatures(
      [
        {
          type: 'way',
          id: 1,
          tags: { waterway: 'river' },
          geometry: [
            { lon: 91, lat: 31 },
            { lon: 91.5, lat: 31.5 },
          ],
        },
        {
          type: 'way',
          id: 2,
          tags: { landuse: 'farmland' },
          geometry: [
            { lon: 91, lat: 31 },
            { lon: 91.5, lat: 31 },
            { lon: 91.5, lat: 31.5 },
          ],
        },
        {
          type: 'way',
          id: 3,
          tags: { waterway: 'river' },
          geometry: [
            { lon: 95, lat: 35 },
            { lon: 96, lat: 36 },
          ],
        },
      ],
      ['water'],
      boundary,
    );
    expect(results).toHaveLength(1);
    expect(results[0].geometry.type).toBe('LineString');
  });
  it('maps raster pixels using full tile bounds and Web Mercator latitude', () => {
    const tiles = getTilesForBbox(
      { minLng: 91.68, maxLng: 91.681, minLat: 32.26, maxLat: 32.261 },
      16,
    );
    const bounds = tileBounds(tiles);
    const point = [91.6805, 32.2605];
    const pixel = lngLatToPixel(point[0], point[1], bounds, 1024, 1024);
    const result = pixelToLngLat(pixel[0], pixel[1], bounds, 1024, 1024);
    expect(result[0]).toBeCloseTo(point[0], 4);
    expect(result[1]).toBeCloseTo(point[1], 4);
    expect(bounds.minLng).toBeLessThanOrEqual(91.68);
    expect(bounds.maxLat).toBeGreaterThanOrEqual(32.261);
  });
  it('rejects oversized tile requests rather than silently truncating coverage', () => {
    expect(() => getTilesForBbox({ minLng: 90, maxLng: 92, minLat: 31, maxLat: 33 }, 18)).toThrow(
      '范围过大',
    );
  });
});
