import { test, expect } from '@playwright/test';

test('地形实验默认不设置图层，并可独立对比地形与卫星', async ({ page }) => {
  await page.route('**/api/amap/status', (route) => route.fulfill({ json: { configured: true } }));
  await page.route('https://webapi.amap.com/maps?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('v')).toBe('2.1Beta');
    return route.fulfill({ contentType: 'application/javascript', body: `
      window.labOptions = [];
      window.labDestroyed = 0;
      window.AMap = {
        version: 'test-beta',
        TileLayer: { Satellite: class { constructor() { this.kind = 'satellite'; } } },
        Map: class {
          constructor(container, options) { this.options = options; window.labOptions.push(options); }
          getPitch() { return this.options.pitch; }
          on(name, callback) { if (name === 'complete') setTimeout(callback, 0); }
          resize() {}
          destroy() { window.labDestroyed++; }
        }
      };
    ` });
  });
  await page.goto('/amap-terrain-lab.html');
  await expect(page.getByTestId('sdk-version')).toHaveText('test-beta');
  await expect(page.getByTestId('actual-pitch')).toHaveText('65');
  const options = () => page.evaluate(() => (window as any).labOptions.at(-1));
  expect(await options()).toMatchObject({ viewMode: '3D', terrain: true, pitch: 65 });
  expect(await options()).not.toHaveProperty('layers');
  await page.getByLabel('使用卫星图层').check();
  expect((await options()).layers).toEqual([{ kind: 'satellite' }]);
  await page.getByLabel('开启 terrain').uncheck();
  expect((await options()).terrain).toBe(false);
  await page.getByLabel('观察位置').selectOption('everest');
  expect((await options()).center[0]).toBeLessThan(90);
  expect(await page.evaluate(() => (window as any).labDestroyed)).toBe(3);
});