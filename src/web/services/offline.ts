export type OfflineConfig = {
  enabled: boolean;
  error?: string;
  name?: string;
  bounds?: [number, number, number, number];
  basemaps?: Record<string, { url: string; maximumLevel: number; credit: string }>;
  terrain?: string;
};

let pending: Promise<OfflineConfig> | undefined;
export function offlineConfig(): Promise<OfflineConfig> {
  if (location.protocol !== 'anduo:') return Promise.resolve({ enabled: false });
  return pending ||= fetch('/api/offline').then(async (response) => {
    if (!response.ok) throw new Error('无法读取桌面离线配置');
    return response.json() as Promise<OfflineConfig>;
  });
}