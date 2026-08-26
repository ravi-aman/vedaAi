import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { resultStore } from "@/lib/jobs/runner";
import type { ProcessingResult, QuestionResult, AnswerResult } from "@/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  if (job.status !== "COMPLETED") {
    return NextResponse.json({ error: "Job not completed", code: "INVALID_STAGE_TRANSITION", job }, { status: 400 });
  }

  const result = resultStore.get(jobId);
  if (!result) {
    // try to reconstruct minimal? In real, would fetch from artifact store / DB
    return NextResponse.json({ error: "Result not found (in-memory expired)", code: "STORAGE_ERROR" }, { status: 404 });
  }

  // Build frontend contract
  const { questions, answerGroups, decisions, unmatchedAnswers } = result;
  const questionResults: QuestionResult[] = decisions
    .filter((d: any) => d.questionId !== "__unmatched__")
    .map((d: any) => {
      const q = questions.find((qq: any) => qq.id === d.questionId);
      if (!q) return null;
      return {
        question: q,
        status: d.status,
        answerIds: d.answerIds,
        primaryAnswerId: d.primaryAnswerId,
        mappingConfidence: d.mappingConfidence,
        highlightRegions: d.highlightRegions,
        evidence: d.evidence,
      };
    })
    .filter(Boolean);

  // Also handle questions without decision (should not happen)
  for (const q of questions) {
    if (!questionResults.find((qr) => qr.question.id === q.id)) {
      questionResults.push({
        question: q,
        status: "UNANSWERED",
        answerIds: [],
        highlightRegions: [],
        evidence: [],
      });
    }
  }

  // Sort by orderIndex
  questionResults.sort((a, b) => a.question.orderIndex - b.question.orderIndex);

  const answerResults: AnswerResult[] = answerGroups.map((ag: any) => {
    const decision = decisions.find((d: any) => d.answerGroupId === ag.id && d.questionId !== "__unmatched__");
    return {
      id: ag.id,
      status: decision ? decision.status : "UNMATCHED",
      text: ag.normalizedText,
      regions: ag.regions,
      mappedQuestionId: decision?.questionId,
      confidence: decision?.confidence,
      evidence: decision?.evidence,
    };
  });

  const unansweredQuestions = questionResults.filter((qr) => qr.status === "UNANSWERED").map((qr) => qr.question);

  const processingResult: ProcessingResult = {
    jobId,
    questions,
    answers: answerGroups,
    decisions,
    questionResults,
    answerResults,
    unmatchedAnswers: unmatchedAnswers || [],
    unansweredQuestions,
  };

  return NextResponse.json(processingResult);
}
