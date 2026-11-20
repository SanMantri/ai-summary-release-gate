import type { Response } from 'express';
import type { DashboardApiErrorCode } from '../../domain/approval-request-contract';

export function sendApiError(
  response: Response,
  httpStatus: number,
  errorCode: DashboardApiErrorCode,
  details: Record<string, unknown> = {},
): void {
  response.status(httpStatus).json({ error: errorCode, ...details });
}
