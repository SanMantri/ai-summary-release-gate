import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';
import { summaryResponses } from '../support/summary-response-builders';

/**
 * UI layer: model output is untrusted input. Customer messages can carry prompt injections,
 * so a summary may contain markup; it must be shown as text, never executed.
 */
test.describe('Rendering model output safely', () => {
  test(
    'renders summary text literally instead of executing markup from the model',
    catalogId('UI-12'),
    async ({ page, ticketFactory, summaryServiceMock, dashboardPage }) => {
      const dialogsOpened: string[] = [];
      page.on('dialog', (dialog) => {
        dialogsOpened.push(dialog.message());
        void dialog.dismiss();
      });
      const ticket = await ticketFactory.createTicket();
      summaryServiceMock.respondWith(summaryResponses.withMarkupInSummary(ticket));
      await dashboardPage.openTicket(ticket.id);

      await dashboardPage.generateSummary();

      await expect(dashboardPage.summaryText).toContainText('<img src=x onerror=');
      await expect(dashboardPage.summaryPanel.locator('img')).toHaveCount(0);
      expect(dialogsOpened).toEqual([]);
    },
  );
});
