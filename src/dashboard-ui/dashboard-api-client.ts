import { z } from 'zod';
import { approvalSuccessResponseSchema } from '../domain/approval-request-contract';
import { parseSummaryResponse, type SummaryOutcome } from '../domain/summary-response-contract';
import {
  ticketListItemSchema,
  ticketSchema,
  type ApprovedSummary,
  type Ticket,
  type TicketListItem,
} from '../domain/ticket';

export type SummaryRequestOutcome = SummaryOutcome | { kind: 'network-failure'; reason: string };

export type ApprovalRequestOutcome =
  { kind: 'approved'; approvedSummary: ApprovedSummary } | { kind: 'failed'; reason: string };

export async function fetchTicketList(): Promise<TicketListItem[]> {
  const response = await fetch('/api/tickets');
  if (!response.ok) {
    throw new Error(`Loading tickets failed with HTTP ${response.status}`);
  }
  return z.array(ticketListItemSchema).parse(await response.json());
}

/** Resolves to undefined when the ticket does not exist. */
export async function fetchTicket(ticketId: string): Promise<Ticket | undefined> {
  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Loading ticket ${ticketId} failed with HTTP ${response.status}`);
  }
  return ticketSchema.parse(await response.json());
}

export async function requestSummary(
  ticketId: string,
  cancellation: AbortSignal,
): Promise<SummaryRequestOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/summary`, {
      method: 'POST',
      signal: cancellation,
    });
  } catch (error) {
    return { kind: 'network-failure', reason: describeError(error) };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'off-contract', reason: `HTTP ${response.status} body is not valid JSON` };
  }

  return parseSummaryResponse(response.status, body);
}

export async function approveSummary(
  ticketId: string,
  approval: { summary: string; sourceIds: string[] },
): Promise<ApprovalRequestOutcome> {
  try {
    const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(approval),
    });
    if (!response.ok) {
      return { kind: 'failed', reason: `HTTP ${response.status}` };
    }
    const { approvedSummary } = approvalSuccessResponseSchema.parse(await response.json());
    return { kind: 'approved', approvedSummary };
  } catch (error) {
    return { kind: 'failed', reason: describeError(error) };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
