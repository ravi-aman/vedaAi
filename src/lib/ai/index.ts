import { z } from "zod";
import type { NormalizedBox } from "@/types";

export const QuestionExtractionSchema = z.object({
  questions: z.array(
    z.object({
      rawNumber: z.string(),
      normalizedNumber: z.string(),
      text: z.string(),
      rawText: z.string().optional().default(""),
      pageRefs: z.array(z.coerce.string()).optional(),
      sourceRegions: z
        .array(
          z.object({
            pageId: z.coerce.string(),
            box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
          })
        )
        .optional(),
      parentNumber: z.string().optional().nullable(),
      partType: z
        .any()
        .optional()
        .transform((val) => {
          if (typeof val !== "string") return undefined;
          const up = val.trim().toUpperCase();
          if (["SECTION", "QUESTION", "PART", "SUBPART"].includes(up)) return up;
          // fallback: if model returns lowercase or with spaces, default to QUESTION for safety
          return "QUESTION";
        }),
      marks: z.coerce.number().optional().nullable(),
      confidence: z.coerce.number().optional().default(0.85),
      evidence: z
        .any()
        .optional()
        .transform((v) => {
          if (!v) return [];
          if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x?.explanation ? String(x.explanation) : String(x)));
          return [String(v)];
        }),
    })
  ),
});

export const AnswerDetectionSchema = z.object({
  regions: z.array(
    z.object({
      pageId: z.coerce.string(),
      boxes: z.array(z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number(), z.coerce.number()])),
      rawText: z.string().optional().default(""),
      questionLabel: z.string().optional().nullable(),
      labelConfidence: z.coerce.number().min(0).max(1).optional(),
      visualConfidence: z.coerce.number().min(0).max(1).optional(),
      ocrConfidence: z.coerce.number().min(0).max(1).optional(),
      orderIndex: z.coerce.number().int().optional(),
    })
  ),
});

export const MappingSchema = z.object({
  mappings: z.array(
    z.object({
      questionId: z.string(),
      answerGroupId: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["MATCHED", "UNCERTAIN", "UNMATCHED", "UNANSWERED", "PARTIAL", "CONTINUATION", "DUPLICATE", "INVALID"]),
      evidence: z.array(
        z.object({
          type: z.string(),
          explanation: z.string(),
          score: z.number().min(0).max(1).optional(),
        })
      ).optional(),
    })
  ),
});

export interface ExtractStructureInput {
  pages: { pageId: string; imageBase64: string; ocrTokens?: unknown }[];
  hints?: string[];
  fileMime?: string;
}

export interface DetectAnswersInput {
  pages: { pageId: string; imageBase64: string; ocrTokens?: unknown }[];
  fileMime?: string;
}

export interface AmbiguousMappingInput {
  questions: { id: string; normalizedNumber: string; text: string }[];
  answerGroups: { id: string; text: string; label?: string }[];
}

export interface AIProvider {
  extractStructure(input: ExtractStructureInput): Promise<z.infer<typeof QuestionExtractionSchema>>;
  detectAnswerRegions(input: DetectAnswersInput): Promise<z.infer<typeof AnswerDetectionSchema>>;
  analyzeAmbiguousMapping(input: AmbiguousMappingInput): Promise<z.infer<typeof MappingSchema>>;
}
