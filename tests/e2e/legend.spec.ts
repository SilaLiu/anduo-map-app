import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`map legend layout and collapse at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const legend = page.getByRole('region', { name: '地图图例' });
    const heading = legend.getByRole('button', { name: '图例' });
    await expect(legend).toBeVisible();
    await expect(legend.getByText('国道', { exact: true })).toBeVisible();
    for (const name of ['省道', '县道', '乡道'])
      await expect(legend.getByText(name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '行政区', exact: true }).click();
    await page.locator('.feature-main').filter({ hasText: '扎仁镇' }).click();
    const details = page.locator('.selection-panel');
    await expect(details).toBeVisible();
    await expect(legend).toBeVisible();
    for (const collapsed of [false, true, false]) {
      if ((await heading.getAttribute('aria-expanded')) !== String(!collapsed))
        await heading.click();
      const detailBox = (await details.boundingBox())!;
      const legendBox = (await legend.boundingBox())!;
      expect(detailBox.y + detailBox.height).toBeLessThanOrEqual(legendBox.y - 4);
      expect(detailBox.height).toBeGreaterThan(30);
    }
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(legend).toBeVisible();
    await expect(legend.getByText('铁路', { exact: true })).toBeVisible();
    const box = (await legend.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThan(viewport.height);
    await heading.click();
    await expect(heading).toHaveAttribute('aria-expanded', 'false');
    await expect(legend.getByText('国道', { exact: true })).toBeHidden();
    await heading.click();
    await expect(legend.getByText('国道', { exact: true })).toBeVisible();
  });
}
