import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: process.env.TEST_URL || 'http://127.0.0.1:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
});
