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
 * A disabled Approve button is UX, not a control — every invalid citation combination is
 * tested here, once, instead of being repeated through the browser.
 */
const approvalPath = (ticketId: string) => `/api/tickets/${ticketId}/approve`;
const summaryText = 'The customer was charged twice and wants the duplicate charge refunded.';

async function readTicket(request: APIRequestContext, ticketId: string) {
  return ticketSchema.parse(await (await request.get(`/api/tickets/${ticketId}`)).json());
}

interface InvalidCitationCase {
  citations: string;
  sourceIdsFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => string[] | undefined;
  expectedReasonsFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => CitationProblem[];
}

const invalidCitationCases: InvalidCitationCase[] = [
  {
    citations: 'an empty citation list',
    sourceIdsFor: () => [],
    expectedReasonsFor: () => [{ code: 'no_citations' }],
  },
  {
    citations: 'no citation list at all',
    sourceIdsFor: () => undefined,
    expectedReasonsFor: () => [{ code: 'no_citations' }],
  },
  {
    citations: "only another ticket's message",
    sourceIdsFor: (_ticket, anotherTicket) => [anotherTicket.firstMessageId],
    expectedReasonsFor: (_ticket, anotherTicket) => [
      { code: 'citation_not_in_ticket', messageId: anotherTicket.firstMessageId },
    ],
  },
  {
    citations: "a valid message plus another ticket's message",
    sourceIdsFor: (ticket, anotherTicket) => [ticket.firstMessageId, anotherTicket.firstMessageId],
    expectedReasonsFor: (_ticket, anotherTicket) => [
      { code: 'citation_not_in_ticket', messageId: anotherTicket.firstMessageId },
    ],
  },
  {
    citations: 'a message ID that exists nowhere',
    sourceIdsFor: () => ['m-does-not-exist'],
    expectedReasonsFor: () => [{ code: 'citation_not_in_ticket', messageId: 'm-does-not-exist' }],
  },
];

const malformedRequestCases = [
  {
    request: 'a citation list that is not an array',
    bodyFor: (ticket: SeededTicket) => ({ summary: summaryText, sourceIds: ticket.firstMessageId }),
  },
  {
    request: 'no summary text',
    bodyFor: (ticket: SeededTicket) => ({ sourceIds: [ticket.firstMessageId] }),
  },
  {
    request: 'blank summary text',
    bodyFor: (ticket: SeededTicket) => ({ summary: '   ', sourceIds: [ticket.firstMessageId] }),
  },
  {
    request: 'an unreadable JSON body',
    bodyFor: () => '{"summary": ',
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
      expect(approval.approvedSummary).toMatchObject({
        summary: summaryText,
        sourceIds: [ticket.firstMessageId],
      });
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

  for (const malformedCase of malformedRequestCases) {
    test(
      `rejects a malformed approval request with ${malformedCase.request}`,
      catalogId('API-APR-03'),
      async ({ request, ticketFactory }) => {
        const ticket = await ticketFactory.createTicket();

        const response = await request.post(approvalPath(ticket.id), {
          headers: { 'content-type': 'application/json' },
          data: malformedCase.bodyFor(ticket),
        });

        expect(response.status()).toBe(400);
        const body: unknown = await response.json();
        expect(body).toMatchObject({ error: 'invalid_payload' });
      },
    );
  }

  test(
    'returns not found when approving an unknown ticket',
    catalogId('API-APR-04'),
    async ({ request }) => {
      const response = await request.post(approvalPath('t-does-not-exist'), {
        data: { summary: summaryText, sourceIds: ['m-1'] },
      });

      expect(response.status()).toBe(404);
      const body: unknown = await response.json();
      expect(body).toEqual({ error: 'ticket_not_found' });
    },
  );

  test(
    'refuses a second approval and keeps the first one',
    catalogId('API-APR-05'),
    async ({ request, ticketFactory }) => {
      const ticket = await ticketFactory.createTicket();
      await request.post(approvalPath(ticket.id), {
        data: { summary: summaryText, sourceIds: [ticket.firstMessageId] },
      });

      const secondResponse = await request.post(approvalPath(ticket.id), {
        data: { summary: 'A different summary.', sourceIds: [ticket.firstMessageId] },
      });

      expect(secondResponse.status()).toBe(409);
      const body: unknown = await secondResponse.json();
      expect(body).toEqual({ error: 'already_approved' });
      const persistedTicket = await readTicket(request, ticket.id);
      expect(persistedTicket.approvedSummary?.summary).toBe(summaryText);
    },
  );

  test(
    'lets exactly one of two simultaneous approvals succeed',
    catalogId('API-APR-06'),
    async ({ request, ticketFactory }) => {
      const ticket = await ticketFactory.createTicket();
      const approval = { data: { summary: summaryText, sourceIds: [ticket.firstMessageId] } };

      const responses = await Promise.all([
        request.post(approvalPath(ticket.id), approval),
        request.post(approvalPath(ticket.id), approval),
      ]);

      expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
    },
  );
});
