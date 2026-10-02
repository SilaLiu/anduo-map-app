// ═══════════════════════════════════════════
//  Sand table MapLibre layers
// ═══════════════════════════════════════════

import { map } from '../map/map.js';
import { loadSandTableGeoJSON } from './sandtable-data.js';

const SANDTABLE_SOURCE_ID = 'sandtable';

const CATEGORY_STYLES = {
  town: {
    pointColor: '#ef4444',
    pointRadius: 10,
    pointStroke: 3,
    labelColor: '#fff',
    labelSize: 13,
    glow: true,
  },
  village: {
    pointColor: '#9ca3af',
    pointRadius: 5,
    pointStroke: 1.5,
    labelColor: '#e5e7eb',
    labelSize: 11,
    glow: false,
  },
  road: {
    lineColor: '#facc15',
    lineWidth: 3,
    lineGlow: true,
    labelColor: '#facc15',
    labelSize: 11,
  },
  river: {
    lineColor: '#3b82f6',
    lineWidth: 2.5,
    lineGlow: true,
    labelColor: '#93c5fd',
    labelSize: 11,
  },
  lake: {
    fillColor: '#3b82f6',
    fillOpacity: 0.25,
    lineColor: '#60a5fa',
    lineWidth: 2,
    labelColor: '#bfdbfe',
    labelSize: 12,
  },
  mountain: {
    pointColor: '#a3a3a3',
    pointRadius: 7,
    pointStroke: 2,
    labelColor: '#e5e5e5',
    labelSize: 12,
    glow: false,
  },
  temple: {
    pointColor: '#f59e0b',
    pointRadius: 7,
    pointStroke: 2,
    labelColor: '#fde68a',
    labelSize: 11,
    glow: false,
  },
};

export function ensureSandTableSource() {
  if (!map) return;
  if (!map.getSource(SANDTABLE_SOURCE_ID)) {
    map.addSource(SANDTABLE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
}

export async function addSandTableLayers() {
  if (!map) return;
  ensureSandTableSource();

  const data = await loadSandTableGeoJSON();
  const allFeatures = [];
  for (const fc of Object.values(data)) {
    allFeatures.push(...(fc.features || []));
  }
  map.getSource(SANDTABLE_SOURCE_ID).setData({
    type: 'FeatureCollection',
    features: allFeatures,
  });

  const labelLayout = {
    'text-field': ['get', 'name'],
    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
    'text-allow-overlap': false,
    'text-ignore-placement': false,
  };

  // Point categories
  for (const cat of ['town', 'village', 'mountain', 'temple']) {
    const s = CATEGORY_STYLES[cat];
    const glowId = `sandtable-${cat}-glow`;
    const pointId = `sandtable-${cat}-point`;
    const labelId = `sandtable-${cat}-label`;

    if (s.glow && !map.getLayer(glowId)) {
      map.addLayer({
        id: glowId,
        type: 'circle',
        source: SANDTABLE_SOURCE_ID,
        filter: ['==', ['get', 'category'], cat],
        paint: {
          'circle-radius': s.pointRadius + 4,
          'circle-color': s.pointColor,
          'circle-opacity': 0.35,
          'circle-blur': 1.5,
        },
      });
    }

    if (!map.getLayer(pointId)) {
      map.addLayer({
        id: pointId,
        type: 'circle',
        source: SANDTABLE_SOURCE_ID,
        filter: ['==', ['get', 'category'], cat],
        paint: {
          'circle-radius': s.pointRadius,
          'circle-color': s.pointColor,
          'circle-stroke-width': s.pointStroke,
          'circle-stroke-color': '#fff',
        },
      });
    }

    if (!map.getLayer(labelId)) {
      map.addLayer({
        id: labelId,
        type: 'symbol',
        source: SANDTABLE_SOURCE_ID,
        filter: ['==', ['get', 'category'], cat],
        layout: {
          ...labelLayout,
          'text-size': s.labelSize,
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
        },
        paint: {
          'text-color': s.labelColor,
          'text-halo-color': '#000',
          'text-halo-width': 1.6,
        },
      });
    }
  }

  // Roads
  if (!map.getLayer('sandtable-road-glow')) {
    map.addLayer({
      id: 'sandtable-road-glow',
      type: 'line',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'road'],
      paint: {
        'line-color': CATEGORY_STYLES.road.lineColor,
        'line-width': CATEGORY_STYLES.road.lineWidth + 4,
        'line-opacity': 0.35,
        'line-blur': 3,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    });
  }
  if (!map.getLayer('sandtable-road-line')) {
    map.addLayer({
      id: 'sandtable-road-line',
      type: 'line',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'road'],
      paint: {
        'line-color': CATEGORY_STYLES.road.lineColor,
        'line-width': CATEGORY_STYLES.road.lineWidth,
        'line-opacity': 0.9,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    });
  }
  if (!map.getLayer('sandtable-road-label')) {
    map.addLayer({
      id: 'sandtable-road-label',
      type: 'symbol',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'road'],
      layout: {
        ...labelLayout,
        'text-size': CATEGORY_STYLES.road.labelSize,
        'symbol-placement': 'line',
        'text-anchor': 'center',
      },
      paint: {
        'text-color': CATEGORY_STYLES.road.labelColor,
        'text-halo-color': '#000',
        'text-halo-width': 1.5,
      },
    });
  }

  // Rivers
  if (!map.getLayer('sandtable-river-glow')) {
    map.addLayer({
      id: 'sandtable-river-glow',
      type: 'line',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'river'],
      paint: {
        'line-color': CATEGORY_STYLES.river.lineColor,
        'line-width': CATEGORY_STYLES.river.lineWidth + 3,
        'line-opacity': 0.35,
        'line-blur': 3,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    });
  }
  if (!map.getLayer('sandtable-river-line')) {
    map.addLayer({
      id: 'sandtable-river-line',
      type: 'line',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'river'],
      paint: {
        'line-color': CATEGORY_STYLES.river.lineColor,
        'line-width': CATEGORY_STYLES.river.lineWidth,
        'line-opacity': 0.85,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    });
  }
  if (!map.getLayer('sandtable-river-label')) {
    map.addLayer({
      id: 'sandtable-river-label',
      type: 'symbol',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'river'],
      layout: {
        ...labelLayout,
        'text-size': CATEGORY_STYLES.river.labelSize,
        'symbol-placement': 'line',
        'text-anchor': 'center',
      },
      paint: {
        'text-color': CATEGORY_STYLES.river.labelColor,
        'text-halo-color': '#000',
        'text-halo-width': 1.5,
      },
    });
  }

  // Lakes
  if (!map.getLayer('sandtable-lake-fill')) {
    map.addLayer({
      id: 'sandtable-lake-fill',
      type: 'fill',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'lake'],
      paint: {
        'fill-color': CATEGORY_STYLES.lake.fillColor,
        'fill-opacity': CATEGORY_STYLES.lake.fillOpacity,
      },
    });
  }
  if (!map.getLayer('sandtable-lake-line')) {
    map.addLayer({
      id: 'sandtable-lake-line',
      type: 'line',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'lake'],
      paint: {
        'line-color': CATEGORY_STYLES.lake.lineColor,
        'line-width': CATEGORY_STYLES.lake.lineWidth,
        'line-opacity': 0.9,
      },
    });
  }
  if (!map.getLayer('sandtable-lake-label')) {
    map.addLayer({
      id: 'sandtable-lake-label',
      type: 'symbol',
      source: SANDTABLE_SOURCE_ID,
      filter: ['==', ['get', 'category'], 'lake'],
      layout: {
        ...labelLayout,
        'text-size': CATEGORY_STYLES.lake.labelSize,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': CATEGORY_STYLES.lake.labelColor,
        'text-halo-color': '#000',
        'text-halo-width': 1.6,
      },
    });
  }

  bringSandTableToFront();
}

export function setSandTableCategoryVisible(cat, visible) {
  if (!map) return;
  const ids = [];
  if (cat === 'road' || cat === 'river') {
    ids.push(`sandtable-${cat}-glow`, `sandtable-${cat}-line`, `sandtable-${cat}-label`);
  } else if (cat === 'lake') {
    ids.push('sandtable-lake-fill', 'sandtable-lake-line', 'sandtable-lake-label');
  } else {
    ids.push(`sandtable-${cat}-glow`, `sandtable-${cat}-point`, `sandtable-${cat}-label`);
  }
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}

export function bringSandTableToFront() {
  if (!map) return;
  const ids = [
    'sandtable-town-glow', 'sandtable-town-point', 'sandtable-town-label',
    'sandtable-village-glow', 'sandtable-village-point', 'sandtable-village-label',
    'sandtable-mountain-glow', 'sandtable-mountain-point', 'sandtable-mountain-label',
    'sandtable-temple-glow', 'sandtable-temple-point', 'sandtable-temple-label',
    'sandtable-road-glow', 'sandtable-road-line', 'sandtable-road-label',
    'sandtable-river-glow', 'sandtable-river-line', 'sandtable-river-label',
    'sandtable-lake-fill', 'sandtable-lake-line', 'sandtable-lake-label',
  ];
  ids.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); });
}
