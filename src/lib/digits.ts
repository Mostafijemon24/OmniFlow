const INDIC: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

/** Maps Bangla/Devanagari digits to ASCII so form values parse and validate. */
export function asciiDigits(value: string) {
  return value.replace(/[০-৯०-९]/g, (ch) => INDIC[ch] ?? ch);
}

export function parseRate(value: string) {
  const n = Number(asciiDigits(value).trim());
  return Number.isFinite(n) ? n : NaN;
}

const PRICE_ID = /^price_[A-Za-z0-9]+$/;

export function normalizeStripePriceId(value: string) {
  return asciiDigits(value).trim();
}

export function isStripePriceId(value: string) {
  return PRICE_ID.test(normalizeStripePriceId(value));
}
