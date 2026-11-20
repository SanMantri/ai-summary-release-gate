import { z } from 'zod';
import { ticketListItemSchema, ticketSchema } from '../../src/domain/ticket';
import { catalogId } from '../support/catalog-annotations';
import { expect, test } from '../support/dashboard-test-fixtures';

test.describe('GET /api/tickets/:ticketId', () => {
  test(
    'returns a ticket with its messages and lists it as unapproved',
    catalogId('API-TKT-01'),
    async ({ request, ticketFactory }) => {
      const seededTicket = await ticketFactory.createTicket();

      const ticketResponse = await request.get(`/api/tickets/${seededTicket.id}`);
      const listResponse = await request.get('/api/tickets');

      expect(ticketResponse.status()).toBe(200);
      const ticket = ticketSchema.parse(await ticketResponse.json());
      expect(ticket).toEqual({
        id: seededTicket.id,
        subject: seededTicket.subject,
        customerName: seededTicket.customerName,
        messages: seededTicket.messages,
      });
      const ticketList = z.array(ticketListItemSchema).parse(await listResponse.json());
      expect(ticketList).toContainEqual({
        id: seededTicket.id,
        subject: seededTicket.subject,
        customerName: seededTicket.customerName,
        isApproved: false,
      });
    },
  );

  test('returns not found for an unknown ticket', catalogId('API-TKT-02'), async ({ request }) => {
    const response = await request.get('/api/tickets/t-does-not-exist');

    expect(response.status()).toBe(404);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: 'ticket_not_found' });
  });
});
