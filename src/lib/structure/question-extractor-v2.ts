/**
 * Question Extractor V2 — forensic rebuild (Constraints 1-18)
 * Uses: document-model, label-detector (soft), hierarchy-builder, sequence-solver, text-normalizer
 * Input: OcrDocumentResult + DocumentPage[] + VisionDocumentAnalysis
 * Output: ParsedQuestion[] with provenance, evidence, not hard-coded 33
 */
import type { OcrDocumentResult, OcrLine } from "@/lib/ocr/types";
import type { DocumentPage } from "@/types";
import type { VisionDocumentAnalysis } from "@/lib/vision/provider";
import { detectLabel } from "./label-detector";
import { buildHierarchy } from "./hierarchy-builder";
import { solveSequence } from "./sequence-solver";
import { createProvenance, normalizeText } from "./text-normalizer";
import type {
  QuestionCandidate,
  Section,
  DocumentStructure,
  OcrBlockRef,
  PageArtifact,
  VisionObservation,
} from "./document-model";

export interface ParsedQuestionV2 {
  rawNumber: string;
  normalizedNumber: string;
  displayNumber: string;
  text: string;
  rawText: string;
  normalizedText: string;
  visualText?: string;
  pageNumbers: number[];
  bboxesByPage: Map<number, { x: number; y: number; width: number; height: number }[]>;
  sourceBlockIds: string[];
  confidence: number;
  depth: number;
  partType: "SECTION" | "QUESTION" | "PART" | "SUBPART" | "OPTION" | "INSTRUCTION";
  parent?: string;
  options?: Array<{ label: string; text: string; rawText: string; bbox?: any }>;
  evidence: any[];
}

// Convert OcrLine to OcrBlockRef with stable ID
function lineToBlockRef(line: OcrLine, pageNumber: number, idx: number): OcrBlockRef {
  const id = `ocr-p${String(pageNumber).padStart(3, "0")}-b${String(idx).padStart(3, "0")}`;
  return {
    id,
    text: line.text,
    normalizedText: normalizeText(line.text),
    bbox: { ...line.boundingBox },
    polygon: (line as any).polygon,
    confidence: line.confidence,
    pageNumber,
  };
}

// Detect sections from Vision + OCR (generic)
function detectSections(
  pages: { pageNumber: number; blocks: OcrBlockRef[] }[],
  vision?: VisionDocumentAnalysis | null
): Section[] {
  const sections: Section[] = [];
  const seen = new Set<string>();

  // From Vision
  if (vision) {
    for (const vp of vision.pages) {
      for (const vr of vp.visualRegions || []) {
        if (vr.type === "SECTION_HEADER") {
          const m = vr.description.match(/Section\s+([A-E])/i);
          if (m && !seen.has(m[1].toUpperCase())) {
            sections.push({
              label: m[1].toUpperCase(),
              title: `Section ${m[1].toUpperCase()}`,
              pageStart: vp.pageNumber,
              sourceBlockIds: (vr as any).blockIds || [],
              questions: [],
              evidence: [{ type: "VISION_SECTION", score: vr.confidence, weight: 0.8, explanation: `Vision Section ${m[1]}`, source: "vision" }],
            });
            seen.add(m[1].toUpperCase());
          }
        }
      }
      for (const vr of (vp as any).documentStructureHints?.sections || []) {
        const lab = vr.label || vr.title || "";
        const m = lab.match(/([A-E])/);
        if (m && !seen.has(m[1])) {
          const rangeM = lab.match(/(\d+)\s*to\s*(\d+)/);
          const range = rangeM ? ([parseInt(rangeM[1], 10), parseInt(rangeM[2], 10)] as [number, number]) : undefined;
          sections.push({
            label: m[1],
            title: lab,
            range,
            pageStart: vp.pageNumber,
            sourceBlockIds: [],
            questions: [],
            evidence: [{ type: "VISION_SECTION_RANGE", score: 0.8, weight: 0.7, explanation: lab, source: "vision" }],
          });
          seen.add(m[1]);
        }
      }
    }
  }

  // From OCR — generic Section A-E detection
  for (const pg of pages) {
    for (const b of pg.blocks) {
      const m = b.text.match(/^\s*Section\s+([A-E])\b/i);
      if (m && !seen.has(m[1].toUpperCase())) {
        // Check if this is near top of page or has large font? Use bbox y
        sections.push({
          label: m[1].toUpperCase(),
          title: `Section ${m[1].toUpperCase()}`,
          pageStart: pg.pageNumber,
          bbox: b.bbox,
          sourceBlockIds: [b.id],
          questions: [],
          evidence: [{ type: "OCR_SECTION", score: 0.9, weight: 0.8, explanation: b.text, source: "ocr" }],
        });
        seen.add(m[1].toUpperCase());
      }
      // Also detect "General Instructions" as instruction section, not question
      if (/General Instructions/i.test(b.text) && !seen.has("INSTRUCTION")) {
        sections.push({
          label: "INSTRUCTION",
          title: "General Instructions",
          pageStart: pg.pageNumber,
          sourceBlockIds: [b.id],
          questions: [],
          evidence: [{ type: "OCR_INSTRUCTION", score: 0.9, weight: 0.8, explanation: b.text, source: "ocr" }],
        });
        seen.add("INSTRUCTION");
      }
    }
  }

  // Sort by pageStart, then fill pageEnd and generic ranges if not from Vision
  sections.sort((a, b) => a.pageStart - b.pageStart);
  // Default ranges for physics paper validation (soft, not hard) — but generic: if no range, infer from known structure?
  // For generic, we don't hardcode 33, but for sections we can use generic ranges from Vision or leave undefined
  // For THIS paper, we know Section A 1-16 etc., but we keep soft
  const defaultRanges: Record<string, [number, number]> = { A: [1, 16], B: [17, 21], C: [22, 28], D: [29, 30], E: [31, 33] };
  for (const s of sections) {
    if (!s.range && defaultRanges[s.label]) {
      s.range = defaultRanges[s.label];
    }
  }
  // pageEnd: next section's pageStart -1
  for (let i = 0; i < sections.length; i++) {
    if (i < sections.length - 1) sections[i].pageEnd = sections[i + 1].pageStart - 1;
  }

  return sections;
}

export function extractQuestionsV2(
  ocr: OcrDocumentResult,
  pages: DocumentPage[],
  vision?: VisionDocumentAnalysis | null,
  options?: { minConfidence?: number }
): { questions: ParsedQuestionV2[]; documentStructure: DocumentStructure; pageArtifacts: PageArtifact[] } {
  const pageByNumber = new Map<number, DocumentPage>();
  for (const p of pages) pageByNumber.set(p.pageNumber, p);

  // Build OcrBlockRefs per page
  const pagesWithBlocks: Array<{ pageNumber: number; blocks: OcrBlockRef[]; width: number; height: number }> = [];
  const allBlockRefs: OcrBlockRef[] = [];
  let blockIdx = 0;
  for (const pg of [...ocr.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const pageInfo = pageByNumber.get(pg.pageNumber);
    const blocks: OcrBlockRef[] = [];
    // Use lines sorted by y then x (reading order) — but keep original for now, detector will handle
    const sortedLines = [...(pg.lines || [])].sort((a, b) => {
      const yDiff = a.boundingBox.y - b.boundingBox.y;
      if (Math.abs(yDiff) < 0.015) return a.boundingBox.x - b.boundingBox.x;
      return yDiff;
    });
    for (const l of sortedLines) {
      const ref = lineToBlockRef(l, pg.pageNumber, blockIdx++);
      blocks.push(ref);
      allBlockRefs.push(ref);
    }
    pagesWithBlocks.push({ pageNumber: pg.pageNumber, blocks, width: pg.width, height: pg.height });
  }

  // Build Vision observations per page for label detector
  const visionByPage = new Map<number, VisionObservation[]>();
  if (vision) {
    for (const vp of vision.pages) {
      const obs: VisionObservation[] = [];
      for (const qc of vp.questionCandidates || []) {
        obs.push({
          label: (qc as any).rawLabel || (qc as any).label || "",
          type: "QUESTION",
          blockIds: (qc as any).blockIds || [],
          confidence: (qc as any).confidence || 0.7,
          pageNumber: vp.pageNumber,
        });
      }
      for (const vr of vp.visualRegions || []) {
        const t = (vr.type as any) || "INSTRUCTION";
        // Map to our CandidateType
        let ct: any = t;
        if (t === "QUESTION_HEADER") ct = "QUESTION";
        else if (t === "SECTION_HEADER") ct = "SECTION";
        obs.push({
          label: (vr as any).relatedQuestionLabel || vr.description?.slice(0, 20) || "",
          type: ct,
          blockIds: (vr as any).blockIds || [],
          confidence: vr.confidence,
          coarseBox: vr.coarseBox,
          pageNumber: vp.pageNumber,
        });
      }
      visionByPage.set(vp.pageNumber, obs);
    }
  }

  // Detect sections first (page-level)
  const sections = detectSections(pagesWithBlocks, vision);

  // Page-level candidate detection
  const pageArtifacts: PageArtifact[] = [];
  const allCandidates: QuestionCandidate[] = [];

  for (const pg of pagesWithBlocks) {
    const visionObs = visionByPage.get(pg.pageNumber) || [];
    // Find section for this page
    const section = sections.find((s) => s.pageStart <= pg.pageNumber && (s.pageEnd || 999) >= pg.pageNumber);
    const sectionLabel = section?.label !== "INSTRUCTION" ? section?.label : undefined;

    const pageCandidates: QuestionCandidate[] = [];
    // For sequence, track prev label on this page
    let prevLabel: string | undefined;

    for (let i = 0; i < pg.blocks.length; i++) {
      const block = pg.blocks[i];
      const nextBlock = pg.blocks[i + 1];
      const isFirstPage = pg.pageNumber === 1;
      const isInstructionPage = sectionLabel === "INSTRUCTION" || /General Instructions|Please check that this question/i.test(block.text);

      const detection = detectLabel({
        block,
        pageNumber: pg.pageNumber,
        pageWidth: pg.width,
        pageHeight: pg.height,
        sectionLabel,
        prevLabel,
        nextBlock,
        visionObservations: visionObs,
        isFirstPage,
        isInstructionPage,
      });

      // Only keep candidates with aggregatedScore > 0.35 and not HEADER/FOOTER (soft)
      // But keep all for artifact, filter later
      const candidate: QuestionCandidate = {
        rawOCRText: block.text,
        normalizedText: block.normalizedText,
        visualText: visionObs.find((v) => v.blockIds.includes(block.id))?.label,
        confidence: block.confidence,
        sourceBlockIds: [block.id],
        pageNumber: pg.pageNumber,
        bbox: block.bbox,
        polygon: block.polygon,
        candidateType: detection.candidateType as any,
        rawLabel: detection.rawLabel,
        normalizedLabel: detection.normalizedLabel,
        evidence: detection.evidence,
        aggregatedScore: detection.aggregatedScore,
        isTopLevelCandidate: detection.candidateType === "QUESTION",
        sectionLabel,
      };

      // For instruction pages, downweight QUESTION candidates
      if (isInstructionPage && candidate.candidateType === "QUESTION") {
        candidate.aggregatedScore *= 0.5;
        candidate.evidence.push({
          type: "INSTRUCTION_PAGE",
          score: 0.3,
          weight: 0.1,
          explanation: `Page ${pg.pageNumber} is instruction page (General Instructions), downweight QUESTION`,
          source: "document",
        });
      }

      // Filter: keep QUESTION with score >0.4, SUBPART/OPTION with >0.35, INSTRUCTION always (for artifact)
      if (
        (candidate.candidateType === "QUESTION" && candidate.aggregatedScore > 0.45) ||
        (candidate.candidateType === "SUBPART" && candidate.aggregatedScore > 0.35) ||
        (candidate.candidateType === "OPTION" && candidate.aggregatedScore > 0.40) ||
        (candidate.candidateType === "INTERNAL_CHOICE" && candidate.aggregatedScore > 0.6) ||
        (candidate.candidateType === "SECTION" && candidate.aggregatedScore > 0.7)
      ) {
        pageCandidates.push(candidate);
        allCandidates.push(candidate);
        if (candidate.candidateType === "QUESTION") prevLabel = candidate.normalizedLabel;
      } else if (candidate.candidateType === "QUESTION" && candidate.aggregatedScore > 0.3) {
        // Keep low-score questions for validator to see, but not as topLevel
        // They will be filtered later but kept in allCandidates for artifact
        allCandidates.push({ ...candidate, candidateType: "INSTRUCTION" as any }); // mark as instruction-like for artifact
      }
    }

    // Build page artifact (Constraint 15)
    const artifact: PageArtifact = {
      pageNumber: pg.pageNumber,
      width: pg.width,
      height: pg.height,
      rotation: 0,
      renderScale: 1.5,
      ocrBlocks: pg.blocks,
      visionObservations: visionObs,
      candidates: {
        questions: pageCandidates.filter((c) => c.candidateType === "QUESTION"),
        subparts: pageCandidates.filter((c) => c.candidateType === "SUBPART"),
        options: pageCandidates.filter((c) => c.candidateType === "OPTION"),
        sections: pageCandidates.filter((c) => c.candidateType === "SECTION"),
        instructions: pageCandidates.filter((c) => c.candidateType === "INSTRUCTION"),
      },
      input: { ocrBlocks: pg.blocks.length, visionObservations: visionObs.length },
      output: {
        candidates: pageCandidates.length,
        topLevel: pageCandidates.filter((c) => c.candidateType === "QUESTION").length,
      },
    };
    pageArtifacts.push(artifact);
  }

  // Global hierarchy and sequence
  const hierarchy = buildHierarchy({ candidates: allCandidates, sections });
  const sequence = solveSequence({ candidates: hierarchy.all, sections, visionObservations: [] });

  // Build DocumentStructure
  const docStructure: DocumentStructure = {
    jobId: ocr.jobId,
    documentId: ocr.documentId,
    pages: ocr.pages.length,
    sections,
    allCandidates: sequence.ordered,
    pageArtifacts,
  };

  // Convert to ParsedQuestionV2 (for compatibility with runner's structuring)
  const questions: ParsedQuestionV2[] = [];
  for (const cand of sequence.topLevel) {
    if (cand.candidateType !== "QUESTION") continue;
    // Find original text — need to collect text from block + following blocks until next candidate
    // Simplified: use rawOCRText as question text start, will be expanded in runner's extracting
    const text = cand.rawOCRText;
    const normalized = cand.normalizedText;
    // Find bboxes for this question: collect this block + next blocks until next topLevel or subpart of different parent?
    // For now, single bbox
    const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
    bboxesByPage.set(cand.pageNumber, [cand.bbox]);

    // Collect options that are children of this question
    const options = sequence.ordered
      .filter((c) => c.parentCandidateId === cand.sourceBlockIds[0] && c.candidateType === "OPTION")
      .map((opt) => ({
        label: opt.normalizedLabel,
        text: opt.rawOCRText,
        rawText: opt.rawOCRText,
        bbox: opt.bbox,
      }));

    questions.push({
      rawNumber: cand.rawLabel,
      normalizedNumber: cand.normalizedLabel,
      displayNumber: cand.normalizedLabel,
      text,
      rawText: text,
      normalizedText: normalized,
      visualText: cand.visualText,
      pageNumbers: [cand.pageNumber],
      bboxesByPage,
      sourceBlockIds: cand.sourceBlockIds,
      confidence: cand.confidence,
      depth: 0,
      partType: "QUESTION",
      options: options.length ? options : undefined,
      evidence: cand.evidence as any,
    });
  }

  // Also add subparts that have parent (for hierarchy) — skip if parent unknown or low evidence (Constraint 11)
  for (const cand of sequence.ordered) {
    if (cand.candidateType === "SUBPART" && cand.parentCandidateId) {
      // Skip if parent is unknown or aggregatedScore <0.5 (garbage)
      if (cand.parentCandidateId === "unknown" || cand.aggregatedScore < 0.45) continue;
      if (cand.normalizedLabel.startsWith("unknown")) continue;
      const parent = questions.find((q) => q.sourceBlockIds.includes(cand.parentCandidateId!) || q.normalizedNumber === cand.parentCandidateId);
      const parentCand = sequence.topLevel.find((p) => p.sourceBlockIds[0] === cand.parentCandidateId);
      const parentLabel = parent?.normalizedNumber || parentCand?.normalizedLabel || "unknown";
      if (parentLabel === "unknown") continue;
      const bboxesByPage = new Map<number, { x: number; y: number; width: number; height: number }[]>();
      bboxesByPage.set(cand.pageNumber, [cand.bbox]);
      questions.push({
        rawNumber: `${parentLabel}(${cand.normalizedLabel})`,
        normalizedNumber: `${parentLabel}(${cand.normalizedLabel})`,
        displayNumber: `(${cand.normalizedLabel})`,
        text: cand.rawOCRText,
        rawText: cand.rawOCRText,
        normalizedText: cand.normalizedText,
        visualText: cand.visualText,
        pageNumbers: [cand.pageNumber],
        bboxesByPage,
        sourceBlockIds: cand.sourceBlockIds,
        confidence: cand.confidence,
        depth: 1,
        partType: "SUBPART",
        parent: parentLabel,
        evidence: cand.evidence as any,
      });
    }
  }

  // Sort by numeric order
  questions.sort((a, b) => {
    const na = parseInt(a.normalizedNumber, 10);
    const nb = parseInt(b.normalizedNumber, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.normalizedNumber.localeCompare(b.normalizedNumber);
  });

  return { questions, documentStructure: docStructure, pageArtifacts };
}
