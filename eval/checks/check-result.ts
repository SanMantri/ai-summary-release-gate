import type { EvaluationCheckName } from '../dataset/summary-example-schema';

export interface CheckResult {
  checkName: EvaluationCheckName;
  passed: boolean;
  /** Human-readable reasons the check failed (empty when it passed). */
  findings: string[];
}
