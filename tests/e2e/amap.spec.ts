import { test, expect } from '@playwright/test';

// Deferred feature: retain integration scenarios for re-enablement after real terrain validation.
test.skip('高德模式可以切换、显示限制并销毁地图', async ({ page }) => {
  await page.route('**/api/amap/status', (route) => route.fulfill({ json: { configured: true } }));
  await page.route('https://webapi.amap.com/maps?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('v')).toBe('2.1Beta');
    return route.fulfill({
      contentType: 'application/javascript',
      body: `
      window.amapStats = { created: 0, destroyed: 0, overlays: 0 };
      class Overlay { on() {} }
      class Satellite { constructor() { this.kind = 'satellite'; } show() {} hide() {} }
      class RoadNet { constructor() { this.kind = 'roadnet'; } show() { window.amapStats.roadLabels = true; } hide() { window.amapStats.roadLabels = false; } }
      window.AMap = {
        TileLayer: { Satellite, RoadNet },
        Marker: Overlay, Polyline: Overlay, Polygon: Overlay, Bounds: class {},
        Map: class {
          constructor(container, options) {
            window.amapStats.created++;
            window.amapStats.options = options;
            const canvas = document.createElement('canvas'); container.appendChild(canvas);
          }
          on() {} add(items) { window.amapStats.overlays = items.length; }
          remove() {} resize() {} setFeatures() {} setPitch(pitch) { window.amapStats.pitch = pitch; } setRotation() {}
          setZoomAndCenter() {} setZoom() {} getZoom() { return 9; } setBounds() {}
          lngLatToContainer() { return { x: 500, y: 400 }; }
          destroy() { window.amapStats.destroyed++; }
        }
      };
    `,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  await page.getByRole('button', { name: '图层', exact: true }).click();
  await page.getByLabel('底图', { exact: true }).selectOption('amap3d');
  await expect(page.getByLabel('高德三维地图')).toBeVisible();
  await expect(page.getByText('正在加载高德卫星地形…')).toHaveCount(0);
  await expect(page.getByText(/卫星影像＋三维地形：/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).amapStats.options.viewMode)).toBe('3D');
  expect(await page.evaluate(() => (window as any).amapStats.options.terrain)).toBe(true);
  expect(
    await page.evaluate(() => (window as any).amapStats.options.layers.map((l: any) => l.kind)),
  ).toEqual(['satellite', 'roadnet']);
  expect(await page.evaluate(() => (window as any).amapStats.options.pitch)).toBe(65);
  await expect(page.getByLabel('高德地形默认启用')).toBeChecked();
  await page.getByLabel('地名标签', { exact: true }).uncheck();
  expect(await page.evaluate(() => (window as any).amapStats.roadLabels)).toBe(false);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  expect(await page.evaluate(() => (window as any).amapStats.pitch)).toBe(0);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  expect(await page.evaluate(() => (window as any).amapStats.pitch)).toBe(65);
  expect(await page.evaluate(() => (window as any).amapStats.overlays)).toBeGreaterThan(0);
  const security = await page.evaluate(() => window._AMapSecurityConfig);
  expect(security?.serviceHost).toContain('/_AMapService');
  expect(security).not.toHaveProperty('securityJsCode');
  await page.getByLabel('底图', { exact: true }).selectOption('street');
  await expect(page.getByLabel('高德三维地图')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).amapStats.destroyed)).toBe(1);
});

test.skip('高德安全代理不可用时提示并允许切回', async ({ page }) => {
  await page.route('**/api/amap/status', (route) =>
    route.fulfill({ status: 503, json: { configured: false } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  await page.getByRole('button', { name: '图层', exact: true }).click();
  await page.getByLabel('底图', { exact: true }).selectOption('amap3d');
  await expect(page.locator('.scene-error')).toContainText('高德安全代理不可用');
  await page.getByLabel('底图', { exact: true }).selectOption('street');
  await expect(page.getByLabel('高德三维地图')).toHaveCount(0);
});

test('暂停迭代的高德地形不出现在底图入口', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  await page.getByRole('button', { name: '图层', exact: true }).click();
  const basemap = page.getByLabel('底图', { exact: true });
  await expect(basemap.locator('option[value="amap3d"]')).toHaveCount(0);
  await expect(basemap).toHaveValue('street');
  await basemap.selectOption('street');
  await expect(basemap).toHaveValue('street');
});
