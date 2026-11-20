import type { Ticket } from '../../domain/ticket';
import type { SummaryProvider, SummaryServiceReply } from './summary-provider';

/**
 * Documented stub: where a real model would plug in. It is never constructed in local runs
 * or CI, and it deliberately makes no network calls (the exercise forbids external AI calls).
 *
 * A real implementation would:
 *  1. Build a prompt from the ticket's messages, labelling each with its message ID and
 *     instructing the model to cite the IDs it relied on.
 *  2. Call the model with a timeout below the dashboard API's PROVIDER_TIMEOUT_MS.
 *  3. Return the model service's HTTP status and JSON body unchanged — the dashboard API
 *     validates the body against the summary contract and maps failures (plan.md §3.5).
 * See docs/test-strategy.md for what must be tested against a live model.
 */
export class LiveSummaryProvider implements SummaryProvider {
  readonly providerName = 'live';

  requestSummary(_ticket: Ticket, _cancellation: AbortSignal): Promise<SummaryServiceReply> {
    return Promise.reject(
      new Error(
        'LiveSummaryProvider is a documented stub; use FakeSummaryProvider locally and in CI',
      ),
    );
  }
}
