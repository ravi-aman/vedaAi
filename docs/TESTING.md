# TESTING.md — VedaAI QA Strategy

## 1. Unit Tests (Vitest)
Location `tests/unit/` — run `npm run test` (vitest). Coverage targets libs with pure functions.

Modules:
- **Numbering normalization** (`tests/unit/numbering.test.ts`): cases `Q 1l (a)→11(a)`, `Question 1.`→`1`, `1(a)(i)` hierarchy, raw preservation.
- **Hierarchy** (`hierarchy.test.ts`): 11→11(a)/11(b), 12→12(a)→i/ii, parentQuestionId links, depth.
- **Reading order** (`readingOrder.test.ts`): single/multi-column via x-clustering, header/footer exclusion.
- **Coordinates** (`coordinates.test.ts`): scale 0.5/1/2, rotation 0/90/180/270, crop, multi-region, multi-page, invertibility.
- **Evidence aggregation** (`evidence.test.ts`): weighted sum, reliability normalization, missing signals.
- **Decision** (`decision.test.ts`): threshold edge, margin <0.15 → UNCERTAIN, topScore<0.5 → UNMATCHED.
- **Answer grouping** (`grouping.test.ts`): continuation detection across pages.
- **Stage transitions** (`jobs.test.ts`): valid graph, invalid transition rejected.

Run:
```bash
npm run typecheck
npm run test         # vitest
```

## 2. Integration Tests
Location `tests/integration/` — use `MockAIProvider` + `MockOcrProvider`.

- **Upload flow**: invalid type, too large, corrupted PDF, MIME via magic bytes.
- **Job lifecycle**: create → upload → start → poll → result; isolation (no global state leak).
- **OCR adapter**: fixture response → normalized boxes.
- **AI adapter**: fixture JSON → Zod validation, malformed retry path.
- **Mapping**: out-of-order, no-number, duplicate, diagram-only (visualEvidence), low-quality scan.
- **Highlight**: normalized → display at 0.5/1/2.
- **Error paths**: model timeout, 429, network fail, pdf render fail — bounded retries, stage FAILED correctly.

Run:
```bash
npm run test -- tests/integration
```

## 3. E2E Browser Tests (Playwright)
Location `tests/e2e/` — run `npm run test:e2e`.

Scenarios:
1. Upload question paper (PDF) + answer sheet (image), Start Mapping disabled until both valid → enabled → click → processing screen appears.
2. Processing state: stage list shows ✓/•/pending, no fake %.
3. Result screen: questions render, answer sheet renders.
4. Click question → PDF navigates to correct page, highlight appears at correct coords (checked via overlay bbox vs expected normalized).
5. Multi-page answer: regions on 2 pages visible.
6. Unanswered question shows “No answer detected”.
7. Unmatched answer in diagnostic section.
8. Uncertain shows “Needs review”.
9. Mobile: header + single active area navigation works.
10. Reload during processing: polling resumes, no corruption.
11. Error UI: corrupted upload shows typed error.

Install & run:
```bash
npx playwright install
npm run test:e2e
```

## 4. Evaluation Fixtures (24 cases §64)

Under `fixtures/` with ground truth outside prod:
```
fixtures/
  sequential/
  out-of-order/
  unanswered/
  11a-11b/
  no-number/
  continuation/
  extra-unmatched/
  ambiguous/
  diagram-only/
  crossed-out/
  low-quality/
  rotated/
  skewed/
  multi-column/
  duplicate-number/
  multi-page-answer/
  multiple-regions/
  ... + groundTruth.json per fixture
```

Each fixture: `input/` (questionPaper.pdf, answerSheet.pdf), `expected/groundTruth.json`:
```json
{
  "questions": [{ "normalizedNumber": "1", "text": "...", "parent": null }],
  "answers": [{ "pageId": "p1", "boxes": [[0.1,0.2,0.8,0.15]] }],
  "mappings": [{ "question": "1", "answerIndex": 0, "status": "MATCHED" }],
  "regions": []
}
```

**Evaluation harness** `scripts/evaluate.ts` computes per-fixture:
- question extraction precision/recall, ordering accuracy, sub-question accuracy
- answer-region detection (IoU)
- mapping accuracy, unmatched/unanswered precision
- localization IoU
- end-to-end correctness

Not reduced to single “% accurate”. Run:
```bash
npm run evaluate   # aggregates metrics
```

## 5. Coordinate Tests (§48)
Dedicated `tests/unit/coordinates.test.ts` covers:
- scale 1.0, 0.5, 2.0
- rotation 0/90/180/270
- cropped OCR regions
- page-size changes
- multiple regions
- multi-page answers

## 6. Performance Tests
Manual measurement via harness logging:
- upload latency
- preprocessing per page
- OCR duration
- model latency
- mapping latency
- total pipeline
- browser PDF render time

Reported in README §23; no premature optimization without profiling.

## 7. Failure / Retry Tests (§69)
Mocks force:
- model timeout → retry then FAILED with MODEL_TIMEOUT
- 429 → backoff retry
- malformed JSON → retry 3× → MODEL_OUTPUT_INVALID
- network failure → retry
- PDF renderer failure → PAGE_RENDER_FAILED, previous stages retained
Assertions: no infinite loop, correct errorCode, UI shows error.

## 8. Deterministic vs Real AI
- Deterministic pipeline tests use `AI_PROVIDER=mock` with fixed fixture responses; no live model required.
- Real AI evaluation runs separately (`AI_PROVIDER=openai`) on subset of fixtures, gated by env `RUN_REAL_AI=1`.

## 9. Blocker Fix Tests (A-T) — 2026-08-29

Added `tests/unit/blocker-fix.test.ts` 20 tests:

- **A-D:** `Ans 1`, `Ans. 1`, `Q1` valid; standalone `1` inside handwriting NOT label; `101` inside answer NOT Q101.
- **F-G:** page number/header NOT answer.
- **H-J:** `Q36(i)/(ii)/(iii)` child of `Q36` via generic roman-dot `i.` without parentheses.
- **K:** MCQ A/B/C/D as options, not questions.
- **L:** `OR` internal choice same parent.
- **M-N:** answer spanning pages same continuation, unrelated page N+1 NOT merged.
- **O-T:** unanswered no fabricated answer, out-of-order correct, no-label REVIEW, rough work separate, crossed-out low confidence, diagram visual evidence.

Plus `tests/e2e/verify-after-fix.spec.ts` for real job `39ac494f` (38 top, 41 cards, PDF canvas, highlight, zoom, resize).

All 89 tests PASS.

## 10. Commands Summary
```bash
npm run typecheck
npm run lint
npm run test              # unit + integration (89 tests)
npm run test:e2e          # playwright (verify-after-fix 1 passed 7s)
npm run build && npm start
npm run evaluate          # fixtures vs ground truth
```
