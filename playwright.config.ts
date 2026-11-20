import { defineConfig, devices, type Project, type ReporterDescription } from '@playwright/test';
import {
  dashboardTestBaseUrl,
  dashboardTestPort,
  serverLogFilePath,
  testProviderTimeoutMs,
} from './tests/support/test-environment';

/**
 * SDET suite configuration (plan.md §4.3). Layers are Playwright projects:
 *   blocking: api · ui-chromium · smoke-chromium · eval
 *   advisory: quarantined   (only with RELEASE_GATE_ADVISORY=1)
 * Developer unit tests run under Vitest (vitest.config.ts).
 */
const isCI = Boolean(process.env.CI);
const includeAdvisoryProjects = process.env.RELEASE_GATE_ADVISORY === '1';
const runsEvaluationOnly = process.env.RELEASE_GATE_LAYER === 'eval';
const quarantinedTag = /@quarantined/;

const blockingProjects: Project[] = [
  {
    name: 'api',
    testDir: './tests/api',
    testMatch: '**/*.api.spec.ts',
    grepInvert: quarantinedTag,
  },
  {
    name: 'ui-chromium',
    testDir: './tests/ui',
    testMatch: '**/*.ui.spec.ts',
    use: { ...devices['Desktop Chrome'] },
    grepInvert: quarantinedTag,
  },
  {
    name: 'smoke-chromium',
    testDir: './tests/smoke',
    testMatch: '**/*.smoke.spec.ts',
    use: { ...devices['Desktop Chrome'] },
    grepInvert: quarantinedTag,
  },
  {
    name: 'eval',
    testDir: './eval',
    testMatch: '**/*.eval.spec.ts',
    grepInvert: quarantinedTag,
  },
];

// Tests tagged @quarantined leave the blocking projects and run only here, so they are never
// silently dropped. Opt-in, so a quarantined failure never reddens a local `npm run test:gate`.
const advisoryProjects: Project[] = [
  {
    name: 'quarantined',
    testDir: './tests',
    testMatch: '**/*.spec.ts',
    use: { ...devices['Desktop Chrome'] },
    grep: quarantinedTag,
  },
];

const reporters: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ['junit', { outputFile: 'release-gate-evidence/playwright-results.junit.xml' }],
  ['./reporting/release-gate-summary-reporter.ts'],
  ...(isCI ? ([['github']] satisfies ReporterDescription[]) : []),
];

export default defineConfig({
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  // In CI a single retry only classifies a failure (flaky vs. consistent) and records a second
  // trace; failOnFlakyTests makes a pass-on-retry still block the release (plan.md §7.3).
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  workers: isCI ? 4 : undefined,
  reporter: reporters,

  use: {
    baseURL: dashboardTestBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: includeAdvisoryProjects ? [...blockingProjects, ...advisoryProjects] : blockingProjects,

  webServer: runsEvaluationOnly
    ? undefined
    : {
        command: 'npm run build:ui && npm run start:server',
        url: `${dashboardTestBaseUrl}/api/health`,
        reuseExistingServer: !isCI,
        timeout: 60_000,
        env: {
          DASHBOARD_PORT: String(dashboardTestPort),
          ENABLE_TEST_SEEDING: '1',
          PROVIDER_TIMEOUT_MS: String(testProviderTimeoutMs),
          SERVER_LOG_FILE: serverLogFilePath,
        },
      },
});
