import { test, expect } from '@playwright/test';

test('fullscreen targets only the map and restores the page on exit', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '沙盘全屏', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.className))
    .toBe('map-area');
  await expect(page.getByRole('button', { name: '退出沙盘全屏', exact: true })).toBeVisible();
  const box = await page.locator('.map-area').boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.y).toBe(0);
  expect(box?.width).toBe(page.viewportSize()!.width);
  expect(box?.height).toBe(page.viewportSize()!.height);
  await page.getByRole('button', { name: '退出沙盘全屏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.getByRole('button', { name: '沙盘全屏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
  expect((await page.locator('.map-area').boundingBox())!.y).toBeGreaterThan(0);
});

for (const width of [1440, 390]) {
  test(`map fills page by default and layout can be restored (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.statusbar')).toBeHidden();
    expect(await page.locator('.map-area').boundingBox()).toEqual({
      x: 0,
      y: 0,
      width,
      height: 900,
    });
    await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.getByRole('button', { name: '只显示沙盘', exact: true }).click();
    await expect(page.locator('.app-header')).toBeHidden();
    expect(await page.locator('.map-area').boundingBox()).toEqual({
      x: 0,
      y: 0,
      width,
      height: 900,
    });
  });
}
