import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  retries: process.env.CI ? 1 : 0, reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: { baseURL: 'http://127.0.0.1:7444', trace: 'retain-on-failure', reducedMotion: 'reduce', colorScheme: 'light', actionTimeout: 15000 },
  webServer: { command: 'node test/e2e/server.mjs', url: 'http://127.0.0.1:7444', timeout: 120000, reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
