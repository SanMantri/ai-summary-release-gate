/**
 * Gate self-test (plan.md §8): proves the release gate still catches the known regression.
 *
 *  1. Applies regressions/citation-rule-some-instead-of-every.patch (every → some).
 *  2. Runs the developer unit tests (Vitest) and the API + UI suites (Playwright) against it.
 *  3. Passes only if EXACTLY the expected detectors failed — so a crash or a broken build cannot
 *     make it pass — every other test still passed, and the summary evaluation stayed green
 *     (it is deliberately independent of product code).
 *  4. Always reverts the patch.
 *
 * If you add a test that also catches this regression, add it to `expectedDetectors`.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const patchPath = 'regressions/citation-rule-some-instead-of-every.patch';
const patchedFile = 'src/domain/citation-validation.ts';
const evidenceDirectory = resolve('release-gate-evidence/gate-self-test');
// A dedicated port guarantees a fresh test server running the patched code.
const selfTestServerPort = '5181';

type Layer = 'developer-unit' | 'api' | 'ui-chromium';

interface TestOutcome {
  layer: Layer;
  catalogId: string;
  title: string;
  failed: boolean;
}

const expectedDetectors: Array<{ layer: Layer; catalogId: string; titleIncludes: string }> = [
  {
    layer: 'developer-unit',
    catalogId: 'DEV-01',
    titleIncludes: 'a valid message plus a message from another ticket',
  },
  {
    layer: 'api',
    catalogId: 'API-APR-02',
    titleIncludes: "a valid message plus another ticket's message",
  },
  {
    layer: 'ui-chromium',
    catalogId: 'UI-05',
    titleIncludes: 'a message from another ticket alongside a valid one',
  },
];

function run(command: string, args: string[], extraEnvironment: Record<string, string> = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnvironment },
  });
  return result.status ?? 1;
}

function git(...args: string[]): number {
  return spawnSync('git', args, { stdio: 'inherit' }).status ?? 1;
}

function readDeveloperUnitOutcomes(reportPath: string): TestOutcome[] {
  interface VitestReport {
    testResults: Array<{
      assertionResults: Array<{ ancestorTitles: string[]; title: string; status: string }>;
    }>;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as VitestReport;
  return report.testResults.flatMap((file) =>
    file.assertionResults.map((assertion) => ({
      layer: 'developer-unit' as const,
      catalogId: /^(DEV-\d+)/.exec(assertion.ancestorTitles[0] ?? '')?.[1] ?? '—',
      title: [...assertion.ancestorTitles, assertion.title].join(' › '),
      failed: assertion.status === 'failed',
    })),
  );
}

function readPlaywrightOutcomes(reportPath: string): TestOutcome[] {
  interface PlaywrightSuite {
    specs?: Array<{
      title: string;
      tests: Array<{
        projectName: string;
        status: string;
        annotations: Array<{ type: string; description?: string }>;
      }>;
    }>;
    suites?: PlaywrightSuite[];
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { suites: PlaywrightSuite[] };
  const outcomes: TestOutcome[] = [];
  const visit = (suite: PlaywrightSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        outcomes.push({
          layer: test.projectName as Layer,
          catalogId:
            test.annotations.find((annotation) => annotation.type === 'catalog-id')?.description ??
            '—',
          title: spec.title,
          failed: test.status === 'unexpected' || test.status === 'flaky',
        });
      }
    }
    suite.suites?.forEach(visit);
  };
  report.suites.forEach(visit);
  return outcomes;
}

function verifyGateCatchesRegression(): boolean {
  mkdirSync(evidenceDirectory, { recursive: true });
  const developerUnitReport = resolve(evidenceDirectory, 'developer-unit-results.json');
  const playwrightReport = resolve(evidenceDirectory, 'playwright-results.json');

  run('node_modules/.bin/vitest', [
    'run',
    '--reporter=json',
    `--outputFile=${developerUnitReport}`,
  ]);
  run(
    'node_modules/.bin/playwright',
    ['test', '--project=api', '--project=ui-chromium', '--reporter=json', '--retries=0'],
    { PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightReport, DASHBOARD_TEST_PORT: selfTestServerPort },
  );
  const evaluationExitCode = run(
    'node_modules/.bin/playwright',
    ['test', '--project=eval', '--reporter=dot'],
    { RELEASE_GATE_LAYER: 'eval' },
  );

  const outcomes = [
    ...readDeveloperUnitOutcomes(developerUnitReport),
    ...readPlaywrightOutcomes(playwrightReport),
  ];
  const failures = outcomes.filter((outcome) => outcome.failed);
  const isExpectedDetection = (outcome: TestOutcome) =>
    expectedDetectors.some(
      (detector) =>
        detector.layer === outcome.layer &&
        detector.catalogId === outcome.catalogId &&
        outcome.title.includes(detector.titleIncludes),
    );

  const missedDetections = expectedDetectors.filter(
    (detector) =>
      !failures.some(
        (failure) =>
          failure.layer === detector.layer &&
          failure.catalogId === detector.catalogId &&
          failure.title.includes(detector.titleIncludes),
      ),
  );
  const unexpectedFailures = failures.filter((failure) => !isExpectedDetection(failure));
  const layersWithoutPassingTests = (['developer-unit', 'api', 'ui-chromium'] as const).filter(
    (layer) => !outcomes.some((outcome) => outcome.layer === layer && !outcome.failed),
  );
  const evaluationStayedGreen = evaluationExitCode === 0;

  const verified =
    missedDetections.length === 0 &&
    unexpectedFailures.length === 0 &&
    layersWithoutPassingTests.length === 0 &&
    evaluationStayedGreen;

  const report = [
    '## Gate self-test — does the gate still catch the known regression?',
    '',
    `Regression: \`${patchPath}\` (citation rule uses \`some\` instead of \`every\`).`,
    '',
    '| Layer | Expected detector | Caught? |',
    '|---|---|---|',
    ...expectedDetectors.map(
      (detector) =>
        `| ${detector.layer} | ${detector.catalogId} — ${detector.titleIncludes} | ${missedDetections.includes(detector) ? '❌ missed' : '✅ failed as expected'} |`,
    ),
    `| eval | summary evaluation stays green (independent oracle) | ${evaluationStayedGreen ? '✅ green' : '❌ failed'} |`,
    '',
    `Tests run: ${outcomes.length} · failed: ${failures.length} · unexpected failures: ${unexpectedFailures.length}`,
    ...unexpectedFailures.map(
      (failure) => `- ⚠️ unexpected: [${failure.layer}] ${failure.catalogId} ${failure.title}`,
    ),
    ...layersWithoutPassingTests.map((layer) => `- ⚠️ no passing tests in ${layer} — did it run?`),
    '',
    verified
      ? '**Verified:** exactly the expected tests caught the regression.'
      : '**NOT verified:** the gate no longer catches this regression the way it should.',
    '',
  ].join('\n');

  console.log(`\n${report}`);
  writeFileSync(resolve(evidenceDirectory, 'gate-self-test-report.md'), report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
  return verified;
}

if (spawnSync('git', ['diff', '--quiet', '--', patchedFile]).status !== 0) {
  console.error(`${patchedFile} has local changes; commit or stash them before the self-test.`);
  process.exit(1);
}
const regressionAlreadyPresent =
  spawnSync('git', ['apply', '--check', '-R', patchPath], { stdio: 'ignore' }).status === 0;
if (regressionAlreadyPresent) {
  const message =
    'The intentional regression is already present in this code, so the self-test cannot inject ' +
    'it. This code must not be released; the other release-gate jobs show which tests catch it.';
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Gate self-test\n\n⚠️ ${message}\n`);
  }
  process.exit(1);
}
if (git('apply', '--check', patchPath) !== 0) {
  console.error(`${patchPath} no longer applies cleanly; regenerate it (see README).`);
  process.exit(1);
}

function verifyWithPatchApplied(): boolean {
  git('apply', patchPath);
  try {
    return verifyGateCatchesRegression();
  } finally {
    git('apply', '-R', patchPath);
  }
}

process.exit(verifyWithPatchApplied() ? 0 : 1);
