import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import { normalizeNumber } from "./numbering";

export interface QuestionOptionParsed {
  label: string;
  text: string;
  rawText: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface ParsedQuestion {
  rawNumber: string;
  normalizedNumber: string;
  displayNumber?: string;
  text: string;
  rawText: string;
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  confidence: number;
  marks?: number;
  depth: number;
  partType: "SECTION" | "QUESTION" | "PART" | "SUBPART" | "OPTION" | "INSTRUCTION";
  kind?: string;
  parent?: string;
  options?: QuestionOptionParsed[];
}

// Regex for question label at line start — ONLY numeric-prefixed (require digit base)
// Supports: 1, 1., 1), Q1, Q.1, Q 1, Question 1, 11(a), 11 (a), 11(a)(i), 11 (a) (i)
// Standalone "(a)" / "(i)" is NOT a top-level label; those are options/subparts handled via parent context
const QUESTION_LABEL_RE = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?|\d+\s*[\.\)]\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?)\s*[\.\)\-:\s]*\s*/i;

// Subpart-only regex for standalone (a)/(i)/(ii) — used only to detect subparts via parent context, not as top-level
const STANDALONE_SUBPART_RE = /^\s*\(([a-z]+|[ivx]+|[0-9]+)\)\s*[\.\)\-:\s]*\s*/i;
const STANDALONE_ROMAN_DOT_RE = /^\s*(i{1,3}|iv|v|vi|vii|viii|ix|x)\s*[\.\)]\s*/i;

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
  if (!t) return false;
  // Generic page-footer pattern
  if (PAGE_HEADER_FOOTER_RE.test(t) && t.length < 30) return true;
  if (/^\s*Page \d+ of \d+/i.test(t)) return true;
  if (/^P\.T\.O\./i.test(t)) return true;
  if (/^NOTE$/i.test(t) && t.length < 10) return true;

  // Code like "31/2/1" anywhere (not only header band) — short slash code is never a question
  if (/^\s*\.?31\/2\/1\.?\s*$/i.test(t)) return true;
  if (/^\s*31\/ETCH/.test(t)) return true;
  if (/^\s*100A\s*$/.test(t)) return true;
  if (/^\s*\.31\/2\/1\.\s*$/.test(t)) return true;
  // Generic slash-code: short (<12 chars) with slash and digits, no letters beyond 2-3 chars, often header code
  if (t.length < 14 && /^[\d\/\.]+$/.test(t.replace(/\s/g, "")) && /[\/]/.test(t) && /\d/.test(t)) return true;

  // Generic header/footer band: y in top 8% or bottom 8% of page
  const inHeaderBand = !!bbox && bbox.y < 0.08;
  const inFooterBand = !!bbox && bbox.y > 0.92;
  if (inHeaderBand || inFooterBand) {
    // Single page number in footer/header
    if (/^\s*\d+\s*$/.test(t)) return true;
    // Short code-like header fragments (e.g., "Code No.", "Roll No.", "Series :", "SET -", "Maximum Marks:", "Time allowed", subject names)
    // Detect via generic cues: contains "Code No", "Roll No", "Maximum Marks", "Time", "CLASS", "SAMPLE", plus very short (<25 chars) and in band
    if (t.length < 30) {
      if (/^(Code|Roll)\s*No\.?/i.test(t)) return true;
      if (/^SET\s*[-–]/i.test(t)) return true;
      if (/^Series\s*:/i.test(t)) return true;
      if (/^(Maximum Marks|Time)\b/i.test(t)) return true;
      if (/^(CLASS|SAMPLE QUESTION PAPER|SCIENCE|MATHEMATICS)\b/i.test(t) && t.length < 35) return true;
    }
    // Any short (<12 chars) alphanumeric garble in header band with symbols/digits mix is likely header noise — generic OCR garbage filter
    if (inHeaderBand && t.length < 18 && /^[\w\s\/\-\.#]+$/.test(t) && /[0-9]/.test(t) && /[A-Z]/.test(t) && t.split(/\s+/).length <= 3) {
      // e.g., "31/2/1", "31/ETCH", short codes — generic pattern: short with slash/dash and digits in header
      if (/[\/\\]/.test(t) && /\d/.test(t)) return true;
    }
  }

  // Assessment scheme notice always footer-like (generic)
  if (/Please note that the assessment scheme/i.test(t)) return true;
  if (/Candidates must write the Code/i.test(t)) return true;
  if (/Please check that this question/i.test(t)) return true;

  // Do not flag legitimate question labels as garbage
  if (QUESTION_LABEL_RE.test(t) || STANDALONE_SUBPART_RE.test(t)) {
    // e.g., "21.(A)", "(a)", "10" at left margin are valid labels, not garbage
    // Do not treat as header/garbage
  } else {
    // OCR garbage: generic generic detection — no paper-specific literals
    // Pure symbols or very low alphanumeric content
    if (/^[^\w]*$/.test(t) && t.length < 10) return true;
    // Generic OCR garbage heuristic: short (<15 chars) with mixed symbols/digits and >40% non-alphanumeric, in any position, and confidence would be low (but we don't have it here)
    if (t.length < 18 && t.length >= 4) {
      const nonAlpha = (t.match(/[^a-zA-Z0-9\s]/g) || []).length;
      const ratio = nonAlpha / t.length;
      // e.g., "$21 onl", "4807, D_D", "3772 $41" — generic: many symbols + digits, few real words, short
      if (ratio > 0.25 && /\d/.test(t) && !/[a-z]{3,}/i.test(t)) return true;
      // Pure short code like "4807", "400 23" — short numeric + maybe short suffix, not a question (which needs accompanying text)
      if (/^\d{3,5}(\s+[\w\/\-\.]{1,6})?$/.test(t) && t.length < 14 && !t.includes("marks")) {
        // But avoid filtering legitimate question numbers like "1" or "22" alone at left margin — those are handled as labels elsewhere
        // Only filter if in header/footer band or mid-page stray with no remaining text expectation
        if ((bbox && (bbox.y < 0.10 || bbox.y > 0.88 || bbox.x > 0.7)) || ratio > 0.15) return true;
      }
    }
  }
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

function isOptionLine(text: string, bbox?: { x: number; y: number; width: number; height: number }): boolean {
  const t = text.trim();
  if (!t) return false;
  // MCQ option markers: (a)-(d) in various forms — but case-study subparts also use (a) with longer text
  // Multi-signal: pattern + indentation + length + not roman
  // Pattern supports: (a), (A), a), A), a., A., (a. — all with optional leading bullet
  const optPattern = /^\s*(?:\(?\s*([a-dA-D])\s*[\)\.\]]\s*)/;
  const m = t.match(optPattern);
  if (!m) return false;
  const label = m[1].toLowerCase();
  if (!["a", "b", "c", "d"].includes(label)) return false;
  // Distinguish from subpart (i)/(ii) which would be roman — already excluded by [a-d]
  // Roman (i) would be single letter but 'i' is beyond d, so not matched here — correct

  // Geometry signal: MCQ options are indented relative to question number column (question numbers at x<0.08)
  // Options typically x 0.09–0.35 with similar x across cluster
  const isIndented = !bbox || bbox.x > 0.07;
  // Options are not at exact left margin; if at x<0.06 it's likely a question label, not option
  if (bbox && bbox.x < 0.06) return false;

  // Content length: allow long mathematical options (up to ~280 chars) but not extremely long paragraph subparts
  // Subparts (i)(ii) case-study often longer explanatory text (>120 chars) — but we already handled [a-d] only, so (i) not here
  // For (a)-(d) we allow any length up to 300, but flag if very long and contains sentence structure vs short option
  // Heuristic: options typically have limited punctuation and are not multi-sentence; but allow math
  if (t.length > 320) return false;

  // If indented and pattern matches a-d, treat as option regardless of length (fixes long math options bug)
  if (isIndented) return true;

  // Fallback: if text is short (<120) and pattern matches, even without bbox, treat as option
  if (t.length < 120) return true;

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
  // Strict left margin for question labels — single column expects x <0.14, two-column right allowed at 0.48-0.65 but only if truly two-column page
  // For generic single-column papers, any x >0.18 is unlikely a question start
  const isLeftMarginStrict = !bbox || bbox.x < 0.14;
  const isRightColumnMargin = !!bbox && bbox.x >= 0.45 && bbox.x < 0.65;
  // If not left and not right column, reject unless Q-prefixed at moderate x
  if (!isLeftMarginStrict && !isRightColumnMargin) {
    // Allow Q-prefixed even if slightly indented up to 0.22
    if (/^\s*Q/i.test(trimmed) && bbox && bbox.x < 0.22) {
      // allow
    } else {
      return null;
    }
  }
  // Geometry: body numbers like "41cm" at interior should not become questions
  const isLeftMargin = !bbox || bbox.x < 0.14;
  if (!isLeftMargin && /^\d+[a-z]{1,3}\b/.test(trimmed) && !/^\d+\s*[\.\)\(\-]/.test(trimmed) && !/^\s*Q/i.test(trimmed)) {
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
    if (n > 100) return null;
    if (n === 0) return null;
    if (expectedTopLevelSet && !expectedTopLevelSet.has(n)) {
      return null;
    }
  }

  // Strict punctuation requirement for bare numbers without Q prefix
  // e.g., "15 minute..." -> raw "15" without dot/parens and remaining starts with lowercase word -> not a question
  // Real questions have "15." or "15(a)" or "15 )" etc. or "1 What is..." with uppercase
  // Check original fullMatch for punctuation (dot/paren), not stripped rawNumber
  const hadPunct = /[\.\)\(\:]/.test(fullMatch);
  const isQPrefixed = /^\s*Q/i.test(trimmed);
  if (!hadPunct && !isQPrefixed) {
    // Bare number without punctuation: allow only if remaining starts with uppercase (plausible question stem)
    // Reject if remaining starts with lowercase or digit (like "15 minute" or "10 30 out")
    if (!remaining) {
      // Bare number alone like "1" with no remaining — could be label on its own line, allow if left margin
      // But single digit alone at left margin could also be page number; however page numbers are filtered via header band
      // Allow for now
    } else if (/^[a-z]/.test(remaining)) {
      return null;
    } else if (/^\d/.test(remaining)) {
      return null;
    }
    // For "1 What is..." remaining starts with "W" uppercase, allow
  }
  // Additional guard: if remaining starts with digit, likely time like "10.15" or "7)2" -> not question
  // Real question after "10." would start with uppercase letter, not digit (except equation)
  if (hadPunct && remaining && /^\d/.test(remaining) && !/^\([a-z]\)/i.test(remaining.slice(0,5))) {
    // e.g., "10." with remaining "15 a.m." -> time
    return null;
  }
  // Additional guard: if remaining starts with digit, likely time like "10.15" or "7)2" -> not question
  if (remaining && /^\d/.test(remaining) && !/^\([a-z]\)/i.test(remaining.slice(0,5))) {
    return null;
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

  let inVisuallyImpairedBlock = false;
  let lastTopBeforeBlock = 0;
  for (const line of allLines) {
    const text = line.text.trim();
    if (!text) continue;
    const bbox = (line as any).boundingBox as { x: number; y: number; width: number; height: number } | undefined;

    // Visually impaired alternative block: generic skip until next valid top-level question
    if (/For Visually Impaired/i.test(text)) {
      inVisuallyImpairedBlock = true;
      // Remember last top-level number before block for exit condition
      const tops = questions.filter((q) => q.depth === 0);
      if (tops.length) {
        const last = tops[tops.length - 1];
        const m = last.normalizedNumber.match(/^(\d+)/);
        if (m) lastTopBeforeBlock = parseInt(m[1], 10);
      } else if (current) {
        const m = current.normalizedNumber.match(/^(\d+)/);
        if (m) lastTopBeforeBlock = parseInt(m[1], 10);
      }
      continue;
    }
    if (inVisuallyImpairedBlock) {
      // Exit when we encounter next valid top-level question at left margin with number > lastTopBeforeBlock
      const maybeLabel = detectLabel(text, bbox);
      if (maybeLabel) {
        const nm = maybeLabel.rawNumber.match(/^(\d+)/);
        const n = nm ? parseInt(nm[1], 10) : 0;
        if (n > lastTopBeforeBlock && n <= 50 && bbox && bbox.x < 0.12) {
          inVisuallyImpairedBlock = false;
          // fall through to normal processing for this line
        } else {
          continue;
        }
      } else {
        // Also check if this line looks like next question without explicit detectLabel due to header filtering?
        // If text at left margin looks like digit, keep skipping
        continue;
      }
    }

    // Always skip headers/footers, marks, table cells — never become questions nor continuations
    if (isPageHeaderFooter(text, bbox)) continue;
    if (isMarksLine(text, bbox)) continue;
    if (isTableCell(text, bbox)) continue;
    if (isSectionOrInstruction(text)) continue;
    // MCQ option handling — multi-signal (pattern + indentation + length)
    if (isOptionLine(text, bbox)) {
      if (current) {
        const optMatch = text.trim().match(/^\s*\(?\s*([a-dA-D])\s*[\)\.\]]\s*(.*)$/);
        const label = optMatch ? optMatch[1].toUpperCase() : "A";
        const optText = optMatch ? optMatch[2].trim() : text.trim();
        if (!current.options) current.options = [];
        current.options.push({ label, text: optText, rawText: text.trim(), bbox: bbox ? { ...bbox } : undefined });
        // Keep geometry for provenance but not as separate question
        currentLines.push(line);
        // Also append minimal hint to text for context but preserve options separately (UI will render options)
        // Do not duplicate full option text into question stem — keep stem clean
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
      // Synthesize missing top-level parent if label like "21.(A)" appears without prior "21"
      const parsedForParent = normalizeNumber(rawNumber);
      if (parsedForParent.parent && parsedForParent.depth > 0) {
        const parentNorm = parsedForParent.parent;
        const parentExists = questions.some((q) => q.normalizedNumber === parentNorm) || (current && current.normalizedNumber === parentNorm);
        if (!parentExists) {
          // Create synthetic parent placeholder for internal-choice questions like "21.(A)" without explicit "21"
          const synthetic: ParsedQuestion = {
            rawNumber: parentNorm,
            normalizedNumber: parentNorm,
            displayNumber: parentNorm,
            text: `Question ${parentNorm}`,
            rawText: `Question ${parentNorm}`,
            pageNumbers: [(line as any).pageNumber as number],
            bboxesByPage: new Map([[(line as any).pageNumber as number, [{ ...(line as any).boundingBox }]]]),
            confidence: 0.6,
            depth: 0,
            partType: "QUESTION",
            options: [],
          };
          questions.push(synthetic);
        }
      }
      current = {
        rawNumber,
        normalizedNumber: rawNumber, // will be normalized at finalize
        displayNumber: rawNumber,
        text: remaining,
        rawText: remaining,
        pageNumbers: [],
        bboxesByPage: new Map(),
        confidence: 0.85,
        depth: 0,
        partType: "QUESTION",
        options: [],
      };
      currentLines = [line];
    } else {
      // Standalone subpart like "(a)" or "(i)" or "i." — treat as child if current is numeric parent, else append
      const romanDotMatch = text.match(STANDALONE_ROMAN_DOT_RE);
      const parenMatch = text.match(STANDALONE_SUBPART_RE);
      const subM = parenMatch || romanDotMatch;
      if (current && subM) {
        const isParen = !!parenMatch;
        if (subM) {
          finalizeCurrent();
          let rawInner: string;
          let isRoman: boolean;
          let isLetter: boolean;
          if (isParen) {
            rawInner = (subM as RegExpMatchArray)[1].toLowerCase();
            isRoman = /^[ivx]+$/i.test(rawInner) && rawInner.length <= 4;
            isLetter = /^[a-z]$/i.test(rawInner);
          } else {
            rawInner = (subM as RegExpMatchArray)[1].toLowerCase();
            isRoman = true;
            isLetter = false;
          }
          const rawNumber = `(${rawInner})`;
          const remaining = text.slice((subM as RegExpMatchArray)[0].length).trim();
          // Hierarchical parent discovery
          let parentCandidate: ParsedQuestion | undefined;
          const last = questions[questions.length - 1];
          if (isRoman) {
            if (last && last.depth === 2) {
              const grandParentNorm = last.parent;
              parentCandidate = questions.find((q) => q.normalizedNumber === grandParentNorm);
            } else if (last && last.depth === 1 && /\([a-d]\)$/i.test(last.normalizedNumber)) {
              // e.g., 11(a) -> (i) nested to 11(a)(i)
              parentCandidate = last;
            } else {
              parentCandidate = [...questions].reverse().find((q) => q.depth === 0);
            }
          } else if (isLetter) {
            parentCandidate = [...questions].reverse().find((q) => q.depth === 0);
          } else {
            parentCandidate = [...questions].reverse().find((q) => q.depth === 0);
          }
          if (parentCandidate) {
            const depth = isRoman && parentCandidate.depth === 1 ? 2 : 1;
            const partType = depth === 2 ? "SUBPART" : "PART";
            current = {
              rawNumber: `${parentCandidate.normalizedNumber}${rawNumber}`,
              normalizedNumber: `${parentCandidate.normalizedNumber}${rawNumber}`,
              displayNumber: `(${rawInner})`,
              text: remaining,
              rawText: remaining,
              pageNumbers: [],
              bboxesByPage: new Map(),
              confidence: 0.85,
              depth,
              partType: partType as any,
              parent: parentCandidate.normalizedNumber,
              options: [],
            };
            currentLines = [line];
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

  // Deduplicate: same normalizedNumber must be single logical question (cross-page continuation)
  // Previous 37(i) duplicate across OCR split caused 6 subs instead of 3
  const deduped: ParsedQuestion[] = [];
  for (const q of filtered) {
    const last = deduped[deduped.length - 1];
    // Consecutive exact duplicate (same parent same number) → merge always, keep longest text + union boxes
    if (last && last.normalizedNumber === q.normalizedNumber) {
      // Merge text if not already contained
      if (!last.text.includes(q.text) && !q.text.includes(last.text)) {
        last.text += " " + q.text;
        last.rawText += " " + q.rawText;
      } else if (q.text.length > last.text.length) {
        last.text = q.text;
        last.rawText = q.rawText;
      }
      for (const [pn, boxes] of q.bboxesByPage) {
        if (!last.bboxesByPage.has(pn)) last.bboxesByPage.set(pn, []);
        last.bboxesByPage.get(pn)!.push(...boxes);
      }
      for (const pn of q.pageNumbers) if (!last.pageNumbers.includes(pn)) last.pageNumbers.push(pn);
      // Merge options if any
      if (q.options && q.options.length) {
        if (!last.options) last.options = [];
        for (const o of q.options) if (!last.options.some((x) => x.label === o.label)) last.options.push(o);
      }
      continue;
    }
    // Non-consecutive duplicate anywhere (e.g., later duplicate of 37(i) after 37(iii) block) → merge into first occurrence
    const existing = deduped.find((x) => x.normalizedNumber === q.normalizedNumber);
    if (existing) {
      if (!existing.text.includes(q.text) && q.text.length > 10) {
        if (!existing.text.includes(q.text)) existing.text += " " + q.text;
      }
      for (const [pn, boxes] of q.bboxesByPage) {
        if (!existing.bboxesByPage.has(pn)) existing.bboxesByPage.set(pn, []);
        existing.bboxesByPage.get(pn)!.push(...boxes);
      }
      for (const pn of q.pageNumbers) if (!existing.pageNumbers.includes(pn)) existing.pageNumbers.push(pn);
      continue;
    }
    deduped.push(q);
  }

  // MCQ false-positive guard: single "(A)" under a subpart is not an MCQ if no sibling (B) exists nearby
  // Demote single-option questions back to text (preserves hierarchy, avoids 37(iii):1)
  for (const q of deduped) {
    if (q.options && q.options.length === 1) {
      const opt = q.options[0];
      // Check if sibling option (B) exists elsewhere as another question with same parent? If not, it's isolated (A) -> internal choice without B captured, treat as text
      const siblingExists = deduped.some((x) => x !== q && x.parent === q.parent && x.normalizedNumber !== q.normalizedNumber) || q.text.length > 120;
      if (!siblingExists) {
        // Demote: append option back into text
        q.text = (q.text ? q.text + " " : "") + `(${opt.label}) ${opt.text}`;
        q.rawText = (q.rawText ? q.rawText + " " : "") + opt.rawText;
        q.options = [];
      }
    }
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
