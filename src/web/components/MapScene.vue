<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import {
  Viewer,
  UrlTemplateImageryProvider,
  EllipsoidTerrainProvider,
  CesiumTerrainProvider,
  ColorMaterialProperty,
  PolylineDashMaterialProperty,
  PolylineOutlineMaterialProperty,
  createWorldTerrainAsync,
  Ion,
  Cartesian3,
  BoundingSphere,
  HeadingPitchRange,
  EasingFunction,
  Cartographic,
  Cartesian2,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  GeoJsonDataSource,
  Color,
  Entity,
  PointGraphics,
  BillboardGraphics,
  HorizontalOrigin,
  LabelGraphics,
  HeightReference,
  DistanceDisplayCondition,
  VerticalOrigin,
  ConstantProperty,
  Rectangle,
  PolygonHierarchy,
  SceneMode,
  ConstantPositionProperty,
  SceneTransforms,
} from 'cesium';
import type { Feature, FeatureCollection, Position } from 'geojson';
import { pointOnFeature } from '@turf/turf';
import { geometryBounds, collection } from '../domain/geo';
import { flagMarkerImage } from '../domain/flagMarker';
import { mapLayers } from '../domain/referenceLayers';
import { roadLabelText } from '../domain/roadLabels';
import { navigationRouteStyle } from '../domain/routeStyle';
import { townColors, isAnduoCounty } from '../domain/townColors';
import { labelHierarchy, overlapsLabel, type LabelBox } from '../domain/labelHierarchy';
import type { DeploymentByTown } from '../domain/deployment';
import { deploymentMarker } from '../domain/deploymentMarker';
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
  templeTheme?: boolean;
  routeMode: boolean;
  route: Position[];
  vehiclePosition: Position | null;
  preview: Feature[];
  highlight?: Feature;
  deployments: DeploymentByTown;
}>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  select: [feature: Feature, group: string];
  draw: [result: DrawResult];
  vertices: [count: number];
  position: [lng: number, lat: number, height: number];
  terrainStatus: [status: string];
  basemapFallback: [];
  routePoint: [position: Position];
  popupPosition: [position: { x: number; y: number } | null];
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
let lastLabelLayout = 0;
let popupAnchor: Position | null = null;
watch(
  () => props.highlight,
  (feature) => {
    popupAnchor = feature ? pointOnFeature(feature).geometry.coordinates : null;
    emit('popupPosition', null);
    requestRender();
  },
  { immediate: true },
);
watch(
  () => props.deployments,
  () => {
    if (props.layers.towns?.features) void updateSource('towns', props.layers.towns.features, '#b7c4d8');
  },
  { deep: true },
);
function updatePopupPosition() {
  if (!viewer || !popupAnchor) return;
  const scene = viewer.scene;
  const cartographic = Cartographic.fromDegrees(popupAnchor[0], popupAnchor[1]);
  const height = scene.globe.getHeight(cartographic) || 0;
  const world = Cartesian3.fromDegrees(popupAnchor[0], popupAnchor[1], height);
  if (
    scene.mode === SceneMode.SCENE3D &&
    Cartesian3.dot(
      scene.globe.ellipsoid.geodeticSurfaceNormal(world),
      Cartesian3.subtract(viewer.camera.positionWC, world, new Cartesian3()),
    ) < 0
  ) {
    emit('popupPosition', null);
    return;
  }
  const pixel = SceneTransforms.worldToWindowCoordinates(scene, world);
  emit(
    'popupPosition',
    pixel &&
      pixel.x >= 0 &&
      pixel.y >= 0 &&
      pixel.x <= scene.canvas.clientWidth &&
      pixel.y <= scene.canvas.clientHeight
      ? { x: pixel.x, y: pixel.y }
      : null,
  );
}

function layoutLabels() {
  if (!viewer || performance.now() - lastLabelLayout < 100) return;
  lastLabelLayout = performance.now();
  const time = viewer.clock.currentTime;
  const scale = Math.abs(viewer.camera.positionCartographic.height);
  const occupied: LabelBox[] = [];
  const ordered = [...sources.entries()].sort(
    ([a], [b]) => labelHierarchy(a).priority - labelHierarchy(b).priority,
  );
  for (const [group, source] of ordered) {
    if (['annotations', 'preview', 'highlight'].includes(group)) continue;
    const rule =
      group === 'temples' && props.templeTheme
        ? { size: 14, range: 3000000, priority: 1 }
        : labelHierarchy(group);
    for (const entity of source.entities.values) {
      const eligible = source.show && scale <= rule.range;
      if (entity.point && entity.point.show?.getValue(time) !== eligible)
        entity.point.show = new ConstantProperty(eligible);
      if (group === 'towns' && entity.id.includes(':deployment-') && entity.billboard) {
        entity.billboard.show = new ConstantProperty(eligible && props.labels);
        continue;
      }
      if (!entity.label) continue;
      // Keep township captions: topographic tiles do not label every township.
      // Suppress only duplicate village captions on this basemap.
      let show =
        eligible && props.labels && !(props.basemap === 'topographic' && group === 'villages');
      const position = entity.position?.getValue(time);
      const screen = position && SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
      if (
        !screen ||
        screen.x < 0 ||
        screen.y < 0 ||
        screen.x > viewer.canvas.clientWidth ||
        screen.y > viewer.canvas.clientHeight
      )
        show = false;
      if (show && screen) {
        const text = String(entity.label.text?.getValue(time) || '');
        const width = [...text].length * rule.size + 18;
        const offset = entity.label.pixelOffset?.getValue(time) || Cartesian2.ZERO;
        const box = {
          x: screen.x + offset.x - width / 2,
          y: screen.y + offset.y - rule.size - 10,
          width,
          height: rule.size + 14,
        };
        show = !occupied.some((other) => overlapsLabel(box, other));
        if (show) occupied.push(box);
      }
      if (group === 'towns') {
        if (entity.billboard) entity.billboard.show = new ConstantProperty(eligible);
        const leader = source.entities.getById(`${entity.id}:leader`);
        if (leader?.billboard) leader.billboard.show = new ConstantProperty(show);
      }
      if (entity.label.show?.getValue(time) !== show)
        entity.label.show = new ConstantProperty(show);
    }
  }
}
const vehicleImage =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="white" stroke="#087c42" stroke-width="3"/><path d="M13 26l3-10h16l3 10v8H13z" fill="#168bf0"/><path d="M18 18h12l2 7H16z" fill="#dff4ff"/><circle cx="17" cy="30" r="2" fill="white"/><circle cx="31" cy="30" r="2" fill="white"/></svg>',
  );
watch(
  () => props.vehiclePosition,
  (position) => {
    if (!viewer) return;
    if (!position) {
      if (vehicleEntity) viewer.entities.remove(vehicleEntity);
      vehicleEntity = undefined;
    } else {
      if (!vehicleEntity)
        vehicleEntity = viewer.entities.add({
          billboard: {
            image: vehicleImage,
            width: 40,
            height: 40,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      vehicleEntity.position = new ConstantPositionProperty(
        Cartesian3.fromDegrees(position[0], position[1]),
      );
    }
    requestRender();
  },
);

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
        group === 'neighborCounties' && f.geometry.type === 'Polygon'
          ? { type: 'MultiLineString' as const, coordinates: f.geometry.coordinates }
          : group === 'neighborCounties' && f.geometry.type === 'MultiPolygon'
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
    const roadLabelPositions = new Map<string, Cartesian3[]>();
    // Adding leader entities mutates Cesium's collection. Process only source features.
    for (const entity of [...source.entities.values]) {
      const p = entity.properties?.getValue(viewer.clock.currentTime) || {};
      const feature = features[p.__index];
      if (!feature) continue;
      if (group === 'boundaries') {
        const county = isAnduoCounty(p);
        entity.show = county || props.visibility.boundaries !== false;
        if (entity.polygon) {
          entity.polygon.material = new ColorMaterialProperty(
            Color.fromCssColorString(
              county ? '#ffd740' : townColors[String(p.name)] || color,
            ).withAlpha(county ? 0.01 : props.basemap === 'topographic' ? 0.12 : 0.14),
          );
          entity.polygon.outline = new ConstantProperty(false);
        }
      }
      if (group === 'neighborCounties' && entity.polyline) {
        entity.polyline.material = new ColorMaterialProperty(
          Color.fromCssColorString('#a8afb5').withAlpha(0.25),
        );
        entity.polyline.width = new ConstantProperty(1);
        entity.polyline.zIndex = new ConstantProperty(0);
      }
      const roadText = roadLabelText(group, p);
      if (['rivers', 'lakes'].includes(group) && p.name) {
        const anchor = pointOnFeature(feature).geometry.coordinates;
        entity.position = new ConstantPositionProperty(
          Cartesian3.fromDegrees(anchor[0], anchor[1]),
        );
      }
      if (entity.polyline && roadText) {
        const positions = entity.polyline.positions?.getValue(viewer.clock.currentTime) as
          Cartesian3[] | undefined;
        const anchor = positions?.[Math.floor(positions.length / 2)];
        const existing = roadLabelPositions.get(roadText) || [];
        if (anchor && existing.every((position) => Cartesian3.distance(position, anchor) >= 8000)) {
          entity.position = new ConstantPositionProperty(anchor);
          existing.push(anchor);
          roadLabelPositions.set(roadText, existing);
        }
      }
      if (group !== 'highlight') featureByEntity.set(entity, { feature, group });
      const tint =
        Color.fromCssColorString(
          group === 'annotations' || group === 'preview' ? p.color || color : color,
        ) || Color.WHITE;
      const useFlag =
        ['annotations', 'preview'].includes(group) &&
        feature.geometry?.type === 'Point' &&
        p.markerStyle === 'flag';
      if (useFlag) {
        entity.point = undefined;
        entity.billboard = new BillboardGraphics({
          image: flagMarkerImage(p.color),
          width: 36,
          height: 42,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(-6, 0),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      } else if (entity.billboard || (group === 'towns' && entity.position)) {
        entity.billboard = undefined;
        entity.point = new PointGraphics({
          pixelSize:
            group === 'highlight' ? 16 : group === 'countySeats' ? 12 : group === 'towns' ? 10 : 7,
          color: tint,
          outlineColor: Color.fromCssColorString('#20292e'),
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(
            0,
            ['annotations', 'preview', 'highlight'].includes(group)
              ? Number.POSITIVE_INFINITY
              : group === 'temples'
                ? 3000000
                : labelHierarchy(group).range,
          ),
        });
      }
      if (group === 'towns' && entity.position) {
        // Clamped PointGraphics and leader billboards share Cesium's billboard pool.
        // Use BillboardGraphics for both so recycled primitives always reset dimensions.
        entity.point = undefined;
        entity.billboard = new BillboardGraphics({
          image:
            'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="5" fill="#ffd740" stroke="#20292e" stroke-width="2"/></svg>',
            ),
          width: 14,
          height: 14,
          scale: 1,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: Cartesian2.ZERO,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, labelHierarchy('towns').range),
        });
      }
      if (entity.position && (roadText || p.name) && !['highlight', 'boundaries'].includes(group)) {
        const townName = String(p.name);
        const deploymentRows = group === 'towns' ? props.deployments[townName] || [] : [];
        const isDeploymentLabel = group === 'towns' && deploymentRows.length > 0;
        const labelText = roadText || townName;
        entity.label = new LabelGraphics({
          text: labelText,
          font: `${group === 'countySeats' ? 'bold ' : ''}${labelHierarchy(group).size}px sans-serif`,
          fillColor: !roadText ? Color.WHITE : tint,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.7),
          backgroundPadding: new Cartesian2(5, 3),
          pixelOffset: new Cartesian2(
            group === 'towns' ? 48 : 0,
            isDeploymentLabel ? 26 : group === 'towns' ? -42 : useFlag ? -46 : -15,
          ),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(
            0,
            group === 'temples' ? 3000000 : labelHierarchy(group).range,
          ),
          show: props.labels,
        });
        if (isDeploymentLabel && entity.position) {
          const marker = deploymentMarker(deploymentRows);
          source.entities.add({
            id: `${entity.id}:deployment-group`,
            position: entity.position,
            billboard: new BillboardGraphics({
              image: marker.image,
              width: marker.width,
              height: marker.height,
              horizontalOrigin: HorizontalOrigin.RIGHT,
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian2(2, 2),
              heightReference: HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              show: props.labels,
              distanceDisplayCondition: new DistanceDisplayCondition(0, labelHierarchy('towns').range),
            }),
          });
        }
      }
      if (entity.polyline && group === 'countyRoads')
        entity.polyline.distanceDisplayCondition = new ConstantProperty(
          new DistanceDisplayCondition(0, 180000),
        );
      if (entity.polyline && ['annotations', 'preview'].includes(group))
        entity.polyline.material = new ColorMaterialProperty(tint);
      if (
        entity.polyline &&
        ['highways', 'provincialRoads', 'countyRoads', 'townshipRoads', 'localRoads'].includes(
          group,
        )
      ) {
        // Explicitly override source styles and keep minor roads below numbered routes.
        entity.polyline.material = new ColorMaterialProperty(tint);
        entity.polyline.width = new ConstantProperty(
          group === 'highways' ? 5 : group === 'provincialRoads' ? 4 : 3,
        );
        entity.polyline.zIndex = new ConstantProperty(
          group === 'highways' ? 50 : group === 'provincialRoads' ? 40 : 30,
        );
        if (group === 'localRoads') entity.polyline.zIndex = new ConstantProperty(20);
      }
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
    if (group === 'boundaries') {
      features.forEach((feature, index) => {
        const p = feature.properties || {};
        const county = isAnduoCounty(p);
        const rings =
          feature.geometry.type === 'Polygon'
            ? feature.geometry.coordinates
            : feature.geometry.type === 'MultiPolygon'
              ? feature.geometry.coordinates.flat()
              : [];
        rings.forEach((ring, part) => {
          const edge = source.entities.add({
            id: `boundary-edge:${index}:${part}`,
            properties: p,
            show: county || props.visibility.boundaries !== false,
            polyline: {
              positions: Cartesian3.fromDegreesArray(ring.flatMap((point) => [point[0], point[1]])),
              clampToGround: true,
              width: county ? 6 : 1.25,
              material: county
                ? new PolylineOutlineMaterialProperty({
                    color: Color.fromCssColorString('#ffd740'),
                    outlineColor: Color.fromCssColorString('#594500'),
                    outlineWidth: 1,
                  })
                : Color.fromCssColorString(townColors[String(p.name)] || color).withAlpha(0.7),
              // Keep the county perimeter above all other ground lines, including routes.
              zIndex: county ? 20000 : 10,
            },
          });
          featureByEntity.set(edge, { feature, group });
        });
      });
    }
    const old = sources.get(group);
    if (old) viewer.dataSources.remove(old, true);
    source.show = group === 'boundaries' || props.visibility[group] !== false;
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
    props.basemap === 'topographic'
      ? 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
      : props.basemap === 'street'
        ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        : props.basemap === 'tianditu'
          ? `https://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${key}`
          : import.meta.env.VITE_IMAGERY_URL ||
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const provider = new UrlTemplateImageryProvider({
    url,
    maximumLevel: props.basemap === 'topographic' ? 17 : 19,
    credit:
      props.basemap === 'topographic'
        ? 'Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap (CC-BY-SA)'
        : props.basemap === 'street'
          ? '© OpenStreetMap contributors'
          : props.basemap === 'tianditu'
            ? '© 天地图'
            : import.meta.env.VITE_IMAGERY_CREDIT || 'Tiles © Esri, Maxar, Earthstar Geographics',
  });
  let reported = false;
  provider.errorEvent.addEventListener(() => {
    if (!reported && gen === imageGeneration) {
      reported = true;
      if (props.basemap === 'topographic') {
        emit('error', '地形底图瓦片加载失败，已切换到街道地图；可手动重新选择地形底图');
        emit('basemapFallback');
        return;
      }
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
    const pixelRange = source.clustering.pixelRange;
    source.clustering.pixelRange = 0;
    source.clustering.pixelRange = pixelRange;
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
function fitTemples() {
  if (!viewer) return;
  const features = (props.layers.temples?.features || []).filter(
    (f) => f.geometry?.type === 'Point',
  );
  if (!features.length) return;
  const bounds = features.map(geometryBounds);
  const west = Math.min(...bounds.map((b) => b[0]));
  const south = Math.min(...bounds.map((b) => b[1]));
  const east = Math.max(...bounds.map((b) => b[2]));
  const north = Math.max(...bounds.map((b) => b[3]));
  const padX = Math.max((east - west) * 0.25, 0.03);
  const padY = Math.max((north - south) * 0.3, 0.03);
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: Rectangle.fromDegrees(west - padX, south - padY * 2, east + padX, north + padY),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1.8,
    easingFunction: EasingFunction.CUBIC_IN_OUT,
  });
}
function fitCountyTraffic() {
  if (!viewer) return;
  const county = props.boundaries.find((feature) => isAnduoCounty(feature.properties || {}));
  if (!county) {
    home();
    return;
  }
  const [west, south, east, north] = geometryBounds(county);
  const padX = Math.max((east - west) * 0.08, 0.01);
  const padY = Math.max((north - south) * 0.08, 0.01);
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: Rectangle.fromDegrees(west - padX, south - padY, east + padX, north + padY),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1.8,
    easingFunction: EasingFunction.CUBIC_IN_OUT,
  });
}
function fitCentralTowns() {
  if (!viewer || viewer.isDestroyed()) return;
  // Geographic overview only; independent of any table entries or deployment records.
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: Rectangle.fromDegrees(90.95, 31.9, 92.45, 33.05),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1.8,
    easingFunction: EasingFunction.CUBIC_IN_OUT,
  });
}
function home() {
  if (!viewer) return;
  viewer.camera.cancelFlight();
  // Closer regional overview: county seat and central/southern towns.
  viewer.camera.flyTo({
    destination: Rectangle.fromDegrees(90.55, 31.35, 92.85, 33.1),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 2.4,
    easingFunction: EasingFunction.CUBIC_IN_OUT,
  });
}
function focus(feature: Feature) {
  if (!viewer) return;
  const [west, south, east, north] = geometryBounds(feature);
  if (viewer.scene.mode === SceneMode.SCENE3D) {
    const camera = viewer.camera;
    const canvas = viewer.scene.canvas;
    const ray = camera.getPickRay(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    const currentTarget = ray && viewer.scene.globe.pick(ray, viewer.scene);
    const range = currentTarget
      ? Cartesian3.distance(camera.positionWC, currentTarget)
      : Math.max(camera.positionCartographic.height, 1000);
    const town = props.layers.towns?.features.find(
      (item) =>
        item.properties?.name === feature.properties?.name && item.geometry?.type === 'Point',
    );
    const anchor = feature.geometry.type === 'Point' ? feature : town;
    const coordinates = anchor?.geometry.type === 'Point' ? anchor.geometry.coordinates : undefined;
    const target = Cartographic.fromDegrees(
      coordinates?.[0] ?? (west + east) / 2,
      coordinates?.[1] ?? (south + north) / 2,
    );
    target.height = viewer.scene.globe.getHeight(target) || 0;
    const distance = anchor ? Math.min(Math.max(range, 1500), 10000) : Math.max(range, 100);
    const pitch = Math.min(camera.pitch, CesiumMath.toRadians(-20));
    camera.cancelFlight();
    camera.flyToBoundingSphere(
      new BoundingSphere(
        Cartesian3.fromRadians(target.longitude, target.latitude, target.height),
        0,
      ),
      {
        offset: new HeadingPitchRange(camera.heading, pitch, distance),
        duration: 1.8,
        easingFunction: EasingFunction.CUBIC_IN_OUT,
        pitchAdjustHeight: Number.POSITIVE_INFINITY,
      },
    );
    return;
  }
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
      source.show = key === 'boundaries' || value[key] !== false;
      if (key === 'boundaries')
        source.entities.values.forEach((entity) => {
          const p = entity.properties?.getValue(viewer?.clock.currentTime) || {};
          entity.show = isAnduoCounty(p) || value.boundaries !== false;
        });
    });
    requestRender();
  },
  { deep: true },
);
watch(
  () => props.basemap,
  () => {
    setImagery();
    const source = sources.get('boundaries');
    if (source && viewer) {
      for (const entity of source.entities.values) {
        if (!entity.polygon) continue;
        const p = entity.properties?.getValue(viewer.clock.currentTime) || {};
        const county = isAnduoCounty(p);
        entity.polygon.material = new ColorMaterialProperty(
          Color.fromCssColorString(
            county ? '#ffd740' : townColors[String(p.name)] || '#ffd740',
          ).withAlpha(county ? 0.01 : props.basemap === 'topographic' ? 0.12 : 0.14),
        );
      }
    }
    lastLabelLayout = 0;
    layoutLabels();
    requestRender();
  },
);
watch(() => props.terrain, setTerrain);
watch(
  () => props.buildings3d,
  (value) => {
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
  },
);
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
        return;
      }
      const selected =
        mapped.find((p) => !['boundaries', 'neighborCounties'].includes(p?.group || '')) ||
        mapped[0];
      if (selected) emit('select', selected.feature, selected.group);
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!viewer || props.drawMode || props.routeMode) return;
      const picks = viewer.scene.drillPick(event.position, 8);
      const mapped = picks.map((p) => featureByEntity.get(p.id)).filter(Boolean);
      const annotation = mapped.find((p) => p?.group === 'annotations');
      const cluster = picks.find((p) => Array.isArray(p.id));
      if (!annotation && cluster) {
        void viewer.flyTo(cluster.id, { duration: 0.7 });
        return;
      }
      const selected =
        annotation ||
        mapped.find((p) => !['boundaries', 'neighborCounties'].includes(p?.group || '')) ||
        mapped[0];
      if (selected) {
        emit('select', selected.feature, selected.group);
        focus(selected.feature);
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
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
    viewer.scene.preUpdate.addEventListener(layoutLabels);
    viewer.scene.postRender.addEventListener(updatePopupPosition);
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
defineExpose({
  focus,
  fitTemples,
  fitCountyTraffic,
  fitCentralTowns,
  home,
  zoom,
  north,
  tilt,
  undo,
  finish,
});
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
