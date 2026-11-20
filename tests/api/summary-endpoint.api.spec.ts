import { z } from 'zod';
import { summaryReadyResponseSchema } from '../../src/domain/summary-response-contract';
import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';

/**
 * API layer: the summary endpoint returns the exercise's response shapes (plan.md §5.2).
 * Each test picks the server's fake AI behaviour for its own ticket, so tests never share state.
 */
const citedSummaryResponseSchema = summaryReadyResponseSchema.extend({
  sourceIds: z.array(z.string()).min(1),
});

const summaryPath = (ticketId: string) => `/api/tickets/${ticketId}/summary`;

test.describe('POST /api/tickets/:ticketId/summary', () => {
  test(
    'returns a contract-valid summary whose citations belong to the ticket',
    catalogId('API-SUM-01'),
    async ({ request, ticketFactory }) => {
      const ticket = await ticketFactory.createTicket({ fakeSummaryScenario: 'ok' });

      const response = await request.post(summaryPath(ticket.id));

      expect(response.status()).toBe(200);
      const summaryResponse = citedSummaryResponseSchema.parse(await response.json());
      expect(ticket.messageIds).toEqual(expect.arrayContaining(summaryResponse.sourceIds));
    },
  );

  test(
    'returns insufficient information when the provider cannot summarise the ticket',
    catalogId('API-SUM-02'),
    async ({ request, ticketFactory }) => {
      const ticket = await ticketFactory.createTicket({
        fakeSummaryScenario: 'insufficient_information',
      });

      const response = await request.post(summaryPath(ticket.id));

      expect(response.status()).toBe(200);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'insufficient_information' });
    },
  );

  test(
    'returns unavailable, then recovers on the next request',
    catalogId('API-SUM-03'),
    async ({ request, ticketFactory }) => {
      const ticket = await ticketFactory.createTicket({
        fakeSummaryScenario: 'unavailable_then_ok',
      });

      const firstResponse = await request.post(summaryPath(ticket.id));
      const retryResponse = await request.post(summaryPath(ticket.id));

      expect(firstResponse.status()).toBe(503);
      const firstBody: unknown = await firstResponse.json();
      expect(firstBody).toEqual({ error: 'unavailable' });
      expect(retryResponse.status()).toBe(200);
      const recoveredSummary = citedSummaryResponseSchema.parse(await retryResponse.json());
      expect(ticket.messageIds).toEqual(expect.arrayContaining(recoveredSummary.sourceIds));
    },
  );
});
