// Minimal boundary types for the externally loaded JS API; no SDK objects enter Vue reactivity.
export interface AMapEvent {
  lnglat?: { getLng(): number; getLat(): number };
}
export interface AMapOverlay {
  on(name: string, callback: (event: AMapEvent) => void): void;
}
export interface AMapTileLayer {
  show(): void;
  hide(): void;
}
export interface AMapInstance {
  add(items: AMapOverlay[]): void;
  remove(items: AMapOverlay[]): void;
  on(name: string, callback: (event: AMapEvent) => void): void;
  destroy(): void;
  resize(): void;
  setZoomAndCenter(zoom: number, center: number[]): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  setPitch(pitch: number): void;
  setRotation(rotation: number): void;
  setFeatures(features: string[]): void;
  setBounds(bounds: unknown): void;
  lngLatToContainer(position: number[]): { x: number; y: number };
}
type Constructor<T> = new (options: Record<string, unknown>) => T;
export interface AMapAPI {
  TileLayer: {
    Satellite: new () => AMapTileLayer;
    RoadNet: new () => AMapTileLayer;
  };
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapInstance;
  Marker: Constructor<AMapOverlay>;
  Polyline: Constructor<AMapOverlay>;
  Polygon: Constructor<AMapOverlay>;
  Bounds: new (southwest: number[], northeast: number[]) => unknown;
}
declare global {
  interface Window {
    AMap?: AMapAPI;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let pending: Promise<AMapAPI> | undefined;
export function loadAMap(): Promise<AMapAPI> {
  if (pending) return pending;
  pending = (async () => {
    if (!['http:', 'https:'].includes(location.protocol))
      throw new Error('高德 3D 需在联网网页版使用；离线桌面模式请使用现有底图');
    const key = import.meta.env.VITE_AMAP_JS_KEY;
    if (!key) throw new Error('尚未配置 VITE_AMAP_JS_KEY，请配置后重启网页服务');
    let configured = false;
    try {
      const status = await fetch('/api/amap/status', { signal: AbortSignal.timeout(8000) });
      configured = status.ok && !!(await status.json()).configured;
    } catch {
      /* Report a safe, actionable message instead of a raw network error. */
    }
    if (!configured)
      throw new Error('高德安全代理不可用，请配置 AMAP_SECURITY_JSCODE 并启动 pnpm routing');
    // A previously loaded 2.0 SDK cannot be upgraded in place to terrain-capable Beta.
    if (window.AMap) throw new Error('检测到已加载的高德 SDK，请刷新页面以加载卫星地形版本');
    window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
    return new Promise<AMapAPI>((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('高德 JS API 加载失败，请检查网络、Key 类型及域名白名单'));
      };
      const timer = window.setTimeout(fail, 20000);
      script.src = `https://webapi.amap.com/maps?v=2.1Beta&key=${encodeURIComponent(key)}`;
      script.async = true;
      script.onerror = fail;
      script.onload = () => {
        clearTimeout(timer);
        if (window.AMap) resolve(window.AMap);
        else fail();
      };
      document.head.appendChild(script);
    });
  })().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
