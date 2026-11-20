import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';

/**
 * Smoke layer: nothing is faked in the browser. These tests prove the real path
 * UI → dashboard API → fake AI provider works, catching URL or payload mismatches that
 * browser-level mocks would hide. Do not use summaryServiceMock here.
 */
test.describe('Full-stack summary smoke', () => {
  test(
    'generates and approves a summary end to end, and the approval survives a reload',
    catalogId('SMOKE-01'),
    async ({ page, ticketFactory, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket({ fakeSummaryScenario: 'ok' });
      await dashboardPage.openTicket(ticket.id);

      await dashboardPage.generateSummary();

      await expect(dashboardPage.citationLinks).toHaveText([ticket.firstMessageId]);
      await expect(dashboardPage.approveSummaryButton).toBeEnabled();

      await dashboardPage.approveSummary();
      await expect(dashboardPage.approvedNotice).toBeVisible();
      await page.reload();

      await expect(dashboardPage.approvedNotice).toBeVisible();
      await expect(dashboardPage.citationLinks).toHaveText([ticket.firstMessageId]);
    },
  );

  test(
    'recovers from an unavailable summary service end to end',
    catalogId('SMOKE-02'),
    async ({ ticketFactory, dashboardPage }) => {
      const ticket = await ticketFactory.createTicket({
        fakeSummaryScenario: 'unavailable_then_ok',
      });
      await dashboardPage.openTicket(ticket.id);

      await dashboardPage.generateSummary();

      await expect(dashboardPage.generationErrorAlert).toBeVisible();
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();

      await dashboardPage.retryGeneration();

      await expect(dashboardPage.summaryText).toBeVisible();
      await expect(dashboardPage.approveSummaryButton).toBeEnabled();
    },
  );
});
