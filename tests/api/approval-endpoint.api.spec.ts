import type { APIRequestContext } from '@playwright/test';
import {
  approvalRejectedResponseSchema,
  approvalSuccessResponseSchema,
} from '../../src/domain/approval-request-contract';
import type { CitationProblem } from '../../src/domain/citation-validation';
import { ticketSchema } from '../../src/domain/ticket';
import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';
import type { SeededTicket } from '../support/ticket-factory';

/**
 * API layer: server-side enforcement of the citation rule (plan.md §5.2).
 * A disabled Approve button is UX, not a control — the API must refuse an invalid approval
 * even when the UI is bypassed. Every other combination of the rule is covered by the
 * developer unit tests (DEV-01).
 */
const approvalPath = (ticketId: string) => `/api/tickets/${ticketId}/approve`;
const summaryText = 'The customer was charged twice and wants the duplicate charge refunded.';

async function readTicket(request: APIRequestContext, ticketId: string) {
  return ticketSchema.parse(await (await request.get(`/api/tickets/${ticketId}`)).json());
}

const invalidCitationCases: Array<{
  citations: string;
  sourceIdsFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => string[];
  expectedReasonsFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => CitationProblem[];
}> = [
  {
    citations: 'no messages',
    sourceIdsFor: () => [],
    expectedReasonsFor: () => [{ code: 'no_citations' }],
  },
  {
    citations: "a valid message plus another ticket's message",
    sourceIdsFor: (ticket, anotherTicket) => [ticket.firstMessageId, anotherTicket.firstMessageId],
    expectedReasonsFor: (_ticket, anotherTicket) => [
      { code: 'citation_not_in_ticket', messageId: anotherTicket.firstMessageId },
    ],
  },
];

test.describe('POST /api/tickets/:ticketId/approve', () => {
  test(
    'approves a summary with valid citations and persists the approval',
    catalogId('API-APR-01'),
    async ({ request, ticketFactory }) => {
      const ticket = await ticketFactory.createTicket();

      const response = await request.post(approvalPath(ticket.id), {
        data: { summary: summaryText, sourceIds: [ticket.firstMessageId] },
      });

      expect(response.status()).toBe(200);
      const approval = approvalSuccessResponseSchema.parse(await response.json());
      const persistedTicket = await readTicket(request, ticket.id);
      expect(persistedTicket.approvedSummary).toEqual(approval.approvedSummary);
    },
  );

  for (const invalidCase of invalidCitationCases) {
    test(
      `refuses to approve a summary citing ${invalidCase.citations}`,
      catalogId('API-APR-02'),
      async ({ request, ticketFactory }) => {
        const ticket = await ticketFactory.createTicket();
        const anotherTicket = await ticketFactory.createTicket();

        const response = await request.post(approvalPath(ticket.id), {
          data: {
            summary: summaryText,
            sourceIds: invalidCase.sourceIdsFor(ticket, anotherTicket),
          },
        });

        expect(response.status()).toBe(422);
        const rejection = approvalRejectedResponseSchema.parse(await response.json());
        expect(rejection.reasons).toEqual(invalidCase.expectedReasonsFor(ticket, anotherTicket));
        const ticketAfterRejection = await readTicket(request, ticket.id);
        expect(ticketAfterRejection.approvedSummary).toBeUndefined();
      },
    );
  }
});
