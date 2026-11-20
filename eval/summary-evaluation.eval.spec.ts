import { expect, test } from '@playwright/test';
import { loadSummaryEvaluationDataset } from './dataset/summary-example-schema';
import {
  describeEvaluation,
  evaluateSummaryExample,
  summaryEvaluationAnnotationType,
} from './evaluate-summary-example';

/**
 * Deterministic summary evaluation (plan.md §6). One test per labeled example: the exact set
 * of failed checks must match the human label's expectation, which catches false accepts,
 * false rejects and right-verdict-for-the-wrong-reason. Each verdict is recorded as an
 * annotation; the release-gate reporter turns them into the scorecard.
 */
const dataset = loadSummaryEvaluationDataset();
const gatedExamples = dataset.examples.filter((example) => !example.knownBlindSpot);
const knownBlindSpots = dataset.examples.filter((example) => example.knownBlindSpot);

test.describe('Summary evaluation: labeled examples', () => {
  for (const example of gatedExamples) {
    test(
      `${example.id} (${example.humanLabel})`,
      { annotation: { type: 'catalog-id', description: `EVAL-${example.id}` } },
      ({}, testInfo) => {
        const evaluation = evaluateSummaryExample(example, dataset);
        testInfo.annotations.push({
          type: summaryEvaluationAnnotationType,
          description: JSON.stringify(evaluation),
        });

        expect(
          evaluation.actualFailedChecks,
          `The deterministic checks disagree with the human label.\n${describeEvaluation(evaluation)}`,
        ).toEqual(evaluation.expectedFailedChecks);
      },
    );
  }
});

test.describe('Summary evaluation: known blind spots (reported, not gated)', () => {
  for (const example of knownBlindSpots) {
    test(
      `${example.id} is still missed by the deterministic checks`,
      { annotation: { type: 'catalog-id', description: `EVAL-${example.id}` } },
      ({}, testInfo) => {
        const evaluation = evaluateSummaryExample(example, dataset);
        testInfo.annotations.push({
          type: summaryEvaluationAnnotationType,
          description: JSON.stringify(evaluation),
        });

        expect(
          evaluation.actualFailedChecks,
          `This known blind spot is now detected. Update its label in summary-examples.json: ` +
            `set knownBlindSpot to false and list the failing checks.\n${describeEvaluation(evaluation)}`,
        ).toEqual([]);
      },
    );
  }
});
