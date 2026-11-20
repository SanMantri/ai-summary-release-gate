import { parseSummaryResponse } from '../../src/domain/summary-response-contract';
import type { SeededTicket } from './ticket-factory';

/** One canned answer from the AI summary service, delivered to the browser by summaryServiceMock. */
export interface MockSummaryResponse {
  label: string;
  httpStatus: number;
  body: unknown;
}

const defaultSummaryText =
  'The customer reports a duplicate charge and asks for the extra charge to be refunded.';

function citing(sourceIds: string[], summaryText = defaultSummaryText): MockSummaryResponse {
  return {
    label: `200 ok citing [${sourceIds.join(', ')}]`,
    httpStatus: 200,
    body: { status: 'ok', summary: summaryText, sourceIds },
  };
}

/** Readable builders for the AI summary service's answers, in the exercise's exact shapes. */
export const summaryResponses = {
  validFor: (ticket: SeededTicket): MockSummaryResponse => citing([ticket.firstMessageId]),
  citing,
  withoutCitations: (): MockSummaryResponse => ({
    label: '200 ok without citations',
    httpStatus: 200,
    body: { status: 'ok', summary: defaultSummaryText, sourceIds: [] },
  }),
  insufficientInformation: (): MockSummaryResponse => ({
    label: '200 insufficient_information',
    httpStatus: 200,
    body: { status: 'insufficient_information' },
  }),
  unavailable: (): MockSummaryResponse => ({
    label: '503 unavailable',
    httpStatus: 503,
    body: { error: 'unavailable' },
  }),
};

/**
 * Mocks must not drift into shapes the real service never sends: every mock is validated with
 * the same parser the dashboard uses.
 */
export function assertMockHonoursSummaryContract(response: MockSummaryResponse): void {
  const outcome = parseSummaryResponse(response.httpStatus, response.body);
  if (outcome.kind === 'off-contract') {
    throw new Error(
      `Mock summary response "${response.label}" breaks the summary contract (${outcome.reason}).`,
    );
  }
}
