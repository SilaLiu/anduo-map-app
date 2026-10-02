import { bbox, booleanPointInPolygon, pointOnFeature, area } from '@turf/turf';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
  Polygon,
  MultiPolygon,
} from 'geojson';
import type { Admin, Annotation, AnnotationProperties, DrawResult } from '../types';

export const emptyAdmin = (): Admin => ({
  province: '',
  county: '',
  town: '',
  village: '',
  region: '',
});
export const collection = (features: Feature[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

function position(value: unknown): asserts value is Position {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !value.every(Number.isFinite) ||
    Math.abs(value[0]) > 180 ||
    Math.abs(value[1]) > 90
  )
    throw new Error('坐标必须是有效的 WGS84 经度、纬度');
}

function line(value: unknown, minimum: number): Position[] {
  if (!Array.isArray(value) || value.length < minimum) throw new Error('几何顶点数量不足');
  value.forEach(position);
  return value.map((p) => [...p]);
}

function ring(value: unknown): Position[] {
  const coords = line(value, 3);
  if (new Set(coords.map((p) => `${p[0]},${p[1]}`)).size < 3)
    throw new Error('面至少需要三个不同的顶点');
  const first = coords[0],
    last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  return coords;
}

export function normalizeGeometry(raw: unknown): Geometry {
  if (!raw || typeof raw !== 'object') throw new Error('缺少 GeoJSON 几何');
  const g = raw as Geometry;
  switch (g.type) {
    case 'Point':
      position(g.coordinates);
      return { type: g.type, coordinates: [...g.coordinates] };
    case 'MultiPoint':
      return { type: g.type, coordinates: line(g.coordinates, 1) };
    case 'LineString':
      return { type: g.type, coordinates: line(g.coordinates, 2) };
    case 'MultiLineString':
      if (!g.coordinates?.length) throw new Error('空的多线几何');
      return { type: g.type, coordinates: g.coordinates.map((c) => line(c, 2)) };
    case 'Polygon':
      if (!g.coordinates?.length) throw new Error('空的面几何');
      return { type: g.type, coordinates: g.coordinates.map(ring) };
    case 'MultiPolygon':
      if (!g.coordinates?.length || g.coordinates.some((p) => !p.length))
        throw new Error('空的多面几何');
      return { type: g.type, coordinates: g.coordinates.map((p) => p.map(ring)) };
    default:
      throw new Error(`暂不支持几何类型：${g.type}`);
  }
}

export function parseFeatures(raw: unknown): Feature[] {
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的 GeoJSON 或旧版数据');
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (item.type === 'Feature') return { ...item, geometry: normalizeGeometry(item.geometry) };
      const geometry =
        item.geometry ||
        (item.type === 'point'
          ? { type: 'Point', coordinates: [item.lng, item.lat] }
          : item.type === 'line'
            ? { type: 'LineString', coordinates: item.coordinates }
            : { type: 'Polygon', coordinates: [item.coordinates] });
      const { geometry: _g, coordinates: _c, lng: _x, lat: _y, ...properties } = item;
      return {
        type: 'Feature',
        id: item.id || item.key,
        geometry: normalizeGeometry(geometry),
        properties,
      };
    });
  }
  const value = raw as FeatureCollection | Feature;
  const features =
    value.type === 'FeatureCollection' ? value.features : value.type === 'Feature' ? [value] : null;
  if (!Array.isArray(features))
    throw new Error('请选择 GeoJSON FeatureCollection、Feature 或旧版 JSON 数组');
  return features.map((f, i) => {
    try {
      return {
        ...f,
        type: 'Feature',
        geometry: normalizeGeometry(f.geometry),
        properties: f.properties || {},
      };
    } catch (e) {
      throw new Error(`第 ${i + 1} 个要素：${(e as Error).message}`);
    }
  });
}

export function toAnnotation(feature: Feature, preserveId = false): Annotation {
  const p = feature.properties || {};
  const admin = emptyAdmin();
  for (const key of Object.keys(admin) as (keyof Admin)[])
    admin[key] = String(p.admin?.[key] || '');
  return {
    type: 'Feature',
    id: preserveId && feature.id ? String(feature.id) : newId(),
    geometry: normalizeGeometry(feature.geometry),
    properties: {
      ...p,
      name: String(p.name || '未命名标注'),
      note: String(p.note || ''),
      color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#e34b62',
      admin,
      created_at: String(p.created_at || new Date().toISOString()),
    } as AnnotationProperties,
  };
}

function newId() {
  return (
    crypto.randomUUID?.() ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('')
  );
}

export function fromDrawing(result: DrawResult): Annotation {
  const { mode, coordinates } = result;
  const geometry =
    mode === 'point'
      ? { type: 'Point', coordinates: coordinates[0] }
      : mode === 'line'
        ? { type: 'LineString', coordinates }
        : { type: 'Polygon', coordinates: [coordinates] };
  return toAnnotation({ type: 'Feature', geometry: normalizeGeometry(geometry), properties: {} });
}

export function geometryBounds(feature: Feature): [number, number, number, number] {
  return bbox(feature) as [number, number, number, number];
}

export function assignAdmin(annotation: Annotation, boundaries: Feature[]): Annotation {
  const anchor = pointOnFeature(annotation);
  const matches = boundaries.filter(
    (b): b is Feature<Polygon | MultiPolygon> =>
      ['Polygon', 'MultiPolygon'].includes(b.geometry.type) &&
      booleanPointInPolygon(anchor, b as Feature<Polygon | MultiPolygon>),
  );
  matches.sort((a, b) => area(b) - area(a));
  const admin = emptyAdmin();
  let estimated = false;
  for (const b of matches) {
    const p = b.properties || {};
    for (const key of Object.keys(admin) as (keyof Admin)[]) {
      const value = p.admin?.[key] || p[key] || (p.level === key ? p.name : '');
      if (value) admin[key] = String(value);
    }
    estimated ||= /voronoi|derived/i.test(String(p.source || p.method)) || !!p.needs_review;
  }
  return {
    ...annotation,
    properties: { ...annotation.properties, admin, adminEstimated: estimated },
  };
}

export function boundaryKey(f: Feature): string {
  const p = f.properties || {};
  return [
    p.level,
    p.adcode || p.id,
    p.admin?.county || p.county,
    p.admin?.town || p.town,
    p.name,
  ].join(':');
}

export function mergeBoundaries(current: Feature[], incoming: Feature[]): Feature[] {
  const map = new Map(current.map((f) => [boundaryKey(f), f]));
  for (const f of incoming) {
    if (!['Polygon', 'MultiPolygon'].includes(f.geometry.type))
      throw new Error('行政边界只支持面或多面几何');
    map.set(boundaryKey(f), f);
  }
  return [...map.values()];
}

// Some bundled OSM MultiPolygons contain collapsed islands. Remove only
// degenerate rings for loading; the original source files remain untouched.
export function cleanBundledBoundaries(raw: FeatureCollection): {
  features: Feature[];
  removed: number;
} {
  let removed = 0;
  const features: Feature[] = [];
  for (const f of raw.features) {
    const g = f.geometry;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const cleaned = polygons.flatMap((polygon) => {
      if (!polygon.length) {
        removed++;
        return [];
      }
      try {
        ring(polygon[0]);
      } catch {
        removed++;
        return [];
      }
      return [
        polygon.filter((r, i) => {
          if (!i) return true;
          try {
            ring(r);
            return true;
          } catch {
            removed++;
            return false;
          }
        }),
      ];
    });
    if (!cleaned.length) continue;
    features.push({
      ...f,
      geometry: normalizeGeometry(
        g.type === 'Polygon'
          ? { type: 'Polygon', coordinates: cleaned[0] }
          : { type: 'MultiPolygon', coordinates: cleaned },
      ),
    });
  }
  return { features, removed };
}
