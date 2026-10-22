import { booleanPointInPolygon, featureCollection, union } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';

const highlighted = new Set(['玛曲乡', '雁石坪镇', '多玛乡', '玛荣乡']);

// Union/interpolation can move a boundary midpoint a few floating-point bits
// outside its source polygon. Test against source segments with a tiny angular
// tolerance (~0.1 mm), rather than relying on exact point-in-polygon arithmetic.
function onSegment(point: Position, a: Position, b: Position) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const squared = dx * dx + dy * dy;
  if (!squared) return Math.hypot(point[0] - a[0], point[1] - a[1]) <= 1e-9;
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / squared));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy) <= 1e-9;
}

// Dissolving all town polygons removes internal borders. Select only exterior
// segments belonging to the requested towns; never dash their entire rings.
export function townOuterEdges(features: Feature[]): Position[][] {
  const towns = features.filter((f): f is Feature<Polygon | MultiPolygon> =>
    f.properties?.level === 'town' && ['Polygon', 'MultiPolygon'].includes(f.geometry.type));
  const selected = towns.filter((f) => highlighted.has(String(f.properties?.name)));
  if (!selected.length) return [];
  const merged = towns.length === 1 ? towns[0] : union(featureCollection(towns));
  if (!merged) return [];
  const polygons = merged.geometry.type === 'Polygon'
    ? [merged.geometry.coordinates] : merged.geometry.coordinates;
  const result: Position[][] = [];
  const vertices = selected.flatMap((town) => town.geometry.type === 'Polygon'
    ? town.geometry.coordinates.flat() : town.geometry.coordinates.flat(2));
  const selectedRings = selected.flatMap((town) => town.geometry.type === 'Polygon'
    ? town.geometry.coordinates : town.geometry.coordinates.flat());
  for (const polygon of polygons) {
    let run: Position[] = [];
    const ring: Position[] = [];
    for (let i = 1; i < polygon[0].length; i++) {
      const a = polygon[0][i - 1], b = polygon[0][i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const splits = vertices.map((p) => ({ p, t: ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length }))
        .filter(({ p, t }) => t > 0 && t < 1 && Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) < 1e-12)
        .sort((x, y) => x.t - y.t);
      ring.push(a, ...splits.filter((s, j) => j === 0 || s.t !== splits[j - 1].t).map((s) => s.p));
    }
    ring.push(polygon[0][polygon[0].length - 1]);
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (selectedRings.some((ring) => ring.slice(1).some((p, j) => onSegment(middle, ring[j], p))) ||
          selected.some((town) => booleanPointInPolygon(middle, town))) {
        if (!run.length) run.push(a);
        run.push(b);
      } else if (run.length) {
        result.push(run);
        run = [];
      }
    }
    if (run.length) result.push(run);
  }
  return result;
}