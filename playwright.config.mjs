import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 2,
  use: {
    baseURL: "http://localhost:5174",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:mock",
    env: { PORT: "5174", HMR_PORT: "24679", USE_QLOO_MOCK: "true" },
    url: "http://localhost:5174/api/sample",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1100 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
