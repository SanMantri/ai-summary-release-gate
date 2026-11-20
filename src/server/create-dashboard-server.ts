import { join } from 'node:path';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { requestLoggingMiddleware, testIdOf, type ServerLogger } from './request-logging';
import { sendApiError } from './routes/api-error-response';
import { createApprovalRoutes } from './routes/approval-routes';
import { createSummaryRoutes } from './routes/summary-routes';
import { createTestSeedingRoutes } from './routes/test-seeding-routes';
import { createTicketRoutes } from './routes/ticket-routes';
import type { FakeSummaryProvider } from './summary-provider/fake-summary-provider';
import type { SummaryProvider } from './summary-provider/summary-provider';
import type { TicketStore } from './ticket-store';

export interface DashboardServerOptions {
  ticketStore: TicketStore;
  summaryProvider: SummaryProvider;
  /** The API answers 503 unavailable when the provider takes longer than this. */
  providerTimeoutMs: number;
  logger: ServerLogger;
  /** Present only when ENABLE_TEST_SEEDING=1; mounts POST /api/__test__/tickets. */
  testSeeding?: { fakeSummaryProvider: FakeSummaryProvider };
  /** The Vite-built dashboard UI. Omit to serve the API only. */
  dashboardUiDirectory?: string;
}

export function createDashboardServer(options: DashboardServerOptions): Express {
  const { ticketStore, summaryProvider, providerTimeoutMs, logger, testSeeding } = options;
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLoggingMiddleware(logger));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use(createTicketRoutes(ticketStore));
  app.use(createSummaryRoutes({ ticketStore, summaryProvider, providerTimeoutMs, logger }));
  app.use(createApprovalRoutes(ticketStore, logger));
  if (testSeeding) {
    app.use(createTestSeedingRoutes(ticketStore, testSeeding.fakeSummaryProvider));
  }
  app.use('/api', (_request, response) => {
    sendApiError(response, 404, 'not_found');
  });

  if (options.dashboardUiDirectory) {
    const dashboardUiDirectory = options.dashboardUiDirectory;
    app.use(express.static(dashboardUiDirectory));
    // Client-side routes such as /tickets/t-123 are served the single-page app.
    app.use((request, response, next) => {
      if (request.method !== 'GET') {
        next();
        return;
      }
      response.sendFile(join(dashboardUiDirectory, 'index.html'));
    });
  }

  app.use(createErrorHandler(logger));
  return app;
}

function createErrorHandler(logger: ServerLogger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    if (isUnreadableJsonBodyError(error)) {
      sendApiError(response, 400, 'invalid_payload', {
        issues: [{ path: '', message: 'Request body is not valid JSON' }],
      });
      return;
    }

    logger.log('unexpected_server_error', {
      testId: testIdOf(request),
      method: request.method,
      path: request.path,
      reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    sendApiError(response, 500, 'internal_error');
  };
}

function isUnreadableJsonBodyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}
