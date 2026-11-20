import { describe, expect, it } from 'vitest';
import { parseSummaryResponse } from './summary-response-contract';

describe('DEV-02 parseSummaryResponse', () => {
  it('reads a ready summary with its citations', () => {
    expect(
      parseSummaryResponse(200, {
        status: 'ok',
        summary: 'Customer was charged twice.',
        sourceIds: ['m-101'],
      }),
    ).toEqual({ kind: 'summary', summary: 'Customer was charged twice.', sourceIds: ['m-101'] });
  });

  it('reads a ready summary without a citation list as a summary with no citations', () => {
    expect(
      parseSummaryResponse(200, { status: 'ok', summary: 'Customer was charged twice.' }),
    ).toEqual({ kind: 'summary', summary: 'Customer was charged twice.', sourceIds: undefined });
  });

  it('reads insufficient information', () => {
    expect(parseSummaryResponse(200, { status: 'insufficient_information' })).toEqual({
      kind: 'insufficient-information',
    });
  });

  it('reads the unavailable error', () => {
    expect(parseSummaryResponse(503, { error: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('treats a response matching none of the three shapes as off-contract', () => {
    expect(parseSummaryResponse(200, { status: 'pending' })).toMatchObject({
      kind: 'off-contract',
    });
  });
});
