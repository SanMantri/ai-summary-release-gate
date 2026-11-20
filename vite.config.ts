import { defineConfig } from 'vite';

// The dashboard API (Express) serves the built UI in tests, CI and `npm start`.
// During `npm run dev`, the Vite dev server serves the UI and forwards /api calls to it.
const dashboardApiPort = process.env.DASHBOARD_PORT ?? '5179';

export default defineConfig({
  root: 'src/dashboard-ui',
  build: {
    outDir: '../../dist/dashboard-ui',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': `http://localhost:${dashboardApiPort}`,
    },
  },
});
