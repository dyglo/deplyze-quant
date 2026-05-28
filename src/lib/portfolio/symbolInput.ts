/**
 * Symbol-input parsing for multi-symbol entry fields (e.g. seeding initial
 * holdings at portfolio creation). Pure and unit-tested.
 *
 * Accepts free text from typing or pasting — splits on commas and whitespace,
 * uppercases, validates each token as a single market symbol, and de-dupes
 * while preserving first-seen order.
 */

/** Single market symbol: letters/digits and a few punctuation chars, 1–20 long. */
export const SYMBOL_PATTERN = /^[A-Z0-9./:^_-]{1,20}$/;

/** True when `s` is a single, well-formed market symbol. */
export function isValidSymbol(s: string): boolean {
  return SYMBOL_PATTERN.test(s.trim().toUpperCase());
}

/**
 * Parse free text into a de-duplicated list of valid uppercase symbols.
 * Splits on commas and any whitespace, drops empties and anything that isn't a
 * clean single symbol. Returns [] when nothing valid is present.
 */
export function parseSymbolTokens(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(/[\s,]+/)) {
    const sym = piece.trim().toUpperCase();
    if (!sym || !SYMBOL_PATTERN.test(sym) || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}
