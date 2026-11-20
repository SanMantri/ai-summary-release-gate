import { describe, expect, it } from 'vitest';
import { parseSummaryResponse } from '../../domain/summary-response-contract';
import type { Ticket } from '../../domain/ticket';
import { FakeSummaryProvider } from './fake-summary-provider';

function syntheticTicket(ticketId: string, messages?: Ticket['messages']): Ticket {
  return {
    id: ticketId,
    subject: 'Charged twice for one order',
    customerName: 'Dana Lee',
    messages: messages ?? [
      {
        id: `${ticketId}-m1`,
        author: 'customer',
        sentAt: '2026-03-02T09:00:00.000Z',
        body: 'I was charged twice for order #48213.',
      },
      {
        id: `${ticketId}-m2`,
        author: 'agent',
        sentAt: '2026-03-02T09:05:00.000Z',
        body: 'I have escalated this to billing.',
      },
    ],
  };
}

const neverCancelled = new AbortController().signal;

describe('DEV-03 FakeSummaryProvider', () => {
  it('uses the ok scenario by default and cites the first customer message', async () => {
    const provider = new FakeSummaryProvider();
    const ticket = syntheticTicket('t-default');

    const reply = await provider.requestSummary(ticket, neverCancelled);

    expect(reply.httpStatus).toBe(200);
    expect(parseSummaryResponse(reply.httpStatus, reply.body)).toEqual({
      kind: 'summary',
      summary: expect.stringContaining('I was charged twice') as string,
      sourceIds: ['t-default-m1'],
    });
  });

  it('answers insufficient information when the ticket has no customer message', async () => {
    const provider = new FakeSummaryProvider();
    const ticket = syntheticTicket('t-agent-only', [
      { id: 'm-agent', author: 'agent', sentAt: '2026-03-02T09:00:00.000Z', body: 'Hello!' },
    ]);

    const reply = await provider.requestSummary(ticket, neverCancelled);

    expect(parseSummaryResponse(reply.httpStatus, reply.body)).toEqual({
      kind: 'insufficient-information',
    });
  });

  it.each([
    { scenario: 'insufficient_information', expectedKind: 'insufficient-information' },
    { scenario: 'unavailable', expectedKind: 'unavailable' },
    { scenario: 'malformed_output', expectedKind: 'off-contract' },
  ] as const)(
    'replies with an outcome of kind $expectedKind for scenario $scenario',
    async ({ scenario, expectedKind }) => {
      const provider = new FakeSummaryProvider();
      const ticket = syntheticTicket(`t-${scenario}`);
      provider.useScenarioForTicket(ticket.id, scenario);

      const reply = await provider.requestSummary(ticket, neverCancelled);

      expect(parseSummaryResponse(reply.httpStatus, reply.body).kind).toBe(expectedKind);
    },
  );

  it('fails the first request and succeeds afterwards for unavailable_then_ok', async () => {
    const provider = new FakeSummaryProvider();
    const ticket = syntheticTicket('t-recovering');
    provider.useScenarioForTicket(ticket.id, 'unavailable_then_ok');

    const firstReply = await provider.requestSummary(ticket, neverCancelled);
    const secondReply = await provider.requestSummary(ticket, neverCancelled);
    const thirdReply = await provider.requestSummary(ticket, neverCancelled);

    expect(firstReply.httpStatus).toBe(503);
    expect(secondReply.httpStatus).toBe(200);
    expect(thirdReply.httpStatus).toBe(200);
  });

  it('counts attempts per ticket, so interleaved tickets do not affect each other', async () => {
    const provider = new FakeSummaryProvider();
    const firstTicket = syntheticTicket('t-first');
    const secondTicket = syntheticTicket('t-second');
    provider.useScenarioForTicket(firstTicket.id, 'unavailable_then_ok');
    provider.useScenarioForTicket(secondTicket.id, 'unavailable_then_ok');

    const statuses = [
      (await provider.requestSummary(firstTicket, neverCancelled)).httpStatus,
      (await provider.requestSummary(secondTicket, neverCancelled)).httpStatus,
      (await provider.requestSummary(firstTicket, neverCancelled)).httpStatus,
      (await provider.requestSummary(secondTicket, neverCancelled)).httpStatus,
    ];

    expect(statuses).toEqual([503, 503, 200, 200]);
  });

  it('rejects for provider_error', async () => {
    const provider = new FakeSummaryProvider();
    const ticket = syntheticTicket('t-crash');
    provider.useScenarioForTicket(ticket.id, 'provider_error');

    await expect(provider.requestSummary(ticket, neverCancelled)).rejects.toThrow('provider_error');
  });

  it('never answers for provider_timeout until the request is cancelled', async () => {
    const provider = new FakeSummaryProvider();
    const ticket = syntheticTicket('t-hang');
    provider.useScenarioForTicket(ticket.id, 'provider_timeout');
    const cancellation = new AbortController();

    const pendingReply = provider.requestSummary(ticket, cancellation.signal);
    const stillPending = await Promise.race([
      pendingReply.then(() => 'answered'),
      new Promise((resolve) => setImmediate(() => resolve('pending'))),
    ]);
    cancellation.abort();

    expect(stillPending).toBe('pending');
    await expect(pendingReply).rejects.toThrow('cancelled');
  });
});
