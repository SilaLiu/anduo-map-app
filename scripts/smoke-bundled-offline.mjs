import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(os.tmpdir(), 'anduo-bundled-'));
let desktop;
try {
  desktop = await electron.launch({ args: ['.'], env: {
    ...process.env, ANDUO_DESKTOP_TEST_PROFILE: profile, ANDUO_BUNDLED_PACK_TEST: '1',
  } });
  const page = await desktop.firstWindow();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
  await page.getByRole('button', { name: '退出沙盘全屏', exact: true }).click();
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
  await page.getByRole('button', { name: '沙盘全屏', exact: true }).click();
  await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
  const box = await page.getByRole('button', { name: '退出沙盘全屏', exact: true }).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole('button', { name: '切换桌面全屏', exact: true })).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const config = await (await fetch('/api/offline')).json();
    const tile = await fetch('/offline/basemaps/street/12/3088/1658.png');
    let blocked = false;
    try { await fetch('https://example.com', { signal: AbortSignal.timeout(5000) }); }
    catch { blocked = true; }
    return { config, tile: tile.status, blocked };
  });
  expect(result.config.enabled).toBe(true);
  expect(result.config.name).toContain('OSM');
  expect(result.tile).toBe(200);
  expect(result.blocked).toBe(true);
  await page.getByRole('button', { name: '民兵部署', exact: true }).click();
  await expect(page.getByRole('region', { name: '兵力部署编组资料表' })).toBeVisible();
  console.log('Bundled real offline pack: first launch, tile read, public network blocking and deployment panel passed.');
} finally {
  await desktop?.close();
  await rm(profile, { recursive: true, force: true });
}