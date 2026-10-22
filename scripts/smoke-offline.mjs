import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A synthetic one-tile pack tests plumbing, not real geographic coverage.
const temp = await mkdtemp(path.join(os.tmpdir(), 'anduo-offline-smoke-'));
const profile = path.join(temp, 'profile');
const pack = path.join(temp, 'pack');
await mkdir(profile);
await mkdir(path.join(pack, 'street/0/0'), { recursive: true });
await writeFile(path.join(pack, 'street/0/0/0.png'), Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=', 'base64',
));
await writeFile(path.join(pack, 'manifest.json'), JSON.stringify({
  version: 1, name: '离线集成测试', bounds: [90, 30, 94, 35],
  basemaps: { street: { url: 'street/{z}/{x}/{y}.png', maximumLevel: 0, sample: [0, 0, 0], credit: 'Synthetic test fixture' } },
}));
await writeFile(path.join(profile, 'offline-settings.json'), JSON.stringify({ root: pack }));
let desktop;
const launch = () => electron.launch({ args: ['.'], env: { ...process.env, ANDUO_DESKTOP_TEST_PROFILE: profile } });
try {
  desktop = await launch();
  let page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  const result = await page.evaluate(async () => {
    const config = await (await fetch('/api/offline')).json();
    const tile = await fetch('/offline/street/0/0/0.png');
    const route = await fetch('/api/route?origin=91,32&destination=92,33');
    let blocked = false;
    try { await fetch('https://example.com/', { signal: AbortSignal.timeout(5000) }); }
    catch { blocked = true; }
    const outside = await fetch('/offline/..%2Fsecret');
    return { config, tile: tile.ok, route: route.status, message: (await route.json()).error, blocked, outside: outside.status };
  });
  expect(result.config).toMatchObject({ enabled: true, name: '离线集成测试' });
  expect(result.tile).toBe(true);
  expect(result.route).toBe(503);
  expect(result.message).toContain('本地路由引擎尚未接入');
  expect(result.blocked).toBe(true);
  expect(result.outside).toBe(404);
  await page.getByRole('button', { name: '民兵部署', exact: true }).click();
  const panel = page.getByRole('region', { name: '兵力部署编组资料表' });
  await panel.getByLabel('编组名称').first().fill('离线保存测试');
  await panel.getByRole('button', { name: '保存部署', exact: true }).click();
  await expect(panel.getByRole('button', { name: '保存部署', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: '民兵部署', exact: true }).click();
  await expect(panel.getByLabel('编组名称').first()).toHaveValue('离线保存测试');
  expect(errors).toEqual([]);
  await desktop.close();
  desktop = undefined;
  await rm(pack, { recursive: true });
  desktop = await launch();
  page = await desktop.firstWindow();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  const invalid = await page.evaluate(async () => {
    const config = await (await fetch('/api/offline')).json();
    let blocked = false;
    try { await fetch('https://example.com/', { signal: AbortSignal.timeout(5000) }); } catch { blocked = true; }
    return { config, blocked };
  });
  expect(invalid.config.enabled).toBe(true);
  expect(invalid.config.error).toBeTruthy();
  expect(invalid.blocked).toBe(true);
  console.log('Offline Electron smoke passed: local resources, network blocking, route guard, deployment persistence, invalid-pack fail-closed startup.');
} finally {
  await desktop?.close();
  await rm(temp, { recursive: true, force: true });
}