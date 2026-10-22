<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Feature, Geometry, Position } from 'geojson';
import { pointOnFeature } from '@turf/turf';
import type { Annotation, Layers } from '../types';
import { geometryBounds } from '../domain/geo';
import { mapLayers } from '../domain/referenceLayers';
import { toGcj, toWgs } from '../../../server/routing.mjs';
import {
  loadAMap,
  type AMapAPI,
  type AMapInstance,
  type AMapOverlay,
  type AMapEvent,
  type AMapTileLayer,
} from '../services/amap';

// Source data stays WGS84; convert only at the rendering/event boundary.
const props = defineProps<{
  annotations: Annotation[];
  boundaries: Feature[];
  layers: Layers;
  visibility: Record<string, boolean>;
  mode: '2D' | '3D';
  buildings3d: boolean;
  labels: boolean;
  routeMode: boolean;
  route: Position[];
  vehiclePosition: Position | null;
  preview: Feature[];
  highlight?: Feature;
}>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  select: [feature: Feature, group: string];
  position: [lng: number, lat: number];
  positionClear: [];
  routePoint: [position: Position];
  popupPosition: [position: { x: number; y: number } | null];
}>();
const container = ref<HTMLDivElement>();
const fatal = ref('');
const loading = ref(true);
let api: AMapAPI | undefined;
let map: AMapInstance | undefined;
let observer: ResizeObserver | undefined;
let disposed = false;
let overlays: AMapOverlay[] = [];
let roadNet: AMapTileLayer | undefined;
const gcj = (position: Position) => toGcj([position[0], position[1]]);

function updatePopup() {
  if (!map || !props.highlight) {
    emit('popupPosition', null);
    return;
  }
  const position = pointOnFeature(props.highlight).geometry.coordinates;
  const pixel = map.lngLatToContainer(gcj(position));
  emit('popupPosition', { x: pixel.x, y: pixel.y });
}

function features() {
  if (props.labels) roadNet?.show();
  else roadNet?.hide();
  map?.setFeatures([
    'bg',
    'road',
    ...(props.labels ? ['point'] : []),
    ...(props.buildings3d ? ['building'] : []),
  ]);
}
function click(event: AMapEvent) {
  if (props.routeMode && event.lnglat)
    emit('routePoint', toWgs([event.lnglat.getLng(), event.lnglat.getLat()]));
}
function renderGeometry(geometry: Geometry, color: string, selected: boolean): AMapOverlay[] {
  if (!api) return [];
  const line = (path: Position[]) =>
    new api!.Polyline({
      path: path.map(gcj),
      strokeColor: color,
      strokeWeight: selected ? 5 : 2,
      bubble: true,
    });
  const polygon = (path: Position[][]) =>
    new api!.Polygon({
      path: path.map((ring) => ring.map(gcj)),
      strokeColor: color,
      strokeWeight: selected ? 4 : 2,
      fillColor: color,
      fillOpacity: selected ? 0.12 : 0,
      bubble: true,
    });
  const point = (position: Position) => new api!.Marker({ position: gcj(position), bubble: true });
  switch (geometry.type) {
    case 'Point':
      return [point(geometry.coordinates)];
    case 'MultiPoint':
      return geometry.coordinates.map(point);
    case 'LineString':
      return [line(geometry.coordinates)];
    case 'MultiLineString':
      return geometry.coordinates.map(line);
    case 'Polygon':
      return [polygon(geometry.coordinates)];
    case 'MultiPolygon':
      return geometry.coordinates.map(polygon);
    case 'GeometryCollection':
      return geometry.geometries.flatMap((g) => renderGeometry(g, color, selected));
  }
}
function render() {
  if (!map || !api) return;
  map.remove(overlays);
  overlays = [];
  const groups: { key: string; items: Feature[]; color: string }[] = [
    { key: 'boundaries', items: props.boundaries, color: '#f46c82' },
    ...mapLayers.map((layer) => ({
      key: layer.key,
      items: props.layers[layer.key]?.features || [],
      color: layer.color,
    })),
    { key: 'annotations', items: props.annotations, color: '#e34b62' },
    { key: 'preview', items: props.preview, color: '#4be2cf' },
    { key: 'highlight', items: props.highlight ? [props.highlight] : [], color: '#4be2cf' },
  ];
  for (const group of groups) {
    if (props.visibility[group.key] === false) continue;
    for (const feature of group.items) {
      const items = renderGeometry(feature.geometry, group.color, group.key === 'highlight');
      for (const item of items)
        item.on('click', () => {
          if (!props.routeMode) {
            emit('select', feature, group.key);
          }
        });
      overlays.push(...items);
    }
  }
  if (props.route.length > 1)
    overlays.push(
      ...renderGeometry({ type: 'LineString', coordinates: props.route }, '#28b8fa', true),
    );
  if (props.vehiclePosition)
    overlays.push(
      ...renderGeometry({ type: 'Point', coordinates: props.vehiclePosition }, '#28b8fa', true),
    );
  map.add(overlays);
  updatePopup();
}
function home() {
  map?.setZoomAndCenter(12, toGcj([91.68, 32.26]));
  tilt();
}
function focus(feature: Feature) {
  if (!map || !api) return;
  const [west, south, east, north] = geometryBounds(feature);
  if (east - west < 0.0001 && north - south < 0.0001)
    map.setZoomAndCenter(16, toGcj([west, south]));
  else map.setBounds(new api.Bounds(toGcj([west, south]), toGcj([east, north])));
}
function fitGroup(key: string) {
  const items = props.layers[key]?.features;
  if (items?.length)
    focus({
      type: 'Feature',
      properties: {},
      geometry: { type: 'GeometryCollection', geometries: items.map((f) => f.geometry) },
    });
  else home();
}
function zoom(direction: number) {
  if (map) map.setZoom(map.getZoom() + direction);
}
function north() {
  map?.setRotation(0);
}
function tilt() {
  map?.setPitch(props.mode === '3D' ? 65 : 0);
}
function unsupported() {
  emit('error', '高德模式暂不支持绘制或提取，请切换到卫星影像或街道底图');
}

watch(
  () => [
    props.annotations,
    props.boundaries,
    props.layers,
    props.visibility,
    props.preview,
    props.highlight,
    props.route,
    props.vehiclePosition,
  ],
  render,
  { deep: true },
);
watch(() => [props.labels, props.buildings3d], features);
watch(() => props.mode, tilt);
onMounted(async () => {
  try {
    const loaded = await loadAMap();
    if (disposed || !container.value) return;
    api = loaded;
    roadNet = new api.TileLayer.RoadNet();
    map = new api.Map(container.value, {
      viewMode: '3D',
      terrain: true,
      layers: [new api.TileLayer.Satellite(), roadNet],
      zoom: 12,
      center: toGcj([91.68, 32.26]),
      pitch: props.mode === '3D' ? 65 : 0,
      rotateEnable: true,
      pitchEnable: true,
      showLabel: props.labels,
    });
    map.on('click', click);
    for (const event of ['mapmove', 'zoomchange', 'rotatechange', 'pitchchange'])
      map.on(event, updatePopup);
    map.on('mousemove', (event) => {
      if (!event.lnglat) return;
      const [lng, lat] = toWgs([event.lnglat.getLng(), event.lnglat.getLat()]);
      emit('position', lng, lat);
    });
    features();
    render();
    observer = new ResizeObserver(() => {
      map?.resize();
      updatePopup();
    });
    observer.observe(container.value);
    emit('ready');
  } catch (error) {
    if (!disposed) {
      fatal.value = error instanceof Error ? error.message : '高德地图初始化失败';
      emit('error', fatal.value);
    }
  } finally {
    if (!disposed) loading.value = false;
  }
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  map?.destroy();
  map = undefined;
  roadNet = undefined;
  overlays = [];
  emit('positionClear');
  emit('popupPosition', null);
});
defineExpose({
  fitHomepage: home,
  focus,
  home,
  zoom,
  north,
  tilt,
  fitTemples: () => fitGroup('temples'),
  fitCountyTraffic: () => fitGroup('roads'),
  fitCentralTowns: () => fitGroup('towns'),
  undo: unsupported,
  finish: unsupported,
});
</script>

<template>
  <div
    ref="container"
    class="scene"
    aria-label="高德三维地图"
    @mouseleave="emit('positionClear')"
  ></div>
  <div v-if="loading" class="loading-state">正在加载高德卫星地形…</div>
  <div v-if="fatal" class="scene-error" role="alert">{{ fatal }}。可切回其他底图。</div>
</template>
