import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { referenceLayers } from '../../src/web/domain/referenceLayers';
import { isAnduoBoundary } from '../../src/web/domain/anduoScope';
import { classifyRoad } from '../../src/web/domain/roadClasses.mjs';
import { point, pointToLineDistance } from '@turf/turf';
import type { Feature, LineString } from 'geojson';

const read = (name: string): FeatureCollection =>
  JSON.parse(readFileSync(`data/reference/${name}.geojson`, 'utf8'));

describe('regional reference layers', () => {
  it('includes real national road geometry near all six target county seats', () => {
    const names = ['色尼区', '聂荣县', '比如县', '班戈县', '双湖县', '当雄县'];
    const counties = read('neighborCounties').features.filter((f) =>
      names.includes(f.properties?.name),
    );
    expect(counties).toHaveLength(6);
    const roads = read('highways').features as Feature<LineString>[];
    for (const county of counties) {
      const nearest = Math.min(
        ...roads.map((road) => pointToLineDistance(point(county.properties!.center), road)),
      );
      expect(nearest, county.properties!.name).toBeLessThan(2);
    }
    for (const group of ['highways', 'provincialRoads', 'railways']) {
      const ids = read(group).features.map((f) => f.properties?.osm_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('ships nonempty reference layers independently of workspace boundaries', () => {
    for (const layer of referenceLayers) {
      const source = read(layer.key);
      expect(Array.isArray(source.features)).toBe(true);
      if (!['countyRoads', 'townshipRoads'].includes(layer.key))
        expect(source.features.length).toBeGreaterThan(0);
      const staged = JSON.parse(
        readFileSync(`web-data/data/reference/${layer.key}.geojson`, 'utf8'),
      );
      expect(staged).toEqual(source);
    }
    const counties = read('neighborCounties').features;
    expect(counties.every((f) => !isAnduoBoundary(f))).toBe(true);
    expect(new Set(counties.map((f) => f.properties?.adcode)).size).toBe(counties.length);
  });

  it('separates national highways from real railway segments with source attribution', () => {
    for (const [name, type] of [
      ['highways', '国道'],
      ['provincialRoads', '省道'],
      ['railways', '铁路'],
    ]) {
      const features = read(name).features;
      expect(features.length).toBeGreaterThan(3);
      expect(features.every((f) => f.geometry.type === 'LineString')).toBe(true);
      expect(features.every((f) => f.properties?.road_type === type && f.properties?.osm_id)).toBe(
        true,
      );
      expect(features.every((f) => f.properties?.source === 'OpenStreetMap')).toBe(true);
    }
  });

  it('classifies current administrative route numbers without guessing missing ranks', () => {
    for (const [ref, key] of [
      ['G109', 'highways'],
      ['S301', 'provincialRoads'],
      ['X123', 'countyRoads'],
      ['Y001', 'townshipRoads'],
      ['S301; G109', 'highways'],
    ]) {
      expect(classifyRoad({ highway: 'secondary', ref })?.key).toBe(key);
    }
    for (const tags of [
      { highway: 'secondary' },
      { highway: 'tertiary', old_ref: 'S301' },
      { highway: 'track' },
      { highway: 'primary', ref: 'AH42' },
      { railway: 'rail', ref: 'G109' },
    ]) {
      expect(classifyRoad(tags)).toBeUndefined();
    }
  });
});
