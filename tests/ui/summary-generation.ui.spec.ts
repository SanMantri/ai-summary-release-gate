import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';
import { summaryResponses } from '../support/summary-response-builders';

/**
 * UI layer: a successful generation and the insufficient-information state. The AI summary
 * service is faked in the browser; approvals reach the real dashboard API. No assertion depends
 * on the summary's wording.
 */
test.describe('Generating and approving a summary', () => {
  test(
    'shows a valid summary with its citations and lets the agent approve it',
    catalogId('UI-01'),
    async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket();
      summaryServiceMock.respondWith(summaryResponses.validFor(ticket));
      await dashboardPage.openTicket(ticket.id);
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();

      await dashboardPage.generateSummary();

      await expect(dashboardPage.summaryText).toBeVisible();
      await expect(dashboardPage.citationLinks).toHaveText([ticket.firstMessageId]);
      await expect(dashboardPage.approveSummaryButton).toBeEnabled();

      await dashboardPage.approveSummary();

      await expect(dashboardPage.approvedNotice).toBeVisible();
      await expect(dashboardPage.approveSummaryButton).toBeHidden();
      expect(summaryServiceMock.requestsForTicket(ticket.id)).toHaveLength(1);
    },
  );

  test(
    'shows the insufficient-information notice and keeps approval disabled',
    catalogId('UI-02'),
    async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket();
      summaryServiceMock.respondWith(summaryResponses.insufficientInformation());
      await dashboardPage.openTicket(ticket.id);

      await dashboardPage.generateSummary();

      await expect(dashboardPage.insufficientInformationNotice).toBeVisible();
      await expect(dashboardPage.summaryText).toBeHidden();
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();
    },
  );
});
