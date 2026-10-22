import { test, expect } from '@playwright/test';

test('cursor coordinates update in map-only mode and clear on exit', async ({ page }) => {
  await page.goto('/');
  const readout = page.getByLabel('鼠标经纬度');
  await expect(readout).toContainText('移动鼠标');
  await expect(page.getByLabel('鼠标地表海拔')).toHaveCount(0);
  const canvas = page.locator('.scene canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(readout).toHaveText(/经度 -?\d+\.\d{6}° · 纬度 -?\d+\.\d{6}°/);
  const crosshair = page.locator('.map-crosshair');
  await expect(crosshair).toBeVisible();
  await expect(crosshair).toHaveCSS('pointer-events', 'none');
  const horizontal = (await page.locator('.map-crosshair-horizontal').boundingBox())!;
  const vertical = (await page.locator('.map-crosshair-vertical').boundingBox())!;
  expect(horizontal.y).toBeCloseTo(box.y + box.height * 0.5, 0);
  expect(vertical.x).toBeCloseTo(box.x + box.width * 0.5, 0);
  expect(horizontal.width).toBeCloseTo(box.width, 0);
  expect(vertical.height).toBeCloseTo(box.height, 0);
  const first = await readout.textContent();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await expect(readout).not.toHaveText(first!);
  await page.getByRole('button', { name: '恢复完整界面', exact: true }).hover();
  await expect(readout).toContainText('移动鼠标');
  await expect(crosshair).toHaveCount(0);
});