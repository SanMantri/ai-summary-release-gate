import type { Ticket } from '../domain/ticket';
import type {
  FakeSummaryProvider,
  FakeSummaryScenario,
} from './summary-provider/fake-summary-provider';
import type { TicketStore } from './ticket-store';

/**
 * Read-only synthetic tickets for `npm start`, one per dashboard state (plan.md §3.9).
 * Tests never use these: each test seeds its own tickets through the test-seeding endpoint.
 */
const demoTickets: Array<{ ticket: Ticket; fakeSummaryScenario: FakeSummaryScenario }> = [
  {
    fakeSummaryScenario: 'ok',
    ticket: {
      id: 't-demo-duplicate-charge',
      subject: 'Charged twice for one order',
      customerName: 'Dana Lee',
      messages: [
        {
          id: 'm-demo-101',
          author: 'customer',
          sentAt: '2026-03-02T09:00:00.000Z',
          body: 'Hi, I was charged twice for order #48213 on 2026-03-02. Both charges were $49.99. Please refund the duplicate charge.',
        },
        {
          id: 'm-demo-102',
          author: 'agent',
          sentAt: '2026-03-02T09:12:00.000Z',
          body: 'Thanks, Dana. I can see both charges for order #48213 and have escalated the duplicate to our billing team.',
        },
      ],
    },
  },
  {
    fakeSummaryScenario: 'insufficient_information',
    ticket: {
      id: 't-demo-vague-greeting',
      subject: 'Hello?',
      customerName: 'Alex Kim',
      messages: [
        {
          id: 'm-demo-301',
          author: 'customer',
          sentAt: '2026-03-03T14:20:00.000Z',
          body: 'Hello? Is anyone there?',
        },
      ],
    },
  },
  {
    fakeSummaryScenario: 'unavailable_then_ok',
    ticket: {
      id: 't-demo-login-lockout',
      subject: 'Locked out after password reset',
      customerName: 'Priya Nair',
      messages: [
        {
          id: 'm-demo-201',
          author: 'customer',
          sentAt: '2026-03-04T08:45:00.000Z',
          body: "I requested a password reset but the email never arrived, and now I'm locked out of my account.",
        },
        {
          id: 'm-demo-202',
          author: 'agent',
          sentAt: '2026-03-04T08:58:00.000Z',
          body: "I've sent a new reset link to your registered email. It expires in 30 minutes.",
        },
      ],
    },
  },
  {
    fakeSummaryScenario: 'unavailable',
    ticket: {
      id: 't-demo-summary-outage',
      subject: 'Invoice address change',
      customerName: 'Jordan Blake',
      messages: [
        {
          id: 'm-demo-401',
          author: 'customer',
          sentAt: '2026-03-05T11:10:00.000Z',
          body: 'Please update the billing address on my invoices to our new office.',
        },
      ],
    },
  },
];

export function seedDemoTickets(
  ticketStore: TicketStore,
  fakeSummaryProvider: FakeSummaryProvider,
): void {
  for (const { ticket, fakeSummaryScenario } of demoTickets) {
    ticketStore.add(ticket);
    fakeSummaryProvider.useScenarioForTicket(ticket.id, fakeSummaryScenario);
  }
}
