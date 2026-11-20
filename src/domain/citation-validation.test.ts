import { describe, expect, it } from 'vitest';
import { validateCitations } from './citation-validation';

const ticketMessageIds = new Set(['m-101', 'm-102', 'm-103']);

describe('DEV-01 validateCitations', () => {
  describe('approvable citations', () => {
    it.each([
      { situation: 'a single message from the ticket', sourceIds: ['m-101'] },
      { situation: 'several messages from the ticket', sourceIds: ['m-101', 'm-103'] },
      { situation: 'the same valid message cited twice', sourceIds: ['m-101', 'm-101'] },
    ])('accepts $situation', ({ sourceIds }) => {
      expect(validateCitations(sourceIds, ticketMessageIds)).toEqual({
        citationsAreValid: true,
        problems: [],
      });
    });
  });

  describe('citations that must block approval', () => {
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
      {
        situation: 'a message ID that exists nowhere',
        sourceIds: ['m-999'],
        expectedProblems: [{ code: 'citation_not_in_ticket', messageId: 'm-999' }],
      },
      {
        situation: 'an empty-string message ID',
        sourceIds: [''],
        expectedProblems: [{ code: 'citation_not_in_ticket', messageId: '' }],
      },
      {
        situation: 'a message ID with different letter case',
        sourceIds: ['M-101'],
        expectedProblems: [{ code: 'citation_not_in_ticket', messageId: 'M-101' }],
      },
    ])('rejects $situation', ({ sourceIds, expectedProblems }) => {
      expect(validateCitations(sourceIds, ticketMessageIds)).toEqual({
        citationsAreValid: false,
        problems: expectedProblems,
      });
    });
  });

  it('reports every foreign citation once, even when it is repeated', () => {
    const result = validateCitations(['m-201', 'm-101', 'm-201', 'm-301'], ticketMessageIds);

    expect(result.problems).toEqual([
      { code: 'citation_not_in_ticket', messageId: 'm-201' },
      { code: 'citation_not_in_ticket', messageId: 'm-301' },
    ]);
  });
});
