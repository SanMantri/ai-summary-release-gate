import type { ModelOutput, SyntheticTicket } from '../dataset/summary-example-schema';
import type { CheckResult } from './check-result';
import { extractSpecifics, specificKey } from './specific-extractors';

/**
 * Grounded specifics — the additional risk: citations show WHERE a claim came from, not
 * WHETHER it is true. A summary can cite the right message and still invent the refund amount,
 * order number or date the agent then acts on.
 *
 * Every concrete fact in the summary (money, reference numbers, dates, emails, phone numbers,
 * percentages) must appear — after normalisation — in a CITED message of THIS ticket.
 * A fact found only in an uncited message fails: agents verify facts through citations.
 */
export function checkGroundedSpecifics(
  modelOutput: ModelOutput,
  ticket: SyntheticTicket,
): CheckResult {
  const citedMessageIds = new Set(modelOutput.sourceIds ?? []);
  const citedMessagesOfThisTicket = ticket.messages.filter((message) =>
    citedMessageIds.has(message.id),
  );
  const evidence = new Set(
    citedMessagesOfThisTicket.flatMap((message) => extractSpecifics(message.body).map(specificKey)),
  );

  const findings = extractSpecifics(modelOutput.summary)
    .filter((specific) => !evidence.has(specificKey(specific)))
    .map(
      (specific) =>
        `${specific.kind} "${specific.text}" does not appear in any cited message of this ticket`,
    );

  return { checkName: 'grounded-specifics', passed: findings.length === 0, findings };
}
