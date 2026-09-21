import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "e2e",
  timeout: 30000,
  outputDir: path.join(dirname, "test-results"),
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: path.join(dirname, "playwright-report"), open: "never" },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:8099",
  },
  webServer: {
    command: "node e2e/server.mjs",
    url: "http://127.0.0.1:8099/health",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
