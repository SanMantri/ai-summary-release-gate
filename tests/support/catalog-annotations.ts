import type { TestDetails } from '@playwright/test';

/**
 * Links a test to its row in the test catalog (plan.md §5) without cluttering the title.
 * The gate self-test (scripts/verify-gate-catches-regression.ts) also uses these IDs to check
 * that the intentional regression is caught by exactly the expected tests.
 */
export function catalogId(id: string): TestDetails {
  return { annotation: { type: 'catalog-id', description: id } };
}
