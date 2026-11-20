import { existsSync, readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { testIdHeaderName } from '../../src/server/request-logging';
import { DashboardPage } from './dashboard-page';
import { SummaryServiceMock } from './summary-service-mock';
import { serverLogFilePath } from './test-environment';
import { TicketFactory } from './ticket-factory';

interface DashboardFixtures {
  /** Creates isolated synthetic tickets through the API. */
  ticketFactory: TicketFactory;
  /** Fakes the AI summary service in this test's browser context (UI tests only). */
  summaryServiceMock: SummaryServiceMock;
  dashboardPage: DashboardPage;
  /** Automatic: on failure, attaches the server log lines this test caused. */
  serverLogEvidence: void;
}

export const test = base.extend<DashboardFixtures>({
  // Every page and API request carries the test's ID, so server log lines map back to tests.
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({ ...extraHTTPHeaders, [testIdHeaderName]: testInfo.testId });
  },

  ticketFactory: async ({ request }, use) => {
    await use(new TicketFactory(request));
  },

  summaryServiceMock: async ({ page }, use) => {
    const summaryServiceMock = await SummaryServiceMock.attachTo(page);
    await use(summaryServiceMock);
    await summaryServiceMock.dispose(page);
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  serverLogEvidence: [
    async ({}, use, testInfo) => {
      await use();
      if (testInfo.status === testInfo.expectedStatus) {
        return;
      }
      const linesForThisTest = serverLogLinesTaggedWith(testInfo.testId);
      await testInfo.attach('server-log.jsonl', {
        body:
          linesForThisTest.length > 0
            ? linesForThisTest.join('\n')
            : `(no server requests were tagged with test ID ${testInfo.testId})`,
        contentType: 'text/plain',
      });
    },
    { auto: true },
  ],
});

export { expect };

function serverLogLinesTaggedWith(testId: string): string[] {
  if (!existsSync(serverLogFilePath)) {
    return [];
  }
  const testIdField = `"testId":${JSON.stringify(testId)}`;
  return readFileSync(serverLogFilePath, 'utf8')
    .split('\n')
    .filter((line) => line.includes(testIdField));
}
