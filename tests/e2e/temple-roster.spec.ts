import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`temple table replaces legend at bottom right (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const legend = page.getByRole('region', { name: '地图图例' });
    await expect(legend).toBeVisible();
    await page.getByRole('button', { name: '寺庙分布', exact: true }).click();
    const table = page.locator('.temple-roster');
    await expect(table).toBeVisible();
    await expect(legend).toBeHidden();
    const box = (await table.boundingBox())!;
    const map = (await page.locator('.map-area').boundingBox())!;
    expect(map.y + map.height - box.y - box.height).toBeCloseTo(16, 0);
    expect(map.x + map.width - box.x - box.width).toBeCloseTo(16, 0);
    expect(box.x).toBeGreaterThanOrEqual(map.x);
    await page.getByRole('button', { name: '综合', exact: true }).click();
    await expect(table).toBeHidden();
    await expect(legend).toBeVisible();
  });
}
