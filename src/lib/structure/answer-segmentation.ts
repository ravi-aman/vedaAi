import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import { normalizeNumber } from "./numbering";

export interface SegmentedAnswer {
  questionLabel?: string; // raw label as detected
  normalizedLabel?: string;
  text: string;
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  lines: OcrLine[];
  confidence: number;
  orderIndex: number;
}

const ANSWER_LABEL_RE = /^\s*(?:Q\.?\s*|Question\s*|Ans\.?\s*|Ans\s*|Answer\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?|\([a-z]\)|\([ivx]+\)|\d+\s*[\.\)])\s*[\.\)\-:\s]*\s*/i;

function detectAnswerLabel(text: string): { raw: string; normalized: string; remaining: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const m = trimmed.match(ANSWER_LABEL_RE);
  if (!m) return null;
  const full = m[0];
  const remaining = trimmed.slice(full.length).trim();
  const rawCandidate = full.trim().replace(/[\s]+/g, " ").replace(/[\.:\)\-]$/, "").trim();
  // Must contain digit or parentheses
  if (!/\d/.test(rawCandidate) && !/^\([a-z]\)$/i.test(rawCandidate) && !/^\([ivx]+\)$/i.test(rawCandidate)) return null;
  if (rawCandidate.length > 20) return null;
  // Normalize via normalizeNumber for matching
  const parsed = normalizeNumber(rawCandidate);
  return { raw: rawCandidate, normalized: parsed.normalized, remaining };
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
    current.confidence = currentLines.reduce((a, l) => a + (l.confidence || 0.85), 0) / currentLines.length;
    segments.push(current);
    current = null;
    currentLines = [];
  }

  for (const line of allLines) {
    const text = line.text.trim();
    if (!text) continue;

    const detected = detectAnswerLabel(text);
    if (detected) {
      // Start new answer segment
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
      currentLines = [line];
      // If remaining is empty (label on its own line), keep text empty and next lines will be appended
      // If remaining has text (e.g., "Q1 The answer is..."), that text is the start of answer
      if (detected.remaining) {
        current.text = detected.remaining;
      } else {
        current.text = "";
      }
    } else {
      // Continuation: check vertical gap to decide if new untagged block should start
      // For handwriting without explicit labels, we treat large gaps as separate untagged segments only if current exists and gap is large.
      // For now, if no current, start an untagged segment
      if (!current) {
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
        // Check gap: if vertical gap >0.03 and line starts with different x, still continuation but keep
        const last = currentLines[currentLines.length - 1];
        const gap = line.boundingBox.y - (last.boundingBox.y + last.boundingBox.height);
        // If gap is huge (>0.04) and line looks like new answer but without label (e.g., circled number not captured), we could split
        // For now, treat as continuation regardless — grouping will be refined by mapping
        current.text += " " + text;
        currentLines.push(line);
      }
    }
  }
  finalize();

  // Filter out empty segments (e.g., page numbers, headers)
  const filtered = segments.filter((s) => {
    // Keep if has label or text length >10 or multiple lines
    if (s.questionLabel) return s.text.trim().length > 0 || s.lines.length >= 1;
    // Untagged segments: keep if substantial text (>15 chars) — avoids page numbers
    return s.text.trim().length > 15;
  });

  // Reassign orderIndex after filtering
  return filtered.map((s, idx) => ({ ...s, orderIndex: idx }));
}
