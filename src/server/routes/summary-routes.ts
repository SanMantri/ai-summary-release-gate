import { Router } from 'express';
import { parseSummaryResponse } from '../../domain/summary-response-contract';
import type { Ticket } from '../../domain/ticket';
import { testIdOf, type ServerLogger } from '../request-logging';
import type { SummaryProvider, SummaryServiceReply } from '../summary-provider/summary-provider';
import type { TicketStore } from '../ticket-store';
import { sendApiError } from './api-error-response';

export interface SummaryRoutesOptions {
  ticketStore: TicketStore;
  summaryProvider: SummaryProvider;
  providerTimeoutMs: number;
  logger: ServerLogger;
}

class ProviderTimeLimitExceededError extends Error {
  override name = 'ProviderTimeLimitExceededError';
}

/**
 * POST /api/tickets/:ticketId/summary — asks the summary provider and returns its reply in the
 * exercise's contract shapes (plan.md §3.5):
 *   provider crash or time limit exceeded → 503 { error: "unavailable" }
 *   provider reply that breaks the contract → 502 { error: "invalid_provider_response" }
 * Citations are passed through untouched: the dashboard decides approvability.
 */
export function createSummaryRoutes({
  ticketStore,
  summaryProvider,
  providerTimeoutMs,
  logger,
}: SummaryRoutesOptions): Router {
  const router = Router();

  router.post('/api/tickets/:ticketId/summary', async (request, response) => {
    const ticket = ticketStore.find(request.params.ticketId);
    if (!ticket) {
      sendApiError(response, 404, 'ticket_not_found');
      return;
    }

    let reply: SummaryServiceReply;
    try {
      reply = await requestSummaryWithinTimeLimit(summaryProvider, ticket, providerTimeoutMs);
    } catch (error) {
      logger.log('summary_provider_failed', {
        testId: testIdOf(request),
        ticketId: ticket.id,
        provider: summaryProvider.providerName,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
      sendApiError(response, 503, 'unavailable');
      return;
    }

    const outcome = parseSummaryResponse(reply.httpStatus, reply.body);
    switch (outcome.kind) {
      case 'summary':
        response.status(200).json({
          status: 'ok',
          summary: outcome.summary,
          sourceIds: outcome.sourceIds,
        });
        return;
      case 'insufficient-information':
        response.status(200).json({ status: 'insufficient_information' });
        return;
      case 'unavailable':
        sendApiError(response, 503, 'unavailable');
        return;
      case 'off-contract':
        logger.log('summary_provider_broke_contract', {
          testId: testIdOf(request),
          ticketId: ticket.id,
          provider: summaryProvider.providerName,
          reason: outcome.reason,
          providerHttpStatus: reply.httpStatus,
        });
        sendApiError(response, 502, 'invalid_provider_response');
        return;
    }
  });

  return router;
}

async function requestSummaryWithinTimeLimit(
  summaryProvider: SummaryProvider,
  ticket: Ticket,
  timeLimitMs: number,
): Promise<SummaryServiceReply> {
  const cancellation = new AbortController();
  let timeLimitTimer: NodeJS.Timeout | undefined;

  const timeLimitExceeded = new Promise<never>((_resolve, reject) => {
    timeLimitTimer = setTimeout(() => {
      const error = new ProviderTimeLimitExceededError(
        `Summary provider did not answer within ${timeLimitMs} ms`,
      );
      cancellation.abort(error);
      reject(error);
    }, timeLimitMs);
  });

  try {
    return await Promise.race([
      summaryProvider.requestSummary(ticket, cancellation.signal),
      timeLimitExceeded,
    ]);
  } catch (error) {
    // A provider that rejects because it was cancelled should be reported as the time limit
    // being exceeded — that is the cause an investigator needs to see in the server log.
    throw cancellation.signal.reason instanceof ProviderTimeLimitExceededError
      ? cancellation.signal.reason
      : error;
  } finally {
    clearTimeout(timeLimitTimer);
  }
}
