import type { Page, Route } from '@playwright/test';
import {
  assertMockHonoursSummaryContract,
  type MockSummaryResponse,
} from './summary-response-builders';

export interface RecordedSummaryRequest {
  ticketId: string;
  requestNumber: number;
}

const summaryEndpoint = /\/api\/tickets\/([^/]+)\/summary$/;

/**
 * Fakes the AI summary service at the browser's network boundary (page.route), scoped to one
 * test's browser context — so tests are isolated by construction and safe to run in parallel.
 *
 * The queue is strict: a request with no queued answer is recorded as unexpected and fails the
 * test when the fixture is torn down, so an accidental extra request can never go unnoticed.
 */
export class SummaryServiceMock {
  readonly #queue: MockSummaryResponse[] = [];
  readonly #requests: RecordedSummaryRequest[] = [];
  readonly #unexpectedRequests: RecordedSummaryRequest[] = [];

  static async attachTo(page: Page): Promise<SummaryServiceMock> {
    const summaryServiceMock = new SummaryServiceMock();
    await page.route(summaryEndpoint, (route) => summaryServiceMock.#answer(route));
    return summaryServiceMock;
  }

  /** Queues answers for the next summary requests, in order. */
  respondWith(...responses: MockSummaryResponse[]): void {
    for (const response of responses) {
      assertMockHonoursSummaryContract(response);
      this.#queue.push(response);
    }
  }

  requestsForTicket(ticketId: string): RecordedSummaryRequest[] {
    return this.#requests.filter((request) => request.ticketId === ticketId);
  }

  /** Called by the fixture after each test. */
  async dispose(page: Page): Promise<void> {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    if (this.#unexpectedRequests.length > 0) {
      const described = this.#unexpectedRequests
        .map(({ requestNumber, ticketId }) => `#${requestNumber} for ticket ${ticketId}`)
        .join(', ');
      throw new Error(
        `Unexpected summary request(s) with no queued response: ${described}. ` +
          'Queue an answer with summaryServiceMock.respondWith(), or fix the extra request.',
      );
    }
  }

  async #answer(route: Route): Promise<void> {
    const ticketId =
      summaryEndpoint.exec(new URL(route.request().url()).pathname)?.[1] ?? '(unknown)';
    const recordedRequest = { ticketId, requestNumber: this.#requests.length + 1 };
    this.#requests.push(recordedRequest);

    const nextResponse = this.#queue.shift();
    if (!nextResponse) {
      this.#unexpectedRequests.push(recordedRequest);
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unexpected_request_in_test' }),
      });
      return;
    }

    await route.fulfill({
      status: nextResponse.httpStatus,
      contentType: 'application/json',
      body: JSON.stringify(nextResponse.body),
    });
  }
}
