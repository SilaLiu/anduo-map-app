import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`header search supports touch-friendly search and clear buttons (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({ timeout: 60000 });
    await page.getByRole('button', { name: '恢复完整界面', exact: true }).click();
    await expect(page.getByRole('heading', { name: '安多县电子三维沙盘', exact: true })).toBeVisible();
    const input = page.getByRole('textbox', { name: '搜索名称或经纬度' });
    const search = page.getByRole('button', { name: '搜索', exact: true });
    const clear = page.getByRole('button', { name: '清除搜索', exact: true });
    await expect(search).toBeDisabled();
    await expect(clear).toBeVisible();
    await input.fill('不存在的搜索测试地点');
    await search.click();
    await expect(page.getByText('没有找到匹配的位置', { exact: true })).toBeVisible();
    await clear.click();
    await expect(input).toHaveValue('');
    await expect(search).toBeDisabled();
    await input.fill('91.682,32.262');
    await search.click();
    await expect.poll(() => page.evaluate(() => {
      const viewer = (document.querySelector('#app') as any).__vue_app__._instance.setupState.map.$.setupState.viewer;
      return viewer.camera.positionCartographic.height;
    })).toBeLessThan(10000);
    for (const button of [search, clear]) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}