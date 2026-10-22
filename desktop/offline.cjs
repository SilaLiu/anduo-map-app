const fs = require('node:fs/promises');
const path = require('node:path');

function inside(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || name.includes(':'))
    throw new Error('资源路径必须为资源包内的相对路径');
  const target = path.resolve(root, name);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('资源路径越界');
  return target;
}

async function safeFile(root, name) {
  const target = await fs.realpath(inside(root, name));
  const base = await fs.realpath(root);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('资源符号链接越界');
  if (!(await fs.stat(target)).isFile()) throw new Error('资源不是文件');
  return target;
}

async function loadPack(root) {
  root = await fs.realpath(root);
  const manifestFile = await safeFile(root, 'manifest.json');
  if ((await fs.stat(manifestFile)).size > 1024 * 1024) throw new Error('资源清单超过 1 MB');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (manifest.version !== 1 || typeof manifest.name !== 'string' || !manifest.name.trim())
    throw new Error('无效的离线资源清单版本或名称');
  const bounds = manifest.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -85 || bounds[3] > 85 ||
      bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) throw new Error('无效的资源覆盖范围');
  const basemaps = {};
  for (const key of ['street', 'satellite', 'topographic', 'tianditu']) {
    const item = manifest.basemaps?.[key];
    if (!item) continue;
    if (typeof item.url !== 'string' || !/\{z\}/.test(item.url) || !/\{x\}/.test(item.url) || !/\{y\}/.test(item.url) ||
        !Number.isInteger(item.maximumLevel) || item.maximumLevel < 0 || item.maximumLevel > 22 ||
        typeof item.credit !== 'string' || !item.credit.trim()) throw new Error(`${key} 底图配置无效`);
    const sample = item.sample;
    if (!Array.isArray(sample) || sample.length !== 3 || !sample.every(Number.isInteger) ||
        sample[0] < 0 || sample[0] > item.maximumLevel || sample.slice(1).some((n) => n < 0 || n >= 2 ** sample[0]))
      throw new Error(`${key} 需要有效的 sample: [z,x,y] 校验瓦片`);
    inside(root, item.url);
    const sampleName = item.url.replace('{z}', sample[0]).replace('{x}', sample[1]).replace('{y}', sample[2]);
    await safeFile(root, sampleName);
    basemaps[key] = { url: `/offline/${item.url}`, maximumLevel: item.maximumLevel, credit: item.credit };
  }
  if (!Object.keys(basemaps).length) throw new Error('资源包至少需要一种底图');
  let terrain;
  if (manifest.terrain) {
    const folder = manifest.terrain.path;
    inside(root, folder);
    const file = await safeFile(root, `${folder}/layer.json`);
    const layer = JSON.parse(await fs.readFile(file, 'utf8'));
    if (layer.format !== 'quantized-mesh-1.0' || !Array.isArray(layer.tiles) || !layer.tiles.length ||
        layer.tiles.some((tile) => typeof tile !== 'string' || tile.startsWith('/') || tile.includes(':') || tile.includes('..') || tile.includes('\\')) ||
        layer.parentUrl || (layer.extensions?.length))
      throw new Error('地形必须为不含外部父图层及扩展依赖的本地 quantized-mesh 数据');
    terrain = `/offline/${folder}/`;
  }
  return { root, config: { enabled: true, name: manifest.name, bounds, basemaps, terrain } };
}

module.exports = { inside, safeFile, loadPack };