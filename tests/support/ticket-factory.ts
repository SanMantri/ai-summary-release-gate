import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { ticketSchema, type MessageAuthor, type Ticket } from '../../src/domain/ticket';
import type { FakeSummaryScenario } from '../../src/server/summary-provider/fake-summary-provider';

export interface SeededTicket extends Ticket {
  messageIds: string[];
  firstMessageId: string;
}

export interface CreateTicketOptions {
  /** A unique suffix is always appended, so each ticket can be found by its subject. */
  subject?: string;
  customerName?: string;
  messages?: Array<{ author: MessageAuthor; body: string }>;
  /** How the server's fake AI service answers for this ticket (default: ok). */
  fakeSummaryScenario?: FakeSummaryScenario;
}

const defaultSyntheticMessages: CreateTicketOptions['messages'] = [
  {
    author: 'customer',
    body: 'Hi, I was charged twice for order #48213 on 2026-03-02. Both charges were $49.99. Please refund the duplicate.',
  },
  {
    author: 'agent',
    body: 'Thanks for flagging this. I can see both charges and have escalated the duplicate to billing.',
  },
];

/**
 * Creates isolated synthetic tickets through the guarded test-seeding endpoint
 * ("arrange via the API, act via the UI"). IDs are server-assigned UUIDs, so tests running in
 * parallel never share a ticket.
 */
export class TicketFactory {
  readonly #request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.#request = request;
  }

  async createTicket(options: CreateTicketOptions = {}): Promise<SeededTicket> {
    const uniqueSuffix = randomUUID().slice(0, 8);
    const response = await this.#request.post('/api/__test__/tickets', {
      data: {
        subject: `${options.subject ?? 'Charged twice for one order'} · ${uniqueSuffix}`,
        customerName: options.customerName ?? 'Dana Lee',
        messages: options.messages ?? defaultSyntheticMessages,
        fakeSummaryScenario: options.fakeSummaryScenario,
      },
    });
    if (!response.ok()) {
      throw new Error(
        `Seeding a synthetic ticket failed: HTTP ${response.status()} ${await response.text()}`,
      );
    }

    const ticket = ticketSchema.parse(await response.json());
    const [firstMessage] = ticket.messages;
    if (!firstMessage) {
      throw new Error(`Seeded ticket ${ticket.id} has no messages`);
    }
    return {
      ...ticket,
      messageIds: ticket.messages.map((message) => message.id),
      firstMessageId: firstMessage.id,
    };
  }
}
