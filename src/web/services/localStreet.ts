import type { OfflineConfig } from './offline';

let pending: Promise<OfflineConfig | undefined> | undefined;
export function localStreetConfig(): Promise<OfflineConfig | undefined> {
  if (!['http:', 'https:'].includes(location.protocol)) return Promise.resolve(undefined);
  return (pending ||= fetch('./local-map/manifest.json')
    .then(async (response) => {
      if (!response.ok) return undefined;
      const manifest = await response.json();
      if (!manifest.basemaps?.street || !Array.isArray(manifest.bounds)) return undefined;
      return manifest as OfflineConfig;
    })
    .catch(() => undefined));
}
