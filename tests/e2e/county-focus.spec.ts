import { test, expect } from '@playwright/test';

test('homepage defaults to a tilted 3D county-seat view and can be revisited', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  const home = page.getByRole('button', { name: '主页', exact: true });
  await expect(home).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    const layers = app.map.$.setupState.viewer.imageryLayers;
    return app.basemap === 'satellite' && layers.length > 0 &&
      layers.get(0).imageryProvider.url.includes('World_Imagery');
  })).toBe(true);
  const checkCamera = async () => {
    await expect.poll(() => page.evaluate(() => {
      const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
      const camera = app.map.$.setupState.viewer.camera;
      return app.mode === '3D' && Math.abs(camera.pitch + Math.PI / 4) < 0.02 &&
        camera.positionCartographic.height > 2000 && camera.positionCartographic.height < 4500;
    }), { timeout: 15000 }).toBe(true);
  };
  await checkCamera();
  await page.getByRole('button', { name: '全览', exact: true }).click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await home.click();
  await checkCamera();
  await expect(home).toHaveAttribute('aria-pressed', 'true');
});

for (const target of ['county', 'overview']) {
test(`clicking ${target} frames the full Anduo boundary even after zooming in`, async ({ page }) => {
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
  if (target === 'county') {
    await page.locator('.feature-main').filter({ has: page.locator('b', { hasText: /^安多县$/ }) }).click();
  } else {
    await page.getByRole('button', { name: '全览', exact: true }).click();
  }
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
}