import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const useHttps = existsSync('.certs/local.pem') && existsSync('.certs/local-key.pem') && process.env.MY_MUSIC_HTTP !== '1';
const baseURL = `${useHttps ? 'https' : 'http'}://127.0.0.1:4174`;
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: { baseURL, trace: "off", screenshot: "off" },
  projects: [
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
  },
});
