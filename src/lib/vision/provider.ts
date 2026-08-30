import { z } from "zod";

/**
 * VisionProvider — parallel to Textract OCR, provides visual understanding
 * not coordinate invention. All outputs are evidence, grounded to Textract geometry downstream.
 */

const KNOWN_REGION_TYPES = [
  "QUESTION",
  "QUESTION_HEADER",
  "SUBPART",
  "OPTION",
  "INSTRUCTION",
  "SECTION_HEADER",
  "HEADER",
  "FOOTER",
  "INTERNAL_CHOICE",
  "DIAGRAM",
  "FIGURE",
  "TABLE",
  "HANDWRITING_BLOCK",
  "CONTINUATION",
  "MARKS",
] as const;

function normalizeRegionType(input: string): typeof KNOWN_REGION_TYPES[number] {
  const up = String(input).toUpperCase().replace(/[\s\-\/]+/g, "_").replace(/[^A-Z_]/g, "");
  if ((KNOWN_REGION_TYPES as readonly string[]).includes(up)) return up as any;
  // Map common variants — generic, not paper-specific
  if (up.includes("QUESTION") && up.includes("HEADER")) return "QUESTION_HEADER";
  if (up === "QUESTION" || up.includes("Q_HEADER")) return "QUESTION";
  if (up.includes("SUBPART") || up === "SUB_QUESTION" || up === "PART") return "SUBPART";
  if (up.includes("INSTRUCT")) return "INSTRUCTION";
  if (up.includes("SECTION")) return "SECTION_HEADER";
  if (up.includes("OPTION") || up === "A" || up === "B" || up === "C" || up === "D") return "OPTION";
  if (up.includes("INTERNAL_CHOICE") || up === "OR" || up.includes("CHOICE")) return "INTERNAL_CHOICE";
  if (up.includes("CONTINUATION") || up.includes("CONTINUED")) return "CONTINUATION";
  if (up.includes("MARK")) return "MARKS";
  if (up.includes("FIGURE") || up.includes("IMAGE") || up.includes("DIAGRAM")) return "DIAGRAM";
  if (up.includes("TABLE")) return "TABLE";
  if (up.includes("HANDWRITING")) return "HANDWRITING_BLOCK";
  if (up.includes("HEADER")) return "HEADER";
  if (up.includes("FOOTER")) return "FOOTER";
  return "INSTRUCTION";
}

export const VisionPageStructureSchema = z.object({
  pageNumber: z.number().int().min(1),
  visualRegions: z.array(
    z.object({
      // Support both "type" and "regionType" (model may return regionType: "title")
      type: z.string().optional(),
      regionType: z.string().optional(),
      description: z.any().optional().transform((val: any) => {
        if (val == null) return "";
        if (Array.isArray(val)) return val.join("\n").slice(0, 1000);
        if (typeof val === "string") return val.slice(0, 1000);
        return String(val).slice(0, 1000);
      }).default(""),
      content: z.any().optional().transform((val: any) => {
        if (val == null) return undefined;
        if (Array.isArray(val)) return val.join("\n").slice(0, 1000);
        if (typeof val === "string") return val.slice(0, 1000);
        return String(val).slice(0, 1000);
      }),
      confidence: z.number().min(0).max(1).default(0.7),
      coarseBox: z.any().optional(),
      bbox: z.any().optional(),
      blockIds: z.array(z.string()).optional().default([]),
      relatedQuestionLabel: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
    }).passthrough().transform((v: any) => {
      // Normalize coarseBox: accept tuple [x,y,w,h] or object {x,y,width,height} or {x,y,w,h}
      let box = v.coarseBox || v.bbox;
      if (box && !Array.isArray(box) && typeof box === 'object') {
        const x = (box as any).x ?? (box as any).left ?? 0;
        const y = (box as any).y ?? (box as any).top ?? 0;
        const w = (box as any).width ?? (box as any).w ?? 0.1;
        const h = (box as any).height ?? (box as any).h ?? 0.1;
        box = [x, y, w, h] as any;
      }
      // If box is array with >4 or absolute px >1, will be normalized downstream; keep as tuple if valid
      if (box && Array.isArray(box) && box.length === 4) {
        // Ensure numbers in 0..1 or absolute -> keep
      } else if (box) {
        box = undefined;
      }
      return {
        type: normalizeRegionType(v.type || v.regionType || v.label || "INSTRUCTION"),
        description: (v.description || v.content || v.text || "").slice(0, 1000),
        confidence: v.confidence ?? 0.7,
        coarseBox: box,
        blockIds: v.blockIds || [],
        relatedQuestionLabel: v.relatedQuestionLabel || v.label,
      };
    })
  ).default([]),
  questionCandidates: z.array(
    z.union([
      z.string().transform((s) => ({ rawLabel: s, textHint: "", confidence: 0.7, visualEvidence: "", blockIds: [] as string[], type: "QUESTION" as const })),
      z.object({
        rawLabel: z.string(),
        label: z.string().optional(),
        textHint: z.string().max(2000).optional().default(""),
        text: z.string().max(2000).optional(),
        confidence: z.number().min(0).max(1).optional().default(0.7),
        visualEvidence: z.string().max(2000).optional().default(""),
        blockIds: z.array(z.string()).optional().default([]),
        type: z.string().optional(),
      }).passthrough().transform((v: any) => ({
        rawLabel: v.rawLabel || v.label || "",
        textHint: v.textHint || v.text || "",
        confidence: v.confidence ?? 0.7,
        visualEvidence: v.visualEvidence || "",
        blockIds: v.blockIds || [],
        type: v.type ? normalizeRegionType(v.type) : "QUESTION",
      })),
      z.object({
        label: z.string(),
        text: z.string().optional(),
        blockIds: z.array(z.string()).optional(),
      }).passthrough().transform((v: any) => ({ rawLabel: v.label || v.rawLabel, textHint: v.text || "", confidence: 0.7, visualEvidence: "", blockIds: v.blockIds || [], type: "QUESTION" as const })),
    ])
  ).default([]),
  answerGroupHints: z.array(
    z.union([
      z.string().transform((s) => ({ labelHint: s, description: "", confidence: 0.7, blockIds: [] as string[] })),
      z.object({
        labelHint: z.string().optional(),
        label: z.string().optional(),
        description: z.string().max(2000).optional().default(""),
        text: z.string().max(2000).optional(),
        confidence: z.number().min(0).max(1).optional().default(0.7),
        isDiagram: z.boolean().optional(),
        isCrossedOut: z.boolean().optional(),
        blockIds: z.array(z.string()).optional().default([]),
      }).passthrough().transform((v: any) => ({
        labelHint: v.labelHint || v.label || "",
        description: v.description || v.text || "",
        confidence: v.confidence ?? 0.7,
        blockIds: v.blockIds || [],
        isDiagram: v.isDiagram,
        isCrossedOut: v.isCrossedOut,
      })),
      z.object({
        label: z.string(),
        text: z.string().optional(),
      }).passthrough().transform((v: any) => ({ labelHint: v.label || v.labelHint || "", description: v.text || v.description || "", confidence: 0.7, blockIds: v.blockIds || [] })),
    ])
  ).default([]),
  documentStructureHints: z.any().optional().default({}),
});

export type VisionPageStructure = z.infer<typeof VisionPageStructureSchema>;

export const VisionDocumentAnalysisSchema = z.object({
  pages: z.array(VisionPageStructureSchema).default([]),
  globalStructure: z.any().optional().default({}),
}).passthrough();

export type VisionDocumentAnalysis = z.infer<typeof VisionDocumentAnalysisSchema>;

export interface VisionAnalyzePageInput {
  pageId: string;
  pageNumber: number;
  imageBase64: string; // real PNG or PDF base64 from source artifact
  mimeType: "image/png" | "image/jpeg" | "application/pdf";
  ocrTokens?: unknown; // optional Textract hint (not concatenated into system prompt as raw text)
  ocrBlocks?: Array<{ id: string; text: string; bbox: [number, number, number, number]; confidence: number }>; // PaddleOCR blocks with IDs (Constraint 6)
  width: number;
  height: number;
}

export interface VisionAnalyzeDocumentInput {
  pages: VisionAnalyzePageInput[];
  hints?: string[];
  ocrTextSample?: string; // truncated, for context only, not concatenated into system prompt
  ocrBlocksByPage?: Record<number, Array<{ id: string; text: string; bbox: [number, number, number, number]; confidence: number }>>; // for blockIds referencing (Constraint 6)
}

export const VISION_PROVIDER_IDS = ["nvidia", "openrouter", "opencode"] as const;
export type VisionProviderId = typeof VISION_PROVIDER_IDS[number];

export type VisionCapabilities = {
  visionInput: boolean;
  structuredOutput: boolean;
  multiImage: boolean;
  imageToText: boolean;
  maxImagesPerRequest: number;
  maxContextTokens?: number;
};

export type VisionPreflightResult = {
  provider: VisionProviderId;
  model: string;
  ok: boolean;
  available: boolean;
  reason?: string;
  latencyMs?: number;
  capabilities?: VisionCapabilities;
};

export interface VisionProvider {
  readonly id: VisionProviderId;
  readonly capabilities: VisionCapabilities;
  preflight(): Promise<VisionPreflightResult>;
  /**
   * Analyze a single page visually — returns semantic structure, not final coordinates
   */
  analyzePage(input: VisionAnalyzePageInput): Promise<VisionPageStructure>;
  /**
   * Analyze whole document structure (question hierarchy interpretation)
   */
  analyzeDocumentStructure(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
  // Generic alias for factory/scheduler
  analyzeDocument?(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
  /**
   * Analyze answer grouping for ambiguous regions
   */
  analyzeAnswerGrouping(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
  /**
   * Analyze ambiguous mapping with visual context
   */
  analyzeAmbiguousMapping(input: { questions: { id: string; normalizedNumber: string; text: string }[]; answerGroups: { id: string; text: string; label?: string }[]; visionEvidence?: VisionDocumentAnalysis }): Promise<{ mappings: unknown[] }>;
}

export const VisionConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["opencode-zen", "mock", "disabled"]),
  model: z.string(),
  maxPages: z.number().int().min(1).max(20),
});

// Normalized provider configs (new) — imported by config module but defined here for single source
export type VisionProviderConfig = {
  id: VisionProviderId;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxConcurrency: number;
};

export type VisionRuntimeConfig = {
  providerOrder: VisionProviderId[];
  autoFallback: boolean;
  globalConcurrency: number;
  batchSize: number;
  timeoutMs: number;
  maxRetries: number;
  maxAdjudications: number;
};
