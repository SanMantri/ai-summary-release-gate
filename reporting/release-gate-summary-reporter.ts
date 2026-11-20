import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Turns a Playwright run into evidence another engineer can act on without re-running it
 * (plan.md §7.4):
 *   release-gate-evidence/release-gate-summary.md   per-layer counts + every failure, with the
 *                                                    artifact that holds its trace
 *   release-gate-evidence/summary-evaluation-scorecard.{md,json}   when eval tests ran
 * Both are appended to the GitHub job summary when running in Actions.
 */

const evidenceDirectory = resolve('release-gate-evidence');
const summaryEvaluationAnnotationType = 'summary-evaluation';

interface LayerCounts {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

interface FailureDetail {
  layer: string;
  title: string;
  catalogId: string;
  location: string;
  outcome: 'failed' | 'flaky';
  firstErrorLine: string;
}

/** The subset of the evaluation record (eval/evaluate-summary-example.ts) this reporter reads. */
interface RecordedEvaluation {
  exampleId: string;
  humanLabel: string;
  knownBlindSpot: boolean;
  expectedFailedChecks: string[];
  actualFailedChecks: string[];
  agreement: string;
}

class ReleaseGateSummaryReporter implements Reporter {
  #rootSuite: Suite | undefined;
  #rootDirectory = process.cwd();

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.#rootSuite = suite;
    this.#rootDirectory = config.rootDir;
  }

  onEnd(result: FullResult): void {
    const tests = this.#rootSuite?.allTests() ?? [];
    if (tests.length === 0) {
      return;
    }
    mkdirSync(evidenceDirectory, { recursive: true });

    const gateSummary = this.#renderGateSummary(tests, result);
    writeFileSync(resolve(evidenceDirectory, 'release-gate-summary.md'), gateSummary);
    appendToGitHubJobSummary(gateSummary);

    const evaluations = tests.flatMap(recordedEvaluationsOf);
    if (evaluations.length > 0) {
      const scorecard = renderScorecard(evaluations);
      writeFileSync(resolve(evidenceDirectory, 'summary-evaluation-scorecard.md'), scorecard);
      writeFileSync(
        resolve(evidenceDirectory, 'summary-evaluation-scorecard.json'),
        `${JSON.stringify(scorecardAsJson(evaluations), null, 2)}\n`,
      );
      appendToGitHubJobSummary(scorecard);
      console.log(
        `\nSummary evaluation scorecard: ${relative(process.cwd(), resolve(evidenceDirectory, 'summary-evaluation-scorecard.md'))}`,
      );
    }
  }

  #renderGateSummary(tests: TestCase[], result: FullResult): string {
    const countsByLayer = new Map<string, LayerCounts>();
    const failures: FailureDetail[] = [];

    for (const test of tests) {
      const layer = test.parent.project()?.name ?? '(no project)';
      const counts = countsByLayer.get(layer) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      const outcome = test.outcome();
      if (outcome === 'expected') counts.passed += 1;
      if (outcome === 'unexpected') counts.failed += 1;
      if (outcome === 'flaky') counts.flaky += 1;
      if (outcome === 'skipped') counts.skipped += 1;
      countsByLayer.set(layer, counts);

      if (outcome === 'unexpected' || outcome === 'flaky') {
        failures.push(this.#describeFailure(test, layer, outcome === 'flaky' ? 'flaky' : 'failed'));
      }
    }

    const lines = [
      `## Release gate — Playwright layers: ${[...countsByLayer.keys()].join(', ')}`,
      '',
      `Run status: **${result.status}**`,
      '',
      '| Layer | Passed | Failed | Flaky (blocks in CI) | Skipped |',
      '|---|---|---|---|---|',
      ...[...countsByLayer.entries()].map(
        ([layer, counts]) =>
          `| ${layer} | ${counts.passed} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} |`,
      ),
      '',
    ];

    if (failures.length > 0) {
      const artifactName = process.env.EVIDENCE_ARTIFACT_NAME;
      lines.push(
        `### Failures (${failures.length})`,
        '',
        '| Layer | Catalog ID | Test | Location | Outcome | First error line |',
        '|---|---|---|---|---|---|',
        ...failures.map(
          (failure) =>
            `| ${failure.layer} | ${failure.catalogId} | ${escapeTableCell(failure.title)} | \`${failure.location}\` | ${failure.outcome} | ${escapeTableCell(failure.firstErrorLine)} |`,
        ),
        '',
        artifactName
          ? `Evidence: download the **${artifactName}** artifact and open \`playwright-report/index.html\` — each failure has its trace, screenshot, video and \`server-log.jsonl\`.`
          : 'Evidence: run `npm run report` to open the HTML report — each failure has its trace, screenshot, video and `server-log.jsonl`.',
        '',
      );
    }
    return lines.join('\n');
  }

  #describeFailure(test: TestCase, layer: string, outcome: 'failed' | 'flaky'): FailureDetail {
    const failingResult = test.results.find((result) => result.status !== 'passed');
    return {
      layer,
      title: test.titlePath().slice(3).join(' › '),
      catalogId:
        test.annotations.find((annotation) => annotation.type === 'catalog-id')?.description ?? '—',
      location: `${relative(this.#rootDirectory, test.location.file)}:${test.location.line}`,
      outcome,
      firstErrorLine: firstErrorLineOf(failingResult),
    };
  }
}

function firstErrorLineOf(result: TestResult | undefined): string {
  const message = result?.errors[0]?.message ?? '(no error message)';
  // eslint-disable-next-line no-control-regex -- strip terminal colour codes from Playwright errors
  const plainMessage = message.replace(/\u001b\[[0-9;]*m/g, '');
  return plainMessage.split('\n').find((line) => line.trim().length > 0) ?? plainMessage;
}

function recordedEvaluationsOf(test: TestCase): RecordedEvaluation[] {
  const lastResult = test.results.at(-1);
  const annotations = [...(lastResult?.annotations ?? []), ...test.annotations];
  const recorded = annotations.find(
    (annotation) => annotation.type === summaryEvaluationAnnotationType,
  );
  return recorded?.description ? [JSON.parse(recorded.description) as RecordedEvaluation] : [];
}

function renderScorecard(evaluations: RecordedEvaluation[]): string {
  const countOf = (agreement: string) =>
    evaluations.filter((evaluation) => evaluation.agreement === agreement).length;
  const failedCountOf = (checkName: string) =>
    evaluations.filter((evaluation) => evaluation.actualFailedChecks.includes(checkName)).length;
  const gated = evaluations.filter((evaluation) => !evaluation.knownBlindSpot);
  const checkNames = [
    ...new Set(evaluations.flatMap((e) => e.expectedFailedChecks.concat(e.actualFailedChecks))),
  ].sort();

  return [
    '## Summary evaluation scorecard',
    '',
    '| Metric | Count |',
    '|---|---|',
    `| Gated examples | ${gated.length} |`,
    `| Agree with the human label | ${countOf('agrees-with-label')} |`,
    `| **False accepts** — unacceptable summary passed every check (most severe) | ${countOf('false-accept')} |`,
    `| False rejects — acceptable summary failed a check | ${countOf('false-reject')} |`,
    `| Right verdict, wrong reason | ${countOf('wrong-reason')} |`,
    `| Known blind spots — reported, not gated | ${countOf('known-blind-spot')} |`,
    `| Blind spots now detected — relabel these | ${countOf('blind-spot-now-detected')} |`,
    '',
    '| Check | Examples it failed |',
    '|---|---|',
    ...checkNames.map((checkName) => `| ${checkName} | ${failedCountOf(checkName)} |`),
    '',
    '<details><summary>Per-example results</summary>',
    '',
    '| Example | Human label | Expected failed checks | Actual failed checks | Result |',
    '|---|---|---|---|---|',
    ...evaluations
      .sort((first, second) => first.exampleId.localeCompare(second.exampleId))
      .map(
        (evaluation) =>
          `| ${evaluation.exampleId} | ${evaluation.humanLabel} | ${evaluation.expectedFailedChecks.join(', ') || '—'} | ${evaluation.actualFailedChecks.join(', ') || '—'} | ${evaluation.agreement} |`,
      ),
    '',
    '</details>',
    '',
  ].join('\n');
}

function scorecardAsJson(evaluations: RecordedEvaluation[]) {
  const countOf = (agreement: string) =>
    evaluations.filter((evaluation) => evaluation.agreement === agreement).length;
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      examples: evaluations.length,
      agreesWithLabel: countOf('agrees-with-label'),
      falseAccepts: countOf('false-accept'),
      falseRejects: countOf('false-reject'),
      wrongReason: countOf('wrong-reason'),
      knownBlindSpots: countOf('known-blind-spot'),
      blindSpotsNowDetected: countOf('blind-spot-now-detected'),
    },
    examples: evaluations,
  };
}

function appendToGitHubJobSummary(markdown: string): void {
  const jobSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (jobSummaryPath) {
    appendFileSync(jobSummaryPath, `${markdown}\n`);
  }
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').slice(0, 200);
}

export default ReleaseGateSummaryReporter;
