import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDashboardServer } from './create-dashboard-server';
import { seedDemoTickets } from './demo-tickets';
import { createServerLogger } from './request-logging';
import { FakeSummaryProvider } from './summary-provider/fake-summary-provider';
import { TicketStore } from './ticket-store';

/**
 * Entry point for `npm start` (demo) and the Playwright web server (tests).
 *
 * Environment:
 *   DASHBOARD_PORT       default 5179
 *   ENABLE_TEST_SEEDING  "1" mounts POST /api/__test__/tickets (tests only, never in production)
 *   PROVIDER_TIMEOUT_MS  default 10000; the API answers 503 when the provider is slower
 *   SERVER_LOG_FILE      default release-gate-evidence/server-log.jsonl
 */
const port = Number(process.env.DASHBOARD_PORT ?? 5179);
const enableTestSeeding = process.env.ENABLE_TEST_SEEDING === '1';
const providerTimeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS ?? 10_000);
const logFilePath = process.env.SERVER_LOG_FILE ?? 'release-gate-evidence/server-log.jsonl';
const dashboardUiDirectory = resolve('dist/dashboard-ui');
const dashboardUiIsBuilt = existsSync(resolve(dashboardUiDirectory, 'index.html'));

const logger = createServerLogger({ logFilePath, echoToStdout: !enableTestSeeding });
const ticketStore = new TicketStore();
const fakeSummaryProvider = new FakeSummaryProvider();
seedDemoTickets(ticketStore, fakeSummaryProvider);

const app = createDashboardServer({
  ticketStore,
  summaryProvider: fakeSummaryProvider,
  providerTimeoutMs,
  logger,
  testSeeding: enableTestSeeding ? { fakeSummaryProvider } : undefined,
  dashboardUiDirectory: dashboardUiIsBuilt ? dashboardUiDirectory : undefined,
});

const server = app.listen(port, () => {
  console.log(`Support dashboard listening on http://localhost:${port}`);
  console.log(`  summary provider: fake (synthetic data, no external AI calls)`);
  console.log(`  test seeding: ${enableTestSeeding ? 'ENABLED (tests only)' : 'disabled'}`);
  console.log(`  server log: ${logFilePath}`);
  if (!dashboardUiIsBuilt) {
    console.log('  dashboard UI: not built — run `npm run build:ui` (API only)');
  }
});

server.on('error', (error) => {
  console.error(`Dashboard server failed to start on port ${port}: ${error.message}`);
  process.exit(1);
});
