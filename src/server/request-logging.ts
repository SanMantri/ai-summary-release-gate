import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Request, RequestHandler } from 'express';

/** Tests send this header so every server log line can be traced back to the test that caused it. */
export const testIdHeaderName = 'x-test-id';

export interface ServerLogger {
  log(event: string, details: Record<string, unknown>): void;
}

export interface ServerLoggerOptions {
  /** One JSON object per line is appended here. Omit to keep logs in-process only. */
  logFilePath?: string;
  echoToStdout?: boolean;
}

export function createServerLogger({
  logFilePath,
  echoToStdout,
}: ServerLoggerOptions): ServerLogger {
  if (logFilePath) {
    mkdirSync(dirname(logFilePath), { recursive: true });
    writeFileSync(logFilePath, '');
  }

  return {
    log(event, details) {
      const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details });
      if (logFilePath) {
        // Synchronous on purpose: a failing test reads its log lines right after the request.
        appendFileSync(logFilePath, `${line}\n`);
      }
      if (echoToStdout) {
        console.log(line);
      }
    },
  };
}

export function testIdOf(request: Request): string | undefined {
  return request.header(testIdHeaderName);
}

const ticketIdInPath = /^\/api\/(?:__test__\/)?tickets\/([^/]+)/;

export function requestLoggingMiddleware(logger: ServerLogger): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();
    response.on('finish', () => {
      logger.log('http_request', {
        testId: testIdOf(request),
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        ticketId: ticketIdInPath.exec(request.path)?.[1],
      });
    });
    next();
  };
}
