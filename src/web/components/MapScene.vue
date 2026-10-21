<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import {
  Viewer,
  UrlTemplateImageryProvider,
  EllipsoidTerrainProvider,
  CesiumTerrainProvider,
  ColorMaterialProperty,
  PolylineDashMaterialProperty,
  createWorldTerrainAsync,
  Ion,
  Cartesian3,
  Cartographic,
  Cartesian2,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  GeoJsonDataSource,
  Color,
  Entity,
  PointGraphics,
  LabelGraphics,
  HeightReference,
  DistanceDisplayCondition,
  VerticalOrigin,
  ConstantProperty,
  Rectangle,
  PolygonHierarchy,
  SceneMode,
  ConstantPositionProperty,
} from 'cesium';
import type { Feature, FeatureCollection, Position } from 'geojson';
import { geometryBounds, collection } from '../domain/geo';
import { mapLayers } from '../domain/referenceLayers';
import { navigationRouteStyle } from '../domain/routeStyle';
import { pointOnFeature } from '@turf/turf';
import type { Annotation, DrawMode, DrawResult, Layers } from '../types';

const props = defineProps<{
  annotations: Annotation[];
  boundaries: Feature[];
  layers: Layers;
  visibility: Record<string, boolean>;
  basemap: string;
  mode: '3D' | '2D';
  drawMode: DrawMode | null;
  terrain: boolean;
  exaggeration: number;
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
  draw: [result: DrawResult];
  vertices: [count: number];
  position: [lng: number, lat: number, height: number];
  terrainStatus: [status: string];
  routePoint: [position: Position];
}>();
const container = ref<HTMLDivElement>();
const fatal = ref('');
let viewer: Viewer | undefined;
let handler: ScreenSpaceEventHandler | undefined;
let observer: ResizeObserver | undefined;
let vertices: Position[] = [];
let draft: Entity[] = [];
const sources = new Map<string, GeoJsonDataSource>();
const generations = new Map<string, number>();
const featureByEntity = new WeakMap<Entity, { feature: Feature; group: string }>();
let terrainGeneration = 0;
let imageGeneration = 0;
let routeEntity: Entity | undefined;
let vehicleEntity: Entity | undefined;
const vehicleImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="white" stroke="#087c42" stroke-width="3"/><path d="M13 26l3-10h16l3 10v8H13z" fill="#168bf0"/><path d="M18 18h12l2 7H16z" fill="#dff4ff"/><circle cx="17" cy="30" r="2" fill="white"/><circle cx="31" cy="30" r="2" fill="white"/></svg>');
watch(() => props.vehiclePosition, (position) => {
  if (!viewer) return;
  if (!position) {
    if (vehicleEntity) viewer.entities.remove(vehicleEntity);
    vehicleEntity = undefined;
  } else {
    if (!vehicleEntity) vehicleEntity = viewer.entities.add({
      billboard: { image: vehicleImage, width: 40, height: 40,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    vehicleEntity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(position[0], position[1]));
  }
  requestRender();
});

function requestRender() {
  viewer?.scene.requestRender();
}
function updateRoute(points: Position[]) {
  if (!viewer) return;
  if (routeEntity) viewer.entities.remove(routeEntity);
  routeEntity = undefined;
  if (points.length < 2) {
    requestRender();
    return;
  }
  routeEntity = viewer.entities.add({
    polyline: {
      positions: Cartesian3.fromDegreesArray(points.flatMap((p) => [p[0], p[1]])),
      ...navigationRouteStyle(),
    },
  });
  requestRender();
}
async function updateSource(group: string, features: Feature[], color: string) {
  if (!viewer || viewer.isDestroyed()) return;
  const generation = (generations.get(group) || 0) + 1;
  generations.set(group, generation);
  const data = collection(
    features.map((f, index) => {
      const geometry =
        ['boundaries', 'neighborCounties'].includes(group) && f.geometry.type === 'Polygon'
          ? { type: 'MultiLineString' as const, coordinates: f.geometry.coordinates }
          : ['boundaries', 'neighborCounties'].includes(group) && f.geometry.type === 'MultiPolygon'
            ? { type: 'MultiLineString' as const, coordinates: f.geometry.coordinates.flat() }
            : f.geometry;
      return {
        ...f,
        geometry,
        id: `${group}:${index}`,
        properties: { ...f.properties, __index: index },
      };
    }),
  );
  try {
    const source = await GeoJsonDataSource.load(JSON.parse(JSON.stringify(data)), {
      clampToGround: true,
      stroke: Color.fromCssColorString(color),
      strokeWidth: group === 'boundaries' ? 2 : 3,
      fill: Color.fromCssColorString(color).withAlpha(group === 'boundaries' ? 0.025 : 0.26),
      markerColor: Color.fromCssColorString(color),
    });
    if (!viewer || viewer.isDestroyed() || generations.get(group) !== generation) return;
    for (const entity of source.entities.values) {
      const p = entity.properties?.getValue(viewer.clock.currentTime) || {};
      const feature = features[p.__index];
      if (!feature) continue;
      if (group === 'neighborCounties' && !entity.position) {
        const center = pointOnFeature(feature).geometry.coordinates;
        entity.position = new ConstantPositionProperty(
          Cartesian3.fromDegrees(center[0], center[1]),
        );
      }
      if (group !== 'highlight') featureByEntity.set(entity, { feature, group });
      const tint =
        Color.fromCssColorString(
          group === 'annotations' || group === 'preview' ? p.color || color : color,
        ) || Color.WHITE;
      if (entity.billboard) {
        entity.billboard = undefined;
        entity.point = new PointGraphics({
          pixelSize: group === 'highlight' ? 16 : group === 'towns' ? 10 : 7,
          color: tint,
          outlineColor: Color.fromCssColorString('#20292e'),
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(
            0,
            ['towns', 'annotations', 'preview', 'highlight'].includes(group)
              ? Number.POSITIVE_INFINITY
              : 180000,
          ),
        });
      }
      if (entity.position && p.name && group !== 'highlight') {
        entity.label = new LabelGraphics({
          text: String(p.name),
          font: '13px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.7),
          backgroundPadding: new Cartesian2(5, 3),
          pixelOffset: new Cartesian2(0, -15),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(
            0,
            ['towns', 'neighborCounties'].includes(group) ? 2400000 : 180000,
          ),
          show: props.labels,
        });
      }
      if (entity.polyline && ['annotations', 'preview'].includes(group))
        entity.polyline.material = new ColorMaterialProperty(tint);
      if (entity.polyline && group === 'railways') {
        entity.polyline.material = new PolylineDashMaterialProperty({
          color: Color.WHITE,
          gapColor: Color.fromCssColorString('#354052'),
          dashLength: 16,
        });
        entity.polyline.width = new ConstantProperty(4);
      }
      if (entity.polygon && ['annotations', 'preview'].includes(group)) {
        entity.polygon.material = new ColorMaterialProperty(tint.withAlpha(0.5));
        const floors = Number(p.floors);
        if (props.buildings3d && Number.isFinite(floors) && floors > 0) {
          entity.polygon.height = new ConstantProperty(0);
          entity.polygon.heightReference = new ConstantProperty(HeightReference.CLAMP_TO_GROUND);
          entity.polygon.extrudedHeight = new ConstantProperty(floors * 3);
          entity.polygon.extrudedHeightReference = new ConstantProperty(
            HeightReference.RELATIVE_TO_GROUND,
          );
        } else {
          entity.polygon.height = undefined;
          entity.polygon.heightReference = undefined;
          entity.polygon.extrudedHeight = undefined;
          entity.polygon.extrudedHeightReference = undefined;
        }
      }
    }
    if (group === 'towns') {
      source.clustering.enabled = true;
      source.clustering.pixelRange = 26;
      source.clustering.minimumClusterSize = 2;
      source.clustering.clusterEvent.addEventListener((entities, cluster) => {
        cluster.billboard.show = false;
        cluster.point.show = true;
        cluster.point.pixelSize = 16;
        cluster.point.color = Color.fromCssColorString(color);
        cluster.point.outlineColor = Color.BLACK;
        cluster.point.outlineWidth = 1;
        cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        cluster.point.id = entities;
        cluster.label.show = props.labels;
        cluster.label.text = `${entities.length} 处`;
        cluster.label.font = '12px sans-serif';
        cluster.label.showBackground = true;
        cluster.label.pixelOffset = new Cartesian2(0, -20);
        cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        cluster.label.id = entities;
      });
    }
    const old = sources.get(group);
    if (old) viewer.dataSources.remove(old, true);
    source.show = props.visibility[group] !== false;
    sources.set(group, source);
    await viewer.dataSources.add(source);
    requestRender();
  } catch (e) {
    emit('error', `${group} 图层加载失败：${(e as Error).message}`);
  }
}

function setImagery() {
  if (!viewer) return;
  const gen = ++imageGeneration;
  const key = import.meta.env.VITE_TIANDITU_KEY;
  if (props.basemap === 'tianditu' && !key) {
    emit('error', '尚未配置天地图 Key');
    return;
  }
  const url =
    props.basemap === 'street'
      ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : props.basemap === 'tianditu'
        ? `https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${key}`
        : import.meta.env.VITE_IMAGERY_URL ||
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const provider = new UrlTemplateImageryProvider({
    url,
    maximumLevel: 19,
    credit:
      props.basemap === 'street'
        ? '© OpenStreetMap contributors'
        : props.basemap === 'tianditu'
          ? '© 天地图'
          : import.meta.env.VITE_IMAGERY_CREDIT || 'Tiles © Esri, Maxar, Earthstar Geographics',
  });
  let reported = false;
  provider.errorEvent.addEventListener(() => {
    if (!reported && gen === imageGeneration) {
      reported = true;
      emit('error', '部分底图瓦片加载失败，请检查网络或切换底图');
    }
  });
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(provider);
  requestRender();
}

function refreshClustering() {
  sources.forEach((source) => {
    if (!source.clustering.enabled) return;
    source.clustering.pixelRange = 0;
    source.clustering.pixelRange = 26;
  });
  requestRender();
}

async function setTerrain() {
  const generation = ++terrainGeneration;
  if (!viewer) return;
  if (!props.terrain) {
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    emit('terrainStatus', '椭球地表');
    requestRender();
    return;
  }
  emit('terrainStatus', '地形加载中');
  try {
    const url = import.meta.env.VITE_TERRAIN_URL;
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (!url && !token) throw new Error('尚未配置高程数据源');
    if (token) Ion.defaultAccessToken = token;
    const provider = url
      ? await CesiumTerrainProvider.fromUrl(url)
      : await createWorldTerrainAsync();
    if (viewer && !viewer.isDestroyed() && generation === terrainGeneration) {
      viewer.terrainProvider = provider;
      emit('terrainStatus', '真实地形');
      requestRender();
    }
  } catch (e) {
    if (generation !== terrainGeneration) return;
    emit('terrainStatus', '地形不可用 · 椭球地表');
    emit('error', `地形加载失败：${(e as Error).message}`);
  }
}

function pickPosition(screen: Cartesian2): Position | null {
  if (!viewer) return null;
  const ray = viewer.camera.getPickRay(screen);
  const terrainPosition = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
  const cartesian =
    terrainPosition ||
    (!props.terrain
      ? viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid)
      : undefined);
  if (!cartesian) return null;
  const c = Cartographic.fromCartesian(cartesian);
  return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
}

function clearDraft() {
  for (const entity of draft) viewer?.entities.remove(entity);
  draft = [];
  requestRender();
}
function renderDraft() {
  clearDraft();
  if (!viewer || !vertices.length) return;
  const positions = vertices.map((p) => Cartesian3.fromDegrees(p[0], p[1]));
  for (const p of positions)
    draft.push(
      viewer.entities.add({
        position: new ConstantPositionProperty(p),
        point: {
          pixelSize: 8,
          color: Color.WHITE,
          outlineColor: Color.CYAN,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
  if (positions.length > 1)
    draft.push(
      viewer.entities.add({
        polyline: { positions, width: 3, material: Color.CYAN, clampToGround: true },
      }),
    );
  if (positions.length > 2 && props.drawMode !== 'line')
    draft.push(
      viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(positions),
          material: Color.CYAN.withAlpha(0.2),
        },
      }),
    );
  emit('vertices', vertices.length);
  requestRender();
}
function undo() {
  vertices.pop();
  renderDraft();
  emit('vertices', vertices.length);
}
function finish() {
  const mode = props.drawMode;
  if (!mode || vertices.length < (mode === 'point' ? 1 : mode === 'line' ? 2 : 3)) return;
  emit('draw', { mode, coordinates: vertices.map((p) => [...p]) });
  vertices = [];
  clearDraft();
  emit('vertices', 0);
}
function home() {
  const county = props.boundaries.find((f) => f.properties?.name === '安多县');
  if (county) focus(county);
  else
    viewer?.camera.flyTo({
      destination: Cartesian3.fromDegrees(91.682, 32.262, 550000),
      duration: 0.7,
    });
}
function focus(feature: Feature) {
  if (!viewer) return;
  const [west, south, east, north] = geometryBounds(feature);
  if (east - west < 0.0005 && north - south < 0.0005) {
    const p = feature.properties || {};
    const height = p.buildingType || p.category === 'building' || p.tags?.building ? 650 : 8000;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(west, south, height),
      duration: 0.7,
    });
  } else {
    const padX = Math.max((east - west) * 0.1, 0.003),
      padY = Math.max((north - south) * 0.1, 0.003);
    viewer.camera.flyTo({
      destination: Rectangle.fromDegrees(west - padX, south - padY, east + padX, north + padY),
      duration: 0.7,
    });
  }
}
function zoom(direction: number) {
  if (!viewer) return;
  if (direction > 0) viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.4);
  else viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.6);
  requestRender();
}
function north() {
  if (viewer) {
    viewer.camera.setView({ orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
    requestRender();
  }
}
function tilt() {
  if (viewer) {
    viewer.camera.setView({
      orientation: {
        heading: viewer.camera.heading,
        pitch: CesiumMath.toRadians(-42),
        roll: 0,
      },
    });
    requestRender();
  }
}

watch(
  () => props.annotations,
  (value) => updateSource('annotations', value, '#e34b62'),
);
watch(
  () => props.boundaries,
  (value) => updateSource('boundaries', value, '#f46c82'),
);
watch(
  () => props.preview,
  (value) => updateSource('preview', value, '#4be2cf'),
);
watch(
  () => props.highlight,
  (value) => updateSource('highlight', value ? [value] : [], '#4be2cf'),
);
watch(
  () => props.layers,
  (value) => {
    for (const c of mapLayers)
      if (value[c.key]) void updateSource(c.key, value[c.key].features, c.color);
  },
);
watch(
  () => props.visibility,
  (value) => {
    sources.forEach((source, key) => {
      source.show = value[key] !== false;
    });
    requestRender();
  },
  { deep: true },
);
watch(() => props.basemap, setImagery);
watch(() => props.terrain, setTerrain);
watch(() => props.buildings3d, (value) => {
  for (const [group, source] of sources) {
    if (group !== 'annotations' && group !== 'preview') continue;
    source.entities.values.forEach((entity) => {
      const p = entity.properties?.getValue(viewer?.clock.currentTime) || {};
      if (!entity.polygon) return;
      const floors = Number(p.floors);
      if (value && Number.isFinite(floors) && floors > 0) {
        entity.polygon.height = new ConstantProperty(0);
        entity.polygon.heightReference = new ConstantProperty(HeightReference.CLAMP_TO_GROUND);
        entity.polygon.extrudedHeight = new ConstantProperty(floors * 3);
        entity.polygon.extrudedHeightReference = new ConstantProperty(
          HeightReference.RELATIVE_TO_GROUND,
        );
      } else {
        entity.polygon.height = undefined;
        entity.polygon.heightReference = undefined;
        entity.polygon.extrudedHeight = undefined;
        entity.polygon.extrudedHeightReference = undefined;
      }
    });
  }
  requestRender();
});
watch(() => props.route, updateRoute, { deep: true });
watch(
  () => props.exaggeration,
  (v) => {
    if (viewer) {
      viewer.scene.verticalExaggeration = v;
      requestRender();
    }
  },
);
watch(
  () => props.labels,
  (v) => {
    sources.forEach((s) =>
      s.entities.values.forEach((e) => {
        if (e.label) e.label.show = new ConstantProperty(v);
      }),
    );
    refreshClustering();
    requestRender();
  },
);
watch(
  () => props.mode,
  (mode) => {
    if (!viewer) return;
    if (mode === '2D') viewer.scene.morphTo2D(0);
    else viewer.scene.morphTo3D(0);
    home();
  },
);
watch(
  () => props.drawMode,
  () => {
    viewer?.camera.cancelFlight();
    vertices = [];
    clearDraft();
    emit('vertices', 0);
  },
);

onMounted(() => {
  try {
    (globalThis as typeof globalThis & { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL(
      `${import.meta.env.BASE_URL}cesium/`,
      document.baseURI,
    ).href;
    viewer = new Viewer(container.value!, {
      baseLayer: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      sceneMode: SceneMode.SCENE3D,
      skyBox: false,
      skyAtmosphere: false,
    });
    viewer.scene.globe.baseColor = Color.fromCssColorString('#394344');
    viewer.scene.backgroundColor = Color.fromCssColorString('#10171b');
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 20000000;
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
    setImagery();
    void setTerrain();
    void updateSource('annotations', props.annotations, '#e34b62');
    void updateSource('boundaries', props.boundaries, '#f46c82');
    for (const c of mapLayers)
      if (props.layers[c.key]) void updateSource(c.key, props.layers[c.key].features, c.color);
    home();
    handler = new ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!viewer) return;
      if (props.routeMode) {
        const position = pickPosition(event.position);
        if (position) emit('routePoint', position);
        return;
      }
      if (props.drawMode) {
        const position = pickPosition(event.position);
        if (!position) return;
        vertices.push(position);
        renderDraft();
        if (props.drawMode === 'point') finish();
        return;
      }
      const picks = viewer.scene.drillPick(event.position, 8);
      const mapped = picks.map((p) => featureByEntity.get(p.id)).filter(Boolean);
      const annotation = mapped.find((p) => p?.group === 'annotations');
      if (annotation) {
        emit('select', annotation.feature, annotation.group);
        return;
      }
      const cluster = picks.find((p) => Array.isArray(p.id));
      if (cluster) {
        void viewer.flyTo(cluster.id, { duration: 0.7 });
        return;
      }
      const selected =
        mapped.find((p) => !['boundaries', 'neighborCounties'].includes(p?.group || '')) ||
        mapped[0];
      if (selected) emit('select', selected.feature, selected.group);
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (props.drawMode || props.routeMode) return;
      const position = pickPosition(event.position);
      if (position) emit('draw', { mode: 'point', coordinates: [position] });
    }, ScreenSpaceEventType.RIGHT_CLICK);
    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      const p = pickPosition(event.endPosition);
      if (p && viewer)
        emit(
          'position',
          p[0],
          p[1],
          viewer.scene.globe.getHeight(Cartographic.fromDegrees(p[0], p[1])) || 0,
        );
    }, ScreenSpaceEventType.MOUSE_MOVE);
    observer = new ResizeObserver(() => {
      viewer?.resize();
      refreshClustering();
      requestRender();
    });
    viewer.scene.morphComplete.addEventListener(refreshClustering);
    observer.observe(container.value!);
    viewer.scene.renderError.addEventListener((_scene, error) => {
      fatal.value = `三维场景渲染失败：${error.message}`;
      emit('error', fatal.value);
    });
    emit('ready');
  } catch (e) {
    fatal.value = `无法启动三维场景：${(e as Error).message}`;
    emit('error', fatal.value);
  }
});
onBeforeUnmount(() => {
  terrainGeneration++;
  observer?.disconnect();
  handler?.destroy();
  viewer?.destroy();
  routeEntity = undefined;
  viewer = undefined;
});
defineExpose({ focus, home, zoom, north, tilt, undo, finish });
</script>

<template>
  <div
    ref="container"
    class="scene"
    :class="{ drawing: drawMode }"
    aria-label="安多县三维地图"
  ></div>
  <div v-if="fatal" class="scene-error" role="alert">{{ fatal }}</div>
</template>
