import { test, expect } from '@playwright/test';

test('regional transport and neighboring counties load with independent toggles', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({
    timeout: 60000,
  });
  await page.getByRole('button', { name: '图层', exact: true }).click();
  for (const name of ['国道（周边50公里）', '铁路（周边50公里）', '周边县级行政区']) {
    const row = page.locator('.toggle-row').filter({ hasText: name });
    await expect(row.locator('small')).not.toHaveText('0');
    const checkbox = row.getByRole('checkbox');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
  }
  await expect(page.locator('.scene canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
