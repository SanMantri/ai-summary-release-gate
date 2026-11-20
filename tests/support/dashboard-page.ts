import type { Locator, Page } from '@playwright/test';

/**
 * Page object for the support dashboard: locators and user actions only.
 * Assertions stay in the spec files, so each test's intent is readable where it is written.
 * Locators use roles and accessible names first; data-testid only for the non-semantic summary text.
 */
export class DashboardPage {
  readonly page: Page;
  readonly ticketList: Locator;
  readonly ticketHeading: Locator;
  readonly summaryPanel: Locator;

  readonly generateSummaryButton: Locator;
  readonly retryButton: Locator;
  readonly regenerateSummaryButton: Locator;
  readonly approveSummaryButton: Locator;

  readonly generatingStatus: Locator;
  readonly summaryText: Locator;
  readonly citationLinks: Locator;
  readonly citationWarning: Locator;
  readonly generationErrorAlert: Locator;
  readonly insufficientInformationNotice: Locator;
  readonly approvalErrorAlert: Locator;
  readonly approvedNotice: Locator;

  constructor(page: Page) {
    this.page = page;
    this.ticketList = page.getByRole('navigation', { name: 'Tickets' });
    this.ticketHeading = page
      .getByRole('main', { name: 'Ticket' })
      .getByRole('heading', { level: 2 });
    this.summaryPanel = page.getByRole('complementary', { name: 'AI summary' });

    const summaryButton = (name: string) =>
      this.summaryPanel.getByRole('button', { name, exact: true });
    this.generateSummaryButton = summaryButton('Generate summary');
    this.retryButton = summaryButton('Retry');
    this.regenerateSummaryButton = summaryButton('Regenerate summary');
    this.approveSummaryButton = summaryButton('Approve summary');

    this.generatingStatus = this.summaryPanel
      .getByRole('status')
      .filter({ hasText: 'Generating summary' });
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
    this.approvalErrorAlert = this.summaryPanel
      .getByRole('alert')
      .filter({ hasText: 'Approval failed' });
    this.approvedNotice = this.summaryPanel
      .getByRole('status')
      .filter({ hasText: 'Summary approved' });
  }

  /** Opens a ticket and waits until its conversation is shown. */
  async openTicket(ticketId: string): Promise<void> {
    await this.page.goto(`/tickets/${encodeURIComponent(ticketId)}`);
    await this.ticketHeading.waitFor();
  }

  /** Switches tickets the way an agent does: through the ticket list, without a page reload. */
  async switchToTicket(subject: string): Promise<void> {
    await this.ticketList.getByRole('link', { name: subject }).click();
  }

  async generateSummary(): Promise<void> {
    await this.generateSummaryButton.click();
  }

  async retryGeneration(): Promise<void> {
    await this.retryButton.click();
  }

  async regenerateSummary(): Promise<void> {
    await this.regenerateSummaryButton.click();
  }

  async approveSummary(): Promise<void> {
    await this.approveSummaryButton.click();
  }
}
