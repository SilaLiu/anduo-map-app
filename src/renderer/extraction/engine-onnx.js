// ═══════════════════════════════════════════
//  ONNX / Transformers.js extraction engine
// ═══════════════════════════════════════════

import { state, map, SRC } from './context.js';
import {
  bboxFromCoords,
  getTilesForBbox,
  stitchTiles,
  tileBounds,
  pixelToLngLat,
} from '../utils/geo.js';
import { pointInPolygon } from '../utils/geometry.js';
import { extractFromMask } from './engine-color.js';
import { categoryNames } from './categories.js';

export async function runONNXEngine(targets, setProgress) {
  setProgress(5, '加载 AI 模型...');
  const transformers = await loadTransformers();
  if (!transformers) throw new Error('无法加载 Transformers.js。请检查网络连接后重试。');

  setProgress(15, '加载语义分割模型 (首次需下载~20MB)...');
  const { pipeline } = transformers;
  let segmenter;
  try {
    segmenter = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
      quantized: true,
      progress_callback: (info) => {
        if (info.status === 'progress') {
          const pct = 15 + Math.round((info.loaded / info.total) * 20);
          setProgress(
            pct,
            `下载模型: ${Math.round(info.loaded / 1024 / 1024)}MB / ${Math.round(info.total / 1024 / 1024)}MB`,
          );
        }
      },
    });
  } catch (e) {
    throw new Error('模型加载失败: ' + e.message + '\n请确保网络通畅，模型约20MB');
  }

  try {
    setProgress(35, '抓取卫星瓦片...');
    const tileUrl = SRC.satellite.tiles[0];
    let bbox = bboxFromCoords(state.extractPolygon);
    const zoom = Math.min(18, Math.floor(map.getZoom()) + 1);
    const tiles = getTilesForBbox(bbox, zoom, 256);
    bbox = tileBounds(tiles);
    const canvas = await stitchTiles(tiles, tileUrl, 256);
    if (!canvas) throw new Error('瓦片抓取失败');

    setProgress(45, '分割瓦片进行 AI 推理...');
    const TILE_SIZE = 512,
      OVERLAP = 32;
    const cols = Math.ceil(canvas.width / (TILE_SIZE - OVERLAP));
    const rows = Math.ceil(canvas.height / (TILE_SIZE - OVERLAP));
    const totalTiles = cols * rows;
    let processedTiles = 0;

    const fullMask = new Uint8Array(canvas.width * canvas.height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        state.signal?.throwIfAborted();
        const x = col * (TILE_SIZE - OVERLAP),
          y = row * (TILE_SIZE - OVERLAP);
        const w = Math.min(TILE_SIZE, canvas.width - x),
          h = Math.min(TILE_SIZE, canvas.height - y);

        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = TILE_SIZE;
        tileCanvas.height = TILE_SIZE;
        const tctx = tileCanvas.getContext('2d');
        tctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

        const result = await segmenter(tileCanvas.toDataURL('image/jpeg', 0.85));

        if (result && Array.isArray(result)) {
          for (const seg of result) {
            const label = seg.label;
            let cat = 0;
            if (label.includes('building') || label.includes('house') || label.includes('wall'))
              cat = 1;
            else if (label.includes('road') || label.includes('path') || label.includes('sidewalk'))
              cat = 2;
            else if (
              label.includes('water') ||
              label.includes('river') ||
              label.includes('sea') ||
              label.includes('lake')
            )
              cat = 3;
            else if (label.includes('tree') || label.includes('plant') || label.includes('forest'))
              cat = 4;
            else if (label.includes('field') || label.includes('earth') || label.includes('land'))
              cat = 5;
            if (!cat) continue;

            const mask = seg.mask;
            if (!mask?.data || !mask.width || !mask.height)
              throw new Error('模型返回了不支持的分割掩码');
            for (let sy = 0; sy < h; sy++) {
              for (let sx = 0; sx < w; sx++) {
                const mx = Math.min(mask.width - 1, Math.floor((sx / TILE_SIZE) * mask.width));
                const my = Math.min(mask.height - 1, Math.floor((sy / TILE_SIZE) * mask.height));
                const si = (my * mask.width + mx) * mask.channels;
                if (
                  mask.data[si] > 64 &&
                  pointInPolygon(
                    pixelToLngLat(x + sx, y + sy, bbox, canvas.width, canvas.height),
                    state.extractPolygon,
                  )
                ) {
                  const fi = (y + sy) * canvas.width + (x + sx);
                  if (fi < fullMask.length) fullMask[fi] = cat;
                }
              }
            }
          }
        }

        processedTiles++;
        const pct = 45 + Math.round((processedTiles / totalTiles) * 35);
        setProgress(pct, `AI 推理: ${processedTiles}/${totalTiles} 图块`);
      }
    }

    setProgress(80, '矢量化分割结果...');
    extractFromMask(fullMask, canvas.width, canvas.height, bbox, targets, setProgress, 'ONNX AI');
    setProgress(100, `ONNX AI 完成: ${state.extractionResults.length} 个地物`);
  } finally {
    await segmenter.dispose();
  }
}

async function loadTransformers() {
  if (window._transformers) return window._transformers;
  if (window.transformers) {
    window._transformers = window.transformers;
    return window.transformers;
  }
  try {
    const moduleUrl =
      'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
    const m = await import(/* @vite-ignore */ moduleUrl);
    window._transformers = m;
    console.log('Transformers.js loaded');
    return m;
  } catch (e) {
    console.warn('Transformers.js load failed:', e.message);
    return null;
  }
}
