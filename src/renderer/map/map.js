// ═══════════════════════════════════════════
//  Map initialization and base layer switching
// ═══════════════════════════════════════════

import { state } from '../state.js';

export const SRC = {
  satellite: {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: '© Esri',
    maxzoom: 20,
  },
  tianditu: {
    type: 'raster',
    tiles: ['https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=YOUR_TIANDITU_KEY'],
    tileSize: 256,
    attribution: '© 天地图',
    maxzoom: 18,
  },
  street: {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '© OSM',
    maxzoom: 20,
  },
};

export let map = null;

export function initMap() {
  map = new window.maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: { b: SRC.satellite },
      layers: [{ id: 'b', type: 'raster', source: 'b' }],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    },
    center: [91.682, 32.262],
    zoom: 14,
    maxZoom: 20,
    attributionControl: true,
    localIdeographFontFamily: "'PingFang SC','Microsoft YaHei','Arial Unicode MS',sans-serif",
  });

  map.addControl(new window.maplibregl.NavigationControl(), 'top-right');
  return map;
}

export function swLayer(layer) {
  if (!map || layer === state.curLayer) return;
  if (layer === 'tianditu' && SRC.tianditu.tiles[0].includes('YOUR_TIANDITU_KEY')) {
    alert('天地图图层需要有效的 Key。请在 map source 配置中替换 YOUR_TIANDITU_KEY。');
    return;
  }

  document.querySelectorAll('#layer-s button').forEach(b => b.classList.remove('on'));
  const btnId = { satellite: 'l-sat', tianditu: 'l-tianditu', street: 'l-street' }[layer];
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add('on');

  if (map.getLayer('b')) map.removeLayer('b');
  if (map.getSource('b')) map.removeSource('b');
  map.addSource('b', SRC[layer]);
  map.addLayer({ id: 'b', type: 'raster', source: 'b' });

  state.curLayer = layer;

  // Re-order overlay layers to top after base layer swap
  bringOverlayLayersToFront();
}

function bringOverlayLayersToFront() {
  if (!map) return;
  const ids = [
    'admin-boundaries-glow-province', 'admin-boundaries-glow-county', 'admin-boundaries-glow-town', 'admin-boundaries-glow-village',
    'admin-boundaries-line-province', 'admin-boundaries-line-county', 'admin-boundaries-line-town', 'admin-boundaries-line-village',
    'admin-boundaries-label-province', 'admin-boundaries-label-county', 'admin-boundaries-label-town', 'admin-boundaries-label-village',
    'admin-highlight-fill', 'admin-highlight-glow', 'admin-highlight-line',
    'annos-point', 'annos-point-label', 'annos-line', 'annos-line-label',
    'annos-polygon-fill', 'annos-polygon-line', 'annos-polygon-label',
    'extract-preview-fill', 'extract-preview-line', 'extract-preview-circle',
  ];
  ids.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); });
}
