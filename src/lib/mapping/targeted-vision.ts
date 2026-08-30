/**
 * Targeted Vision Adjudication — bounded, cached, fallback to structural (Phase 22,23,50,52,53,54)
 */
import { getVisionProvider } from "@/lib/vision/factory";
import { getConfig } from "@/lib/config";
import type { QuestionNode, AnswerGroup } from "@/types";

const adjudicationCache = new Map<string, { selectedQuestionId: string; confidence: number; reason: string }>();

export interface AdjudicationInput {
  questionCrops?: Array<{ questionId: string; normalizedNumber: string; text: string }>;
  answerGroup: AnswerGroup;
  candidateQuestionIds: string[];
  ambiguity: string; // e.g., "label conflict" etc.
  jobId: string;
}

export interface AdjudicationResult {
  selectedQuestionId?: string;
  confidence: number;
  reason: string;
  supportingObservations?: string[];
  rejectedCandidates?: string[];
  fromCache: boolean;
}

function cacheKey(jobId: string, answerGroupId: string, candidateIds: string[]): string {
  return `${jobId}:${answerGroupId}:${candidateIds.slice().sort().join(",")}`;
}

export async function adjudicateWithVision(input: AdjudicationInput): Promise<AdjudicationResult | null> {
  const cfg = getConfig() as any;
  const max = cfg.MAPPING_VISION_MAX_ADJUDICATIONS ?? 6;
  // Budget check via simple in-memory counter per job
  const jobCounterKey = `__vision_budget_${input.jobId}`;
  const globalAny: any = globalThis as any;
  if (!globalAny.__visionAdjudicationCount) globalAny.__visionAdjudicationCount = new Map<string, number>();
  const counts: Map<string, number> = globalAny.__visionAdjudicationCount;
  const current = counts.get(input.jobId) || 0;
  if (current >= max) {
    console.log(JSON.stringify({ stage: "MAPPING", event: "vision_budget_exceeded", jobId: input.jobId, max, current }));
    return null;
  }
  const key = cacheKey(input.jobId, input.answerGroup.id, input.candidateQuestionIds);
  if (adjudicationCache.has(key)) {
    const cached = adjudicationCache.get(key)!;
    return { ...cached, fromCache: true };
  }

  const provider = getVisionProvider();
  if (!provider) {
    console.log(JSON.stringify({ stage: "MAPPING", event: "vision_unavailable_for_adjudication", jobId: input.jobId }));
    return null;
  }

  try {
    counts.set(input.jobId, current + 1);
    // Build minimal input for provider's analyzeAmbiguousMapping
    const questions = (input.questionCrops || []).filter((q) => input.candidateQuestionIds.includes(q.questionId)).map((q) => ({ id: q.questionId, normalizedNumber: q.normalizedNumber, text: q.text }));
    const answerGroups = [{ id: input.answerGroup.id, text: input.answerGroup.normalizedText.slice(0, 800), label: (input.answerGroup as any).regions?.[0]?.questionLabel }];
    const result = await provider.analyzeAmbiguousMapping({ questions, answerGroups } as any);
    const mappings: any[] = (result as any).mappings || [];
    const chosen = mappings.find((m) => m.answerGroupId === input.answerGroup.id) || mappings[0];
    if (!chosen || !chosen.questionId) {
      console.warn(JSON.stringify({ stage: "MAPPING", event: "vision_adjudication_no_choice", jobId: input.jobId, answerGroupId: input.answerGroup.id }));
      return null;
    }
    const res: AdjudicationResult = {
      selectedQuestionId: chosen.questionId,
      confidence: chosen.confidence || 0.65,
      reason: chosen.evidence?.[0]?.explanation || "Vision adjudication",
      supportingObservations: chosen.evidence?.map((e: any) => e.explanation) || [],
      rejectedCandidates: input.candidateQuestionIds.filter((id) => id !== chosen.questionId),
      fromCache: false,
    };
    adjudicationCache.set(key, { selectedQuestionId: res.selectedQuestionId!, confidence: res.confidence, reason: res.reason });
    return res;
  } catch (e: any) {
    console.warn(JSON.stringify({ stage: "MAPPING", event: "vision_adjudication_failed", jobId: input.jobId, error: e.message?.slice(0, 200) }));
    // Fallback: do not fabricate, return null so structural evidence is used
    return null;
  }
}

export function clearAdjudicationCache() {
  adjudicationCache.clear();
  const globalAny: any = globalThis as any;
  if (globalAny.__visionAdjudicationCount) globalAny.__visionAdjudicationCount.clear();
}
