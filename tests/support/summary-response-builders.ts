import { parseSummaryResponse } from '../../src/domain/summary-response-contract';
import type { SeededTicket } from './ticket-factory';

/** One canned answer from the AI summary service, delivered to the browser by summaryServiceMock. */
export interface MockSummaryResponse {
  label: string;
  httpStatus: number;
  rawBody: string;
  /** Off-contract responses must be built deliberately with summaryResponses.offContract.* */
  deliberatelyOffContract: boolean;
}

const defaultSummaryText =
  'The customer reports a duplicate charge and asks for the extra charge to be refunded.';

function jsonResponse(
  label: string,
  httpStatus: number,
  body: unknown,
  deliberatelyOffContract = false,
): MockSummaryResponse {
  return { label, httpStatus, rawBody: JSON.stringify(body), deliberatelyOffContract };
}

function citing(sourceIds: string[], summaryText = defaultSummaryText): MockSummaryResponse {
  return jsonResponse(`200 ok citing [${sourceIds.join(', ')}]`, 200, {
    status: 'ok',
    summary: summaryText,
    sourceIds,
  });
}

/** Readable builders for the AI summary service's answers (plan.md §4.4). */
export const summaryResponses = {
  validFor: (ticket: SeededTicket, summaryText = defaultSummaryText) =>
    citing([ticket.firstMessageId], summaryText),
  citing,
  withoutCitations: (summaryText = defaultSummaryText) =>
    jsonResponse('200 ok without citations', 200, {
      status: 'ok',
      summary: summaryText,
      sourceIds: [],
    }),
  insufficientInformation: () =>
    jsonResponse('200 insufficient_information', 200, { status: 'insufficient_information' }),
  unavailable: () => jsonResponse('503 unavailable', 503, { error: 'unavailable' }),
  withMarkupInSummary: (ticket: SeededTicket) =>
    citing(
      [ticket.firstMessageId],
      `Customer asked for a refund. <img src=x onerror="alert('summary markup executed')">`,
    ),
  offContract: {
    serverError: () => jsonResponse('500 internal error', 500, { error: 'internal' }, true),
    unreadableJson: (): MockSummaryResponse => ({
      label: '200 with unreadable JSON',
      httpStatus: 200,
      rawBody: '{"status": "ok", "summary": ',
      deliberatelyOffContract: true,
    }),
  },
};

/**
 * Mocks must not drift into shapes the real service never sends: every on-contract mock is
 * validated with the same parser the dashboard uses.
 */
export function assertMockHonoursSummaryContract(response: MockSummaryResponse): void {
  if (response.deliberatelyOffContract) {
    return;
  }
  const outcome = parseSummaryResponse(response.httpStatus, JSON.parse(response.rawBody));
  if (outcome.kind === 'off-contract') {
    throw new Error(
      `Mock summary response "${response.label}" breaks the summary contract (${outcome.reason}). ` +
        'Build it with summaryResponses.offContract.* if that is intended.',
    );
  }
}
