import type { Page, Route } from '@playwright/test';
import {
  assertMockHonoursSummaryContract,
  type MockSummaryResponse,
} from './summary-response-builders';

export interface RecordedSummaryRequest {
  ticketId: string;
  requestNumber: number;
}

export interface HeldSummaryResponse {
  /**
   * Delivers the held response. Resolves once it has been delivered — or once it is clear the
   * page already abandoned the request (for example after switching tickets).
   */
  release(): Promise<void>;
}

type QueuedSummaryReply =
  | { kind: 'respond'; response: MockSummaryResponse }
  | { kind: 'network-error' }
  | {
      kind: 'hold';
      response: MockSummaryResponse;
      released: Promise<void>;
      markSettled: () => void;
    };

const summaryEndpoint = /\/api\/tickets\/([^/]+)\/summary$/;

/**
 * Fakes the AI summary service at the browser's network boundary (page.route), scoped to one
 * test's browser context — so tests are isolated by construction and safe to run in parallel.
 *
 * The queue is strict: a request with no queued answer is recorded as unexpected and fails the
 * test when the fixture is torn down. That is how double submission is caught.
 */
export class SummaryServiceMock {
  readonly #queue: QueuedSummaryReply[] = [];
  readonly #requests: RecordedSummaryRequest[] = [];
  readonly #unexpectedRequests: RecordedSummaryRequest[] = [];
  readonly #releaseHeldResponses: Array<() => void> = [];

  static async attachTo(page: Page): Promise<SummaryServiceMock> {
    const summaryServiceMock = new SummaryServiceMock();
    await page.route(summaryEndpoint, (route) => summaryServiceMock.#answer(route));
    return summaryServiceMock;
  }

  /** Queues answers for the next summary requests, in order. */
  respondWith(...responses: MockSummaryResponse[]): void {
    for (const response of responses) {
      assertMockHonoursSummaryContract(response);
      this.#queue.push({ kind: 'respond', response });
    }
  }

  /** Queues an answer that is only delivered when the test calls release(). */
  holdNextResponse(response: MockSummaryResponse): HeldSummaryResponse {
    assertMockHonoursSummaryContract(response);
    let releaseResponse: () => void = () => undefined;
    let markSettled: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (releaseResponse = resolve));
    const settled = new Promise<void>((resolve) => (markSettled = resolve));

    this.#releaseHeldResponses.push(releaseResponse);
    this.#queue.push({ kind: 'hold', response, released, markSettled });
    return {
      release: async () => {
        releaseResponse();
        await settled;
      },
    };
  }

  /** The next summary request fails at the network level (no HTTP response at all). */
  failNextRequestWithNetworkError(): void {
    this.#queue.push({ kind: 'network-error' });
  }

  get requests(): readonly RecordedSummaryRequest[] {
    return this.#requests;
  }

  requestsForTicket(ticketId: string): RecordedSummaryRequest[] {
    return this.#requests.filter((request) => request.ticketId === ticketId);
  }

  /** Called by the fixture after each test. */
  async dispose(page: Page): Promise<void> {
    for (const releaseHeldResponse of this.#releaseHeldResponses) {
      releaseHeldResponse();
    }
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

    const nextReply = this.#queue.shift();
    if (!nextReply) {
      this.#unexpectedRequests.push(recordedRequest);
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unexpected_request_in_test' }),
      });
      return;
    }

    switch (nextReply.kind) {
      case 'respond':
        await deliver(route, nextReply.response);
        return;
      case 'network-error':
        await route.abort('failed');
        return;
      case 'hold':
        await nextReply.released;
        try {
          await deliver(route, nextReply.response);
        } catch {
          // The page abandoned this request before it was released; there is nothing to deliver.
        } finally {
          nextReply.markSettled();
        }
        return;
    }
  }
}

function deliver(route: Route, response: MockSummaryResponse): Promise<void> {
  return route.fulfill({
    status: response.httpStatus,
    contentType: 'application/json',
    body: response.rawBody,
  });
}
