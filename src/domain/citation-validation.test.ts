import { describe, expect, it } from 'vitest';
import { validateCitations } from './citation-validation';

const ticketMessageIds = new Set(['m-101', 'm-102']);

describe('DEV-01 validateCitations', () => {
  it('accepts a summary citing a message from the ticket', () => {
    expect(validateCitations(['m-101'], ticketMessageIds)).toEqual({
      citationsAreValid: true,
      problems: [],
    });
  });

  it.each([
    {
      situation: 'an empty citation list',
      sourceIds: [],
      expectedProblems: [{ code: 'no_citations' }],
    },
    {
      situation: 'no citation list at all',
      sourceIds: undefined,
      expectedProblems: [{ code: 'no_citations' }],
    },
    {
      situation: 'only a message from another ticket',
      sourceIds: ['m-201'],
      expectedProblems: [{ code: 'citation_not_in_ticket', messageId: 'm-201' }],
    },
    {
      situation: 'a valid message plus a message from another ticket',
      sourceIds: ['m-101', 'm-201'],
      expectedProblems: [{ code: 'citation_not_in_ticket', messageId: 'm-201' }],
    },
  ])('rejects $situation', ({ sourceIds, expectedProblems }) => {
    expect(validateCitations(sourceIds, ticketMessageIds)).toEqual({
      citationsAreValid: false,
      problems: expectedProblems,
    });
  });
});
