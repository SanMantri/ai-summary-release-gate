import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';
import { summaryResponses } from '../support/summary-response-builders';

/**
 * UI layer: timing. Responses are held and released by the test, so these races are
 * reproduced deterministically instead of hoped for.
 */
test.describe('Summary request timing', () => {
  test(
    'does not show a late summary from the previous ticket after switching tickets',
    catalogId('UI-06'),
    async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
      const previousTicket = await ticketFactory.createTicket({ subject: 'Previous ticket' });
      const currentTicket = await ticketFactory.createTicket({ subject: 'Current ticket' });
      const lateSummaryForPreviousTicket = summaryServiceMock.holdNextResponse(
        summaryResponses.validFor(previousTicket),
      );
      await dashboardPage.openTicket(previousTicket.id);
      await dashboardPage.generateSummary();
      await expect(dashboardPage.generatingStatus).toBeVisible();

      await dashboardPage.switchToTicket(currentTicket.subject);
      await expect(dashboardPage.ticketHeading).toHaveText(currentTicket.subject);
      await lateSummaryForPreviousTicket.release();

      await expect(dashboardPage.generateSummaryButton).toBeEnabled();
      await expect(dashboardPage.summaryText).toBeHidden();
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();
      expect(summaryServiceMock.requestsForTicket(currentTicket.id)).toHaveLength(0);
    },
  );

  test(
    'sends one summary request while generation is in progress',
    catalogId('UI-07'),
    async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket();
      const heldSummary = summaryServiceMock.holdNextResponse(summaryResponses.validFor(ticket));
      await dashboardPage.openTicket(ticket.id);

      await dashboardPage.generateSummaryWithDoubleClick();

      await expect(dashboardPage.generatingStatus).toBeVisible();
      await expect(dashboardPage.generateSummaryButton).toBeDisabled();

      await heldSummary.release();

      await expect(dashboardPage.approveSummaryButton).toBeEnabled();
      expect(summaryServiceMock.requestsForTicket(ticket.id)).toHaveLength(1);
    },
  );
});
