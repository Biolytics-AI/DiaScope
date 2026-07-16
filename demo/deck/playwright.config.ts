import { defineConfig } from "@playwright/test";

// NOTE: Task 17 specified port 5199, but in this environment 5199 is occupied by an
// unrelated project's vite dev server (Corpus-to-Table) and 5173/5174/4173 by stale vite
// processes. With `--strictPort` our server can't bind an occupied port, and with
// `reuseExistingServer` Playwright would wrongly reuse whatever already answers there — so we
// use a free port. Change this if 5203 is taken; any free port works.
const PORT = 5203;

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, screenshot: "off", video: "off" },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "narrow", use: { viewport: { width: 1000, height: 700 } } },
  ],
});
