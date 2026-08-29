import { z } from "zod";

/**
 * VisionProvider — parallel to Textract OCR, provides visual understanding
 * not coordinate invention. All outputs are evidence, grounded to Textract geometry downstream.
 */

const KNOWN_REGION_TYPES = ["QUESTION_HEADER", "INSTRUCTION", "SECTION_HEADER", "OPTION", "MARKS", "FIGURE", "TABLE", "HANDWRITING_BLOCK", "DIAGRAM", "HEADER", "FOOTER"] as const;

function normalizeRegionType(input: string): typeof KNOWN_REGION_TYPES[number] {
  const up = String(input).toUpperCase().replace(/[\s\-\/]+/g, "_").replace(/[^A-Z_]/g, "");
  if ((KNOWN_REGION_TYPES as readonly string[]).includes(up)) return up as any;
  // Map common variants
  if (up.includes("QUESTION")) return "QUESTION_HEADER";
  if (up.includes("INSTRUCT")) return "INSTRUCTION";
  if (up.includes("SECTION")) return "SECTION_HEADER";
  if (up.includes("OPTION") || up === "A" || up === "B" || up === "C" || up === "D") return "OPTION";
  if (up.includes("MARK")) return "MARKS";
  if (up.includes("FIGURE") || up.includes("IMAGE") || up.includes("DIAGRAM")) return "DIAGRAM";
  if (up.includes("TABLE")) return "TABLE";
  if (up.includes("HANDWRITING")) return "HANDWRITING_BLOCK";
  if (up.includes("HEADER")) return "HEADER";
  if (up.includes("FOOTER")) return "FOOTER";
  return "HANDWRITING_BLOCK";
}

export const VisionPageStructureSchema = z.object({
  pageNumber: z.number().int().min(1),
  visualRegions: z.array(
    z.object({
      type: z.string().transform(normalizeRegionType),
      description: z.any().optional().transform((val: any) => {
        if (Array.isArray(val)) return val.join("\n").slice(0, 1000);
        if (typeof val === "string") return val.slice(0, 1000);
        return "";
      }).default(""),
      content: z.any().optional().transform((val: any) => {
        if (Array.isArray(val)) return val.join("\n").slice(0, 1000);
        if (typeof val === "string") return val.slice(0, 1000);
        return undefined;
      }),
      confidence: z.number().min(0).max(1).default(0.7),
      coarseBox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      relatedQuestionLabel: z.string().optional(),
    }).passthrough().transform((v: any) => ({
      type: v.type,
      description: (v.description || v.content || "").slice(0, 1000),
      confidence: v.confidence ?? 0.7,
      coarseBox: v.coarseBox,
      relatedQuestionLabel: v.relatedQuestionLabel,
    }))
  ).default([]),
  questionCandidates: z.array(
    z.union([
      z.string().transform((s) => ({ rawLabel: s, textHint: "", confidence: 0.7, visualEvidence: "" })),
      z.object({
        rawLabel: z.string(),
        textHint: z.string().max(2000).default(""),
        confidence: z.number().min(0).max(1).default(0.7),
        visualEvidence: z.string().max(2000).default(""),
      }),
      z.object({
        label: z.string(),
        text: z.string().optional(),
      }).passthrough().transform((v: any) => ({ rawLabel: v.label || v.rawLabel, textHint: v.text || "", confidence: 0.7, visualEvidence: "" })),
    ])
  ).default([]),
  answerGroupHints: z.array(
    z.union([
      z.string().transform((s) => ({ labelHint: s, description: "", confidence: 0.7 })),
      z.object({
        labelHint: z.string(),
        description: z.string().max(2000).default(""),
        confidence: z.number().min(0).max(1).default(0.7),
        isDiagram: z.boolean().optional(),
        isCrossedOut: z.boolean().optional(),
      }),
      z.object({
        label: z.string(),
        text: z.string().optional(),
      }).passthrough().transform((v: any) => ({ labelHint: v.label || v.labelHint || "", description: v.text || v.description || "", confidence: 0.7 })),
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
  width: number;
  height: number;
}

export interface VisionAnalyzeDocumentInput {
  pages: VisionAnalyzePageInput[];
  hints?: string[];
  ocrTextSample?: string; // truncated, for context only, not concatenated into system prompt
}

export interface VisionProvider {
  /**
   * Analyze a single page visually — returns semantic structure, not final coordinates
   */
  analyzePage(input: VisionAnalyzePageInput): Promise<VisionPageStructure>;
  /**
   * Analyze whole document structure (question hierarchy interpretation)
   */
  analyzeDocumentStructure(input: VisionAnalyzeDocumentInput): Promise<VisionDocumentAnalysis>;
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
