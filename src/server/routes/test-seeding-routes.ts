import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { messageAuthorSchema, type Ticket } from '../../domain/ticket';
import {
  fakeSummaryScenarios,
  type FakeSummaryProvider,
} from '../summary-provider/fake-summary-provider';
import type { TicketStore } from '../ticket-store';
import { sendApiError } from './api-error-response';

export const seedTicketRequestSchema = z.object({
  subject: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(1).optional(),
  messages: z
    .array(z.object({ author: messageAuthorSchema, body: z.string().trim().min(1) }))
    .min(1),
  fakeSummaryScenario: z.enum(fakeSummaryScenarios).optional(),
});

export type SeedTicketRequest = z.infer<typeof seedTicketRequestSchema>;

const firstMessageSentAt = Date.UTC(2026, 2, 2, 9, 0, 0);
const minutesBetweenMessages = 5;

/**
 * POST /api/__test__/tickets — creates an isolated synthetic ticket for one test.
 * Mounted only when ENABLE_TEST_SEEDING=1 (plan.md §3.8); IDs are server-assigned UUIDs,
 * so tests running in parallel can never collide.
 */
export function createTestSeedingRoutes(
  ticketStore: TicketStore,
  fakeSummaryProvider: FakeSummaryProvider,
): Router {
  const router = Router();

  router.post('/api/__test__/tickets', (request, response) => {
    const seedRequest = seedTicketRequestSchema.safeParse(request.body);
    if (!seedRequest.success) {
      sendApiError(response, 400, 'invalid_payload', {
        issues: seedRequest.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { subject, customerName, messages, fakeSummaryScenario } = seedRequest.data;
    const ticketId = `t-${randomUUID()}`;
    const ticket: Ticket = {
      id: ticketId,
      subject: subject ?? `Synthetic ticket ${ticketId.slice(2, 10)}`,
      customerName: customerName ?? 'Synthetic Customer',
      messages: messages.map((message, index) => ({
        id: `m-${randomUUID()}`,
        author: message.author,
        sentAt: new Date(
          firstMessageSentAt + index * minutesBetweenMessages * 60_000,
        ).toISOString(),
        body: message.body,
      })),
    };

    ticketStore.add(ticket);
    fakeSummaryProvider.useScenarioForTicket(ticketId, fakeSummaryScenario ?? 'ok');
    response.status(201).json(ticket);
  });

  return router;
}
