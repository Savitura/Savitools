import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for SaviTools end-to-end tests.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI ? 'npm run start -w apps/web' : 'npm run dev -w apps/web',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
