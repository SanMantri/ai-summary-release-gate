import { z } from 'zod';
import { approvedSummarySchema } from './ticket';

/** Body of POST /api/tickets/:ticketId/approve (plan.md §3.5). */
export const approvalRequestSchema = z.object({
  summary: z.string().trim().min(1),
  // Optional so that a missing list is reported as `no_citations` (422), not a malformed request (400).
  sourceIds: z.array(z.string()).optional(),
});

export const approvalSuccessResponseSchema = z.object({
  ticketId: z.string().min(1),
  approvedSummary: approvedSummarySchema,
});

export const citationProblemSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('no_citations') }),
  z.object({ code: z.literal('citation_not_in_ticket'), messageId: z.string() }),
]);

export const approvalRejectedResponseSchema = z.object({
  error: z.literal('summary_not_approvable'),
  reasons: z.array(citationProblemSchema).min(1),
});

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApprovalSuccessResponse = z.infer<typeof approvalSuccessResponseSchema>;

/** Error codes the dashboard API can return, in the exercise's lowercase snake_case style. */
export type DashboardApiErrorCode =
  | 'ticket_not_found'
  | 'invalid_payload'
  | 'already_approved'
  | 'summary_not_approvable'
  | 'invalid_provider_response'
  | 'unavailable'
  | 'not_found'
  | 'internal_error';
