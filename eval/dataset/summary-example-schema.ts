import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * The labeled synthetic dataset: the human-authored oracle for the summary evaluation
 * (plan.md §6.2). Deliberately independent of product code in src/.
 */
export const evaluationCheckNames = ['source-attribution', 'grounded-specifics'] as const;
export type EvaluationCheckName = (typeof evaluationCheckNames)[number];

export const syntheticTicketSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  customerName: z.string().min(1),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        author: z.enum(['customer', 'agent']),
        body: z.string().min(1),
      }),
    )
    .min(1),
});

export const modelOutputSchema = z.object({
  status: z.literal('ok'),
  summary: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
});

export const summaryExampleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a readable kebab-case id'),
    description: z.string().min(1),
    ticketId: z.string().min(1),
    modelOutput: modelOutputSchema,
    humanLabel: z.enum(['acceptable', 'unacceptable']),
    expectedFailedChecks: z.array(z.enum(evaluationCheckNames)),
    knownBlindSpot: z.boolean().default(false),
  })
  .superRefine((example, context) => {
    const expectsFailures = example.expectedFailedChecks.length > 0;
    if (example.humanLabel === 'acceptable' && expectsFailures) {
      context.addIssue({
        code: 'custom',
        message: `${example.id}: an acceptable example cannot expect failed checks`,
      });
    }
    if (example.humanLabel === 'unacceptable' && !example.knownBlindSpot && !expectsFailures) {
      context.addIssue({
        code: 'custom',
        message: `${example.id}: an unacceptable example must expect a failed check, or be marked knownBlindSpot`,
      });
    }
    if (example.knownBlindSpot && (example.humanLabel !== 'unacceptable' || expectsFailures)) {
      context.addIssue({
        code: 'custom',
        message: `${example.id}: a known blind spot is an unacceptable example that every check passes`,
      });
    }
  });

export type SyntheticTicket = z.infer<typeof syntheticTicketSchema>;
export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type SummaryExample = z.infer<typeof summaryExampleSchema>;

export interface SummaryEvaluationDataset {
  tickets: SyntheticTicket[];
  examples: SummaryExample[];
}

/** Loads both dataset files and fails loudly on any inconsistency between them. */
export function loadSummaryEvaluationDataset(): SummaryEvaluationDataset {
  const tickets = z.array(syntheticTicketSchema).parse(readDatasetFile('synthetic-tickets.json'));
  const examples = z.array(summaryExampleSchema).parse(readDatasetFile('summary-examples.json'));

  const problems = [
    ...duplicatesOf(tickets.map((ticket) => ticket.id)).map((id) => `duplicate ticket id ${id}`),
    ...duplicatesOf(tickets.flatMap((ticket) => ticket.messages.map((message) => message.id))).map(
      (id) => `message id ${id} is used in more than one place`,
    ),
    ...duplicatesOf(examples.map((example) => example.id)).map(
      (id) => `duplicate example id ${id}`,
    ),
    ...examples
      .filter((example) => !tickets.some((ticket) => ticket.id === example.ticketId))
      .map((example) => `${example.id} refers to unknown ticket ${example.ticketId}`),
  ];
  if (problems.length > 0) {
    throw new Error(`The summary evaluation dataset is inconsistent:\n- ${problems.join('\n- ')}`);
  }

  return { tickets, examples };
}

function readDatasetFile(fileName: string): unknown {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, fileName), 'utf8'));
}

function duplicatesOf(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}
