import type { ApprovedSummary, Ticket, TicketListItem } from '../domain/ticket';

export type ApprovalOutcome = 'approved' | 'already_approved' | 'ticket_not_found';

/**
 * In-memory ticket storage for the fixture (approvals reset when the server restarts).
 * Every read returns a copy. `approve` is a synchronous check-and-set, so two simultaneous
 * approvals of the same ticket produce exactly one 'approved' and one 'already_approved'.
 */
export class TicketStore {
  readonly #ticketsById = new Map<string, Ticket>();

  add(ticket: Ticket): void {
    if (this.#ticketsById.has(ticket.id)) {
      throw new Error(`A ticket with ID ${ticket.id} already exists`);
    }
    this.#ticketsById.set(ticket.id, structuredClone(ticket));
  }

  find(ticketId: string): Ticket | undefined {
    const ticket = this.#ticketsById.get(ticketId);
    return ticket ? structuredClone(ticket) : undefined;
  }

  list(): TicketListItem[] {
    return [...this.#ticketsById.values()].map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      customerName: ticket.customerName,
      isApproved: ticket.approvedSummary !== undefined,
    }));
  }

  approve(ticketId: string, approvedSummary: ApprovedSummary): ApprovalOutcome {
    const ticket = this.#ticketsById.get(ticketId);
    if (!ticket) {
      return 'ticket_not_found';
    }
    if (ticket.approvedSummary) {
      return 'already_approved';
    }
    ticket.approvedSummary = structuredClone(approvedSummary);
    return 'approved';
  }
}
