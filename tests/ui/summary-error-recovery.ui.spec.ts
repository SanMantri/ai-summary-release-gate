import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';
import { summaryResponses } from '../support/summary-response-builders';

/**
 * UI layer: error and recovery. Approval must stay disabled until a retry returns a VALID
 * summary — a successful retry with an invalid citation must not enable it.
 */
test.describe('Recovering from summary generation errors', () => {
  test(
    'recovers from an unavailable service when the retry returns a valid summary',
    catalogId('UI-03'),
    async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket();
      summaryServiceMock.respondWith(
        summaryResponses.unavailable(),
        summaryResponses.validFor(ticket),
      );
      await dashboardPage.openTicket(ticket.id);

      await dashboardPage.generateSummary();

      await expect(dashboardPage.generationErrorAlert).toBeVisible();
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();

      await dashboardPage.retryGeneration();

      await expect(dashboardPage.summaryText).toBeVisible();
      await expect(dashboardPage.approveSummaryButton).toBeEnabled();
      expect(summaryServiceMock.requestsForTicket(ticket.id)).toHaveLength(2);
    },
  );

  test(
    'keeps approval disabled when the retry returns a summary citing another ticket',
    catalogId('UI-04'),
    async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket();
      const anotherTicket = await ticketFactory.createTicket();
      summaryServiceMock.respondWith(
        summaryResponses.unavailable(),
        summaryResponses.citing([anotherTicket.firstMessageId]),
      );
      await dashboardPage.openTicket(ticket.id);
      await dashboardPage.generateSummary();
      await expect(dashboardPage.generationErrorAlert).toBeVisible();

      await dashboardPage.retryGeneration();

      await expect(dashboardPage.citationWarning).toBeVisible();
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();
    },
  );
});
