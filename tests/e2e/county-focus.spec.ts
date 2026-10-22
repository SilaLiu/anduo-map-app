import { test, expect } from '@playwright/test';

test('clicking Anduo county frames its full boundary even after zooming in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  await page.getByRole('button', { name: '行政区', exact: true }).click();
  // Reproduce a close-up camera before selecting the county.
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    const viewer = app.map.$.setupState.viewer;
    viewer.camera.cancelFlight();
    viewer.camera.zoomIn(viewer.camera.positionCartographic.height - 2000);
  });
  await page.locator('.feature-main').filter({ has: page.locator('b', { hasText: /^安多县$/ }) }).click();
  await expect.poll(() => page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    const viewer = app.map.$.setupState.viewer;
    const camera = viewer.camera;
    const county = app.boundaries.find((f: any) => f.properties.level === 'county' && f.properties.name === '安多县');
    const rect = camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rect || !county) return false;
    const coordinates = county.geometry.coordinates.flat(county.geometry.type === 'MultiPolygon' ? 2 : 1);
    return coordinates.every(([lon, lat]: number[]) => {
      const x = lon * Math.PI / 180;
      const y = lat * Math.PI / 180;
      return x >= rect.west && x <= rect.east && y >= rect.south && y <= rect.north;
    }) && camera.positionCartographic.height > 100000 && Math.abs(camera.pitch + Math.PI / 2) < 0.01;
  }), { timeout: 15000 }).toBe(true);
});