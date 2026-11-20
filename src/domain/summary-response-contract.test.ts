import { describe, expect, it } from 'vitest';
import { parseSummaryResponse } from './summary-response-contract';

describe('DEV-02 parseSummaryResponse', () => {
  describe('on-contract responses', () => {
    it('reads a ready summary with its citations', () => {
      expect(
        parseSummaryResponse(200, {
          status: 'ok',
          summary: 'Customer was charged twice.',
          sourceIds: ['m-101'],
        }),
      ).toEqual({
        kind: 'summary',
        summary: 'Customer was charged twice.',
        sourceIds: ['m-101'],
      });
    });

    it('reads a ready summary without a citation list as a summary with no citations', () => {
      expect(
        parseSummaryResponse(200, { status: 'ok', summary: 'Customer was charged twice.' }),
      ).toEqual({
        kind: 'summary',
        summary: 'Customer was charged twice.',
        sourceIds: undefined,
      });
    });

    it('reads insufficient information', () => {
      expect(parseSummaryResponse(200, { status: 'insufficient_information' })).toEqual({
        kind: 'insufficient-information',
      });
    });

    it('reads the unavailable error', () => {
      expect(parseSummaryResponse(503, { error: 'unavailable' })).toEqual({ kind: 'unavailable' });
    });

    it('ignores unknown extra fields so the service can evolve', () => {
      expect(
        parseSummaryResponse(200, {
          status: 'ok',
          summary: 'Customer was charged twice.',
          sourceIds: ['m-101'],
          modelVersion: 'synthetic-1',
        }),
      ).toMatchObject({ kind: 'summary' });
    });
  });

  describe('off-contract responses', () => {
    it.each([
      { situation: 'an unknown status', httpStatus: 200, body: { status: 'pending' } },
      {
        situation: 'a citation list that is not an array',
        httpStatus: 200,
        body: { status: 'ok', summary: 'Charged twice.', sourceIds: 'm-101' },
      },
      {
        situation: 'a citation that is not a string',
        httpStatus: 200,
        body: { status: 'ok', summary: 'Charged twice.', sourceIds: [101] },
      },
      {
        situation: 'a whitespace-only summary',
        httpStatus: 200,
        body: { status: 'ok', summary: '   ', sourceIds: ['m-101'] },
      },
      {
        situation: 'a summary that is not text',
        httpStatus: 200,
        body: { status: 'ok', summary: 42, sourceIds: ['m-101'] },
      },
      { situation: 'a body that is not an object', httpStatus: 200, body: 'ok' },
      { situation: 'a missing body', httpStatus: 200, body: undefined },
      {
        situation: 'HTTP 503 with an unexpected body',
        httpStatus: 503,
        body: { error: 'overloaded' },
      },
      { situation: 'HTTP 500', httpStatus: 500, body: { error: 'internal' } },
      { situation: 'HTTP 502', httpStatus: 502, body: { error: 'invalid_provider_response' } },
      {
        situation: 'a ready summary sent with a non-200 status',
        httpStatus: 201,
        body: { status: 'ok', summary: 'Charged twice.', sourceIds: ['m-101'] },
      },
    ])('treats $situation as off-contract', ({ httpStatus, body }) => {
      expect(parseSummaryResponse(httpStatus, body)).toMatchObject({ kind: 'off-contract' });
    });
  });
});
