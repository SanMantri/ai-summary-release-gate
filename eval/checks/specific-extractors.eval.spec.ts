import { expect, test } from '@playwright/test';
import { extractSpecifics, specificKey } from './specific-extractors';

/**
 * The evaluation's own oracle is tested too: if normalisation is wrong, every grounded-specifics
 * verdict built on it is wrong.
 */
test.describe('Specific extraction and normalisation', () => {
  const sameFactWrittenDifferently = [
    { fact: 'a money amount', variants: ['$49.99', '49.99 USD', '$ 49.99', '49.99 dollars'] },
    { fact: 'a whole money amount', variants: ['$500', '$500.00', '500 USD'] },
    { fact: 'an order number', variants: ['#48213', 'order 48213', 'order #48213', 'ORD-48213'] },
    { fact: 'a date', variants: ['2026-03-02', 'March 2, 2026', '2 March 2026', 'Mar 2nd 2026'] },
    { fact: 'an email address', variants: ['dana.lee@example.com', 'Dana.Lee@Example.com'] },
    { fact: 'a phone number', variants: ['+1 415 555 0134', '(415) 555-0134', '415.555.0134'] },
  ];

  for (const { fact, variants } of sameFactWrittenDifferently) {
    test(`normalises ${fact} written ${variants.length} ways to one value`, () => {
      const keys = variants.map((variant) => extractSpecifics(variant).map(specificKey));

      expect(keys.every((variantKeys) => variantKeys.length === 1)).toBe(true);
      expect(new Set(keys.flat()).size).toBe(1);
    });
  }

  test('does not re-read a date as a phone number or reference number', () => {
    const specifics = extractSpecifics('Charged on 2026-03-02 for order #48213.');

    expect(specifics.map(specificKey)).toEqual(['date:2026-03-02', 'reference-number:48213']);
  });

  test('keeps different currencies apart', () => {
    const [euroAmount] = extractSpecifics('€49.99').map(specificKey);
    const [dollarAmount] = extractSpecifics('$49.99').map(specificKey);

    expect(euroAmount).not.toBe(dollarAmount);
  });

  test('extracts nothing from a summary without concrete facts', () => {
    expect(extractSpecifics('The customer is locked out and wants help.')).toEqual([]);
  });
});
