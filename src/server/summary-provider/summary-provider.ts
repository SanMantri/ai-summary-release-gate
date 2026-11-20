import type { Ticket } from '../../domain/ticket';

/** What the AI summary service replied, before the dashboard API checks it against the contract. */
export interface SummaryServiceReply {
  httpStatus: number;
  body: unknown;
}

/**
 * The seam between the dashboard and the AI summary service (plan.md §3.1).
 *
 * Local runs and CI use FakeSummaryProvider, so no credentials, paid services or external AI
 * calls are needed. A live model plugs in here (see LiveSummaryProvider), and the summary
 * evaluation in eval/ can reuse the same seam to generate outputs from a real model.
 */
export interface SummaryProvider {
  readonly providerName: string;
  requestSummary(ticket: Ticket, cancellation: AbortSignal): Promise<SummaryServiceReply>;
}
