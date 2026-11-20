import { describe, expect, it } from 'vitest';
import type { Ticket } from '../domain/ticket';
import { TicketStore } from './ticket-store';

const ticket: Ticket = {
  id: 't-store',
  subject: 'Charged twice for one order',
  customerName: 'Dana Lee',
  messages: [
    { id: 'm-1', author: 'customer', sentAt: '2026-03-02T09:00:00.000Z', body: 'Charged twice.' },
  ],
};

const approvedSummary = {
  summary: 'Customer was charged twice.',
  sourceIds: ['m-1'],
  approvedAt: '2026-03-02T10:00:00.000Z',
};

describe('DEV-05 TicketStore', () => {
  it('approves a ticket once and persists the approval', () => {
    const store = new TicketStore();
    store.add(ticket);

    expect(store.approve(ticket.id, approvedSummary)).toBe('approved');
    expect(store.find(ticket.id)?.approvedSummary).toEqual(approvedSummary);
    expect(store.list()).toEqual([
      {
        id: ticket.id,
        subject: ticket.subject,
        customerName: ticket.customerName,
        isApproved: true,
      },
    ]);
  });

  it('rejects a second approval of the same ticket (check-and-set)', () => {
    const store = new TicketStore();
    store.add(ticket);
    store.approve(ticket.id, approvedSummary);

    expect(store.approve(ticket.id, { ...approvedSummary, summary: 'Different text.' })).toBe(
      'already_approved',
    );
    expect(store.find(ticket.id)?.approvedSummary?.summary).toBe(approvedSummary.summary);
  });

  it('reports an unknown ticket', () => {
    const store = new TicketStore();

    expect(store.approve('t-missing', approvedSummary)).toBe('ticket_not_found');
    expect(store.find('t-missing')).toBeUndefined();
  });

  it('hands out copies, so callers cannot change stored tickets by accident', () => {
    const store = new TicketStore();
    store.add(ticket);

    const copy = store.find(ticket.id);
    copy?.messages.push({ id: 'm-injected', author: 'agent', sentAt: 'x', body: 'x' });

    expect(store.find(ticket.id)?.messages).toHaveLength(1);
  });

  it('refuses to add two tickets with the same ID', () => {
    const store = new TicketStore();
    store.add(ticket);

    expect(() => store.add(ticket)).toThrow('t-store');
  });
});
