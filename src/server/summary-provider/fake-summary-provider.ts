import type { Ticket } from '../../domain/ticket';
import type { SummaryProvider, SummaryServiceReply } from './summary-provider';

/** Deterministic behaviours of the fake AI service, chosen per ticket (plan.md §3.6). */
export const fakeSummaryScenarios = [
  'ok',
  'ok_with_foreign_citation',
  'insufficient_information',
  'unavailable',
  'unavailable_then_ok',
  'provider_error',
  'provider_timeout',
  'malformed_output',
] as const;

export type FakeSummaryScenario = (typeof fakeSummaryScenarios)[number];

export class FakeSummaryProviderError extends Error {
  override name = 'FakeSummaryProviderError';
}

const maximumQuotedCharacters = 160;
/** A real message ID from a different demo ticket (the login-lockout ticket). */
export const messageIdFromAnotherTicket = 'm-demo-201';
const unavailableReply: SummaryServiceReply = { httpStatus: 503, body: { error: 'unavailable' } };
const insufficientInformationReply: SummaryServiceReply = {
  httpStatus: 200,
  body: { status: 'insufficient_information' },
};

/**
 * Stands in for the AI summary service in local runs and CI.
 * All state is keyed by ticket ID, so tests running in parallel never share it.
 */
export class FakeSummaryProvider implements SummaryProvider {
  readonly providerName = 'fake';
  readonly #scenarioByTicketId = new Map<string, FakeSummaryScenario>();
  readonly #requestCountByTicketId = new Map<string, number>();

  useScenarioForTicket(ticketId: string, scenario: FakeSummaryScenario): void {
    this.#scenarioByTicketId.set(ticketId, scenario);
    this.#requestCountByTicketId.delete(ticketId);
  }

  scenarioForTicket(ticketId: string): FakeSummaryScenario {
    return this.#scenarioByTicketId.get(ticketId) ?? 'ok';
  }

  requestSummary(ticket: Ticket, cancellation: AbortSignal): Promise<SummaryServiceReply> {
    const attemptNumber = (this.#requestCountByTicketId.get(ticket.id) ?? 0) + 1;
    this.#requestCountByTicketId.set(ticket.id, attemptNumber);

    const scenario = this.scenarioForTicket(ticket.id);
    switch (scenario) {
      case 'ok':
        return Promise.resolve(summaryReplyFor(ticket));
      case 'ok_with_foreign_citation':
        return Promise.resolve(summaryReplyFor(ticket, [messageIdFromAnotherTicket]));
      case 'insufficient_information':
        return Promise.resolve(insufficientInformationReply);
      case 'unavailable':
        return Promise.resolve(unavailableReply);
      case 'unavailable_then_ok':
        return Promise.resolve(attemptNumber === 1 ? unavailableReply : summaryReplyFor(ticket));
      case 'provider_error':
        return Promise.reject(
          new FakeSummaryProviderError('Fake provider crashed (scenario: provider_error)'),
        );
      case 'provider_timeout':
        return replyOnlyWhenCancelled(cancellation);
      case 'malformed_output':
        return Promise.resolve({ httpStatus: 200, body: { status: 'ok', summary: 42 } });
    }
  }
}

function summaryReplyFor(ticket: Ticket, additionalSourceIds: string[] = []): SummaryServiceReply {
  const firstCustomerMessage = ticket.messages.find((message) => message.author === 'customer');
  if (!firstCustomerMessage) {
    return insufficientInformationReply;
  }

  const quotedText =
    firstCustomerMessage.body.length > maximumQuotedCharacters
      ? `${firstCustomerMessage.body.slice(0, maximumQuotedCharacters)}…`
      : firstCustomerMessage.body;

  return {
    httpStatus: 200,
    body: {
      status: 'ok',
      summary: `${ticket.customerName} wrote: "${quotedText}"`,
      sourceIds: [firstCustomerMessage.id, ...additionalSourceIds],
    },
  };
}

function replyOnlyWhenCancelled(cancellation: AbortSignal): Promise<SummaryServiceReply> {
  return new Promise((_resolve, reject) => {
    const rejectAsCancelled = () =>
      reject(new FakeSummaryProviderError('Fake provider request was cancelled'));

    if (cancellation.aborted) {
      rejectAsCancelled();
      return;
    }
    cancellation.addEventListener('abort', rejectAsCancelled, { once: true });
  });
}
