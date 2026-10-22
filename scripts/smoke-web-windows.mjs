import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = path.join(root, 'web-dist-windows');
const directories = (await fs.readdir(base, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
const dir = path.join(base, directories.sort().at(-1));
const child = spawn(process.execPath, ['scripts/serve-web.mjs'], {
  cwd: dir,
  env: { ...process.env, AMAP_WEB_KEY: '', AMAP_SECURITY_JSCODE: '', WEB_PORT: '18080' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
  });
  for (const [url, status] of [
    ['/', 200], ['/amap-terrain-lab.html', 200], ['/api/amap/status', 503],
    ['/api/route?origin=91.68,32.26&destination=91.70,32.28', 503],
    ['/api/route?origin=x', 400], ['/.env', 403], ['/server/routing.mjs', 404], ['/missing', 404],
  ]) {
    const response = await fetch(`http://127.0.0.1:18080${url}`);
    assert.equal(response.status, status, url);
    console.log('PASS', url, status);
  }
  const env = parseEnv(await fs.readFile(path.join(root, '.env.local'), 'utf8').catch(() => ''));
  async function scan(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file);
      else {
        assert(!['.env', '.env.local'].includes(entry.name));
        const body = await fs.readFile(file);
        for (const key of ['AMAP_WEB_KEY', 'AMAP_SECURITY_JSCODE'])
          if (env[key]) assert(!body.includes(Buffer.from(env[key])), `Secret leaked: ${key}`);
      }
    }
  }
  await scan(dir);
  console.log('PASS no private server credentials in package');
  const test = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
    'exec', 'playwright', 'test', 'tests/e2e/amap.spec.ts', 'tests/e2e/fullscreen.spec.ts', 'tests/e2e/hybrid-map.spec.ts',
  ], { cwd: root, env: { ...process.env, TEST_URL: 'http://127.0.0.1:18080' }, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { test.on('exit', resolve); test.on('error', reject); });
  assert.equal(code, 0, 'Browser tests');
} finally { child.kill(); }