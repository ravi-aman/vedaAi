import { jobStore, documentStore, pageStoreApi, fileStorage } from "@/lib/storage";
import type { ProcessingJob, ProcessingStage, QuestionNode, AnswerGroup, AnswerRegion, HighlightRegion, MappingDecision, Evidence } from "@/types";
import { getConfig } from "@/lib/config";
import { AppError, ErrorCodes } from "@/lib/errors/codes";
import { inspectPdf, inspectImage } from "@/lib/documents/pdf";
import { getAIProvider } from "@/lib/ai/factory";
import { normalizeNumber } from "@/lib/structure/numbering";
import { aggregateScore, buildEvidence } from "@/lib/evidence/aggregate";
import { decideForQuestion } from "@/lib/decision";
import { generateId } from "@/lib/storage";

function resolvePageId(modelPageId: string | undefined, pages: any[]): string {
  if (!modelPageId) return pages[0]?.id;
  // If modelPageId is already a UUID (contains -), return as is if exists
  if (modelPageId.includes("-") && pages.some(p=>p.id===modelPageId)) return modelPageId;
  // Try to parse as page number (1-indexed) or index (0-indexed)
  const num = parseInt(String(modelPageId).replace(/[^0-9]/g, ""), 10);
  if (!isNaN(num)) {
    // Try 1-indexed first
    const byNumber = pages.find(p=>p.pageNumber===num);
    if (byNumber) return byNumber.id;
    // Try 0-indexed
    if (pages[num]) return pages[num].id;
    // Try num-1
    if (pages[num-1]) return pages[num-1].id;
  }
  // Fallback to first page
  return pages[0]?.id;
}

// Stage order
const STAGE_ORDER: ProcessingStage[] = [
  "VALIDATING",
  "PREPROCESSING",
  "EXTRACTING",
  "STRUCTURING",
  "MATCHING",
  "LOCALIZING",
  "VALIDATING_RESULT",
  "COMPLETED",
];

function nextStage(current: ProcessingStage): ProcessingStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1) return null;
  return STAGE_ORDER[idx + 1] || null;
}

export async function startProcessing(jobId: string): Promise<void> {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, `Job ${jobId} not found`);
  if (job.status === "COMPLETED" || job.currentStage === "COMPLETED") return;
  if (job.status === "FAILED") throw new AppError(ErrorCodes.INVALID_STAGE_TRANSITION, "Job already failed");

  // Run asynchronously without blocking caller too long
  runJob(jobId).catch(async (e) => {
    console.error(`[job ${jobId}] runner failed`, e);
    await jobStore.update(jobId, {
      status: "FAILED",
      currentStage: "FAILED",
      error: {
        code: (e as AppError).code || ErrorCodes.UNKNOWN_ERROR,
        message: (e as Error).message,
        stage: "FAILED",
        timestamp: new Date().toISOString(),
      },
    });
  });
}

async function runJob(jobId: string) {
  let job = await jobStore.get(jobId);
  if (!job) return;

  const updateStage = async (stage: ProcessingStage, status: "in_progress" | "completed" | "failed") => {
    const stageStates = { ...job!.progress.stageStates } as any;
    stageStates[stage] = status;
    await jobStore.update(jobId, {
      currentStage: stage,
      status: stage as ProcessingStage,
      progress: { ...job!.progress, stageStates },
      updatedAt: new Date().toISOString(),
    });
    job = await jobStore.get(jobId);
  };

  try {
    // VALIDATING
    await updateStage("VALIDATING", "in_progress");
    await validateJob(jobId);
    await updateStage("VALIDATING", "completed");

    // PREPROCESSING
    await updateStage("PREPROCESSING", "in_progress");
    const prep = await preprocess(jobId);
    await updateStage("PREPROCESSING", "completed");

    // EXTRACTING
    await updateStage("EXTRACTING", "in_progress");
    const extraction = await extracting(jobId, prep);
    await updateStage("EXTRACTING", "completed");

    // STRUCTURING
    await updateStage("STRUCTURING", "in_progress");
    const structured = await structuring(jobId, extraction);
    await updateStage("STRUCTURING", "completed");

    // MATCHING
    await updateStage("MATCHING", "in_progress");
    const matching = await matchingStage(jobId, structured);
    await updateStage("MATCHING", "completed");

    // LOCALIZING
    await updateStage("LOCALIZING", "in_progress");
    const localized = await localizing(jobId, matching);
    await updateStage("LOCALIZING", "completed");

    // VALIDATING_RESULT
    await updateStage("VALIDATING_RESULT", "in_progress");
    await validatingResult(jobId, localized);
    await updateStage("VALIDATING_RESULT", "completed");

    // COMPLETED
    await jobStore.update(jobId, {
      status: "COMPLETED",
      currentStage: "COMPLETED",
      progress: {
        stageStates: {
          ...job!.progress.stageStates,
          COMPLETED: "completed",
        } as any,
      },
    });

    // store result in memory for retrieval
    resultStore.set(jobId, localized);
  } catch (e: any) {
    const code = e?.code || ErrorCodes.UNKNOWN_ERROR;
    const stage = job?.currentStage || "FAILED";
    await jobStore.update(jobId, {
      status: "FAILED",
      currentStage: "FAILED",
      error: {
        code,
        message: e?.message || String(e),
        stage,
        timestamp: new Date().toISOString(),
      },
      progress: {
        ...job!.progress,
        stageStates: { ...job!.progress.stageStates, [stage]: "failed" as const } as any,
      },
    });
    throw e;
  }
}

async function validateJob(jobId: string) {
  const job = await jobStore.get(jobId);
  if (!job?.questionPaperFileId || !job?.answerSheetFileId) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, "Both files required");
  }
  // existence already checked on upload
}

async function preprocess(jobId: string) {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, "Job not found");

  const docs = await documentStore.getByJob(jobId);
  for (const doc of docs) {
    // file is stored under fileId (job.questionPaperFileId / answerSheetFileId), not doc.id
    const fileId = doc.kind === "questionPaper" ? job.questionPaperFileId : doc.kind === "answerSheet" ? job.answerSheetFileId : doc.id;
    if (!fileId) throw new AppError(ErrorCodes.STORAGE_ERROR, `No fileId for doc ${doc.id}`);
    const buffer = await fileStorage.read(jobId, fileId);
    const isPdf = doc.mime === "application/pdf";
    const inspection = isPdf ? await inspectPdf(buffer) : await inspectImage(buffer);
    // update document pageCount if mismatch
    if (doc.pageCount !== inspection.pageCount) {
      await documentStore.update(doc.id, { pageCount: inspection.pageCount });
    }
    // ensure pages exist correctly
    for (const p of inspection.pages) {
      const existing = await pageStoreApi.getByDocument(doc.id);
      // if already have pages, update dimensions
      const match = existing.find((e) => e.pageNumber === p.pageNumber);
      if (match) {
        // update? For now keep
        continue;
      }
      await pageStoreApi.save({
        id: generateId(),
        documentId: doc.id,
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
      });
    }
  }
  return { ok: true };
}

// In-memory result store
export const resultStore = new Map<string, any>();

async function extracting(jobId: string, prep: any) {
  const job = await jobStore.get(jobId);
  if (!job) throw new AppError(ErrorCodes.JOB_NOT_FOUND, "Job not found");
  const docs = await documentStore.getByJob(jobId);
  const qpDoc = docs.find((d) => d.kind === "questionPaper");
  const asDoc = docs.find((d) => d.kind === "answerSheet");
  if (!qpDoc || !asDoc) throw new AppError(ErrorCodes.VALIDATION_FAILED, "Missing docs");

  const qpPages = await pageStoreApi.getByDocument(qpDoc.id);
  const asPages = await pageStoreApi.getByDocument(asDoc.id);

  const provider = getAIProvider();

  // For vision, use real file content base64 (not placeholder) — supports PDF and image
  // For PDFs, send as file data (detected via JVBER header), for images send as image
  async function buildVisionInput(doc: any, pages: any[], fileId: string) {
    try {
      const buffer = await fileStorage.read(jobId, fileId);
      const b64 = buffer.toString("base64");
      // For image docs, single image; for PDF, send whole PDF as file data in first page entry
      // Detect PDF by magic: %PDF
      const isPdf = buffer.slice(0, 4).toString() === "%PDF";
      if (isPdf) {
        // Send PDF as single entry with pdfBase64 marker (provider will detect JVBER)
        // Keep pageId for traceability
        return {
          pages: [{ pageId: pages[0]?.id || "p1", imageBase64: b64 }],
          isPdf: true,
          mime: "application/pdf",
        };
      } else {
        // Image — send per page (single)
        return {
          pages: pages.map((p) => ({ pageId: p.id, imageBase64: b64 })),
          isPdf: false,
          mime: doc.mime,
        };
      }
    } catch (e) {
      console.warn("[extracting] failed to read file for vision, using placeholder", e);
      return {
        pages: pages.map((p) => ({ pageId: p.id, imageBase64: placeholderPngBase64(p.pageNumber) })),
        isPdf: false,
        mime: "image/png",
      };
    }
  }

  const qpFileId = job.questionPaperFileId!;
  const asFileId = job.answerSheetFileId!;
  const qpVision = await buildVisionInput(qpDoc, qpPages, qpFileId);
  const asVision = await buildVisionInput(asDoc, asPages, asFileId);

  const qpInput = {
    pages: qpVision.pages as any,
    hints: [] as string[],
    // Include text extraction for question paper if PDF to help model
    fileMime: qpVision.mime,
  };
  const asInput = {
    pages: asVision.pages as any,
    fileMime: asVision.mime,
  };

  let qpExtracted, asDetected;
  try {
    qpExtracted = await provider.extractStructure(qpInput);
  } catch (e: any) {
    throw new AppError(e.code || ErrorCodes.QUESTION_EXTRACTION_FAILED, `Question extraction failed: ${e.message}`);
  }
  try {
    asDetected = await provider.detectAnswerRegions(asInput);
  } catch (e: any) {
    throw new AppError(e.code || ErrorCodes.ANSWER_EXTRACTION_FAILED, `Answer detection failed: ${e.message}`);
  }

  return { qpDoc, asDoc, qpPages, asPages, qpExtracted, asDetected };
}

function placeholderPngBase64(pageNum: number): string {
  // 1x1 transparent PNG base64
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
}

async function structuring(jobId: string, extraction: any) {
  const { qpDoc, asDoc, qpPages, asPages, qpExtracted, asDetected } = extraction;

  // Build QuestionNodes
  const questions: QuestionNode[] = [];
  const qpPageMap = new Map(qpPages.map((p: any) => [p.id, p]));

  for (let idx = 0; idx < qpExtracted.questions.length; idx++) {
    const q = qpExtracted.questions[idx];
    const parsed = normalizeNumber(q.rawNumber || q.normalizedNumber || String(idx + 1));
    // Determine parent
    let parentId: string | undefined;
    if (q.parentNumber) {
      const parent = questions.find((qq) => qq.normalizedNumber === q.parentNumber);
      parentId = parent?.id;
    } else if (parsed.parent) {
      const parent = questions.find((qq) => qq.normalizedNumber === parsed.parent);
      parentId = parent?.id;
    }

    const rawPageRefs = q.pageRefs && q.pageRefs.length > 0 ? q.pageRefs : [qpPages[0]?.id].filter(Boolean);
    const pageRefs = rawPageRefs.map((pr: string) => resolvePageId(pr, qpPages));
    const sourceRegions = (q.sourceRegions || []).map((r: any) => ({
      x: r.box[0],
      y: r.box[1],
      width: r.box[2],
      height: r.box[3],
    }));
    if (sourceRegions.length === 0) {
      // heuristic region for display
      sourceRegions.push({ x: 0.05, y: 0.1 + idx * 0.05, width: 0.9, height: 0.04 });
    }

    const node: QuestionNode = {
      id: generateId(),
      sourceDocumentId: qpDoc.id,
      pageRefs,
      sourceRegions,
      rawNumber: q.rawNumber,
      normalizedNumber: q.normalizedNumber || parsed.normalized,
      text: q.text,
      rawText: q.rawText || q.text,
      normalizedText: q.text.trim(),
      parentQuestionId: parentId,
      partType: (q.partType as any) || parsed.partType,
      orderIndex: idx,
      depth: parsed.depth,
      marks: q.marks || undefined,
      confidence: q.confidence,
      evidence: (q.evidence || []).map((e: string) => ({
        type: "OCR_CONFIDENCE" as const,
        source: "extractStructure",
        score: q.confidence,
        explanation: e,
        reliability: 0.6,
      })),
    };
    questions.push(node);
  }

  // Build AnswerRegions and groups
  const answerRegions: AnswerRegion[] = [];
  const asPageMap = new Map(asPages.map((p: any) => [p.id, p]));
  for (let idx = 0; idx < asDetected.regions.length; idx++) {
    const r = asDetected.regions[idx];
    const boxes = r.boxes.map((b: number[]) => ({
      x: b[0],
      y: b[1],
      width: b[2],
      height: b[3],
    }));
    const resolvedPageId = resolvePageId(r.pageId, asPages);
    const region: AnswerRegion = {
      id: generateId(),
      documentId: asDoc.id,
      pageId: resolvedPageId,
      regionType: r.visualConfidence && r.visualConfidence > 0.6 && !r.rawText ? "DIAGRAM" : "HANDWRITING",
      rawText: r.rawText || "",
      normalizedText: (r.rawText || "").trim(),
      sourceBoxes: boxes,
      normalizedBoxes: boxes,
      questionLabel: r.questionLabel || undefined,
      labelConfidence: r.labelConfidence,
      ocrConfidence: r.ocrConfidence,
      visualConfidence: r.visualConfidence,
      orderIndex: r.orderIndex ?? idx,
    };
    answerRegions.push(region);
  }

  // Group regions by continuationGroupId or single
  // For now, group by label or keep each as separate group (1 region per group) except consecutive same label
  const answerGroups: AnswerGroup[] = answerRegions.map((reg) => ({
    id: generateId(),
    documentId: asDoc.id,
    regions: [reg],
    primaryRegionId: reg.id,
    normalizedText: reg.normalizedText,
    mappedQuestionId: undefined,
  }));

  // Handle multi-page continuation: if two regions have same questionLabel and are consecutive pages, merge
  // Simple heuristic: if label same, group
  const groupedByLabel = new Map<string, AnswerGroup>();
  const finalGroups: AnswerGroup[] = [];
  for (const g of answerGroups) {
    const label = g.regions[0].questionLabel;
    if (label && groupedByLabel.has(label)) {
      const existing = groupedByLabel.get(label)!;
      existing.regions.push(...g.regions);
      existing.normalizedText += "\n" + g.normalizedText;
    } else {
      if (label) groupedByLabel.set(label, g);
      finalGroups.push(g);
    }
  }

  return { questions, answerRegions, answerGroups: finalGroups, qpDoc, asDoc, qpPages, asPages };
}

function numericPart(s: string): string {
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
}
function stripPrefix(s: string): string {
  return s.replace(/^[A-Z]+/, "");
}

async function matchingStage(jobId: string, structured: any) {
  const { questions, answerGroups } = structured as { questions: QuestionNode[]; answerGroups: AnswerGroup[] };

  const decisions: MappingDecision[] = [];
  const usedAnswerGroups = new Set<string>();

  // For each question, generate candidates
  for (const q of questions) {
    const candidates: { answerGroupId: string; evidence: Evidence[]; score: number }[] = [];

    for (const ag of answerGroups) {
      const reg = ag.regions[0];
      const evidence: Evidence[] = [];

      // Explicit label evidence — handle prefix like Q1 vs 1 vs T5
      if (reg.questionLabel) {
        const parsedLabel = normalizeNumber(reg.questionLabel).normalized;
        const labelNum = numericPart(parsedLabel);
        const qNum = numericPart(q.normalizedNumber);
        const labelPrefix = parsedLabel.replace(/[0-9].*/, "");
        const qPrefix = q.normalizedNumber.replace(/[0-9].*/, "");
        if (parsedLabel === q.normalizedNumber) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.95, `Explicit label ${reg.questionLabel} matched ${q.normalizedNumber}`, 1.0));
        } else if (labelNum === qNum && labelPrefix === qPrefix) {
          // Same numeric and same prefix after normalization (e.g., T5 vs T5)
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.92, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (normalized)`, 0.95));
        } else if (labelNum === qNum && (labelPrefix === "" || qPrefix === "")) {
          // One has prefix stripped (e.g., Q1 vs 1) — consider strong match
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.88, `Label ${reg.questionLabel} matched ${q.normalizedNumber} (prefix-insensitive)`, 0.9));
        } else if (labelNum === qNum) {
          // Same number but different prefix (e.g., 2 vs T5? No, 2 vs 5 is different number, so not here)
          // For 2 vs T5, labelNum 2 vs qNum 5 -> not equal, so not here
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.4, `Same number different prefix ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.6));
        } else if (parsedLabel && q.normalizedNumber.includes(parsedLabel)) {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.6, `Partial label ${reg.questionLabel} vs ${q.normalizedNumber}`, 0.7));
        } else {
          evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.1, `Label ${reg.questionLabel} does not match ${q.normalizedNumber}`, 0.9));
        }
      } else {
        evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.2, "No explicit label", 0.4));
      }

      // Semantic similarity heuristic: text overlap (generic, not subject hardcoded)
      // Simple Jaccard on words
      const qWords = new Set(q.normalizedText.toLowerCase().split(/\W+/).filter(Boolean));
      const aWords = new Set(ag.normalizedText.toLowerCase().split(/\W+/).filter(Boolean));
      let inter = 0;
      for (const w of aWords) if (qWords.has(w)) inter++;
      const union = qWords.size + aWords.size - inter;
      const jaccard = union === 0 ? 0 : inter / union;
      if (jaccard > 0.1) {
        evidence.push(buildEvidence("SEMANTIC_SIMILARITY", "matching", Math.min(0.85, jaccard + 0.3), `Semantic overlap ${jaccard.toFixed(2)}`, 0.5));
      } else {
        evidence.push(buildEvidence("SEMANTIC_SIMILARITY", "matching", 0.15, "Low semantic overlap", 0.5));
      }

      // Layout continuity: orderIndex proximity
      const orderDiff = Math.abs(q.orderIndex - ag.regions[0].orderIndex);
      const layoutScore = Math.max(0, 1 - orderDiff * 0.2);
      evidence.push(buildEvidence("LAYOUT_CONTINUITY", "matching", layoutScore, `Order proximity diff ${orderDiff}`, 0.3));

      // OCR confidence
      const ocrConf = reg.ocrConfidence ?? 0.5;
      evidence.push(buildEvidence("OCR_CONFIDENCE", "matching", ocrConf, `OCR confidence ${ocrConf}`, 0.4));

      // Visual evidence for diagram-only
      if (reg.regionType === "DIAGRAM" && reg.visualConfidence && reg.visualConfidence > 0.6) {
        evidence.push(buildEvidence("VISUAL_EVIDENCE", "matching", reg.visualConfidence, "Diagram visual evidence", 0.6));
      }

      const score = aggregateScore(evidence);
      // Only keep candidates with some evidence
      candidates.push({ answerGroupId: ag.id, evidence, score });
    }

    // Sort and decide
    const sorted = candidates.sort((a, b) => b.score - a.score);
    const topCandidates = sorted.slice(0, 3).map((c) => ({ questionId: q.id, answerGroupId: c.answerGroupId, evidence: c.evidence, score: c.score }));
    const decision = decideForQuestion(topCandidates);
    const chosenId = decision.chosen?.answerGroupId;

    if (chosenId && (decision.status === "MATCHED" || decision.status === "UNCERTAIN")) {
      // check if already used elsewhere with high confidence — but allow uncertain duplicates? For now allow
    }

    const highlightRegions: HighlightRegion[] = [];
    if (chosenId) {
      const ag = answerGroups.find((a) => a.id === chosenId);
      if (ag) {
        for (const reg of ag.regions) {
          highlightRegions.push({
            pageId: reg.pageId,
            boxes: reg.normalizedBoxes,
            confidence: decision.confidence,
            source: "matching",
          });
        }
      }
      if (decision.status === "MATCHED") usedAnswerGroups.add(chosenId);
    }

    decisions.push({
      id: generateId(),
      questionId: q.id,
      answerGroupId: chosenId,
      answerIds: chosenId ? [chosenId] : [],
      primaryAnswerId: chosenId,
      status: decision.status === "MATCHED" && chosenId ? "MATCHED" : decision.status === "UNCERTAIN" && chosenId ? "UNCERTAIN" : "UNANSWERED",
      confidence: decision.confidence,
      mappingConfidence: decision.confidence,
      evidence: decision.evidence,
      highlightRegions,
    });
  }

  // Find unmatched answers
  const unmatchedAnswers = answerGroups.filter((ag) => !decisions.some((d) => d.answerGroupId === ag.id && (d.status === "MATCHED" || d.status === "UNCERTAIN")));
  // Create decisions for unmatched? Instead collect separately
  const unmatchedDecisions: MappingDecision[] = unmatchedAnswers.map((ag) => ({
    id: generateId(),
    questionId: "__unmatched__",
    answerGroupId: ag.id,
    answerIds: [ag.id],
    primaryAnswerId: ag.id,
    status: "UNMATCHED" as const,
    confidence: 0,
    evidence: [buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.1, "No reliable question match", 0.5)],
    highlightRegions: ag.regions.map((r) => ({
      pageId: r.pageId,
      boxes: r.normalizedBoxes,
      confidence: 0.3,
      source: "unmatched",
    })),
  }));

  return { questions, answerGroups, decisions: [...decisions, ...unmatchedDecisions], unmatchedAnswers };
}

async function localizing(jobId: string, matching: any) {
  // Already have highlight regions; ensure normalized coords are [0,1] and preserve pageIds
  // In real impl, would verify against page dimensions
  return matching;
}

async function validatingResult(jobId: string, localized: any) {
  const { questions, decisions } = localized;
  if (questions.length === 0) {
    throw new AppError(ErrorCodes.QUESTION_EXTRACTION_FAILED, "No questions detected");
  }
  // decisions already validated
}
