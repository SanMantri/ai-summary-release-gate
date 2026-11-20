// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

const playwrightRecommended = playwright.configs['flat/recommended'];

export default defineConfig(
  {
    ignores: [
      'dist/**',
      'playwright-report/**',
      'test-results/**',
      'blob-report/**',
      'release-gate-evidence/**',
    ],
  },

  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'error',
      // A leading underscore marks a parameter that must exist for its signature (e.g. Express's
      // four-argument error handler) but is intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The summary panel is a state machine: every state must be handled explicitly.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // SDET suite rules: these are the classic sources of flaky or silently-dropped Playwright tests.
  {
    files: ['tests/**/*.ts', 'eval/**/*.ts'],
    ...playwrightRecommended,
    rules: {
      ...playwrightRecommended.rules,
      // Playwright fixtures that need no other fixture must still destructure their first argument.
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
      'playwright/missing-playwright-await': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: false }],
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-networkidle': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/prefer-web-first-assertions': 'error',
    },
  },

  // Oracle independence (plan.md decision 10): the evaluation must never reuse product code,
  // or a bug in the product's citation rule would also "pass" its own evaluation.
  {
    files: ['eval/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/**'],
              message:
                'The summary evaluation must stay independent of product code (plan.md decision 10).',
            },
          ],
        },
      ],
    },
  },
);
