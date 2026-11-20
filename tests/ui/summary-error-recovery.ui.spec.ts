import { summaryRequestTimeoutMs } from '../../src/dashboard-ui/dashboard-settings';
import { catalogId } from '../support/catalog-annotations';
import type { DashboardPage } from '../support/dashboard-page';
import { expect, test } from '../support/dashboard-test-fixtures';
import { summaryResponses, type MockSummaryResponse } from '../support/summary-response-builders';
import type { SummaryServiceMock } from '../support/summary-service-mock';
import type { SeededTicket } from '../support/ticket-factory';

/**
 * UI layer: errors and recovery. Approval must stay disabled until a retry returns a VALID
 * summary — a retry that fails again, says "insufficient information" or cites another ticket
 * must not enable it.
 */
const unsuccessfulRetryOutcomes: Array<{
  retryOutcome: string;
  retryResponseFor: (ticket: SeededTicket, anotherTicket: SeededTicket) => MockSummaryResponse;
  visibleNoticeOn: (dashboardPage: DashboardPage) => ReturnType<DashboardPage['page']['locator']>;
}> = [
  {
    retryOutcome: 'the service is unavailable again',
    retryResponseFor: () => summaryResponses.unavailable(),
    visibleNoticeOn: (dashboardPage) => dashboardPage.generationErrorAlert,
  },
  {
    retryOutcome: 'insufficient information',
    retryResponseFor: () => summaryResponses.insufficientInformation(),
    visibleNoticeOn: (dashboardPage) => dashboardPage.insufficientInformationNotice,
  },
  {
    retryOutcome: 'a summary citing another ticket',
    retryResponseFor: (_ticket, anotherTicket) =>
      summaryResponses.citing([anotherTicket.firstMessageId]),
    visibleNoticeOn: (dashboardPage) => dashboardPage.citationWarning,
  },
];

const offContractFailures: Array<{
  failure: string;
  prepareFailure: (summaryServiceMock: SummaryServiceMock) => void;
}> = [
  {
    failure: 'an HTTP 500 error',
    prepareFailure: (summaryServiceMock) =>
      summaryServiceMock.respondWith(summaryResponses.offContract.serverError()),
  },
  {
    failure: 'an unreadable JSON body',
    prepareFailure: (summaryServiceMock) =>
      summaryServiceMock.respondWith(summaryResponses.offContract.unreadableJson()),
  },
  {
    failure: 'a dropped connection',
    prepareFailure: (summaryServiceMock) => summaryServiceMock.failNextRequestWithNetworkError(),
  },
];

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
      expect(summaryServiceMock.requests.map((request) => request.ticketId)).toEqual([
        ticket.id,
        ticket.id,
      ]);
    },
  );

  for (const { retryOutcome, retryResponseFor, visibleNoticeOn } of unsuccessfulRetryOutcomes) {
    test(
      `keeps approval disabled when the retry returns ${retryOutcome}`,
      catalogId('UI-04'),
      async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
        const ticket = await ticketFactory.createTicket();
        const anotherTicket = await ticketFactory.createTicket();
        summaryServiceMock.respondWith(
          summaryResponses.unavailable(),
          retryResponseFor(ticket, anotherTicket),
        );
        await dashboardPage.openTicket(ticket.id);
        await dashboardPage.generateSummary();
        await expect(dashboardPage.generationErrorAlert).toBeVisible();

        await dashboardPage.retryGeneration();

        await expect(visibleNoticeOn(dashboardPage)).toBeVisible();
        await expect(dashboardPage.approveSummaryButton).toBeDisabled();
        expect(summaryServiceMock.requestsForTicket(ticket.id)).toHaveLength(2);
      },
    );
  }

  for (const { failure, prepareFailure } of offContractFailures) {
    test(
      `offers a retry after ${failure}`,
      catalogId('UI-09'),
      async ({ ticketFactory, summaryServiceMock, dashboardPage }) => {
        const ticket = await ticketFactory.createTicket();
        prepareFailure(summaryServiceMock);
        await dashboardPage.openTicket(ticket.id);

        await dashboardPage.generateSummary();

        await expect(dashboardPage.generationErrorAlert).toBeVisible();
        await expect(dashboardPage.retryButton).toBeEnabled();
        await expect(dashboardPage.summaryText).toBeHidden();
        await expect(dashboardPage.approveSummaryButton).toBeDisabled();
      },
    );
  }

  test(
    'offers a retry when the summary service does not answer in time',
    catalogId('UI-10'),
    async ({ page, ticketFactory, summaryServiceMock, dashboardPage }) => {
      // The fake clock makes the 15-second timeout instant and exact — no real waiting.
      const clockStart = new Date('2026-03-02T09:00:00.000Z');
      await page.clock.install({ time: clockStart });
      const ticket = await ticketFactory.createTicket();
      summaryServiceMock.holdNextResponse(summaryResponses.validFor(ticket));
      await dashboardPage.openTicket(ticket.id);
      // Freeze time: from here on, the page's timers advance only when this test says so.
      // (An installed clock otherwise keeps flowing with real time, which makes the
      // boundary check below race against however long the click took.)
      await page.clock.pauseAt(new Date(clockStart.getTime() + 60_000));
      await dashboardPage.generateSummary();

      await page.clock.runFor(summaryRequestTimeoutMs - 1);
      await expect(dashboardPage.generatingStatus).toBeVisible();

      await page.clock.runFor(1);

      await expect(dashboardPage.generationErrorAlert).toBeVisible();
      await expect(dashboardPage.retryButton).toBeEnabled();
      await expect(dashboardPage.approveSummaryButton).toBeDisabled();
    },
  );
});
