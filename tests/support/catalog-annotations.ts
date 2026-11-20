import type { TestDetails } from '@playwright/test';

/**
 * Links a test to its row in the test catalog (plan.md §5) without cluttering the title.
 * The release-gate summary reporter shows the ID next to every failure.
 */
export function catalogId(id: string): TestDetails {
  return { annotation: { type: 'catalog-id', description: id } };
}
