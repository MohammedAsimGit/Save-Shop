/**
 * Identity normalization for the product catalogue (Sprint 5).
 *
 * These helpers decide nothing on their own: they turn human text and
 * manufacturer identifiers into stable keys so matching can be deterministic.
 * Every rule here is intentionally conservative - when normalization cannot
 * tell two products apart, the matcher must report ambiguity rather than guess.
 */

/** Words that carry no identity and would otherwise inflate title similarity. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'with',
  'for',
  'of',
  'to',
  'in',
  'on',
  'by',
  'new',
  'latest',
  'original',
  'genuine',
  'official',
  'edition',
  'pack',
  'pcs',
  'pc',
  'inch',
  'inches',
  'inchs',
]);

/** Terms that describe an accessory, never the product itself. */
const ACCESSORY_TERMS = new Set([
  'case',
  'cover',
  'covers',
  'sleeve',
  'skin',
  'screen',
  'protector',
  'protectors',
  'guard',
  'cable',
  'cord',
  'charger',
  'adapter',
  'adaptor',
  'strap',
  'band',
  'mount',
  'holder',
  'stand',
  'bracket',
  'replacement',
  'spare',
  'bag',
  'pouch',
  'refill',
  'stylus',
  'tripod',
  'dock',
  'hub',
]);

/** Color spellings that mean the same variant. */
const COLOR_ALIASES: Readonly<Record<string, string>> = {
  gray: 'gray',
  grey: 'gray',
  silver: 'silver',
  spacegray: 'gray',
  spacegrey: 'gray',
  midnight: 'midnight',
  starlight: 'starlight',
  black: 'black',
  white: 'white',
  blue: 'blue',
  navy: 'navy',
  red: 'red',
  green: 'green',
  gold: 'gold',
  pink: 'pink',
  purple: 'purple',
  violet: 'violet',
  graphite: 'graphite',
  titanium: 'titanium',
  beige: 'beige',
  orange: 'orange',
  yellow: 'yellow',
};

/**
 * Lowercases, strips diacritics and punctuation, and collapses whitespace.
 * "Apple iPhone 15 (128 GB, Blue)" -> "apple iphone 15 128 gb blue".
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Alphanumeric-only key: the form used for brand and model comparisons. */
export function normalizeKey(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

/**
 * Tokens used for search and similarity. Stopwords are dropped, but tokens that
 * contain digits are always kept: they carry generation and capacity identity.
 */
export function tokenizeText(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 0 && (!STOPWORDS.has(token) || /\d/.test(token)));
}

/** GS1 mod-10 check digit over the digits before the last one. */
export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  // Weights alternate 3/1 from the rightmost payload digit.
  for (let index = payload.length - 1, position = 1; index >= 0; index -= 1, position += 1) {
    const digit = Number(payload[index] ?? '0');
    sum += position % 2 === 1 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Normalizes a GTIN/EAN/UPC to 14 digits and validates its check digit.
 * Returns `null` for anything that is not a real GTIN, so an invalid identifier
 * can never become a match key or be stored as if it were authoritative.
 */
export function normalizeGtin(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return null;

  const payload = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  if (gtinCheckDigit(payload) !== check) return null;

  return digits.padStart(14, '0');
}

export function isValidGtin(value: string): boolean {
  return normalizeGtin(value) !== null;
}

/** "128 GB" / "1TB" / "512gb" -> "128gb" / "1tb" / "512gb". */
export function normalizeCapacity(value: string): string | null {
  const match = /(\d+(?:\.\d+)?)\s*(tb|gb|mb)\b/i.exec(value) ?? /(\d+)\s?(tb|gb|mb)/i.exec(value);
  if (!match) return null;
  const amount = match[1] ?? '';
  const unit = (match[2] ?? '').toLowerCase();
  if (amount === '') return null;
  return `${amount}${unit}`;
}

/** Known color word from free text, normalized through the alias table. */
export function normalizeColor(value: string): string | null {
  const tokens = normalizeText(value).split(' ');
  for (const token of tokens) {
    const alias = COLOR_ALIASES[token];
    if (alias) return alias;
  }
  return null;
}

/** Removes capacity tokens so "128 gb" cannot look like a product generation. */
function stripCapacityTokens(text: string): string {
  return text.replace(/\b\d+(?:\.\d+)?\s?(?:tb|gb|mb)\b/gi, ' ');
}

/**
 * Generation/model tokens: any token that contains a digit and is not a capacity
 * ("xm5", "15", "s24", "watch6"). Two products whose generation tokens are
 * disjoint are different generations and must never be merged.
 */
export function extractGenerationTokens(value: string): string[] {
  const tokens = tokenizeText(stripCapacityTokens(value));
  return tokens.filter((token) => /\d/.test(token) && token.length <= 8);
}

/** True when the two titles describe different product generations. */
export function hasGenerationConflict(a: string, b: string): boolean {
  const left = extractGenerationTokens(a);
  const right = extractGenerationTokens(b);
  if (left.length === 0 || right.length === 0) return false;
  // Only a strict, non-overlapping generation token set is a conflict; a title
  // that adds "2024" next to "xm5" keeps the shared token and stays comparable.
  return !left.some((token) => right.includes(token));
}

/** True when the text describes an accessory rather than the product itself. */
export function detectAccessory(value: string): boolean {
  return tokenizeText(value).some((token) => ACCESSORY_TERMS.has(token));
}

/** Variant attributes that a title or record may carry. */
export interface VariantHints {
  readonly storageCapacity: string | null;
  readonly color: string | null;
}

export function extractVariantHints(text: string): VariantHints {
  return {
    storageCapacity: normalizeCapacity(text),
    color: normalizeColor(text),
  };
}

/**
 * Deterministic title similarity: Jaccard overlap of informative tokens.
 *
 * Documented as a similarity ratio, never a probability. It is the weakest signal
 * the matcher accepts, and only as a "possible match" that requires review.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(tokenizeText(a));
  const right = new Set(tokenizeText(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;

  return shared / new Set([...left, ...right]).size;
}

/** Normalizes a manufacturer part number for comparison (case/space insensitive). */
export function normalizeMpn(value: string): string {
  return normalizeKey(value).toUpperCase();
}
