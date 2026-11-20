import { z } from 'zod';

export const messageAuthorSchema = z.enum(['customer', 'agent']);

export const ticketMessageSchema = z.object({
  id: z.string().min(1),
  author: messageAuthorSchema,
  sentAt: z.string().min(1),
  body: z.string(),
});

export const approvedSummarySchema = z.object({
  summary: z.string().min(1),
  sourceIds: z.array(z.string()).min(1),
  approvedAt: z.string().min(1),
});

export const ticketSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  customerName: z.string().min(1),
  messages: z.array(ticketMessageSchema),
  approvedSummary: approvedSummarySchema.optional(),
});

export const ticketListItemSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  customerName: z.string().min(1),
  isApproved: z.boolean(),
});

export type MessageAuthor = z.infer<typeof messageAuthorSchema>;
export type TicketMessage = z.infer<typeof ticketMessageSchema>;
export type ApprovedSummary = z.infer<typeof approvedSummarySchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketListItem = z.infer<typeof ticketListItemSchema>;

export function messageIdsOf(ticket: Pick<Ticket, 'messages'>): ReadonlySet<string> {
  return new Set(ticket.messages.map((message) => message.id));
}
