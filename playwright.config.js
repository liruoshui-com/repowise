import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3107', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'node server/index.js', url: 'http://127.0.0.1:3107/api/health', reuseExistingServer: false,
    env: { PORT: '3107', HOST: '127.0.0.1', BASE_URL: 'http://127.0.0.1:3107', DATA_DIR: `./var/browser-${Date.now()}`, MAIL_MODE: 'local', NODE_ENV: 'test', ADMIN_TOKEN: 'browser-test-only-secret-at-least-32-characters' }
  }
});
