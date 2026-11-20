import { Router } from 'express';
import { approvalRequestSchema } from '../../domain/approval-request-contract';
import { validateCitations } from '../../domain/citation-validation';
import { messageIdsOf } from '../../domain/ticket';
import { testIdOf, type ServerLogger } from '../request-logging';
import type { TicketStore } from '../ticket-store';
import { sendApiError } from './api-error-response';

/**
 * POST /api/tickets/:ticketId/approve — server-side enforcement of the citation rule.
 * A disabled Approve button is UX, not a control: the API re-validates the citations against
 * its own copy of the ticket. Checks run in this order (plan.md §3.5):
 *   400 invalid_payload → 404 ticket_not_found → 409 already_approved → 422 summary_not_approvable
 */
export function createApprovalRoutes(ticketStore: TicketStore, logger: ServerLogger): Router {
  const router = Router();

  router.post('/api/tickets/:ticketId/approve', (request, response) => {
    const approvalRequest = approvalRequestSchema.safeParse(request.body);
    if (!approvalRequest.success) {
      sendApiError(response, 400, 'invalid_payload', {
        issues: approvalRequest.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const ticket = ticketStore.find(request.params.ticketId);
    if (!ticket) {
      sendApiError(response, 404, 'ticket_not_found');
      return;
    }
    if (ticket.approvedSummary) {
      sendApiError(response, 409, 'already_approved');
      return;
    }

    const { summary, sourceIds } = approvalRequest.data;
    const citationValidation = validateCitations(sourceIds, messageIdsOf(ticket));
    if (!citationValidation.citationsAreValid) {
      logger.log('approval_rejected', {
        testId: testIdOf(request),
        ticketId: ticket.id,
        reasons: citationValidation.problems,
      });
      sendApiError(response, 422, 'summary_not_approvable', {
        reasons: citationValidation.problems,
      });
      return;
    }

    const approvedSummary = {
      summary,
      sourceIds: [...new Set(sourceIds)],
      approvedAt: new Date().toISOString(),
    };
    const approvalOutcome = ticketStore.approve(ticket.id, approvedSummary);
    if (approvalOutcome !== 'approved') {
      sendApiError(response, approvalOutcome === 'already_approved' ? 409 : 404, approvalOutcome);
      return;
    }

    response.status(200).json({ ticketId: ticket.id, approvedSummary });
  });

  return router;
}
