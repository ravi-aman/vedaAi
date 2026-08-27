import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import { normalizeNumber } from "./numbering";

export interface ParsedQuestion {
  rawNumber: string;
  normalizedNumber: string;
  text: string;
  rawText: string;
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  confidence: number;
  marks?: number;
  depth: number;
  partType: "SECTION" | "QUESTION" | "PART" | "SUBPART";
  parent?: string;
}

// Regex for question label at line start
// Supports: 1, 1., 1), Q1, Q.1, Q 1, Question 1, 11(a), 11 (a), 11(a)(i), 11 (a) (i), (a), (i), 11.b?
const QUESTION_LABEL_RE = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?|\([a-z]\)|\([ivx]+\)|\d+\s*[\.\)]\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?)\s*[\.\)\-:\s]*\s*/i;

const SECTION_RE = /^\s*(?:Section|Part)\s+[A-Z]\b/i;
const INSTRUCTIONS_RE = /^\s*(?:Instructions|Note|General Instructions)\s*:?/i;
const MARKS_RE = /(?:\((\d+)\s*marks?\)|\[(\d+)\s*marks?\]|\[(\d+)\]|(\d+)\s*marks?\b)/i;

function isSectionOrInstruction(text: string): boolean {
  return SECTION_RE.test(text) || INSTRUCTIONS_RE.test(text);
}

function extractMarks(text: string): { marks?: number; cleaned: string } {
  const m = text.match(MARKS_RE);
  if (!m) return { cleaned: text };
  const val = m[1] || m[2] || m[3] || m[4];
  const n = parseInt(val, 10);
  if (isNaN(n)) return { cleaned: text };
  // Remove marks portion from text
  const cleaned = text.replace(m[0], "").trim();
  return { marks: n, cleaned };
}

function detectLabel(lineText: string): { rawNumber: string; remaining: string } | null {
  const trimmed = lineText.trim();
  if (!trimmed) return null;
  if (isSectionOrInstruction(trimmed)) return null;
  // Skip if line is too short and not like a label (e.g., "Ans:")
  // Must detect label at start

  // Special handling: Try to match label pattern at start and ensure there's either remaining text or it's a standalone label like "1." on a line by itself (question text may be on next line)
  // We consider a line with just "Q1" as a label with empty remaining.

  // Attempt regex
  const m = trimmed.match(QUESTION_LABEL_RE);
  if (!m) return null;

  const fullMatch = m[0];
  const remaining = trimmed.slice(fullMatch.length).trim();

  // Validate that rawNumber part is not absurdly long (e.g., capturing whole sentence)
  // rawNumber should be relatively short (<15 chars) and contain digit or parentheses
  let rawNumber = fullMatch.trim().replace(/[\s]+/g, " ").trim();
  // Only strip trailing dot/colon/dash, not ) which may be part of (a)
  rawNumber = rawNumber.replace(/[\.:\-]\s*$/, "").trim();
  // For "1." -> "1", for "11(a)." -> "11(a)"
  if (/^\d+\.$/.test(rawNumber)) rawNumber = rawNumber.slice(0, -1);
  // Clean double spaces

  // Heuristic: rawNumber must contain at least one digit or be "(a)"/"(i)"
  if (!/\d/.test(rawNumber) && !/^\([a-z]\)$/i.test(rawNumber) && !/^\([ivx]+\)$/i.test(rawNumber)) {
    return null;
  }

  // Additional guard: if remaining is empty and rawNumber is just "1" with no text yet, still treat as label (multi-line question)
  // If remaining is something like "What is photosynthesis?" that's fine.
  // If remaining starts with lowercase and rawNumber was mis-detected (e.g., "1 apple"?), still treat as question — deterministic.

  // Ensure rawNumber length reasonable
  if (rawNumber.length > 20) return null;

  return { rawNumber, remaining };
}

function readingOrderSort(lines: OcrLine[]): OcrLine[] {
  // Simple multi-column detection: cluster by x
  // If lines have two distinct x clusters (left <0.45 and right >0.55), sort by column then y
  const xs = lines.map((l) => l.boundingBox.x).filter((x) => x !== undefined);
  if (xs.length === 0) return [...lines].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  // Determine if bimodal: count left vs right
  const leftCount = xs.filter((x) => x < 0.4).length;
  const rightCount = xs.filter((x) => x >= 0.5).length;
  const isTwoColumn = leftCount >= 2 && rightCount >= 2;

  if (isTwoColumn) {
    const left = lines.filter((l) => l.boundingBox.x < 0.5).sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
    const right = lines.filter((l) => l.boundingBox.x >= 0.5).sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
    // Heuristic: reading order is left column fully, then right column
    return [...left, ...right];
  }

  // Single column: sort by y, then x for same y band
  const sorted = [...lines];
  sorted.sort((a, b) => {
    const yDiff = a.boundingBox.y - b.boundingBox.y;
    if (Math.abs(yDiff) < 0.01) return a.boundingBox.x - b.boundingBox.x;
    return yDiff;
  });
  return sorted;
}

export function parseQuestionsFromTextract(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  options?: { minConfidence?: number }
): ParsedQuestion[] {
  const pageByNumber = new Map<number, DocumentPage>();
  for (const p of pages) pageByNumber.set(p.pageNumber, p);

  // Flatten lines in reading order per page, then pages in order
  const allLines: (OcrLine & { pageId: string })[] = [];
  for (const pg of [...ocr.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const pageId = pageByNumber.get(pg.pageNumber)?.id || `page-${pg.pageNumber}`;
    const sorted = readingOrderSort(pg.lines || []);
    for (const l of sorted) {
      allLines.push({ ...l, pageId } as any);
    }
  }

  const questions: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;
  let currentLines: (OcrLine & { pageId: string })[] = [];

  function finalizeCurrent() {
    if (!current) return;
    // Build text from currentLines remaining parts? Already have text
    // Merge bboxes per page
    const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
    const pageNumbers: number[] = [];
    const byPage = new Map<number, typeof currentLines>();
    for (const l of currentLines) {
      const pn = (l as any).pageNumber as number;
      if (!byPage.has(pn)) byPage.set(pn, []);
      byPage.get(pn)!.push(l);
    }
    for (const [pn, ls] of byPage) {
      pageNumbers.push(pn);
      // Union boxes per page? For highlight we want per-line boxes, but union is simpler for single highlight. Keep per-line boxes for exact highlights.
      const boxes = ls.map((l) => ({ ...l.boundingBox }));
      bboxesByPage.set(pn, boxes);
    }
    // Confidence avg
    const avgConf = currentLines.length ? currentLines.reduce((a, l) => a + (l.confidence || 0.9), 0) / currentLines.length : 0.85;
    current.confidence = avgConf;
    current.pageNumbers = [...pageNumbers].sort((a, b) => a - b);
    current.bboxesByPage = bboxesByPage;
    // Extract marks from text
    const { marks, cleaned } = extractMarks(current.text);
    if (marks) {
      current.marks = marks;
      current.text = cleaned;
      current.rawText = cleaned;
    }
    // Determine depth/partType via normalizeNumber
    const parsed = normalizeNumber(current.rawNumber);
    current.normalizedNumber = parsed.normalized;
    current.depth = parsed.depth;
    current.partType = parsed.partType;
    current.parent = parsed.parent;

    questions.push(current);
    current = null;
    currentLines = [];
  }

  for (const line of allLines) {
    const text = line.text.trim();
    if (!text) continue;

    const detected = detectLabel(text);
    if (detected) {
      // New question starts
      finalizeCurrent();
      const { rawNumber, remaining } = detected;
      current = {
        rawNumber,
        normalizedNumber: rawNumber, // will be normalized at finalize
        text: remaining,
        rawText: remaining,
        pageNumbers: [],
        bboxesByPage: new Map(),
        confidence: 0.85,
        depth: 0,
        partType: "QUESTION",
      };
      currentLines = [line];
      // If remaining is empty (label on its own line like "Q1"), keep question text empty and next line will be appended as continuation
      // But we need to not treat next line as new question if it doesn't have label
    } else {
      // Continuation of current question, or stray text before first question (skip instructions)
      if (current) {
        // Heuristic: if line looks like instructions and current text is empty, skip
        // Otherwise append
        const sep = current.text ? " " : "";
        current.text += sep + text;
        current.rawText += sep + text;
        currentLines.push(line);
      } else {
        // No current question yet, line is likely heading/instructions — skip
        continue;
      }
    }
  }
  finalizeCurrent();

  // Post-process: sort questions by normalized order? No, preserve printed order (already in allLines order which is reading order)
  // Assign orderIndex implicitly by array order
  // Filter out_questions with empty text that are likely false positives (e.g., page numbers)
  const filtered = questions.filter((q) => {
    // Keep if text length >3 or marks present or normalized looks like question
    if (q.text.trim().length > 3) return true;
    // If question is like "1" with no text, might be a heading that is actually a question with text on next page? Keep if next question exists? Simpler: keep if we have at least 1 line and not just a stray number at bottom (page number)
    // Page numbers are usually single digit at footer y>0.9 with small text — filter those
    const firstBox = q.bboxesByPage.get(q.pageNumbers[0]!)?.[0];
    const hasFooterPageNumber = q.pageNumbers.length === 1 && (firstBox?.y ?? 0) > 0.92 && /^\d+$/.test(q.rawNumber) && q.text.length < 5;
    if (hasFooterPageNumber) return false;
    return q.text.trim().length > 0;
  });

  return filtered;
}
