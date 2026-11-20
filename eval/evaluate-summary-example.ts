import type { CheckResult } from './checks/check-result';
import { checkGroundedSpecifics } from './checks/grounded-specifics-check';
import { checkSourceAttribution } from './checks/source-attribution-check';
import type {
  EvaluationCheckName,
  SummaryEvaluationDataset,
  SummaryExample,
} from './dataset/summary-example-schema';

/**
 * How the deterministic checks' verdict relates to the human label:
 *   agrees-with-label        exactly the expected checks failed
 *   false-accept             the human says unacceptable, every check passed (most severe)
 *   false-reject             the human says acceptable, a check failed
 *   wrong-reason             right verdict, but different checks failed than expected
 *   known-blind-spot         a documented miss: unacceptable, yet every check passes
 *   blind-spot-now-detected  a documented miss is now caught — relabel the example
 */
export type LabelAgreement =
  | 'agrees-with-label'
  | 'false-accept'
  | 'false-reject'
  | 'wrong-reason'
  | 'known-blind-spot'
  | 'blind-spot-now-detected';

export interface ExampleEvaluation {
  exampleId: string;
  description: string;
  humanLabel: SummaryExample['humanLabel'];
  knownBlindSpot: boolean;
  expectedFailedChecks: EvaluationCheckName[];
  actualFailedChecks: EvaluationCheckName[];
  agreement: LabelAgreement;
  checkResults: CheckResult[];
}

/** The annotation type the release-gate reporter reads to build the scorecard. */
export const summaryEvaluationAnnotationType = 'summary-evaluation';

export function evaluateSummaryExample(
  example: SummaryExample,
  dataset: SummaryEvaluationDataset,
): ExampleEvaluation {
  const ticket = dataset.tickets.find((candidate) => candidate.id === example.ticketId);
  if (!ticket) {
    throw new Error(`${example.id} refers to unknown ticket ${example.ticketId}`);
  }

  const checkResults = [
    checkSourceAttribution(example.modelOutput, ticket, dataset.tickets),
    checkGroundedSpecifics(example.modelOutput, ticket),
  ];
  const actualFailedChecks = checkResults
    .filter((result) => !result.passed)
    .map((result) => result.checkName)
    .sort();
  const expectedFailedChecks = [...example.expectedFailedChecks].sort();

  return {
    exampleId: example.id,
    description: example.description,
    humanLabel: example.humanLabel,
    knownBlindSpot: example.knownBlindSpot,
    expectedFailedChecks,
    actualFailedChecks,
    agreement: classifyAgreement(example, expectedFailedChecks, actualFailedChecks),
    checkResults,
  };
}

function classifyAgreement(
  example: SummaryExample,
  expectedFailedChecks: EvaluationCheckName[],
  actualFailedChecks: EvaluationCheckName[],
): LabelAgreement {
  const checksAcceptTheSummary = actualFailedChecks.length === 0;

  if (example.knownBlindSpot) {
    return checksAcceptTheSummary ? 'known-blind-spot' : 'blind-spot-now-detected';
  }
  if (expectedFailedChecks.join() === actualFailedChecks.join()) {
    return 'agrees-with-label';
  }
  if (example.humanLabel === 'unacceptable' && checksAcceptTheSummary) {
    return 'false-accept';
  }
  if (example.humanLabel === 'acceptable' && !checksAcceptTheSummary) {
    return 'false-reject';
  }
  return 'wrong-reason';
}

export function describeEvaluation(evaluation: ExampleEvaluation): string {
  const findings = evaluation.checkResults.flatMap((result) =>
    result.findings.map((finding) => `  - ${result.checkName}: ${finding}`),
  );
  return [
    `${evaluation.exampleId} → ${evaluation.agreement}`,
    `  human label: ${evaluation.humanLabel}`,
    `  expected failed checks: [${evaluation.expectedFailedChecks.join(', ')}]`,
    `  actual failed checks:   [${evaluation.actualFailedChecks.join(', ')}]`,
    ...findings,
  ].join('\n');
}
