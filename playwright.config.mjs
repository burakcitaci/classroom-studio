import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

process.env['STUDIO_BROWSER_SCHEMA'] ??= 'studio_test_' + randomUUID().replaceAll('-', '');

export default defineConfig({
  testDir: './tests',
  globalTeardown: './tests/browser-teardown.mjs',
  testMatch: '*.browser.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 40_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    baseURL: 'http://127.0.0.1:4372',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: '"' + process.execPath + '" scripts/browser-server.mjs',
    url: 'http://127.0.0.1:4372/api/status',
    timeout: 25_000,
    reuseExistingServer: false,
  },
});
