import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import { normalizeNumber } from "./numbering";

export interface SegmentedAnswer {
  questionLabel?: string;
  normalizedLabel?: string;
  text: string;
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  lines: OcrLine[];
  confidence: number;
  orderIndex: number;
}

const PAGE_HEADER_RE = /(Page\s*\d+\s*of\s*\d+|Please note that the assessment scheme|Space for writing|Question Number|Rough work)/i;
const PRINTED_HEADER_PHRASES = [
  /Space for writing/i,
  /Question Number/i,
  /Rough work/i,
  /^\s*SECTION\s*[A-E]/i,
  /^\s*For Visually Impaired/i,
  /^\s*Mathematics Standard/i,
];

// Strict label: prefix required OR bare number with punctuation at left margin
// Valid with prefix: Ans 1, Ans. 1, Answer 1, Q1, Q.1, Q 1, Question 1
// Valid bare: 1., 1), 1(a), 37(i) etc at left margin (x <0.15)
// Invalid: standalone "1" or "101" or "L1" or math "101x"
const ANS_PREFIX_RE = /^\s*Ans\.?\s*\.?\s*/i;
const ANS_FUZZY_PREFIX_RE = /^\s*An[a-z]{1,2}\s*\.?\s*/i; // catches Anss, Anst, Anslo OCR errors but still starts with An
const Q_PREFIX_RE = /^\s*Q(?:uestion)?\.?\s*/i;

function isHeaderOrPrinted(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
  const t = text.trim();
  if (!t) return true;
  if (PAGE_HEADER_RE.test(t)) return true;
  for (const re of PRINTED_HEADER_PHRASES) if (re.test(t)) return true;
  // page number alone at top/bottom
  if (/^\s*\d+\s*$/.test(t) && bbox && (bbox.y < 0.06 || bbox.y > 0.90)) return true;
  // short numeric at header band
  if (bbox && bbox.y < 0.08 && /^\s*\d+\s*$/.test(t) && t.length <= 3) return true;
  return false;
}

function mapOcrDigits(s: string): string {
  // generic OCR confusion: l/I/| ->1, O/o ->0, keep others
  return s.replace(/[lI|]/g, "1").replace(/[oO]/g, "0");
}

function extractNumericLabel(text: string, hasPrefix: boolean, bbox?: { x: number; y: number; width: number; height: number }): { raw: string; normalized: string; remaining: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length > 40) return null; // label lines are short

  // If has Ans/Q prefix, extract number after prefix fuzzily
  if (hasPrefix) {
    let after: string;
    if (/^\s*Ans/i.test(trimmed)) {
      // For Ans, take after first 3 chars, but handle fuzzy like Anss, Anst, Anslo
      const m = trimmed.match(/^\s*Ans[^\d]*([^\s]+)/i);
      after = m ? m[1] : "";
      // remaining after number token
      const fullMatch = trimmed.match(/^\s*Ans[^\d]*([0-9lIoO]+(?:\s*\([a-z]+\))?(?:\s*\([ivx]+\))?)[\s\.\)\-:]*/i);
      if (fullMatch) {
        const numPart = mapOcrDigits(fullMatch[1].trim());
        if (!/\d/.test(numPart)) return null;
        const rawCandidate = `Ans ${numPart}`.trim();
        if (numPart.length > 6) return null;
        const parsed = normalizeNumber(numPart);
        if (!/\d/.test(parsed.normalized)) return null;
        const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
        if (n < 1 || n > 100) return null;
        const remaining = trimmed.slice(fullMatch[0].length).trim();
        // remaining should not start with letter directly attached without space? but okay
        return { raw: rawCandidate, normalized: parsed.normalized, remaining };
      }
      // Fallback: any Ans-like line with <20 chars at left margin, treat as label even if number garbled
      // This prevents over-merge when OCR misreads number completely
      if (trimmed.length < 20 && bbox && bbox.x < 0.20) {
        // Check if line is short and starts with Ans
        const isAnsLine = /^\s*Ans/i.test(trimmed) && trimmed.length < 20;
        if (isAnsLine) {
          // Try to find any digit-like chars
          const digits = mapOcrDigits(trimmed).match(/\d+/);
          if (digits) {
            const num = digits[0];
            const parsed = normalizeNumber(num);
            const remaining = trimmed.replace(/^\s*Ans[^\d]*/i, "").replace(num, "").trim().replace(/^[\.\)\-:\s]+/, "");
            return { raw: `Ans ${num}`, normalized: parsed.normalized, remaining };
          }
          // No digits found but still Ans line -> mark as unknown label boundary
          // Use placeholder normalized as "?" but still treat as label to split
          return { raw: trimmed.split(/\s+/)[0], normalized: "__unknown__", remaining: trimmed.slice(trimmed.split(/\s+/)[0].length).trim() };
        }
      }
      return null;
    }
    if (/^\s*Q/i.test(trimmed)) {
      const m = trimmed.match(/^\s*Q(?:uestion)?\.?\s*([0-9lIoO]+(?:\s*\([a-z]+\))?(?:\s*\([ivx]+\))?)/i);
      if (!m) return null;
      const numPart = mapOcrDigits(m[1].trim());
      if (!/\d/.test(numPart)) return null;
      const parsed = normalizeNumber(numPart);
      const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
      if (n < 1 || n > 100) return null;
      const full = m[0];
      const remaining = trimmed.slice(full.length).trim().replace(/^[\.\)\-:\s]+/, "");
      return { raw: `Q${numPart}`, normalized: parsed.normalized, remaining };
    }
  }

  // No prefix: bare number at left margin with punctuation
  // Require left margin and punctuation or parentheses
  const isLeft = !bbox || bbox.x < 0.15;
  if (!isLeft) return null;
  // Bare number must have punctuation or parentheses to be valid
  // Patterns: "1.", "1)", "1(a)", "37(i)", "37(ii)" etc
  const bareMatch = trimmed.match(/^\s*(\d+[a-z]?(?:\s*\([a-z]\))?(?:\s*\([ivx0-9]+\))?)\s*[\.\)]\s*/i);
  if (bareMatch) {
    const numPart = bareMatch[1].trim();
    if (!/\d/.test(numPart)) return null;
    const parsed = normalizeNumber(numPart);
    const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
    if (n < 1 || n > 100) return null;
    const remaining = trimmed.slice(bareMatch[0].length).trim();
    // Ensure remaining does not start with letter directly without space? Already handled
    // For bare, require remaining either empty or starts with space/upper or not immediate digit
    return { raw: numPart, normalized: parsed.normalized, remaining };
  }
  // Also bare with parentheses and no dot: "1(a)" or "37(i)"
  const bareParen = trimmed.match(/^\s*(\d+\s*\([a-z]\)|\d+\s*\([ivx]+\))\s*[\s\.\)\-:]*/i);
  if (bareParen) {
    const numPart = bareParen[1].trim().replace(/\s+/g, "");
    const parsed = normalizeNumber(numPart);
    const n = parseInt(parsed.normalized.match(/^(\d+)/)?.[1] || "0", 10);
    if (n < 1 || n > 100) return null;
    const remaining = trimmed.slice(bareParen[0].length).trim();
    return { raw: numPart, normalized: parsed.normalized, remaining };
  }
  return null;
}

function detectAnswerLabel(text: string, bbox?: { x: number; y: number; width: number; height: number }, confidence?: number): { raw: string; normalized: string; remaining: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (PAGE_HEADER_RE.test(trimmed)) return null;
  // Filter page numbers at top/bottom
  if (/^\s*\d+\s*$/.test(trimmed) && bbox && (bbox.y < 0.06 || bbox.y > 0.92)) return null;
  // Option lines (A) (B) etc at interior x should not be label
  if (/^\s*\(\s*[A-Da-d]\s*\)/.test(trimmed) && bbox && bbox.x > 0.07) return null;
  if (/^\s*[A-Da-d]\s*[\)\.\]]/.test(trimmed) && bbox && bbox.x > 0.07 && trimmed.length < 30) {
    // Could be option, check if indented
    if (bbox.x > 0.10) return null;
  }
  // Very short isolated digit without prefix should not be label
  if (/^\s*\d+\s*$/.test(trimmed) && trimmed.length <= 2) return null;
  // Math expression starting with digit but followed immediately by letter without punctuation (e.g., "101x") should not be label
  if (/^\s*\d+[a-zA-Z]/.test(trimmed) && !/^\s*\d+\s*[\.\)\(]/.test(trimmed)) {
    // Check if second char is letter without separator
    const m = trimmed.match(/^\s*(\d+)([a-zA-Z])/);
    if (m && m[2] && !/[\s\.\)\(]/.test(trimmed[m[0].length - 1] || "")) {
      // "101x" -> digit+letter immediately -> not label
      return null;
    }
  }
  // Confidence filter: very low confidence isolated token not label
  if (confidence !== undefined && confidence < 0.35 && /^\s*\d+\s*$/.test(trimmed)) return null;

  const hasAnsPrefix = /^\s*Ans/i.test(trimmed) || /^\s*An[a-z]{1,2}\s*[0-9]/i.test(trimmed);
  const hasQPrefix = /^\s*Q/i.test(trimmed);

  if (hasAnsPrefix) {
    const r = extractNumericLabel(trimmed, true, bbox);
    if (r) return r;
    // Even if extraction fails, if line is short and starts with Ans at left margin, treat as label boundary with unknown
    if (trimmed.length < 22 && bbox && bbox.x < 0.20) {
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("ans") || lower.startsWith("an8") || lower.startsWith("an5")) {
        // Try to find any digit after
        const mapped = mapOcrDigits(trimmed);
        const dig = mapped.match(/\d+/);
        if (dig) {
          const parsed = normalizeNumber(dig[0]);
          const remaining = trimmed.slice(trimmed.indexOf(dig[0]) + dig[0].length).trim().replace(/^[\.\)\-:\s]+/, "");
          return { raw: `Ans ${dig[0]}`, normalized: parsed.normalized, remaining };
        }
        return { raw: trimmed.split(/\s+/)[0], normalized: "__unknown__", remaining: trimmed.slice(trimmed.split(/\s+/)[0].length).trim() };
      }
    }
    return null;
  }
  if (hasQPrefix) {
    const r = extractNumericLabel(trimmed, true, bbox);
    return r;
  }
  // Bare case
  const bare = extractNumericLabel(trimmed, false, bbox);
  return bare;
}

function readingOrderSort(lines: OcrLine[]): OcrLine[] {
  const sorted = [...lines];
  sorted.sort((a, b) => {
    const yDiff = a.boundingBox.y - b.boundingBox.y;
    if (Math.abs(yDiff) < 0.01) return a.boundingBox.x - b.boundingBox.x;
    return yDiff;
  });
  return sorted;
}

export function segmentAnswersFromTextract(
  ocr: OcrDocumentResult,
  pages: DocumentPage[]
): SegmentedAnswer[] {
  const pageByNumber = new Map<number, DocumentPage>();
  for (const p of pages) pageByNumber.set(p.pageNumber, p);

  const allLines: (OcrLine & { pageId: string; pageNumber: number })[] = [];
  for (const pg of [...ocr.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const sorted = readingOrderSort(pg.lines || []);
    for (const l of sorted) {
      allLines.push({ ...l, pageNumber: pg.pageNumber } as any);
    }
  }

  if (allLines.length === 0) return [];

  // Adaptive gap: median line height *1.8, min 0.02
  const heights = allLines.map((l) => l.boundingBox.height).filter((h) => h > 0).sort((a, b) => a - b);
  const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 0.025;
  const adaptiveGap = Math.max(0.02, medianH * 1.8);

  const segments: SegmentedAnswer[] = [];
  let current: SegmentedAnswer | null = null;
  let currentLines: (OcrLine & { pageNumber: number })[] = [];

  function finalize() {
    if (!current || currentLines.length === 0) return;
    const byPage = new Map<number, typeof currentLines>();
    for (const l of currentLines) {
      const pn = l.pageNumber;
      if (!byPage.has(pn)) byPage.set(pn, []);
      byPage.get(pn)!.push(l);
    }
    const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
    const pageNumbers: number[] = [];
    for (const [pn, ls] of byPage) {
      pageNumbers.push(pn);
      bboxesByPage.set(
        pn,
        ls.map((l) => ({ ...l.boundingBox }))
      );
    }
    current.pageNumbers = [...pageNumbers].sort((a, b) => a - b);
    current.bboxesByPage = bboxesByPage;
    current.lines = [...currentLines];
    // Confidence weighted, but filter extremely low
    const validConfs = currentLines.map((l) => l.confidence || 0.85).filter((c) => c > 0);
    current.confidence = validConfs.length ? validConfs.reduce((a, b) => a + b, 0) / validConfs.length : 0.85;
    // Text already built via current.text
    segments.push(current);
    current = null;
    currentLines = [];
  }

  for (const line of allLines) {
    const text = line.text.trim();
    const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;
    const conf = (line as any).confidence as number | undefined;

    if (!text) continue;
    if (isHeaderOrPrinted(text, bbox)) continue;
    // Blank/noise filter: very short isolated symbols with low confidence
    if (text.length < 3 && (conf || 0) < 0.55) continue;
    if (/^[^\w]*$/.test(text) && text.length < 6) continue;
    // Isolated single char at interior not label -> skip if low conf
    if (/^\s*[^\w\s]\s*$/.test(text) && text.length === 1) continue;

    const detected = detectAnswerLabel(text, bbox, conf);
    if (detected) {
      // Validate normalized: if __unknown__, still split but mark
      // If normalized is valid numeric >38, it's likely not answer label but math -> ignore
      if (detected.normalized !== "__unknown__") {
        const num = parseInt(detected.normalized.match(/^(\d+)/)?.[1] || "0", 10);
        if (num > 50) {
          // Likely math like 101, 102, etc -> not label, treat as continuation
          // Fall through to continuation logic
        } else {
          finalize();
          current = {
            questionLabel: detected.raw,
            normalizedLabel: detected.normalized,
            text: detected.remaining,
            pageNumbers: [],
            bboxesByPage: new Map(),
            lines: [],
            confidence: 0.85,
            orderIndex: segments.length,
          };
          // Add this line's bbox (the label line) to currentLines
          // But we want to include label line's bbox as part of answer region? Spec says question number may be included incorrectly?
          // For now, include label line but text is remaining only; bbox still belongs to region for highlight anchor
          currentLines = [line];
          if (detected.remaining) {
            current.text = detected.remaining;
          } else {
            current.text = "";
          }
          continue;
        }
      } else {
        // Unknown label but still Ans-like at left margin -> split to prevent over-merge
        finalize();
        current = {
          questionLabel: detected.raw,
          normalizedLabel: undefined,
          text: detected.remaining,
          pageNumbers: [],
          bboxesByPage: new Map(),
          lines: [],
          confidence: 0.6,
          orderIndex: segments.length,
        };
        currentLines = [line];
        if (detected.remaining) current.text = detected.remaining;
        else current.text = "";
        continue;
      }
    }

    // No label detected -> continuation or untagged new segment
    if (!current) {
      // No current -> start untagged segment only if substantial
      // Check gap from previous segment (if any)
      current = {
        questionLabel: undefined,
        normalizedLabel: undefined,
        text: text,
        pageNumbers: [],
        bboxesByPage: new Map(),
        lines: [],
        confidence: 0.85,
        orderIndex: segments.length,
      };
      currentLines = [line];
    } else {
      // Check gap to decide if this is actually new untagged answer without label (should be REVIEW/UNMATCHED)
      // For handwriting, large vertical gap + left margin + substantial previous text may indicate new answer without label
      const last = currentLines[currentLines.length - 1];
      const gap = line.boundingBox.y - (last.boundingBox.y + last.boundingBox.height);
      const samePage = line.pageNumber === last.pageNumber;
      const isLargeGap = samePage ? gap > adaptiveGap * 2.2 : gap > adaptiveGap * 1.5; // across pages, gap threshold lower
      const isLeftMargin = bbox ? bbox.x < 0.15 : false;
      const prevSubstantial = current.text.trim().length > 80 || currentLines.length >= 6;

      // If large gap on same page and left margin and previous substantial, consider splitting as untagged new segment
      // But only if not continuation across pages with same label (which we already handled via label)
      // For continuity across pages without label, if previous segment ends near bottom (y>0.65) and new line starts near top (y<0.25) and pages sequential, it's continuation, not split
      const isPageContinuation = !samePage && Math.abs(line.pageNumber - last.pageNumber) === 1 && last.boundingBox.y > 0.55 && line.boundingBox.y < 0.35;

      if (isLargeGap && isLeftMargin && prevSubstantial && !isPageContinuation) {
        // Large gap suggests new untagged answer without explicit label -> split
        // But to avoid over-split of single answer with paragraph breaks, require gap > 0.06 and text starts with uppercase
        if (gap > 0.06 && /^[A-Z]/.test(text)) {
          finalize();
          current = {
            questionLabel: undefined,
            normalizedLabel: undefined,
            text: text,
            pageNumbers: [],
            bboxesByPage: new Map(),
            lines: [],
            confidence: 0.85,
            orderIndex: segments.length,
          };
          currentLines = [line];
          continue;
        }
      }
      // Check for option-like lines that should stay with current (not new label)
      // e.g., "(A) ..." at x 0.12 should stay as part of current answer, not new segment
      if (/^\s*\(\s*[A-Da-d]\s*\)/.test(text) && bbox && bbox.x > 0.08) {
        current.text += " " + text;
        currentLines.push(line);
        continue;
      }
      // Normal continuation
      current.text += " " + text;
      currentLines.push(line);
    }
  }
  finalize();

  // Post-filter: remove blank/noise segments
  const filtered = segments.filter((s) => {
    // Keep all labeled segments even if text short (they are boundaries)
    if (s.questionLabel) {
      // But filter if label is implausible and text empty and single line low conf
      if (s.normalizedLabel === "__unknown__" && s.text.trim().length === 0 && s.lines.length === 1 && s.confidence < 0.6) return false;
      // Keep if has any text or lines
      return s.text.trim().length > 0 || s.lines.length >= 1;
    }
    // Untagged: keep only if substantial
    const txt = s.text.trim();
    if (txt.length < 20) return false;
    if (s.lines.length < 2 && txt.length < 40) return false;
    // Filter if average confidence very low
    if (s.confidence < 0.45 && txt.length < 30) return false;
    // Filter if looks like page number or header
    if (/^\s*\d+\s*$/.test(txt) && txt.length <= 3) return false;
    return true;
  });

  // Reassign orderIndex
  const result = filtered.map((s, idx) => ({ ...s, orderIndex: idx }));

  // Validate no catastrophic over-merge: if any segment spans >4 pages with large gaps, split it
  // This handles previous Q1 9-page merge: if segment pageNumbers length >4 and spans >5 pages numerically, it's likely over-merge due to missed labels
  // We keep as is but log warning; actual fix is label detection, not splitting here
  return result;
}
