import type { Locator, Page } from '@playwright/test';

/**
 * Page object for the support dashboard: locators and user actions only.
 * Assertions stay in the spec files, so each test's intent is readable where it is written.
 * Locators use roles and accessible names first; data-testid only for the non-semantic summary text.
 */
export class DashboardPage {
  readonly page: Page;
  readonly ticketHeading: Locator;
  readonly summaryPanel: Locator;

  readonly generateSummaryButton: Locator;
  readonly retryButton: Locator;
  readonly approveSummaryButton: Locator;

  readonly summaryText: Locator;
  readonly citationLinks: Locator;
  readonly citationWarning: Locator;
  readonly generationErrorAlert: Locator;
  readonly insufficientInformationNotice: Locator;
  readonly approvedNotice: Locator;

  constructor(page: Page) {
    this.page = page;
    this.ticketHeading = page
      .getByRole('main', { name: 'Ticket' })
      .getByRole('heading', { level: 2 });
    this.summaryPanel = page.getByRole('complementary', { name: 'AI summary' });

    const summaryButton = (name: string) =>
      this.summaryPanel.getByRole('button', { name, exact: true });
    this.generateSummaryButton = summaryButton('Generate summary');
    this.retryButton = summaryButton('Retry');
    this.approveSummaryButton = summaryButton('Approve summary');

    this.summaryText = this.summaryPanel.getByTestId('summary-text');
    this.citationLinks = this.summaryPanel
      .getByRole('list', { name: 'Citations' })
      .getByRole('link');
    this.citationWarning = this.summaryPanel
      .getByRole('alert')
      .filter({ hasText: 'Citations could not be verified' });
    this.generationErrorAlert = this.summaryPanel
      .getByRole('alert')
      .filter({ hasText: 'Summary generation is unavailable' });
    this.insufficientInformationNotice = this.summaryPanel
      .getByRole('status')
      .filter({ hasText: 'Not enough information' });
    this.approvedNotice = this.summaryPanel
      .getByRole('status')
      .filter({ hasText: 'Summary approved' });
  }

  /** Opens a ticket and waits until its conversation is shown. */
  async openTicket(ticketId: string): Promise<void> {
    await this.page.goto(`/tickets/${encodeURIComponent(ticketId)}`);
    await this.ticketHeading.waitFor();
  }

  async generateSummary(): Promise<void> {
    await this.generateSummaryButton.click();
  }

  async retryGeneration(): Promise<void> {
    await this.retryButton.click();
  }

  async approveSummary(): Promise<void> {
    await this.approveSummaryButton.click();
  }
}
