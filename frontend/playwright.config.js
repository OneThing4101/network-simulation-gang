import {defineConfig, devices} from '@playwright/test';

const PORT = process.env.FIBERLAB_PORT || '5080';
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {timeout: 10_000},
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}},
      testIgnore: /mobile\.spec\.js/,
    },
    {
      name: 'chromium-mobile',
      use: {...devices['Pixel 7'], viewport: {width: 390, height: 844}},
      testMatch: /mobile\.spec\.js/,
    },
  ],
  webServer: {
    command: '.venv/bin/python -m fiberlab.app',
    cwd: '..',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {FIBERLAB_PORT: PORT},
  },
});
