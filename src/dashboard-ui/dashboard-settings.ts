/**
 * How long the dashboard waits for the AI summary before showing a retryable error
 * (plan.md §3.7). Implemented with setTimeout so Playwright's page.clock can fast-forward it.
 * This module has no DOM dependencies, so tests can import the value.
 */
export const summaryRequestTimeoutMs = 15_000;
