import { expect, test } from '@playwright/test';

test('batch coordinates create flags and a closed region and survive reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '经纬度标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await page.getByRole('button', { name: '经纬度标注', exact: true }).click();
  await page.getByLabel('坐标标注名称', { exact: true }).fill('坐标区域测试');
  await page.getByLabel('批量经纬度', { exact: true }).fill('91.682,32.262\n91.692,32.262\n91.692,32.272');
  await page.getByLabel('坐标生成方式', { exact: true }).selectOption('polygon');
  await page.getByRole('button', { name: '生成并保存标注', exact: true }).click();
  await expect(page.getByRole('region', { name: '经纬度批量标注' })).toHaveCount(0);
  const getRows = () => page.evaluate(() => {
    const state = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    return state.annotations.filter((f: any) => f.properties.name.startsWith('坐标区域测试'));
  });
  await expect.poll(async () => (await getRows()).length).toBe(4);
  const rows = await getRows();
  expect(rows.filter((f: any) => f.properties.markerStyle === 'flag')).toHaveLength(3);
  expect(rows[3].geometry.coordinates[0]).toHaveLength(4);
  await page.reload();
  await expect(page.getByRole('button', { name: '经纬度标注', exact: true })).toBeEnabled({ timeout: 60000 });
  await expect.poll(async () => (await getRows()).length).toBe(4);
});