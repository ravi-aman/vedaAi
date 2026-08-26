import { z } from "zod";
import type { NormalizedBox } from "@/types";

export const QuestionExtractionSchema = z.object({
  questions: z.array(
    z.object({
      rawNumber: z.string(),
      normalizedNumber: z.string(),
      text: z.string(),
      rawText: z.string(),
      pageRefs: z.array(z.string()).optional(),
      sourceRegions: z.array(
        z.object({
          pageId: z.string(),
          box: z.tuple([z.number(), z.number(), z.number(), z.number()]), // x,y,w,h normalized
        })
      ).optional(),
      parentNumber: z.string().optional().nullable(),
      partType: z.enum(["SECTION", "QUESTION", "PART", "SUBPART"]).optional(),
      marks: z.number().optional().nullable(),
      confidence: z.number().min(0).max(1),
      evidence: z.array(z.string()).optional(),
    })
  ),
});

export const AnswerDetectionSchema = z.object({
  regions: z.array(
    z.object({
      pageId: z.string(),
      boxes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
      rawText: z.string().optional().default(""),
      questionLabel: z.string().optional().nullable(),
      labelConfidence: z.number().min(0).max(1).optional(),
      visualConfidence: z.number().min(0).max(1).optional(),
      ocrConfidence: z.number().min(0).max(1).optional(),
      orderIndex: z.number().int().optional(),
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
}

export interface DetectAnswersInput {
  pages: { pageId: string; imageBase64: string; ocrTokens?: unknown }[];
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
