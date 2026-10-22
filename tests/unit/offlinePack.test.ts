import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { loadPack, safeFile } = createRequire(import.meta.url)('../../desktop/offline.cjs');
const folders: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'anduo-pack-'));
  folders.push(root);
  await mkdir(path.join(root, 'street/0/0'), { recursive: true });
  await writeFile(path.join(root, 'street/0/0/0.png'), 'fixture');
  const manifest = {
    version: 1, name: '安多测试包', bounds: [90, 30, 94, 35],
    basemaps: { street: { url: 'street/{z}/{x}/{y}.png', maximumLevel: 0, sample: [0, 0, 0], credit: '© OpenStreetMap contributors' } },
    terrain: undefined as { path: string } | undefined,
  };
  const save = () => writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await save();
  return { root, manifest, save };
}
afterEach(async () => { await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))); });

describe('offline resource packs', () => {
  it('validates a pack and exposes only same-origin resource URLs', async () => {
    const { root } = await fixture();
    const pack = await loadPack(root);
    expect(pack.config).toMatchObject({ enabled: true, name: '安多测试包', basemaps: { street: { url: '/offline/street/{z}/{x}/{y}.png' } } });
    expect(pack.config.root).toBeUndefined();
  });
  it('rejects missing sample tiles and invalid bounds', async () => {
    const { root, manifest, save } = await fixture();
    manifest.bounds = [94, 35, 90, 30];
    await save();
    await expect(loadPack(root)).rejects.toThrow('覆盖范围');
    manifest.bounds = [90, 30, 94, 35];
    await save();
    await rm(path.join(root, 'street/0/0/0.png'));
    await expect(loadPack(root)).rejects.toThrow();
  });
  it('rejects remote and escaping tile templates', async () => {
    const { root, manifest, save } = await fixture();
    for (const url of ['https://example.com/{z}/{x}/{y}.png', '../{z}/{x}/{y}.png', 'C:\\tiles\\{z}/{x}/{y}.png']) {
      manifest.basemaps.street.url = url;
      await save();
      await expect(loadPack(root)).rejects.toThrow();
    }
  });
  it('prevents resource traversal and symlink escapes', async () => {
    const { root } = await fixture();
    await expect(safeFile(root, '../secret')).rejects.toThrow();
    await expect(safeFile(root, '/etc/passwd')).rejects.toThrow();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'anduo-outside-'));
    folders.push(outside);
    await writeFile(path.join(outside, 'secret'), 'not public');
    await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(safeFile(root, 'linked/secret')).rejects.toThrow('符号链接越界');
  });
  it('accepts local quantized mesh metadata but rejects external terrain dependencies', async () => {
    const { root, manifest, save } = await fixture();
    manifest.terrain = { path: 'terrain' };
    await mkdir(path.join(root, 'terrain'));
    const file = path.join(root, 'terrain/layer.json');
    await writeFile(file, JSON.stringify({ format: 'quantized-mesh-1.0', tiles: ['{z}/{x}/{y}.terrain'] }));
    await save();
    expect((await loadPack(root)).config.terrain).toBe('/offline/terrain/');
    await writeFile(file, JSON.stringify({ format: 'quantized-mesh-1.0', tiles: ['https://example.com/{z}'] }));
    await expect(loadPack(root)).rejects.toThrow('地形');
  });
});