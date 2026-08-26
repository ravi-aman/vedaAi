/**
 * Generic question numbering normalization — no subject hardcoding.
 * Supports: Q1, Q1., Q1), Question 1, 1., 1), 1(a), 1. (a), (a), (i), (ii)
 */
export interface ParsedNumber {
  raw: string;
  normalized: string;
  depth: number;
  partType: "SECTION" | "QUESTION" | "PART" | "SUBPART";
  parent?: string;
}

const ROMAN = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

function isRoman(s: string): boolean {
  return ROMAN.test(s) && s.length > 0;
}

// Normalize helpers
export function normalizeNumber(raw: string): ParsedNumber {
  const trimmed = raw.trim();
  // Keep raw as is, normalized is cleaned
  // Remove leading Q / Question / No etc generically
  let s = trimmed
    .replace(/^(?:Q(?:uestion)?|No\.?|Problem)\s*\.?\s*/i, "")
    .trim();

  // Replace unicode variants? Keep simple
  // Collapse spaces
  s = s.replace(/\s+/g, "");
  // Remove trailing dots/parens for base
  // We want to preserve structure like 11(a) or 12(a)(i) or 1.2?
  // Generic: detect numeric base + optional (a) + optional (i)
  // Examples: "1", "1.", "1)", "(a)", "1(a)", "1(a)(i)", "11(b)", "1(a)i" -> normalize

  // If input like "Q 1l (a)" where OCR misreads 11 as 1l, we map 1l→11 generically? No magic; preserve but record normalization
  // For now, simple: replace `l` that looks like 1 when between digits? Keep raw vs normalized diff captured
  // Example: Q 1l (a) raw preserved, normalized attempt: replace standalone l with 1?
  const rawForEvidence = trimmed;
  let normalized = s;

  // Fix common OCR l -> 1 when pattern like "1l" or "l" alone before "("
  // Generic: if normalized matches ^1l(\(|$), replace 1l→11
  normalized = normalized.replace(/^1l(\b|\(|\.)/i, "11$1");
  // Also standalone "l" before "(a)" → "1"
  normalized = normalized.replace(/^l(\()/i, "1$1");

  // Remove trailing . or ) after number alone
  normalized = normalized.replace(/^(\d+)[\.\)]$/, "$1");
  // "(a)" stays "(a)", "a." → "(a)"
  if (/^[a-z]\.$/i.test(normalized)) {
    normalized = `(${normalized[0].toLowerCase()})`;
  }
  if (/^[a-z]$/i.test(normalized) && !/^\d+$/.test(normalized)) {
    // single letter could be part like "a" → "(a)"
    // but ambiguous; keep as "(a)" if depth >0?
    // Leave as is for now, caller determines depth
  }

  // Determine depth/partType
  // Depth 0: numeric main (e.g., "11")
  // Depth 1: numeric + letter part (e.g., "11(a)")
  // Depth 2: + roman/number subpart (e.g., "11(a)(i)" or "11(a)i")
  let depth = 0;
  let partType: ParsedNumber["partType"] = "QUESTION";
  let parent: string | undefined;

  // Check patterns
  const mainMatch = normalized.match(/^(\d+)$/);
  const partMatch = normalized.match(/^(\d+)\(?([a-z])\)?$/i);
  const subPartMatch = normalized.match(/^(\d+)\(?([a-z])\)?\(?([ivx]+|[0-9]+)\)?$/i);
  const letterOnly = normalized.match(/^\(([a-z])\)$/i);
  const romanOnly = normalized.match(/^\(([ivx]+)\)$/i) || normalized.match(/^[ivx]+$/i);

  if (subPartMatch && subPartMatch[3]) {
    const base = subPartMatch[1];
    const letter = subPartMatch[2].toLowerCase();
    const sub = subPartMatch[3].toLowerCase();
    normalized = `${base}(${letter})(${sub})`;
    depth = 2;
    partType = "SUBPART";
    parent = `${base}(${letter})`;
  } else if (partMatch && partMatch[2]) {
    const base = partMatch[1];
    const letter = partMatch[2].toLowerCase();
    // distinguish if original was just "(a)" without number — treat as PART with no parent
    if (/^\d+\([a-z]\)$/i.test(`${base}(${letter})`) && !/^\([a-z]\)$/i.test(trimmed)) {
      normalized = `${base}(${letter})`;
      depth = 1;
      partType = "PART";
      parent = base;
    }
  } else if (letterOnly) {
    normalized = `(${letterOnly[1].toLowerCase()})`;
    depth = 1;
    partType = "PART";
    parent = undefined;
  } else if (romanOnly) {
    const r = romanOnly[1]?.toLowerCase ? romanOnly[1].toLowerCase() : normalized.toLowerCase();
    if (isRoman(r.replace(/[\(\)]/g, ""))) {
      normalized = `(${r.replace(/[\(\)]/g, "")})`;
      depth = 2;
      partType = "SUBPART";
    }
  } else if (mainMatch) {
    normalized = mainMatch[1];
    depth = 0;
    partType = "QUESTION";
  } else {
    // Try to parse like "1(a)" with dot
    const dotParen = normalized.match(/^(\d+)\.\s*\(?([a-z])\)?$/i);
    if (dotParen) {
      normalized = `${dotParen[1]}(${dotParen[2].toLowerCase()})`;
      depth = 1;
      partType = "PART";
      parent = dotParen[1];
    }
  }

  // fallback: keep normalized as cleaned s
  if (!normalized) normalized = s;

  return {
    raw: rawForEvidence,
    normalized,
    depth,
    partType,
    parent,
  };
}

export function compareNormalized(a: string, b: string): number {
  // sort by numeric base then letter then roman
  // Simple: split numeric
  const parse = (s: string) => {
    const m = s.match(/^(\d+)(?:\(([a-z])\))?(?:\(([ivx0-9]+)\))?/i);
    if (!m) return { n: 9999, l: "", sub: "" };
    return { n: parseInt(m[1] || "9999", 10), l: m[2] || "", sub: m[3] || "" };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.n !== pb.n) return pa.n - pb.n;
  if (pa.l !== pb.l) return pa.l.localeCompare(pb.l);
  return pa.sub.localeCompare(pb.sub);
}
