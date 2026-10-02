import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import manifest from '../../data/anduo-boundary-repairs.json';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled({
    timeout: 60000,
  });
  await expect(page.locator('.scene canvas')).toBeVisible();
  await expect(page.locator('.task-progress strong')).not.toHaveText('0 / 0');
}
async function canvasPosition(page: Page, dx = 0, dy = 0) {
  const box = (await page.locator('.scene canvas').boundingBox())!;
  return { x: box.x + box.width * 0.5 + dx, y: box.y + box.height * 0.5 + dy };
}
async function nonblank(page: Page) {
  const png = await page.locator('.scene canvas').screenshot();
  const colors = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = 100;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0, 100, 100);
    const data = ctx.getImageData(0, 0, 100, 100).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return colors.size;
  }, png.toString('base64'));
  expect(colors).toBeGreaterThan(50);
}

test('old nationwide workspaces and new imports stay within Anduo', async ({ page }) => {
  await open(page);
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    const foreign = {
      ...app.boundaries[0],
      properties: { adcode: '130105', name: '新华区', level: 'county', source: 'DataV Atlas' },
    };
    app.boundaries = [
      ...app.boundaries.map((f: any) => ({
        ...f,
        properties: { ...f.properties, note: 'keep scoped boundary note' },
      })),
      foreign,
    ];
    app.annotations = [
      {
        type: 'Feature',
        id: 'local',
        geometry: { type: 'Point', coordinates: [91.682, 32.262] },
        properties: { name: '保留安多县标注', note: 'local note' },
      },
      {
        type: 'Feature',
        id: 'foreign',
        geometry: { type: 'Point', coordinates: [116.4, 39.9] },
        properties: { name: '其他县标注' },
      },
    ];
    await app.persist();
  });
  await page.reload();
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  await expect(page.locator('.status-count')).toHaveText('1 个标注');
  await page.getByRole('button', { name: '行政区', exact: true }).click();
  await expect(page.getByRole('heading', { name: '行政边界 14', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '全国边界', exact: true })).toHaveCount(0);
  await expect(page.getByText('新华区', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '安多县全部边界', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('14 个边界');
  await page.getByRole('button', { name: '边界库', exact: true }).click();
  await expect(page.locator('.library-row')).toHaveCount(14);
  await page.getByRole('button', { name: '关闭边界库', exact: true }).click();
  const local = await page.evaluate(() =>
    (document.querySelector('#app') as any).__vue_app__._instance.setupState.boundaries.find(
      (f: any) => f.properties.level === 'town',
    ),
  );
  const foreign = {
    ...local,
    properties: { name: '其他县乡镇', county: '其他县', level: 'town', adcode: 'foreign' },
  };
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入边界', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'mixed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [local, foreign] })),
  });
  await expect(page.locator('.notice')).toContainText('已排除 1 个安多县范围外要素');
  await expect(page.getByRole('heading', { name: '行政边界 14', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await expect(page.getByText('保留安多县标注', { exact: true })).toBeVisible();
  await expect(page.getByText('其他县标注', { exact: true })).toHaveCount(0);
});

test('clicking a mapped building zooms in and shows its information on desktop and mobile', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: '标注', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'building.geojson',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [91.682, 32.262] },
        properties: {
          name: '安多县示例教学楼',
          category: 'building',
          buildingType: 'public',
          floors: 3,
          address: '示例街 1 号',
          note: '教学与办公',
          source: '回归测试数据',
          admin: { county: '安多县', town: '帕那镇' },
        },
      }),
    ),
  });
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewer = (document.querySelector('#app') as any).__vue_app__._instance.setupState.map
          .$.setupState.viewer;
        for (let i = 0; i < viewer.dataSources.length; i++) {
          const entity = viewer.dataSources.get(i).entities.getById('annotations:0');
          if (entity) {
            const pixel = viewer.scene.cartesianToCanvasCoordinates(
              entity.position.getValue(viewer.clock.currentTime),
            );
            if (pixel && viewer.scene.drillPick(pixel, 8).some((pick: any) => pick.id === entity))
              return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);
  const pixel = await page.evaluate(() => {
    const viewer = (document.querySelector('#app') as any).__vue_app__._instance.setupState.map.$
      .setupState.viewer;
    for (let i = 0; i < viewer.dataSources.length; i++) {
      const entity = viewer.dataSources.get(i).entities.getById('annotations:0');
      if (entity) {
        const p = viewer.scene.cartesianToCanvasCoordinates(
          entity.position.getValue(viewer.clock.currentTime),
        );
        return { x: p.x, y: p.y };
      }
    }
    throw new Error('Building entity missing');
  });
  const box = (await page.locator('.scene canvas').boundingBox())!;
  await page.mouse.click(box.x + pixel.x, box.y + pixel.y);
  const popup = page.locator('.selection-panel');
  await expect(popup.getByRole('heading')).toHaveText('安多县示例教学楼');
  for (const value of [
    '公共建筑',
    '安多县 / 帕那镇',
    '示例街 1 号',
    '教学与办公',
    '回归测试数据',
  ]) {
    await expect(popup).toContainText(value);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (document.querySelector('#app') as any).__vue_app__._instance.setupState.map.$.setupState
            .viewer.camera.positionCartographic.height,
      ),
    )
    .toBeLessThan(1000);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/building-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1300);
  await expect(popup).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/building-mobile.png' });
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await expect(popup).toHaveCount(0);
});

test('task annotation flies to the target after entering draw mode', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '标注雁石坪镇', exact: true }).click();
  await expect(page.locator('.draw-bar')).toBeVisible();
  // Inspect the real Cesium camera: a visible drawing toolbar alone cannot
  // detect a flight cancelled by the draw-mode watcher.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
        return app.map.$.setupState.viewer.camera.positionCartographic.height;
      }),
    )
    .toBeLessThan(10000);
});

test('backup recovery after startup failure restores reference data and migrates old boundaries', async ({
  page,
}) => {
  await open(page);
  const legacyBoundaries = manifest.repairs.map((r) => ({
    type: 'Feature',
    id: r.adcode,
    geometry: r.originalGeometry,
    properties: {
      adcode: r.adcode,
      name: r.name,
      level: 'town',
      county: '安多县',
      source: 'OpenStreetMap',
      note: 'keep this note',
    },
  }));
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('anduo-sandtable');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ version: 999, annotations: [], boundaries: [] }, 'v2');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByText('工作区读取失败', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '图层', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '恢复工作区备份', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await (
    await chooser
  ).setFiles({
    name: 'old-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ version: 2, annotations: [], boundaries: legacyBoundaries }),
    ),
  });
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled();
  await expect(page.locator('.task-progress strong')).not.toHaveText('0 / 0');
  const restored = await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    return {
      layers: Object.keys(app.layers),
      tasks: app.sections.flatMap((s: any) => s.items).length,
      boundaries: app.boundaries,
    };
  });
  expect(restored.layers).toHaveLength(7);
  expect(restored.tasks).toBeGreaterThan(100);
  restored.boundaries.forEach((b: any, i: number) => {
    expect(b.geometry).toEqual(manifest.repairs[i].geometry);
    expect(b.properties).toMatchObject({ geometry_revision: 2, note: 'keep this note' });
  });
  await page.reload();
  await open(page);
  const persisted = await page.evaluate(
    () => (document.querySelector('#app') as any).__vue_app__._instance.setupState.boundaries,
  );
  expect(persisted).toEqual(restored.boundaries);
});

test('startup repairs and saves historical workspace geometry', async ({ page }) => {
  await open(page);
  const repair = manifest.repairs.find((r) => r.name === '雁石坪镇')!;
  await page.evaluate(async (repair) => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    app.boundaries = [
      {
        type: 'Feature',
        geometry: repair.originalGeometry,
        properties: {
          adcode: repair.adcode,
          name: repair.name,
          source: 'OpenStreetMap',
          level: 'town',
          county: '安多县',
          note: 'saved user note',
        },
      },
    ];
    await app.persist();
  }, repair);
  await page.reload();
  await expect(page.getByRole('button', { name: '绘制点标注', exact: true })).toBeEnabled();
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  const stored = await page.evaluate(async () => {
    return new Promise<any>((resolve, reject) => {
      const request = indexedDB.open('anduo-sandtable');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readonly');
        const read = tx.objectStore('workspace').get('v2');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
        tx.oncomplete = () => db.close();
      };
      request.onerror = () => reject(request.error);
    });
  });
  expect(stored.boundaries[0].geometry).toEqual(repair.geometry);
  expect(stored.boundaries[0].properties.note).toBe('saved user note');
});

test('quota failures remain visible for assignment, library import and extracted imports', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  const states = await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__._instance.setupState;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: any[]) {
      if (args[1] === 'readwrite')
        throw new DOMException('Test quota exhausted', 'QuotaExceededError');
      return (original as any).apply(this, args);
    } as typeof original;
    const results = [];
    try {
      const actions = [
        () => app.autoAssignAll(),
        () =>
          app.importLibrary({
            name: '安多县',
            path: 'admin-geojson/xizang/anduo/anduo_all_levels.json',
          }),
        () =>
          app.importExtracted([
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [91.7, 32.3] },
              properties: { name: 'quota point' },
            },
          ]),
      ];
      for (const action of actions) {
        await action();
        results.push({ status: app.saveStatus, notice: app.notice });
      }
      return { results, annotations: app.annotations.length };
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });
  states.results.forEach((result) => {
    expect(result.status).toBe('未保存');
    expect(result.notice).toContain('保存失败');
    expect(result.notice).toContain('Test quota exhausted');
  });
  expect(states.annotations).toBe(1);
  await expect(page.locator('.notice')).toContainText('保存失败');
});

test('real Cesium scene, scrolling tasks, desktop and mobile layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.waitForTimeout(4000);
  await nonblank(page);
  const scroll = page.getByTestId('task-scroll');
  await scroll
    .locator('details')
    .evaluateAll((nodes) => nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)));
  expect(await scroll.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await scroll.evaluate((e) => (e.scrollTop = e.scrollHeight));
  expect(await scroll.evaluate((e) => e.scrollTop)).toBeGreaterThan(500);
  await expect(scroll.getByText('寺庙', { exact: true })).toBeInViewport();
  await scroll.evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: 'test-results/desktop.png' });
  const before = await page.locator('.scene canvas').screenshot();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await page.waitForTimeout(900);
  const after = await page.locator('.scene canvas').screenshot();
  expect(before.equals(after)).toBe(false);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.waitForTimeout(900);
  await nonblank(page);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1300);
  await expect(page.locator('.panel-tabs')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await scroll.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await nonblank(page);
  await page.screenshot({ path: 'test-results/mobile.png' });
  expect(errors).toEqual([]);
});

test('draw, edit, persist, import/export and link a task', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '绘制点标注', exact: true }).click();
  const p = await canvasPosition(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('名称', { exact: true }).fill('网页迁移测试点');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await expect(page.getByText('网页迁移测试点', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑网页迁移测试点' }).click();
  await page.getByLabel('备注', { exact: true }).fill('持久化验证');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '绘制道路', exact: true }).click();
  const a = await canvasPosition(page, -40, 0),
    b = await canvasPosition(page, 40, 20);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.getByRole('button', { name: '完成绘制', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('测试道路');
  await page.getByLabel('车道数', { exact: true }).fill('2');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const exported = await download;
  const data = JSON.parse(await readFile((await exported.path())!, 'utf8'));
  expect(data.features).toHaveLength(2);
  expect(data.features.find((f: any) => f.properties.name === '测试道路').properties.lanes).toBe(2);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'desktop.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: 'old',
          type: 'point',
          lng: 91.7,
          lat: 32.3,
          name: '旧版迁移点',
          sandtableKey: 'village:扎仁镇:#1',
        },
      ]),
    ),
  });
  await expect(page.getByText('旧版迁移点', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByTestId('task-scroll').getByText('扎仁镇 · 行政村', { exact: true }).click();
  await expect(
    page.getByTestId('task-scroll').getByText('旧版迁移点', { exact: true }),
  ).toBeVisible();
  const task = page
    .getByTestId('task-scroll')
    .getByText('旧版迁移点', { exact: true })
    .locator('..');
  await expect(task.getByText('已标注')).toBeVisible();
  await page.getByRole('textbox', { name: '搜索名称或经纬度' }).fill('旧版迁移点');
  await expect(
    page.getByTestId('task-scroll').getByText('旧版迁移点', { exact: true }),
  ).toBeVisible();
});

test('OSM extraction preview and selective import', async ({ page }) => {
  await page.route('**/api/interpreter', async (route) => {
    const text = route.request().postData() || '';
    const m = text.match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/)!;
    const lat = (+m[1] + +m[3]) / 2,
      lon = (+m[2] + +m[4]) / 2;
    await route.fulfill({
      json: {
        elements: [
          {
            type: 'way',
            id: 15,
            tags: { building: 'yes', name: '提取测试建筑' },
            geometry: [
              { lon, lat },
              { lon: lon + 0.0001, lat },
              { lon: lon + 0.0001, lat: lat + 0.0001 },
              { lon, lat },
            ],
          },
        ],
      },
    });
  });
  await open(page);
  await page.getByRole('textbox', { name: '搜索名称或经纬度' }).fill('91.682,32.262');
  await page.getByRole('textbox', { name: '搜索名称或经纬度' }).press('Enter');
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: '圈选提取范围', exact: true }).click();
  let vertexCount = 0;
  for (const [dx, dy] of [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ]) {
    const p = await canvasPosition(page, dx, dy);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('.draw-bar small')).toHaveText(`${++vertexCount} 个顶点`);
  }
  await page.getByRole('button', { name: '完成绘制', exact: true }).click();
  await page.getByRole('button', { name: '开始提取', exact: true }).click();
  await expect(page.getByText('提取测试建筑', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入 1', exact: true }).click();
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await expect(page.getByText('提取测试建筑', { exact: true })).toBeVisible();
});

test('polygon editing, vertex undo, boundary visibility and workspace restore', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.getByRole('textbox', { name: '搜索名称或经纬度' }).fill('91.682,32.262');
  await page.getByRole('textbox', { name: '搜索名称或经纬度' }).press('Enter');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '绘制建筑或区域', exact: true }).click();
  let count = 0;
  for (const [dx, dy] of [
    [-30, -30],
    [30, -30],
    [30, 30],
  ]) {
    const p = await canvasPosition(page, dx, dy);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('.draw-bar small')).toHaveText(`${++count} 个顶点`);
  }
  await page.getByRole('button', { name: '撤销顶点', exact: true }).click();
  await expect(page.locator('.draw-bar small')).toHaveText('2 个顶点');
  const last = await canvasPosition(page, 0, 30);
  await page.mouse.click(last.x, last.y);
  await page.getByRole('button', { name: '完成绘制', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('测试政府建筑');
  await page.getByLabel('楼层数', { exact: true }).fill('5');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('已保存到浏览器');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工作区备份', exact: true }).click();
  const file = await downloaded;
  const backup = await readFile((await file.path())!);
  const json = JSON.parse(backup.toString());
  expect(json.annotations[0].properties.floors).toBe(5);
  expect(json.annotations[0].geometry.coordinates[0]).toHaveLength(4);
  expect(json.boundaries.length).toBeGreaterThanOrEqual(14);
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await page.getByRole('button', { name: '编辑测试政府建筑', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除标注', exact: true }).click();
  await expect(page.getByText('测试政府建筑', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '图层', exact: true }).click();
  await page.getByLabel('行政边界', { exact: true }).uncheck();
  await expect(page.getByLabel('行政边界', { exact: true })).not.toBeChecked();
  await page.getByLabel('行政边界', { exact: true }).check();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '恢复工作区备份', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await (
    await chooser
  ).setFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('.status-count')).toHaveText('1 个标注');
  await page.getByRole('button', { name: '标注', exact: true }).click();
  await expect(page.getByText('测试政府建筑', { exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
  await expect(page.locator('.scene-error')).toHaveCount(0);
});
