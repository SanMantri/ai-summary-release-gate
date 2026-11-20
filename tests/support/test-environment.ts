import { resolve } from 'node:path';

/**
 * Where the test web server runs and writes its request log. It uses its own port so it never
 * collides with (or silently reuses) a demo server started with `npm start` on 5179.
 */
export const dashboardTestPort = Number(process.env.DASHBOARD_TEST_PORT ?? 5180);
export const dashboardTestBaseUrl = `http://localhost:${dashboardTestPort}`;
export const serverLogFilePath = resolve(
  import.meta.dirname,
  '../../release-gate-evidence/server-log.jsonl',
);

/** The test server answers 503 unavailable when the fake provider takes longer than this. */
export const testProviderTimeoutMs = 300;
