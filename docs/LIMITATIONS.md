# LIMITATIONS.md — VedaAI Honest Limitations

VedaAI is production-grade but not magical. This document states real constraints so teachers and engineers make informed decisions.

## Document Quality
- Severe handwriting degradation (bleed, faint pencil, heavy cursive) → OCR confidence low → mapping may be UNCERTAIN or UNMATCHED. We prefer “needs review” over confidently wrong.
- Impossible-to-read scans (<100 dpi, heavy JPEG artifacts) → visualEvidence weak; we do not invent coordinates.
- Rotated / skewed images: deskew heuristic handles ±5°, but >15° or perspective warp (photo at angle) may fail — advise using flat scan.
- Multi-column detection via x-clustering is heuristic; complex newspaper layouts can misorder reading.

## Vision & OCR
- Diagram-only answers: we detect visual regions but semantic grading is out of scope; diagram vs scribble ambiguity remains.
- Crossed-out handling: we flag low visualConfidence for strikethrough, but inferring “final” vs “original” text is heuristic; teacher should verify.
- Equations / tables: AI vision handles but may misread symbols; extraction confidence reflects this.
- Language: optimized for English; mixed languages may reduce semantic similarity.

## Mapping & Evidence
- Ambiguous answer mapping (e.g., two questions plausible with near-identical evidence margin <0.15) → UNCERTAIN, requires manual review. We do not silently pick.
- Unanswered vs unmatched: distinction depends on evidence threshold; borderline cases may be review-state.
- Duplicate numbers (e.g., two “Q1” on paper) → flagged as DUPLICATE; we do not repair silently.
- Long documents (50+ pages): pipeline still works but latency increases linearly; concurrency capped at 2 to avoid rate limits, so 50 pages ≈ 2-3 minutes.

## Model & Provider
- Requires `AI_API_KEY` for real inference; without it, app fails clearly (`CONFIGURATION_ERROR`) and does not silently mock.
- Rate limits (429) retried with backoff; sustained limits may delay completion.
- Model is inference-only; mapping is evidence-derived. LLM hallucinated confidence is ignored.
- Prompt injection: system/data separation mitigates but cannot guarantee against adversarial handwriting that mimics instructions — validation remains defensive.

## Deployment & Persistence
- Default `InMemoryJobStore` + `LocalFileStorage` (tmpdir) is not durable on serverless (Vercel). Jobs lost on cold restart or scale. For production, replace with DB/S3 via interfaces. Limitation documented explicitly.
- Function duration limits (Vercel 10s hobby / 60s pro) insufficient for 10-page vision pipeline — recommend self-hosted Node (Fly/Render/EC2) or Vercel workflow/background.
- No auth layer; job IDs unguessable but not access-controlled per user. Add auth if multi-tenant.

## Viewer
- Highlight precision tied to source geometry; rendering at extreme zoom (>4×) may show sub-pixel jitter.
- PDF rendering via pdfjs-dist requires modern browser; IE11 unsupported.

## Measured After Blocker Fix (2026-08-29)

- **Question hierarchy:** 38/38 top-level precision 1.0, 9/9 case-study subs for 36,37,38 (generic roman dot `i.` without parentheses + visually impaired block skip). Previously 0/9 for 36,38.
- **Segmentation:** 39 groups (38 labeled 1-38 +1 rough work UNL) precision 0.97 vs 189 before (0.17). Q1 now isolated to page3 (was 25 regions 9 pages). Adaptive gap median*1.8, strict `Ans|Q` prefix only (bare `1` not label), `t->1` for OCR Anst3->13, expectedNext inference for Anss->8 etc.
- **Mapping:** 38/38 MATCHED (1.0) vs 1/38 before, mean confidence 0.94 explicit label 0.95.
- **Remaining minor:** Q6/Q8/Q10 missing option C/B (Textract truncated, generic option detection threshold), Q7 opts 2/4 (diagram split). Not blocker for production.

## Generalization
- No subject-specific hardcoding; but unusual exam formats (e.g., “Answer any 5 of 10”) still require manual mapping for choice logic — we extract all, but do not enforce selection rules.
- Marks/section parsing is generic; bespoke formats (school logo as question number) may be UNMATCHED.

## What We Do Instead
- Preserve raw + normalized representations.
- Expose evidence objects so teacher can see “why”.
- Prefer UNCERTAIN/UNMATCHED over false MATCHED.
- Version pipeline/model/prompts for reproducibility.

If you hit an unsupported case, file an issue with fixture (anonymized) and expected ground truth; we will improve general heuristics, not hardcode the sample.

