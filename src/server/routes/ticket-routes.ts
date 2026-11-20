import { Router } from 'express';
import type { TicketStore } from '../ticket-store';
import { sendApiError } from './api-error-response';

export function createTicketRoutes(ticketStore: TicketStore): Router {
  const router = Router();

  router.get('/api/tickets', (_request, response) => {
    response.json(ticketStore.list());
  });

  router.get('/api/tickets/:ticketId', (request, response) => {
    const ticket = ticketStore.find(request.params.ticketId);
    if (!ticket) {
      sendApiError(response, 404, 'ticket_not_found');
      return;
    }
    response.json(ticket);
  });

  return router;
}
