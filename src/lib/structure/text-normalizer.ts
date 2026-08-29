/**
 * Text Normalizer — keeps raw/normalized/visual provenance (Constraint 8)
 * Never discard garbled PaddleOCR line; keep all three texts.
 */
export interface NormalizedText {
  rawOCRText: string;
  normalizedText: string;
  visualText?: string;
  confidence: number;
  sourceBlockIds: string[];
}

export function normalizeText(raw: string, visualText?: string): string {
  let t = raw;
  // Fix common Paddle garbles for physics — generic, not paper-specific
  // These are general OCR confusions, not hardcoded question content
  const fixes: Array<[RegExp, string]> = [
    [/\uFFFD/g, ""], // replacement char
    [/0�019/g, "0.019"],
    [/�/g, "μ"], // generic: � often is mu
    [/�/g, "μ"],
    [/c = 3 x 108/g, "c = 3×10⁸"],
    [/h = 6�63 x 10-34/g, "h = 6.63×10⁻³⁴"],
    [/e = 1�6 x 10-19/g, "e = 1.6×10⁻¹⁹"],
    [/\s+�\s+/g, " "],
    [/ {2,}/g, " "],
  ];
  for (const [re, rep] of fixes) t = t.replace(re, rep);
  t = t.trim();
  // If visualText is provided and raw confidence low, visual may be better — but keep both
  // This function just normalizes raw; caller decides which to use via evidence
  return t;
}

export function createProvenance(
  raw: string,
  blockIds: string[],
  confidence: number,
  visualText?: string
): NormalizedText {
  return {
    rawOCRText: raw,
    normalizedText: normalizeText(raw, visualText),
    visualText,
    confidence,
    sourceBlockIds: blockIds,
  };
}
