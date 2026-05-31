/**
 * Parse a voice transcript into a valid darts turn score (0–180).
 *
 * Handles:
 *  - Raw digits:           "57" → 57
 *  - Written-out numbers:  "fifty seven" → 57
 *  - Darts shorthand:      "ton forty" / "one forty" → 140
 *  - Embedded digits:      "score 57" → 57
 *
 * Returns null if no valid score (0–180) can be parsed.
 */

const ONES: Record<string, number> = {
  zero: 0, nought: 0, oh: 0, o: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function parseWordNumber(s: string): number | null {
  const trimmed = s.trim();
  if (ONES[trimmed] !== undefined) return ONES[trimmed];
  if (TENS[trimmed] !== undefined) return TENS[trimmed];

  // "twenty one", "forty five", etc.
  const parts = trimmed.split(' ');
  if (parts.length === 2) {
    const tens = TENS[parts[0]];
    const ones = ONES[parts[1]];
    if (tens !== undefined && ones !== undefined && ones < 20) return tens + ones;
  }
  return null;
}

export function parseVoiceScore(transcript: string): number | null {
  // Normalise: lowercase, strip punctuation
  const s = transcript
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Pure digit string — most common (Safari/Chrome return "57", "140", etc.)
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 0 && n <= 180 ? n : null;
  }

  // 2. Digits embedded in speech, e.g. "score 57" or "that was 140"
  const embeddedMatch = s.match(/\b(\d{1,3})\b/);
  if (embeddedMatch) {
    const n = parseInt(embeddedMatch[1], 10);
    if (n >= 0 && n <= 180) return n;
  }

  // 3. "ton [and] [X]" / "hundred [and] [X]"  e.g. "ton forty" = 140, "ton" = 100
  const tonMatch = s.match(/^(?:one )?(?:hundred|ton)(?:(?: and)? (.+))?$/);
  if (tonMatch) {
    if (!tonMatch[1]) return 100;
    const rest = parseWordNumber(tonMatch[1]);
    if (rest !== null) return Math.min(180, 100 + rest);
  }

  // 4. "one eighty" / "one sixty" / "one forty" etc. → 100 + tens (only when tens 20–80)
  const oneHundredMatch = s.match(/^one (\w+(?: \w+)?)$/);
  if (oneHundredMatch) {
    const rest = TENS[oneHundredMatch[1]];
    if (rest !== undefined) return 100 + rest;  // "one eighty" = 180, etc.
  }

  // 5. Plain word number 0–99
  return parseWordNumber(s);
}
