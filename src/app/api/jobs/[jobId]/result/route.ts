import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@/lib/storage";
import { resultStore } from "@/lib/jobs/runner";
import type { ProcessingResult, QuestionResult, AnswerResult } from "@/types";
import { getGuestSession, isGraceExpired } from "@/lib/auth/guest";
import { createClient } from "@/lib/supabase/server";
import { getConfig } from "@/lib/config";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await jobStore.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });

  if (job.status !== "COMPLETED") {
    return NextResponse.json({ error: "Job not completed", code: "INVALID_STAGE_TRANSITION", job }, { status: 400 });
  }

  // Access control: guest grace period OR user ownership
  const cfg = getConfig();
  let currentUserId: string | null = null;
  try {
    if (cfg.NEXT_PUBLIC_SUPABASE_URL && cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      const supabase = await createClient().catch(() => null);
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        currentUserId = data.user?.id || null;
      }
    }
    // Fallback for local dev without supabase: check x-test-user-id header (case-insensitive)
    if (!currentUserId) {
      const testUser =
        req.headers.get("x-test-user-id") ||
        req.headers.get("X-Test-User-Id") ||
        req.headers.get("x-test-user") ||
        req.headers.get("X-Test-User");
      if (testUser) currentUserId = testUser;
      else {
        // also check search param for testing
        const url = new URL(req.url);
        const qpUser = url.searchParams.get("test_user");
        if (qpUser) currentUserId = qpUser;
      }
    }
  } catch (e) {
    console.warn("[result] auth check failed", e);
  }
  const guestSessionId = await getGuestSession().catch(() => null);

  // If job is owned by user, allow only that user
  if (job.userId) {
    if (currentUserId !== job.userId) {
      return NextResponse.json({ error: "Access denied", code: "UNAUTHORIZED" }, { status: 403 });
    }
  } else if (job.guestSessionId) {
    // Guest job: check grace period
    const isOwnerGuest = guestSessionId && job.guestSessionId === guestSessionId;
    if (!isOwnerGuest) {
      return NextResponse.json({ error: "Access denied", code: "UNAUTHORIZED" }, { status: 403 });
    }
    if (isGraceExpired(job.createdAt)) {
      // Grace expired → require auth
      if (!currentUserId) {
        return NextResponse.json({ error: "Authentication required", code: "AUTH_REQUIRED", graceExpired: true }, { status: 401 });
      }
      // Even with guest cookie, after grace requires claim
      return NextResponse.json({ error: "Authentication required", code: "AUTH_REQUIRED", graceExpired: true }, { status: 401 });
    }
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
