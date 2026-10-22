import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(os.tmpdir(), 'anduo-desktop-'));
const desktop = await electron.launch({ args: ['.'], env: { ...process.env, ANDUO_DESKTOP_TEST_PROFILE: profile } });
try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page).toHaveTitle('安多县电子三维沙盘');
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('.scene canvas').first()).toBeVisible();
  await expect(page.locator('.scene-error')).toHaveCount(0);
  const resources = await page.evaluate(async () => {
    const urls = ['data/sandtable-geojson/towns.geojson', 'cesium/Assets/approximateTerrainHeights.json'];
    return Promise.all(urls.map(async (url) => (await fetch(url)).ok));
  });
  expect(resources).toEqual([true, true]);
  const isolation = await page.evaluate(() => ({
    require: typeof window.require,
    exportJson: typeof window.anduoDesktop?.exportJson,
  }));
  expect(isolation).toEqual({ require: 'undefined', exportJson: 'function' });
  await page.getByRole('button', { name: '民兵部署', exact: true }).click();
  const panel = page.getByRole('region', { name: '兵力部署编组资料表' });
  await panel.getByLabel('编组名称').first().fill('桌面持久化测试');
  await panel.getByRole('button', { name: '保存部署', exact: true }).click();
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  const backupPath = path.join(profile, 'workspace.json');
  await desktop.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, backupPath);
  await page.getByRole('button', { name: '导出工作区备份', exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await readFile(backupPath, 'utf8')).version; } catch { return null; }
  }).toBe(2);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.deployments['帕那镇'][0].name).toBe('桌面持久化测试');
  await panel.getByLabel('编组名称').first().fill('临时修改');
  await page.getByRole('button', { name: '图层', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '恢复工作区备份', exact: true }).click();
  // Electron native JS dialogs are not controlled by Playwright's browser CDP.
  await page.evaluate(() => { window.confirm = () => true; });
  await (await chooser).setFiles(backupPath);
  await expect(panel.getByLabel('编组名称').first()).toHaveValue('桌面持久化测试');
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  await page.reload();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: '民兵部署', exact: true }).click();
  await expect(panel.getByLabel('编组名称').first()).toHaveValue('桌面持久化测试');
  expect(errors).toEqual([]);
  console.log('Electron smoke passed: map, resources, deployment saving, backup export/import and reload.');
} finally {
  await desktop.close();
  await rm(profile, { recursive: true, force: true });
}