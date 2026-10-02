// ═══════════════════════════════════════════
//  Color-based segmentation extraction engine
// ═══════════════════════════════════════════

import { state, map, SRC } from './context.js';
import {
  bboxFromCoords,
  getTilesForBbox,
  stitchTiles,
  lngLatToPixel,
  pixelToLngLat,
  tileBounds,
} from '../utils/geo.js';
import { rgbToHsv } from '../utils/color.js';
import { pointInPolygon, simplifyLine } from '../utils/geometry.js';
import { categoryNames } from './categories.js';

const catColors = { 1: '#8b5cf6', 2: '#f59e0b', 3: '#3b82f6', 4: '#22c55e', 5: '#eab308' };
const catNames = { 1: 'buildings', 2: 'roads', 3: 'water', 4: 'vegetation', 5: 'farmland' };
const catToTarget = { 1: 'buildings', 2: 'roads', 3: 'water', 4: 'vegetation', 5: 'farmland' };

export async function runColorEngine(targets, setProgress) {
  setProgress(10, '抓取卫星瓦片...');
  const tileUrl = SRC.satellite.tiles[0];
  let bbox = bboxFromCoords(state.extractPolygon);
  const zoom = Math.min(19, Math.floor(map.getZoom()) + 2);
  const tiles = getTilesForBbox(bbox, zoom, 256);
  bbox = tileBounds(tiles);

  setProgress(20, `拼接 ${tiles.length} 个瓦片...`);
  const canvas = await stitchTiles(tiles, tileUrl, 256);
  state.signal?.throwIfAborted();
  if (!canvas) throw new Error('瓦片抓取失败');

  setProgress(30, '预处理 & 降噪...');
  const ctx = canvas.getContext('2d');
  const W = canvas.width,
    H = canvas.height;
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  const pixelPolygon = state.extractPolygon.map(([lng, lat]) =>
    lngLatToPixel(lng, lat, bbox, W, H),
  );

  const mask = new Uint8Array(W * H);
  const wantBld = targets.includes('buildings');
  const wantRoad = targets.includes('roads');
  const wantWater = targets.includes('water');
  const wantVeg = targets.includes('vegetation');
  const wantFarm = targets.includes('farmland');

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!pointInPolygon([x, y], pixelPolygon)) continue;
      const i = (y * W + x) * 4;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const [h, s, v] = rgbToHsv(r, g, b);
      const idx = y * W + x;

      if (
        wantBld &&
        ((v > 145 && s < 18) ||
          (v >= 80 && v <= 160 && s < 22) ||
          ((h < 20 || h > 340) && s > 18 && s < 70 && v > 60) ||
          (h >= 20 && h < 45 && s > 15 && s < 55 && v > 50) ||
          (h >= 195 && h < 255 && s > 12 && s < 55 && v > 55) ||
          (v >= 25 && v < 60 && s < 25))
      ) {
        mask[idx] = 1;
        continue;
      }

      if (wantRoad && (v < 28 || (v >= 28 && v < 55 && s < 18) || (v >= 55 && v < 90 && s < 12))) {
        mask[idx] = 2;
        continue;
      }

      if (
        wantWater &&
        ((h >= 185 && h < 265 && s > 10 && v > 45) ||
          (b > r + 15 && b > g + 5 && v > 30 && s > 8) ||
          (v < 40 && s < 15 && b > r && b > g))
      ) {
        mask[idx] = 3;
        continue;
      }

      if (
        wantVeg &&
        ((h >= 75 && h < 170 && s > 18 && v > 30) ||
          (h >= 80 && h < 160 && s > 10 && v >= 20 && v < 50))
      ) {
        mask[idx] = 4;
        continue;
      }

      if (
        wantFarm &&
        ((h >= 25 && h < 75 && s > 20 && v > 50 && v < 160) ||
          (h >= 20 && h < 55 && s > 12 && s < 45 && v > 70 && v < 180))
      ) {
        mask[idx] = 5;
        continue;
      }
    }
  }

  setProgress(45, '形态学清理...');
  const cleaned = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (mask[idx] === 0) {
        cleaned[idx] = 0;
        continue;
      }
      const cat = mask[idx];
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (mask[(y + dy) * W + (x + dx)] === cat) same++;
        }
      }
      cleaned[idx] = same >= 4 ? cat : 0;
    }
  }

  const dilated = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (cleaned[idx] !== 0) {
        dilated[idx] = cleaned[idx];
        continue;
      }
      const counts = [0, 0, 0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          counts[cleaned[(y + dy) * W + (x + dx)]]++;
        }
      }
      let best = 0,
        bestCat = 0;
      for (let c = 1; c <= 5; c++) {
        if (counts[c] > best) {
          best = counts[c];
          bestCat = c;
        }
      }
      dilated[idx] = best >= 5 ? bestCat : 0;
    }
  }

  setProgress(65, '提取轮廓...');
  extractFromMask(dilated, W, H, bbox, targets, setProgress, '颜色分割');
  setProgress(100, `颜色分割完成: ${state.extractionResults.length} 个地物`);
}

export function extractFromMask(mask, W, H, bbox, targets, setProgress, sourceLabel) {
  state.signal?.throwIfAborted();
  const visited = new Uint8Array(W * H);
  const MIN_AREAS = { 1: 25, 2: 15, 3: 80, 4: 100, 5: 80 };

  for (let cat = 1; cat <= 5; cat++) {
    if (!targets.includes(catToTarget[cat])) continue;
    const MIN_A = MIN_AREAS[cat] || 30;

    for (let y = 0; y < H; y += 3) {
      for (let x = 0; x < W; x += 3) {
        if (visited[y * W + x]) continue;
        if (mask[y * W + x] !== cat) continue;

        const pixels = [];
        const stack = [[x, y]];
        visited[y * W + x] = 1;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          pixels.push([cx, cy]);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ]) {
            const nx = cx + dx,
              ny = cy + dy;
            if (
              nx >= 0 &&
              nx < W &&
              ny >= 0 &&
              ny < H &&
              !visited[ny * W + nx] &&
              mask[ny * W + nx] === cat
            ) {
              visited[ny * W + nx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
        if (pixels.length < MIN_A) continue;

        const geoCoords = extractBoundary(pixels, W, H, bbox, cat);
        if (!geoCoords || geoCoords.length < (cat === 2 ? 2 : 4)) continue;

        const label = categoryNames[catToTarget[cat]];
        if (cat === 2) {
          const simplified = simplifyLine(geoCoords, 0.00004);
          if (simplified.length >= 2) {
            state.extractionResults.push({
              id: 'extr_c_' + state.extractionResults.length,
              category: catToTarget[cat],
              type: 'line',
              coordinates: simplified,
              color: catColors[cat],
              name: label + ' (颜色)',
              note: '',
              roadClass: '',
              lanes: '',
              surface: '',
              source: sourceLabel,
              selected: true,
            });
          }
        } else {
          const simplified = simplifyLine(geoCoords, 0.00006);
          if (simplified.length >= 4) {
            const f = simplified[0],
              l = simplified[simplified.length - 1];
            if (f[0] !== l[0] || f[1] !== l[1]) simplified.push([...f]);
            state.extractionResults.push({
              id: 'extr_c_' + state.extractionResults.length,
              category: catToTarget[cat],
              type: 'polygon',
              coordinates: simplified,
              color: catColors[cat],
              name: label + ' (颜色)',
              note: '',
              buildingType: cat === 1 ? '' : '',
              floors: '',
              source: sourceLabel,
              selected: true,
            });
          }
        }
      }
    }
  }
}

function extractBoundary(pixels, W, H, bbox, category) {
  if (pixels.length < 4) return null;
  let minX = W,
    maxX = 0,
    minY = H,
    maxY = 0;
  for (const [px, py] of pixels) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const gw = maxX - minX + 3,
    gh = maxY - minY + 3;
  const grid = new Uint8Array(gw * gh);
  for (const [px, py] of pixels) grid[(py - minY + 1) * gw + (px - minX + 1)] = 1;

  let sx = -1,
    sy = -1;
  outer: for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (grid[gy * gw + gx] === 1) {
        sx = gx;
        sy = gy;
        break outer;
      }
    }
  }
  if (sx < 0) return null;

  const boundary = [];
  const dirs = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  let cx = sx,
    cy = sy,
    cdir = 0;
  const maxSteps = pixels.length * 3;
  for (let step = 0; step < maxSteps; step++) {
    boundary.push([cx + minX - 1, cy + minY - 1]);
    let found = false;
    for (let d = 0; d < 8; d++) {
      const nd = (cdir + 7 - d) % 8;
      const nx = cx + dirs[nd][0],
        ny = cy + dirs[nd][1];
      if (nx >= 0 && nx < gw && ny >= 0 && ny < gh && grid[ny * gw + nx] === 1) {
        cx = nx;
        cy = ny;
        cdir = nd;
        found = true;
        break;
      }
    }
    if (!found || (cx === sx && cy === sy)) break;
  }

  if (boundary.length < 3) return null;
  const first = boundary[0],
    last = boundary[boundary.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) boundary.push([...first]);

  const targetPts = category === 2 ? Math.min(30, boundary.length) : Math.min(20, boundary.length);
  const step = Math.max(1, Math.floor(boundary.length / targetPts));
  const sampled = [];
  for (let i = 0; i < boundary.length; i += step) sampled.push(boundary[i]);
  if (sampled[sampled.length - 1] !== boundary[boundary.length - 1])
    sampled.push(boundary[boundary.length - 1]);

  return sampled.map(([px, py]) => pixelToLngLat(px, py, bbox, W, H));
}
