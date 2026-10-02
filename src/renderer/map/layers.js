// ═══════════════════════════════════════════
//  Layer definitions and boundary zoom interpolation
// ═══════════════════════════════════════════

import { state, ADMIN_LEVELS } from '../state.js';
import { map } from './map.js';

export function addAnnotationLayers() {
  if (!map) return;

  map.addLayer({
    id: 'annos-point',
    type: 'circle',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'point'],
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#fff',
    },
  });

  map.addLayer({
    id: 'annos-line',
    type: 'line',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'line'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.9 },
  });

  map.addLayer({
    id: 'annos-polygon-fill',
    type: 'fill',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'polygon'],
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
  });

  map.addLayer({
    id: 'annos-polygon-line',
    type: 'line',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'polygon'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 },
  });

  const labelLayout = {
    'text-field': ['get', 'name'],
    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
    'text-allow-overlap': false,
    'text-ignore-placement': false,
  };

  map.addLayer({
    id: 'annos-point-label',
    type: 'symbol',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'point'],
    layout: { ...labelLayout, 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.7] },
    paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.8, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1] },
  });

  map.addLayer({
    id: 'annos-line-label',
    type: 'symbol',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'line'],
    layout: { ...labelLayout, 'text-size': 11, 'symbol-placement': 'line', 'text-anchor': 'center' },
    paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.8, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1] },
  });

  map.addLayer({
    id: 'annos-polygon-label',
    type: 'symbol',
    source: 'annos',
    filter: ['==', ['get', 'type'], 'polygon'],
    layout: { ...labelLayout, 'text-size': 11, 'text-anchor': 'center' },
    paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.8, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 1] },
  });
}

export function ensureBoundaryLayers() {
  if (!map) return;

  const LEVELS = {
    province: {
      minZoom: 4, maxZoom: 10,
      color: '#f87171',
      width: ['interpolate', ['linear'], ['zoom'], 4, 1.5, 6, 2.5, 9, 3.8],
      textSize: ['interpolate', ['linear'], ['zoom'], 4, 10, 6, 12, 9, 14],
    },
    county: {
      minZoom: 7, maxZoom: 14,
      color: '#fbbf24',
      width: ['interpolate', ['linear'], ['zoom'], 7, 1.2, 9, 2, 13, 3],
      textSize: ['interpolate', ['linear'], ['zoom'], 7, 10, 9, 11.5, 13, 13],
    },
    town: {
      minZoom: 10, maxZoom: 17,
      color: '#34d399',
      width: ['interpolate', ['linear'], ['zoom'], 10, 0.8, 12, 1.8, 16, 2.8],
      textSize: ['interpolate', ['linear'], ['zoom'], 10, 9, 12, 10.5, 16, 12],
    },
    village: {
      minZoom: 13, maxZoom: 20,
      color: '#a78bfa',
      width: ['interpolate', ['linear'], ['zoom'], 13, 0.6, 15, 1.2, 19, 1.8],
      textSize: ['interpolate', ['linear'], ['zoom'], 13, 8, 15, 9.5, 19, 11],
    },
  };

  for (const [level, cfg] of Object.entries(LEVELS)) {
    const glowId = `admin-boundaries-glow-${level}`;
    const lineId = `admin-boundaries-line-${level}`;
    const labelId = `admin-boundaries-label-${level}`;
    const fadeIn = cfg.minZoom + 1;
    const fadeOut = cfg.maxZoom - 1;

    if (!map.getLayer(glowId)) {
      map.addLayer({
        id: glowId,
        type: 'line',
        source: 'admin-boundaries',
        filter: ['==', ['get', 'level'], level],
        minzoom: cfg.minZoom,
        maxzoom: cfg.maxZoom,
        paint: {
          'line-color': '#000000',
          'line-width': cfg.width,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], cfg.minZoom, 0, fadeIn, 0.35, fadeOut, 0.35, cfg.maxZoom, 0],
          'line-blur': 3,
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      });
    }

    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: 'admin-boundaries',
        filter: ['==', ['get', 'level'], level],
        minzoom: cfg.minZoom,
        maxzoom: cfg.maxZoom,
        paint: {
          'line-color': cfg.color,
          'line-width': cfg.width,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], cfg.minZoom, 0, fadeIn, 0.92, fadeOut, 0.92, cfg.maxZoom, 0],
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      });
    }

    if (!map.getLayer(labelId)) {
      map.addLayer({
        id: labelId,
        type: 'symbol',
        source: 'admin-boundaries',
        filter: ['==', ['get', 'level'], level],
        minzoom: cfg.minZoom,
        maxzoom: cfg.maxZoom,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': cfg.textSize,
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#fff',
          'text-halo-color': '#000',
          'text-halo-width': 1.5,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], cfg.minZoom, 0, fadeIn, 0.85, fadeOut, 0.85, cfg.maxZoom, 0],
        },
      });
    }
  }

  if (!map.getLayer('admin-highlight-fill')) {
    map.addLayer({
      id: 'admin-highlight-fill',
      type: 'fill',
      source: 'admin-highlight',
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.28 },
    });
  }

  if (!map.getLayer('admin-highlight-glow')) {
    map.addLayer({
      id: 'admin-highlight-glow',
      type: 'line',
      source: 'admin-highlight',
      paint: {
        'line-color': '#1e3a8a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 12, 10, 16, 14],
        'line-opacity': 0.4,
        'line-blur': 6,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    });
  }

  if (!map.getLayer('admin-highlight-line')) {
    map.addLayer({
      id: 'admin-highlight-line',
      type: 'line',
      source: 'admin-highlight',
      paint: {
        'line-color': '#60a5fa',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 8],
        'line-opacity': 1,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    });
  }

  updateBoundaryVisibilityFilters();
}

export function updateBoundaryVisibilityFilters() {
  if (!map) return;
  const target = state.boundaries.find(b => b.key === state.highlightedBoundaryKey);
  for (const level of ADMIN_LEVELS) {
    const lineId = `admin-boundaries-line-${level}`;
    const glowId = `admin-boundaries-glow-${level}`;
    const labelId = `admin-boundaries-label-${level}`;
    if (!map.getLayer(lineId)) continue;
    const filter = (target && target.level === level)
      ? ['all', ['==', ['get', 'level'], level], ['==', ['get', 'key'], state.highlightedBoundaryKey]]
      : ['==', ['get', 'level'], level];
    map.setFilter(lineId, filter);
    if (map.getLayer(glowId)) map.setFilter(glowId, filter);
    if (map.getLayer(labelId)) map.setFilter(labelId, filter);
  }
}

export function addExtractPreviewLayers() {
  if (!map) return;
  if (!map.getSource('extract-preview')) {
    map.addSource('extract-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer('extract-preview-fill')) {
    map.addLayer({
      id: 'extract-preview-fill',
      type: 'fill',
      source: 'extract-preview',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.3 },
    });
  }
  if (!map.getLayer('extract-preview-line')) {
    map.addLayer({
      id: 'extract-preview-line',
      type: 'line',
      source: 'extract-preview',
      paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.8, 'line-dasharray': [6, 3] },
    });
  }
  if (!map.getLayer('extract-preview-circle')) {
    map.addLayer({
      id: 'extract-preview-circle',
      type: 'circle',
      source: 'extract-preview',
      filter: ['==', ['get', 'type'], 'point'],
      paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-opacity': 0.7 },
    });
  }
}

export function bringAnnosToFront() {
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
