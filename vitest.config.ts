import { defineConfig } from 'vitest/config';

// Developer-side unit tests only: pure product logic colocated with the code it tests.
// The SDET suite (API, UI, smoke, evaluation) runs under Playwright — see playwright.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: {
      junit: 'release-gate-evidence/developer-unit-tests.junit.xml',
    },
  },
});
