import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

export type DrawMode = 'point' | 'line' | 'polygon' | 'extract';
export type Category =
  'town' | 'village' | 'road' | 'river' | 'lake' | 'mountain' | 'temple' | 'building';
export type Admin = {
  province: string;
  county: string;
  town: string;
  village: string;
  region: string;
};
export interface AnnotationProperties {
  name: string;
  note: string;
  color: string;
  admin: Admin;
  created_at: string;
  sandtableKey?: string;
  floors?: number | string;
  buildingType?: string;
  roadClass?: string;
  lanes?: number | string;
  surface?: string;
  [key: string]: unknown;
}
export type Annotation = Feature<Geometry, AnnotationProperties> & { id: string };
export interface Workspace {
  version: 2;
  annotations: Annotation[];
  boundaries: Feature[];
}
export interface Requirements {
  county?: { county_seat?: { town?: string } };
  towns: { name: string; type: string; villages_known: string[]; villages_unknown: number }[];
  roads: { name: string; category?: string; light_color?: string }[];
  rivers: { name: string; section?: string }[];
  lakes: { name: string }[];
  mountains: { name: string; elevation_m?: number }[];
  temples: { name: string }[];
}
export interface Task {
  key: string;
  category: Category;
  town: string;
  name: string;
  label: string;
  drawType: Exclude<DrawMode, 'extract'>;
  note: string;
  status: 'annotated' | 'located' | 'estimated' | 'missing';
  feature?: Feature;
  annotation?: Annotation;
  reason?: string;
}
export interface TaskSection {
  key: string;
  label: string;
  items: Task[];
}
export interface LibraryItem {
  path: string;
  name: string;
}
export interface DrawResult {
  mode: DrawMode;
  coordinates: Position[];
}
export type Layers = Record<string, FeatureCollection>;
