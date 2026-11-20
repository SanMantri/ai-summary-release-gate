import type { ModelOutput, SyntheticTicket } from '../dataset/summary-example-schema';
import type { CheckResult } from './check-result';

/**
 * Source attribution: the summary must cite at least one message, and every cited message
 * must belong to the ticket being summarised.
 *
 * Written independently of the product's citation rule (src/domain/citation-validation.ts):
 * the evaluation must not share an implementation with the code it is meant to judge.
 * It also distinguishes a citation from another ticket (a cross-customer data leak) from a
 * citation that exists nowhere (a hallucinated ID).
 */
export function checkSourceAttribution(
  modelOutput: ModelOutput,
  ticket: SyntheticTicket,
  allTickets: SyntheticTicket[],
): CheckResult {
  const citedMessageIds = modelOutput.sourceIds;

  if (citedMessageIds === undefined) {
    return failed(['The summary has no citation list (sourceIds is missing)']);
  }
  if (citedMessageIds.length === 0) {
    return failed(['The summary cites no messages']);
  }

  const findings: string[] = [];
  for (const citedMessageId of new Set(citedMessageIds)) {
    const belongsToThisTicket = ticket.messages.some((message) => message.id === citedMessageId);
    if (belongsToThisTicket) {
      continue;
    }
    const owningTicket = allTickets.find((candidate) =>
      candidate.messages.some((message) => message.id === citedMessageId),
    );
    findings.push(
      owningTicket
        ? `${citedMessageId} belongs to another ticket (${owningTicket.id})`
        : `${citedMessageId} does not exist in any ticket`,
    );
  }

  return { checkName: 'source-attribution', passed: findings.length === 0, findings };
}

function failed(findings: string[]): CheckResult {
  return { checkName: 'source-attribution', passed: false, findings };
}
