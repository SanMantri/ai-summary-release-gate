/**
 * Extracts the concrete, verifiable facts ("specifics") an agent might act on from free text,
 * and normalises each so the same fact written differently compares equal:
 *   $49 · $49.00 · 49.00 USD            → money "USD 49.00"
 *   #48213 · ORD-48213 · order 48213    → reference-number "48213"
 *   March 2, 2026 · 2 March 2026 · 2026-03-02 → date "2026-03-02"
 *
 * Extractors run in priority order and each one masks what it matched, so a date is never
 * re-read as a phone number or a reference number.
 *
 * Known blind spots (documented in docs/test-strategy.md): numbers written as words, relative
 * dates ("yesterday"), facts without digits (names, promises) and meaning reversals.
 */
export type SpecificKind =
  'email' | 'date' | 'money' | 'percentage' | 'phone-number' | 'reference-number';

export interface ExtractedSpecific {
  kind: SpecificKind;
  /** The text as written. */
  text: string;
  /** The comparable form. */
  normalized: string;
}

interface SpecificExtractor {
  kind: SpecificKind;
  pattern: RegExp;
  normalize: (match: RegExpMatchArray) => string;
}

const monthNumbers: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
}; // prettier-ignore
const monthNames = Object.keys(monthNumbers)
  .sort((first, second) => second.length - first.length)
  .join('|');

const currencyBySymbol: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };
const currencyByWord: Record<string, string> = {
  usd: 'USD', dollar: 'USD', dollars: 'USD',
  eur: 'EUR', euro: 'EUR', euros: 'EUR',
  gbp: 'GBP', pound: 'GBP', pounds: 'GBP',
}; // prettier-ignore

const extractorsInPriorityOrder: SpecificExtractor[] = [
  {
    kind: 'email',
    pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    normalize: (match) => match[0].toLowerCase(),
  },
  {
    kind: 'date',
    pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    normalize: (match) => isoDate(match[1], match[2], match[3]),
  },
  {
    kind: 'date',
    pattern: new RegExp(
      `\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      'gi',
    ),
    normalize: (match) => isoDate(match[3], monthNumberOf(match[1]), match[2]),
  },
  {
    kind: 'date',
    pattern: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?,?\\s+(\\d{4})\\b`,
      'gi',
    ),
    normalize: (match) => isoDate(match[3], monthNumberOf(match[2]), match[1]),
  },
  {
    kind: 'money',
    pattern: /([$€£])\s?(\d[\d,]*(?:\.\d{1,2})?)/g,
    normalize: (match) => moneyOf(currencyBySymbol[match[1] ?? ''], match[2]),
  },
  {
    kind: 'money',
    pattern: /\b(\d[\d,]*(?:\.\d{1,2})?)\s?(usd|eur|gbp|dollars?|euros?|pounds?)\b/gi,
    normalize: (match) => moneyOf(currencyByWord[(match[2] ?? '').toLowerCase()], match[1]),
  },
  {
    kind: 'percentage',
    pattern: /\b(\d+(?:\.\d+)?)\s?%/g,
    normalize: (match) => `${Number(match[1])}%`,
  },
  {
    kind: 'phone-number',
    pattern: /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    normalize: (match) => match[0].replace(/\D/g, '').slice(-10),
  },
  {
    kind: 'reference-number',
    pattern:
      /(?:#|\b(?:order|ord|invoice|inv|case|ref|reference)\b[\s#:.-]*)\s*([a-z]{0,4}-?\d{3,})\b/gi,
    normalize: (match) => (match[1] ?? '').replace(/\D/g, ''),
  },
  {
    kind: 'reference-number',
    pattern: /\b\d{4,}\b/g,
    normalize: (match) => match[0],
  },
];

export function extractSpecifics(text: string): ExtractedSpecific[] {
  let unreadText = text;
  const specifics: ExtractedSpecific[] = [];

  for (const extractor of extractorsInPriorityOrder) {
    for (const match of unreadText.matchAll(extractor.pattern)) {
      specifics.push({
        kind: extractor.kind,
        text: match[0].trim(),
        normalized: extractor.normalize(match),
      });
      const start = match.index;
      const end = start + match[0].length;
      unreadText = `${unreadText.slice(0, start)}${' '.repeat(end - start)}${unreadText.slice(end)}`;
    }
  }
  return specifics;
}

/** Two specifics state the same fact when their kind and normalised value match. */
export function specificKey(specific: ExtractedSpecific): string {
  return `${specific.kind}:${specific.normalized}`;
}

function isoDate(
  year: string | undefined,
  month: string | number | undefined,
  day: string | undefined,
): string {
  const twoDigits = (value: string | number | undefined) => String(value ?? '').padStart(2, '0');
  return `${year ?? ''}-${twoDigits(month)}-${twoDigits(day)}`;
}

function monthNumberOf(monthName: string | undefined): number | undefined {
  return monthNumbers[(monthName ?? '').toLowerCase().replace('.', '')];
}

function moneyOf(currency: string | undefined, amount: string | undefined): string {
  return `${currency ?? '?'} ${Number((amount ?? '').replace(/,/g, '')).toFixed(2)}`;
}
