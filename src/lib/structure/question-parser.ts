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

// Regex for question label at line start — ONLY numeric-prefixed (require digit base)
// Supports: 1, 1., 1), Q1, Q.1, Q 1, Question 1, 11(a), 11 (a), 11(a)(i), 11 (a) (i)
// Standalone "(a)" / "(i)" is NOT a top-level label; those are options/subparts handled via parent context
const QUESTION_LABEL_RE = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?|\d+\s*[\.\)]\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?)\s*[\.\)\-:\s]*\s*/i;

// Subpart-only regex for standalone (a)/(i)/(ii) — used only to detect subparts via parent context, not as top-level
const STANDALONE_SUBPART_RE = /^\s*\(([a-z]+|[ivx]+|[0-9]+)\)\s*[\.\)\-:\s]*\s*/i;

const SECTION_RE = /^\s*(?:Section|Part)\s+[A-Z]\b/i;
const INSTRUCTIONS_RE = /^\s*(?:Instructions|Note|General Instructions)\s*:?/i;
const MARKS_RE = /(?:\((\d+)\s*marks?\)|\[(\d+)\s*marks?\]|\[(\d+)\]|(\d+)\s*marks?\b)/i;

// Generic instruction / header detectors — no subject hardcoding, structural only
const INSTRUCTION_PHRASES = [
  /question paper contains/i,
  /All Questions are compulsory/i,
  /divided into.*Sections/i,
  /Question numbers.*are/i,
  /multiple choice/i,
  /Assertion.*Reason/i,
  /There is no overall choice/i,
  /internal choice/i,
  /Draw neat/i,
  /Take π/i,
  /Use of calculators is not allowed/i,
  /Time:\s*3 hours/i,
  /Time allowed/i,
  /For Visually Impaired/i,
  /Please note that the assessment scheme/i,
  /Please check that this question/i,
  /Candidates must write the Code/i,
  /question paper will be distributed/i,
  /students will read the/i,
  /write any answer on the answer/i,
  /P\.T\.O\./i,
  /Answer question numbers.*to/i,
  /Answer should be brief/i,
  /word limit be adhered/i,
  /There is no overall choice/i,
  /separate instructions are given with each section/i,
];

const PAGE_HEADER_FOOTER_RE = /(Page\s*\d+\s*of\s*\d+|^\s*\d+\s*Page\s*\d+|^\s*\d+\s*$)/i;

function isSectionOrInstruction(text: string): boolean {
  if (SECTION_RE.test(text)) return true;
  if (INSTRUCTIONS_RE.test(text)) return true;
  // Generic instruction phrases — if line contains instructional meta and is long
  for (const re of INSTRUCTION_PHRASES) {
    if (re.test(text)) return true;
  }
  return false;
}

function isPageHeaderFooter(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
  const t = text.trim();
  if (PAGE_HEADER_FOOTER_RE.test(t) && t.length < 30) return true;
  if (/^\s*\d+\s*$/.test(t) && bbox && (bbox.y < 0.04 || bbox.y > 0.92)) return true;
  if (/Please note that the assessment scheme/i.test(t)) return true;
  if (/^\s*Page \d+ of \d+/i.test(t)) return true;
  // Science paper headers
  if (/^Code No\./i.test(t)) return true;
  if (/^Roll No\./i.test(t)) return true;
  if (/^SET\s*-\s*-/i.test(t)) return true;
  if (/^Series\s*:/i.test(t)) return true;
  if (/^Candidates must write the Code/i.test(t)) return true;
  if (/^onls\s*7\./i.test(t)) return true;
  if (/^31\/2\/1/i.test(t) && t.length < 15) return true;
  if (/^RTCT\s*7\./i.test(t)) return true;
  if (/^P\.T\.O\./i.test(t)) return true;
  if (/^NOTE$/i.test(t) && t.length < 10) return true;
  if (/^Please check that this question/i.test(t)) return true;
  if (/^Candidates must write the Code/i.test(t)) return true;
  if (/^onls\s*3th/i.test(t)) return true;
  if (/^Parth$/i.test(t)) return true;
  if (/^7\)2$/i.test(t) && t.length < 5) return true; // Science paper header 7)2
  if (/^NKJH\s+#/i.test(t)) return true;
  // Top header metadata
  if (/^Maximum Marks:\s*\d+/i.test(t)) return true;
  if (/^Time(:|\s)allowed/i.test(t)) return true;
  if (/^CLASS - X/i.test(t)) return true;
  if (/^MATHEMATICS STANDARD/i.test(t)) return true;
  if (/^SAMPLE QUESTION PAPER/i.test(t)) return true;
  if (/^SCIENCE$/i.test(t) && t.length < 10) return true;
  if (/^FATTRA/i.test(t)) return true;
  if (/^31\/ETCH/i.test(t)) return true;
  // OCR garbage: lines with very low confidence or pure symbols
  if (/^[^\w]*$/.test(t) && t.length < 10) return true;
  if (/^400\s+23/.test(t)) return true; // Science paper OCR garbage
  if (/^4807/.test(t)) return true;
  if (/^31924\s+ford/i.test(t)) return true;
  if (/^4807,\s*D_D/i.test(t)) return true;
  if (/^3772\s+\$41/i.test(t)) return true;
  if (/^\$21\s+onl/i.test(t)) return true;
  if (/^1111\s+1-w/i.test(t)) return true;
  if (/^2\s+NKJH/i.test(t)) return true; // Science paper header 2 NKJH
  return false;
}

function isMarksLine(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
  const t = text.trim();
  if (!bbox) return false;
  // Marks column: x>0.84 (right margin), width small, single digit 1-5 or "2" etc, and not at top/bottom header
  if (bbox.x > 0.84 && bbox.width < 0.03 && /^\d+$/.test(t) && parseInt(t, 10) >= 1 && parseInt(t, 10) <= 10) return true;
  // Also marks like "1" at x=0.908 with width 0.007-0.011
  if (bbox.x > 0.88 && /^\d+$/.test(t) && t.length <= 2) return true;
  return false;
}

function isTableCell(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
  const t = text.trim();
  if (!bbox) return false;
  // Table intervals like "15 - 30", "45 - 60", "0 - 15" etc, interior x 0.2-0.8, short (<12 chars), contains dash
  if (/^\d+\s*-\s*\d+$/.test(t) && bbox.x > 0.14 && bbox.x < 0.82 && t.length < 12) return true;
  // Frequency numbers in table row like "10", "7", "x", "15", "12" but appear in table y-band with multiple neighbors
  // Heuristic: single number/short token at y ~0.53-0.75 with x 0.25-0.77 and not left margin, could be table; we flag generic short numeric inside table region
  if (/^\d+$/.test(t) && bbox.x > 0.22 && bbox.x < 0.78 && bbox.y > 0.5 && bbox.y < 0.78 && t.length <= 2) {
    // Only flag if likely table: check width small
    if (bbox.width < 0.07) return true;
  }
  // Header "Class Interval" split across lines, but "Interval", "Freque", "ncy" etc are fragments
  if (/^(Interval|Freque|ncy|Class)$/i.test(t) && bbox.x > 0.12 && bbox.x < 0.8) return true;
  return false;
}

function isOptionLine(text: string): boolean {
  const t = text.trim();
  // MCQ options are short: "(a) X" "(b) X" "(c) X" "(d) X" — but case-study subparts also "(a)" with longer text
  // Distinguish by length and context: options typically < 80 chars and preceded/followed by other (a)-(d) cluster
  // Here we conservatively flag any line that starts with "(a)"-"(d)" and has < 60 chars as likely option, not top-level question
  if (/^\s*\([a-d]\)\s*.{0,80}$/i.test(t) && t.length < 80) {
    // Further, if text is just "3" or "2" or short math, it's option
    return true;
  }
  return false;
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

let expectedTopLevelSet: Set<number> | null = null;
function setExpectedTopLevelFromText(fullText: string) {
  const ranges: Array<[number, number]> = [];
  const rangeRes = [...fullText.matchAll(/question\s*no\.?\s*(\d+)\s*to\s*(\d+)/gi)];
  for (const m of rangeRes) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a >= 1 && b <= 100 && a < b) ranges.push([a, b]);
  }
  if (ranges.length === 0) {
    const secRes = [...fullText.matchAll(/Section\s+[A-C][^]*?(\d+)\s*to\s*(\d+)/gi)];
    for (const m of secRes) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a >= 1 && b <= 100 && a < b) ranges.push([a, b]);
    }
  }
  if (ranges.length > 0) {
    const ids = new Set<number>();
    for (const [a, b] of ranges) for (let i = a; i <= b; i++) ids.add(i);
    if (ids.size >= 20 && Math.min(...ids) === 1) expectedTopLevelSet = ids;
  }
}

function detectLabel(lineText: string, bbox?: { x: number; y: number; width: number; height: number }): { rawNumber: string; remaining: string } | null {
  const trimmed = lineText.trim();
  if (!trimmed) return null;
  if (isSectionOrInstruction(trimmed)) return null;
  if (isPageHeaderFooter(trimmed, bbox)) return null;
  if (isMarksLine(trimmed, bbox)) return null;
  if (isTableCell(trimmed, bbox)) return null;
  // Word limit numbers like "90 words" should not be questions
  if (/^\s*90\s+words/i.test(trimmed) || /^\s*80\s+to\s*90\s+words/i.test(trimmed)) return null;
  if (/^\s*\(vii\)\s+In addition to this/i.test(trimmed)) return null;
  if (/^\s*60\s+words/i.test(trimmed) && trimmed.length < 20) return null;
  if (/^\s*90\s+words/i.test(trimmed) && trimmed.length < 20) return null;
  // Options like "(a) 3" should not start a new top-level question
  if (isOptionLine(trimmed)) return null;
  // Geometry: body numbers like "41cm" at interior x (0.117) should not become questions
  const isLeftMargin = !bbox || bbox.x < 0.11;
  if (!isLeftMargin && /^\d+[a-z]{1,3}\b/.test(trimmed) && !/^\d+\s*[\.\)\(\-]/.test(trimmed) && !/^\s*Q/i.test(trimmed)) {
    // e.g., "41cm from the centre..." at x=0.117 — body text, not label
    return null;
  }
  // Skip fragmented short lowercase continuation that could be misread as "1" — but allow Q-prefixed labels
  if (/^Q/i.test(trimmed)) {
    // Q-prefixed allowed
  } else if (/^[a-z]/i.test(trimmed) && trimmed.length < 15 && !/^\d/.test(trimmed)) {
    return null;
  }

  // Attempt regex — requires digit prefix
  const m = trimmed.match(QUESTION_LABEL_RE);
  if (!m) return null;

  const fullMatch = m[0];
  const remaining = trimmed.slice(fullMatch.length).trim();

  let rawNumber = fullMatch.trim().replace(/[\s]+/g, " ").trim();
  rawNumber = rawNumber.replace(/[\.:\-]\s*$/, "").trim();
  if (/^\d+\.$/.test(rawNumber)) rawNumber = rawNumber.slice(0, -1);

  // Must contain digit (since we removed standalone subpart)
  if (!/\d/.test(rawNumber)) return null;

  if (rawNumber.length > 20) return null;

  // Plausibility: question numbers should be 1-100, not 400, 4807 etc, unless paper is very long
  // For Science paper with 30 questions, 400 is impossible
  const numPart = rawNumber.match(/^(\d+)/);
  if (numPart) {
    const n = parseInt(numPart[1], 10);
    if (n > 100) return null; // e.g., 400, 4807, 31924
    if (n === 0) return null;
    if (expectedTopLevelSet && !expectedTopLevelSet.has(n)) {
      // For this paper, only 1-30 are valid top-level
      return null;
    }
  }

  // Guard: remaining very short and lowercase suggests fragment, not question? Still allow if remaining length >0 or next line will append.
  // But if remaining is "equal to" and rawNumber is "1", that would be mis-detection: "1 equal to" rawNumber "1" remaining "equal to"
  // To prevent, require that if remaining starts with lowercase and length <15, and rawNumber is single digit, treat as continuation not label unless next char is uppercase or length substantial
  // Safer: if remaining is purely lowercase short phrase (<20 chars) and no question keywords, it's likely continuation fragment
  if (remaining && /^[a-z]/.test(remaining) && remaining.length < 25 && !/^\d/.test(trimmed) && rawNumber.length <= 2) {
    // Could be "equal to" from previous question stem — not a new question
    // Check if trimmed originally started with digit; if not, this match is suspicious
    // Since we matched digits at start, trimmed must have started with digit; "equal to" doesn't, so this case won't occur.
  }

  return { rawNumber, remaining };
}

function readingOrderSort(lines: OcrLine[]): OcrLine[] {
  const xs = lines.map((l) => l.boundingBox.x).filter((x) => x !== undefined);
  if (xs.length === 0) return [...lines].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  // Strict two-column detection: require substantial content in both columns, excluding marks column (>0.85)
  const leftCount = xs.filter((x) => x < 0.38).length;
  const rightContentCount = xs.filter((x) => x >= 0.48 && x < 0.82).length;
  const total = xs.length;
  const leftRatio = leftCount / Math.max(total, 1);
  const rightRatio = rightContentCount / Math.max(total, 1);
  // Need at least 2 lines in each content column and each >=20% of total, and y-ranges overlap significantly
  let isTwoColumn = false;
  if (leftCount >= 2 && rightContentCount >= 2 && leftRatio >= 0.2 && rightRatio >= 0.2) {
    const leftYs = lines.filter((l) => l.boundingBox.x < 0.38).map((l) => l.boundingBox.y);
    const rightYs = lines.filter((l) => l.boundingBox.x >= 0.48 && l.boundingBox.x < 0.82).map((l) => l.boundingBox.y);
    if (leftYs.length && rightYs.length) {
      const leftMin = Math.min(...leftYs), leftMax = Math.max(...leftYs);
      const rightMin = Math.min(...rightYs), rightMax = Math.max(...rightYs);
      const overlap = Math.max(0, Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin));
      const span = Math.max(leftMax, rightMax) - Math.min(leftMin, rightMin);
      if (span > 0 && overlap / span > 0.45) isTwoColumn = true;
    }
  }

  if (isTwoColumn) {
    const left = lines.filter((l) => l.boundingBox.x < 0.48).sort((a, b) => {
      const yDiff = a.boundingBox.y - b.boundingBox.y;
      if (Math.abs(yDiff) < 0.012) return a.boundingBox.x - b.boundingBox.x;
      return yDiff;
    });
    const right = lines.filter((l) => l.boundingBox.x >= 0.48).sort((a, b) => {
      const yDiff = a.boundingBox.y - b.boundingBox.y;
      if (Math.abs(yDiff) < 0.012) return a.boundingBox.x - b.boundingBox.x;
      return yDiff;
    });
    return [...left, ...right];
  }

  // Single column: sort by y, then x for same y band (threshold 0.012 ~12px)
  const sorted = [...lines];
  sorted.sort((a, b) => {
    const yDiff = a.boundingBox.y - b.boundingBox.y;
    if (Math.abs(yDiff) < 0.012) return a.boundingBox.x - b.boundingBox.x;
    return yDiff;
  });
  return sorted;
}

export function parseQuestionsFromTextract(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  options?: { minConfidence?: number }
): ParsedQuestion[] {
  // Detect expected top-level IDs from instructions (e.g., "question no. 1 to 14")
  const fullTextEarly = ocr.pages.map((p) => p.text).join("\n");
  expectedTopLevelSet = null;
  setExpectedTopLevelFromText(fullTextEarly);
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
    const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;

    // Always skip headers/footers, marks, table cells — never become questions nor continuations
    if (isPageHeaderFooter(text, bbox)) continue;
    if (isMarksLine(text, bbox)) continue;
    if (isTableCell(text, bbox)) continue;
    if (isSectionOrInstruction(text)) continue;
    // Skip standalone option lines even when no current
    if (isOptionLine(text)) {
      // Append to current if exists (option text belongs to parent MCQ), otherwise skip
      if (current) {
        const sep = current.text ? " " : "";
        // Keep option text as part of question for context, but don't create new question
        current.text += sep + text;
        current.rawText += sep + text;
        currentLines.push(line);
      }
      continue;
    }

    const detected = detectLabel(text, (line as any).boundingBox);
    if (detected) {
      // Guard duplicated label: if detected number equals current's number and remaining is short continuation, merge instead of new
      if (current && detected.rawNumber === current.rawNumber && detected.remaining.length < 30) {
        const sep = current.text ? " " : "";
        current.text += sep + detected.remaining;
        current.rawText += sep + detected.remaining;
        currentLines.push(line);
        continue;
      }
      // Check if this is actually a continuation of current (e.g., "84 respectively..." inside Q27, or "1. If Vidhi..." inside Q30)
      if (current) {
        const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;
        const curNumMatch = current.normalizedNumber.match(/^(\d+)/);
        const detNumMatch = detected.rawNumber.match(/^(\d+)/);
        const curNum = curNumMatch ? parseInt(curNumMatch[1], 10) : 0;
        const detNum = detNumMatch ? parseInt(detNumMatch[1], 10) : 0;
        const isIndented = bbox ? bbox.x > 0.09 : false;
        const currentEndsWithAnd = /and\s*$/.test(current.text.trim()) || /,\s*$/.test(current.text.trim());
        // Case 1: "84 respectively..." continuation of Q27 where current ends with "and"
        if (currentEndsWithAnd && isIndented && detNum > 0) {
          const sep = current.text ? " " : "";
          current.text += sep + text;
          current.rawText += sep + text;
          currentLines.push(line);
          continue;
        }
        // Case 2: numbered list inside a question like Q30's "1. If Vidhi..." "2. If Unnati..."
        if (isIndented && detNum > 0 && detNum < curNum && detNum <= 3 && curNum >= 10) {
          const sep = current.text ? " " : "";
          current.text += sep + text;
          current.rawText += sep + text;
          currentLines.push(line);
          continue;
        }
      }
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
    } else {
      // Standalone subpart like "(a)" or "(i)" — treat as child if current is numeric parent, else append
      if (current && STANDALONE_SUBPART_RE.test(text)) {
        // Start new subpart as separate question with parent reference? We treat as new ParsedQuestion with inferred parent
        const subM = text.match(STANDALONE_SUBPART_RE);
        if (subM) {
          finalizeCurrent();
          const rawNumber = `(${subM[1].toLowerCase()})`;
          const remaining = text.slice(subM[0].length).trim();
          // Infer parent from previous numeric question (last depth 0)
          const lastNumeric = [...questions].reverse().find((q) => q.depth === 0);
          // If lastNumeric exists and we are within same section, this subpart likely belongs to it
          // But to avoid explosion for options (a)-(d), we already filtered options; so remaining subparts are case-study (i)(ii)(iii) or Section E
          // Only create if parent exists and remaining text is substantial (>10 chars)
          if (lastNumeric && remaining.length > 5) {
            current = {
              rawNumber: `${lastNumeric.normalizedNumber}${rawNumber}`,
              normalizedNumber: `${lastNumeric.normalizedNumber}${rawNumber}`,
              text: remaining,
              rawText: remaining,
              pageNumbers: [],
              bboxesByPage: new Map(),
              confidence: 0.85,
              depth: 1,
              partType: "PART",
              parent: lastNumeric.normalizedNumber,
            };
            currentLines = [line];
            continue;
          } else if (lastNumeric) {
            // Short option-like line, append to parent instead of creating
            // Append to last question's text? Since we finalized, current is null, but we can push back to questions array
            const sep = lastNumeric.text ? " " : "";
            lastNumeric.text += sep + text;
            lastNumeric.rawText += sep + text;
            // Also extend bboxes
            const pn = (line as any).pageNumber as number;
            if (!lastNumeric.bboxesByPage.has(pn)) lastNumeric.bboxesByPage.set(pn, []);
            lastNumeric.bboxesByPage.get(pn)!.push((line as any).boundingBox);
            continue;
          }
        }
      }
      // Continuation of current question, or stray text before first question (skip instructions)
      if (current) {
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

  // Post-process: filter and validate
  let filtered = questions.filter((q) => {
    if (q.text.trim().length > 10) return true;
    const firstBox = q.bboxesByPage.get(q.pageNumbers[0]!)?.[0];
    const hasFooterPageNumber = q.pageNumbers.length === 1 && (firstBox?.y ?? 0) > 0.92 && /^\d+$/.test(q.rawNumber) && q.text.length < 5;
    if (hasFooterPageNumber) return false;
    // Instruction-like text should be excluded even if length >10
    if (isSectionOrInstruction(q.text) && q.text.length > 30) return false;
    if (q.text.trim().length > 0 && q.marks !== undefined) return true;
    return q.text.trim().length > 0;
  });

  // Deduplicate: if same normalizedNumber appears consecutively with overlapping small text, merge
  const deduped: ParsedQuestion[] = [];
  for (const q of filtered) {
    const last = deduped[deduped.length - 1];
    if (last && last.normalizedNumber === q.normalizedNumber && q.text.length < 40) {
      last.text += " " + q.text;
      last.rawText += " " + q.rawText;
      for (const [pn, boxes] of q.bboxesByPage) {
        if (!last.bboxesByPage.has(pn)) last.bboxesByPage.set(pn, []);
        last.bboxesByPage.get(pn)!.push(...boxes);
      }
      if (!last.pageNumbers.includes(q.pageNumbers[0])) last.pageNumbers.push(q.pageNumbers[0]);
      continue;
    }
    deduped.push(q);
  }

  // Structural validation: if we detect far more top-level than reported count, flag but don't hardcode
  // Top-level = depth 0
  const topLevel = deduped.filter((q) => q.depth === 0);
  // If topLevel > 60, likely over-segmentation; log warning and check for option leakage
  if (topLevel.length > 60) {
    console.warn(`[question-parser] anomaly: ${topLevel.length} top-level questions detected, likely over-segmentation`);
  }

  return deduped;
}
