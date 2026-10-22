import { test, expect } from '@playwright/test';

test('混合发布包默认读取本地街道瓦片并保留在线入口', async ({ page, request }) => {
  const manifestResponse = await request.get('/local-map/manifest.json');
  test.skip(!manifestResponse.ok(), '仅在包含 local-map 的混合发布包运行');
  const manifest = await manifestResponse.json();
  expect(manifest.basemaps.street.maximumLevel).toBe(12);
  const localTiles: string[] = [];
  const remoteTiles: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/local-map/basemaps/street/') && response.ok())
      localTiles.push(response.url());
  });
  await page.route(/https:\/\/.*(?:tile\.openstreetmap\.org|tile\.opentopomap\.org)\//, (route) => {
    remoteTiles.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await expect.poll(() => localTiles.length, { timeout: 30000 }).toBeGreaterThan(0);
  expect(remoteTiles).toHaveLength(0);
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  await page.getByRole('button', { name: '图层', exact: true }).click();
  const basemap = page.getByLabel('底图', { exact: true });
  await expect(basemap).toHaveValue('street');
  await expect(basemap.locator('option[value="street-online"]')).toHaveCount(1);
  await expect(basemap.locator('option[value="topographic"]')).toHaveCount(1);
  await expect(page.getByText(/混合发布包优先使用本地 OSM/)).toBeVisible();
  await basemap.selectOption('street-online');
  await expect
    .poll(() => remoteTiles.some((url) => url.includes('tile.openstreetmap.org')))
    .toBe(true);
  await basemap.selectOption('topographic');
  await expect
    .poll(() => remoteTiles.some((url) => url.includes('tile.opentopomap.org')))
    .toBe(true);
});
