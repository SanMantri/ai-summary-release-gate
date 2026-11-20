/**
 * The product rule that decides whether an AI summary may be approved (plan.md §3.4).
 *
 * A summary's citations are valid only if it cites at least one message and EVERY cited
 * message belongs to the current ticket. Shared by the dashboard UI (to enable Approve)
 * and the dashboard API (to enforce approval). The summary evaluation in eval/ checks
 * attribution with its own, independent implementation.
 */

export type CitationProblem =
  { code: 'no_citations' } | { code: 'citation_not_in_ticket'; messageId: string };

export interface CitationValidationResult {
  citationsAreValid: boolean;
  problems: CitationProblem[];
}

export function validateCitations(
  sourceIds: readonly string[] | undefined,
  ticketMessageIds: ReadonlySet<string>,
): CitationValidationResult {
  const uniqueSourceIds = [...new Set(sourceIds ?? [])];

  if (uniqueSourceIds.length === 0) {
    return { citationsAreValid: false, problems: [{ code: 'no_citations' }] };
  }

  const problems: CitationProblem[] = uniqueSourceIds
    .filter((messageId) => !ticketMessageIds.has(messageId))
    .map((messageId) => ({ code: 'citation_not_in_ticket', messageId }));

  const everyCitationBelongsToTicket = uniqueSourceIds.some((messageId) =>
    ticketMessageIds.has(messageId),
  );

  return { citationsAreValid: everyCitationBelongsToTicket, problems };
}
