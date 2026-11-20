import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';
import { summaryResponses, type MockSummaryResponse } from '../support/summary-response-builders';
import type { SeededTicket } from '../support/ticket-factory';

/**
 * UI layer: an invalid summary must block approval. The browser covers the two cases the
 * exercise names (missing and cross-ticket citations); every other combination of the citation
 * rule is covered by the developer unit tests.
 */
const invalidCitationCases: Array<{
  citations: string;
  summaryResponseFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => MockSummaryResponse;
  expectedProblemFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => string;
}> = [
  {
    citations: 'no messages',
    summaryResponseFor: () => summaryResponses.withoutCitations(),
    expectedProblemFor: () => 'does not cite any message from this ticket',
  },
  {
    citations: 'a message from another ticket alongside a valid one',
    summaryResponseFor: (ticket, anotherTicket) =>
      summaryResponses.citing([ticket.firstMessageId, anotherTicket.firstMessageId]),
    expectedProblemFor: (_ticket, anotherTicket) =>
      `Message ${anotherTicket.firstMessageId} is not part of this ticket`,
  },
];

test.describe('Blocking approval of summaries with invalid citations', () => {
  for (const { citations, summaryResponseFor, expectedProblemFor } of invalidCitationCases) {
    test(
      `blocks approval when the summary cites ${citations}`,
      catalogId('UI-05'),
      async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
        const ticket = await ticketFactory.createTicket();
        const anotherTicket = await ticketFactory.createTicket();
        summaryServiceMock.respondWith(summaryResponseFor(ticket, anotherTicket));
        await dashboardPage.openTicket(ticket.id);

        await dashboardPage.generateSummary();

        await expect(dashboardPage.summaryText).toBeVisible();
        await expect(dashboardPage.citationWarning).toContainText(
          expectedProblemFor(ticket, anotherTicket),
        );
        await expect(dashboardPage.approveSummaryButton).toBeDisabled();
      },
    );
  }
});
