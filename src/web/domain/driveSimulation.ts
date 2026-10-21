import { distance } from '@turf/turf';
import type { Position } from 'geojson';

export function buildDriveTrack(points: Position[]) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  }
  const total = cumulative[cumulative.length - 1];
  return {
    total,
    at(progress: number): Position | null {
      if (!points.length) return null;
      if (progress >= 1) return points[points.length - 1].slice(0, 2);
      if (progress <= 0 || total === 0) return points[0].slice(0, 2);
      const target = total * progress;
      let low = 1,
        high = points.length - 1;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (cumulative[mid] < target) low = mid + 1;
        else high = mid;
      }
      const a = points[low - 1],
        b = points[low];
      const span = cumulative[low] - cumulative[low - 1];
      const t = span ? (target - cumulative[low - 1]) / span : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
  };
}
