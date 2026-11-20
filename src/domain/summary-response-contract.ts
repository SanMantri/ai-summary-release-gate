import { z } from 'zod';

/**
 * The contract between the dashboard and the AI summary service (plan.md §3.3).
 * The wire format is exactly the one given in the exercise.
 */

const nonBlankText = z.string().trim().min(1);

export const summaryReadyResponseSchema = z.object({
  status: z.literal('ok'),
  summary: nonBlankText,
  // Optional on purpose: a summary with missing citations is on-contract but unapprovable.
  sourceIds: z.array(z.string()).optional(),
});

export const insufficientInformationResponseSchema = z.object({
  status: z.literal('insufficient_information'),
});

export const summaryUnavailableResponseSchema = z.object({
  error: z.literal('unavailable'),
});

export type SummaryReadyResponse = z.infer<typeof summaryReadyResponseSchema>;

export type SummaryOutcome =
  | { kind: 'summary'; summary: string; sourceIds: string[] | undefined }
  | { kind: 'insufficient-information' }
  | { kind: 'unavailable' }
  | { kind: 'off-contract'; reason: string };

export function parseSummaryResponse(httpStatus: number, body: unknown): SummaryOutcome {
  if (httpStatus === 200) {
    const readySummary = summaryReadyResponseSchema.safeParse(body);
    if (readySummary.success) {
      return {
        kind: 'summary',
        summary: readySummary.data.summary,
        sourceIds: readySummary.data.sourceIds,
      };
    }

    if (insufficientInformationResponseSchema.safeParse(body).success) {
      return { kind: 'insufficient-information' };
    }

    return { kind: 'off-contract', reason: 'HTTP 200 body matches no summary response shape' };
  }

  if (httpStatus === 503 && summaryUnavailableResponseSchema.safeParse(body).success) {
    return { kind: 'unavailable' };
  }

  return { kind: 'off-contract', reason: `Unexpected HTTP ${httpStatus} response` };
}
