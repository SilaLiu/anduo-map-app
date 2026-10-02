import type { Feature, FeatureCollection } from 'geojson';
import { anduoBoundaries } from '../domain/anduoScope';
import { cleanBundledBoundaries, collection } from '../domain/geo';
import { dataJson } from './storage';

let boundaryData: Promise<Feature[]> | null = null;
export function loadAnduoBoundaryData(): Promise<Feature[]> {
  if (!boundaryData) {
    boundaryData = dataJson<FeatureCollection>('admin-geojson/xizang/anduo/anduo_all_levels.json')
      .then((raw) => cleanBundledBoundaries(collection(anduoBoundaries(raw.features))).features)
      .catch((error) => {
        boundaryData = null;
        throw error;
      });
  }
  return boundaryData;
}
