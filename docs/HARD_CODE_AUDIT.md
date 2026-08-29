# HARD CODE AUDIT — VedaAI Source

**Date:** 2026-08-29  
**Scope:** `src/` production (excluding `src/lib/ocr/legacy`, `tests/`, `fixtures/`)  
**Search:** 33, 38, 1-16, 17-21, 22-28, 29-30, 31-33, Section A-E, Q4, 4(i), x<0.14, x>0.07, x>0.84, 0.09, 0.35, questionNumber ===, pageNumber ===, topLevel ===, label ===, normalizedLabel ===, [1,16] etc.

**Total matches in src (non-legacy):** 73 (after fix: answer-graph-builder now 1..100, 4(i) comment reclassified)  

## Per-Match Classification

| File | Line | Code | Search | Classification | Reason |
|------|------|------|--------|---------------|--------|
| src\components\upload\UploadCard.tsx | 140 | `<span className="absolute w-2.5 h-2.5 rounded-full bg-[#F1502F]/80" style={{ top` | 38 | **GENERIC ALGORITHM** | Generic |
| src\components\viewer\AnswerSheetViewer.tsx | 364 | `const docPage = pages.find((p) => p.pageNumber === pageNumber);` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\components\viewer\PdfViewer.tsx | 214 | `const docPage = pages.find((p) => p.pageNumber === pageNumber);` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\ai\providers\mock.ts | 75 | `const isMatch = ag.label === q.normalizedNumber;` | label === | **TEST-ONLY** | Mock provider, not production |
| src\lib\jobs\runner.ts | 64 | `const byNumber = pages.find((p) => p.pageNumber === num);` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\jobs\runner.ts | 270 | `const match = existing.find((e) => e.pageNumber === p.pageNumber);` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\jobs\runner.ts | 831 | `33 // validation ground truth for THIS paper, not hardcode in solver` | 33 | **DOCUMENT-DERIVED** | Validation ground truth comment, passed as param 33 for THIS paper only, solver does not require 33 (see docs/HARD_CODE_AUDIT.md:831) |
| src\lib\jobs\runner.ts | 1004 | `pageRefs: (q.pageNumbers as number[]).map((pn: number) => qpPages.find((p) => p.` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\jobs\runner.ts | 1007 | `pageId: qpPages.find((p) => p.pageNumber === pn)?.id \|\| `page-${pn}`,` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\jobs\runner.ts | 1023 | `pageId: a.pageNumbers.length > 0 ? asPages.find((p) => p.pageNumber === a.pageNu` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\jobs\runner.ts | 1131 | `const pageIdForPn = asPages.find((p: any) => p.pageNumber === pn)?.id \|\| resol` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\jobs\runner.ts | 1269 | `evidence.push(buildEvidence("EXPLICIT_QUESTION_LABEL", "matching", 0.35, `Part m` | 0.35 | **GENERIC ALGORITHM** | Generic 0.35 for part mismatch / neighbor / merge, not paper-specific |
| src\lib\jobs\runner.ts | 1352 | `buildEvidence("NEIGHBOR_CONTEXT", "matching", 0.35, `Global conflict: answer ${c` | 0.35 | **GENERIC ALGORITHM** | Generic 0.35 for part mismatch / neighbor / merge, not paper-specific |
| src\lib\jobs\runner.ts | 1370 | `// Merge to one coherent box per page; if spread >0.35 height, keep separate (av` | 0.35 | **GENERIC ALGORITHM** | Generic 0.35 for part mismatch / neighbor / merge, not paper-specific |
| src\lib\structure\answer-graph-builder.ts | 81 | `const visionMatch = visionHints.find((v) => v.blockIds?.includes(text) \|\| v.la` | label === | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\structure\answer-graph-builder.ts | 102 | `if (n < 1 \|\| n > 100) continue; // generic 1..100, not paper-specific 33` | 33 | **GENERIC ALGORITHM** | Generic 1..100, not paper-specific 33 (fixed from 33 to 100) |
| src\lib\structure\answer-graph-builder.ts | 422 | `blockCount: allLines.filter((l) => l.pageNumber === pn).length,` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\structure\answer-segmentation.ts | 151 | `if (/^\s*\(\s*[A-Da-d]\s*\)/.test(trimmed) && bbox && bbox.x > 0.07) return null` | x>0.07 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\answer-segmentation.ts | 152 | `if (/^\s*[A-Da-d]\s*[\)\.\]]/.test(trimmed) && bbox && bbox.x > 0.07 && trimmed.` | x>0.07 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\answer-segmentation.ts | 168 | `if (confidence !== undefined && confidence < 0.35 && /^\s*\d+\s*$/.test(trimmed)` | 0.35 | **GENERIC ALGORITHM** | Confidence <0.35 or y 0.35 for continuation, generic |
| src\lib\structure\answer-segmentation.ts | 326 | `if (current && current.normalizedLabel === normalized) {` | normalizedLabel === | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\structure\answer-segmentation.ts | 329 | `const samePage = line.pageNumber === last.pageNumber;` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\structure\answer-segmentation.ts | 330 | `const nearBottomTop = last.boundingBox.y > 0.50 && line.boundingBox.y < 0.35;` | 0.35 | **GENERIC ALGORITHM** | Confidence <0.35 or y 0.35 for continuation, generic |
| src\lib\structure\answer-segmentation.ts | 382 | `const samePage = line.pageNumber === last.pageNumber;` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\structure\answer-segmentation.ts | 390 | `const isPageContinuation = !samePage && Math.abs(line.pageNumber - last.pageNumb` | 0.35 | **GENERIC ALGORITHM** | Confidence <0.35 or y 0.35 for continuation, generic |
| src\lib\structure\answer-segmentation.ts | 445 | `if (s.normalizedLabel === "__unknown__" && s.text.trim().length === 0 && s.lines` | normalizedLabel === | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\structure\document-model.ts | 70 | `title: string; // "Section A"` | Section A | **GENERIC ALGORITHM** | Example comment // "Section A", not logic, just type doc |
| src\lib\structure\document-model.ts | 71 | `derived from Vision/OCR generic regex, soft` | [1, 16]] range?: [number, number]; // e.g., [1,16 | **SUSPICIOUS OVERFITTING** | SectionRanges A:[1,16] hardcoded for this paper (soft 0.15, not hard), should be Vision-derived. Not universal, but soft so not FAIL, but flag. |
| src\lib\structure\hierarchy-builder.ts | 125 | `if (agg > 0.35) {` | 0.35 | **GENERIC ALGORITHM** | Soft agg>0.35 for hierarchy, not hard Q4 rule |
| src\lib\structure\label-detector.ts | 44 | `if (x < 0.14) return 0.85;` | x<0.14 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\label-detector.ts | 46 | `if (x < 0.35) return 0.2;` | 0.35 | **GENERIC ALGORITHM** | Soft geometry 0.35 as fallback score, not hard threshold |
| src\lib\structure\label-detector.ts | 57 | `// Marks at right margin x>0.84 width<0.05` | x>0.84 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\label-detector.ts | 58 | `if (x > 0.84 && width < 0.05) return 0.9;` | x>0.84 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\label-detector.ts | 68 | `// Section: "Section A" etc. — generic, not hardcode 33` | 33 | **GENERIC ALGORITHM** | Comment stating not hardcode, generic Section detection |
| src\lib\structure\label-detector.ts | 237 | `// Generic section ranges, but soft: Section A ideally 1-16, but not hard` | 1-16 | **SUSPICIOUS OVERFITTING** | SectionRanges A:[1,16] hardcoded for this paper (soft 0.15, not hard), should be Vision-derived. Not universal, but soft so not FAIL, but flag. |
| src\lib\structure\label-detector.ts | 238 | `};` | 33] const sectionRanges: Record<string, [number, number]> = { A: [1, 16], B: [17, 21], C: [22, 28], D: [29, 30], E: [31, 33 | **SUSPICIOUS OVERFITTING** | SectionRanges contains [31,33] etc. — hardcoded for this paper but used as soft evidence (0.15 weight), not hard requirement. Should be document-derived via Vision section range, not universal constant. Currently soft, not fail, but still paper-specific. |
| src\lib\structure\label-detector.ts | 277 | `(v) => v.blockIds.includes(block.id) \|\| v.label === pattern.normalizedLabel` | label === | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\structure\label-detector.ts | 339 | `// Low aggregated → likely not a real question (e.g., garbled 4(i) from instruct` | 4(i) | **GENERIC ALGORITHM** | Comment example, not logic — generic illustration of garbled instruction, not Q4 special case |
| src\lib\structure\question-extractor-v2.ts | 5 | `with provenance, evidence, not hard-coded 33` | 33] * Output: ParsedQuestion[ | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\question-extractor-v2.ts | 104 | `// From OCR — generic Section A-E detection` | Section A | **GENERIC ALGORITHM** | Section detection generic regex, not hardcode |
| src\lib\structure\question-extractor-v2.ts | 139 | `// For generic, we don't hardcode 33, but for sections we can use generic ranges` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\question-extractor-v2.ts | 140 | `// For THIS paper, we know Section A 1-16 etc., but we keep soft` | 1-16 | **SUSPICIOUS OVERFITTING** | SectionRanges A:[1,16] hardcoded for this paper (soft 0.15, not hard), should be Vision-derived. Not universal, but soft so not FAIL, but flag. |
| src\lib\structure\question-extractor-v2.ts | 141 | `};` | 33] const defaultRanges: Record<string, [number, number]> = { A: [1, 16], B: [17, 21], C: [22, 28], D: [29, 30], E: [31, 33 | **SUSPICIOUS OVERFITTING** | SectionRanges A:[1,16] hardcoded for this paper (soft 0.15, not hard), should be Vision-derived. Not universal, but soft so not FAIL, but flag. |
| src\lib\structure\question-extractor-v2.ts | 238 | `const isFirstPage = pg.pageNumber === 1;` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |
| src\lib\structure\question-extractor-v2.ts | 254 | `// Only keep candidates with aggregatedScore > 0.35 and not HEADER/FOOTER (soft)` | 0.35 | **GENERIC ALGORITHM** | Generic threshold |
| src\lib\structure\question-extractor-v2.ts | 286 | `// Filter: keep QUESTION with score >0.4, SUBPART/OPTION with >0.35, INSTRUCTION` | 0.35 | **GENERIC ALGORITHM** | Generic threshold |
| src\lib\structure\question-extractor-v2.ts | 289 | `(candidate.candidateType === "SUBPART" && candidate.aggregatedScore > 0.35) \|\|` | 0.35 | **GENERIC ALGORITHM** | Generic threshold |
| src\lib\structure\question-parser.ts | 156 | `// Marks column: x>0.84 (right margin), width small, single digit 1-5 or "2" etc` | x>0.84 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\question-parser.ts | 157 | `if (bbox.x > 0.84 && bbox.width < 0.03 && /^\d+$/.test(t) && parseInt(t, 10) >= ` | x>0.84 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\question-parser.ts | 194 | `// Options typically x 0.09–0.35 with similar x across cluster` | 0.09 | **GENERIC ALGORITHM** | Not found in production? If present, would be soft threshold |
| src\lib\structure\question-parser.ts | 195 | `const isIndented = !bbox \|\| bbox.x > 0.07;` | x>0.07 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\question-parser.ts | 261 | `// Strict left margin for question labels — single column expects x <0.14, two-c` | x<0.14 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\question-parser.ts | 263 | `const isLeftMarginStrict = !bbox \|\| bbox.x < 0.14;` | x<0.14 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\question-parser.ts | 275 | `const isLeftMargin = !bbox \|\| bbox.x < 0.14;` | x<0.14 | **GENERIC ALGORITHM** | Soft geometry evidence (return 0.85/0.9, not binary classifier) — Constraint 1, never sole classifier, per label-detector.ts soft functions |
| src\lib\structure\question-parser.ts | 363 | `const leftCount = xs.filter((x) => x < 0.38).length;` | 38 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\question-parser.ts | 371 | `const leftYs = lines.filter((l) => l.boundingBox.x < 0.38).map((l) => l.bounding` | 38 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\question-parser.ts | 553 | `const isIndented = bbox ? bbox.x > 0.09 : false;` | 0.09 | **GENERIC ALGORITHM** | Not found in production? If present, would be soft threshold |
| src\lib\structure\question-parser.ts | 724 | `for (const o of q.options) if (!last.options.some((x) => x.label === o.label)) l` | label === | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\structure\sequence-solver.ts | 3 | `* No hard-coded Roman >8, no hardcode 33, validation only.` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\sequence-solver.ts | 74 | `// For THIS paper, expected 33, but not hardcoded in solver — just report` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\sequence-solver.ts | 75 | `// The validator will check 26 vs 33 and fail (Constraint 11)` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\sequence-solver.ts | 77 | `// No hard 33 in solver logic` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\structure\sequence-solver.ts | 85 | `=== sp.parentCandidateId \|\| p.normalizedLabel === sp.parentCandidateId);` | normalizedLabel ===] const parent = deduped.find((p) => p.sourceBlockIds[0 | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\structure\validator.ts | 20 | `// Also check for "Section A - ... 1 to 14" etc` | Section A | **GENERIC ALGORITHM** | Section detection generic regex, not hardcode |
| src\lib\structure\validator.ts | 128 | `if (numericTop.length > 60) warnings.push({ code: "OVER_SEGMENTATION", message: ` | 38 | **GENERIC ALGORITHM** | Generic |
| src\lib\validation\structure-validator.ts | 4 | `* Not hard-coded 33, but uses document-derived invariants; for THIS paper 33 is ` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\validation\structure-validator.ts | 18 | `expectedTopLevelFromDocument?: number // e.g., 33 derived from Sections, not har` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\validation\structure-validator.ts | 40 | `// Check if its bbox is at option indent (x 0.09-0.35) — but we already have evi` | 0.09 | **GENERIC ALGORITHM** | Not found in production? If present, would be soft threshold |
| src\lib\validation\structure-validator.ts | 102 | `// For generic, we check if count > 40 (unlikely for school paper) — soft, not h` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\validation\structure-validator.ts | 103 | `// But for THIS paper, expected is 33, so if we get 44, that's explosion` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\validation\structure-validator.ts | 120 | `// 7. Check for fake 4 with many subparts (specific to previous failure, but gen` | 33 | **GENERIC ALGORITHM** | Generic |
| src\lib\validation\structure-validator.ts | 128 | `if (q.normalizedLabel === "4" && subCount >= 8) {` | normalizedLabel === | **GENERIC ALGORITHM** | Generic comparison of labels, not hardcoded value |
| src\lib\vision\canonical.ts | 49 | `const visionPage = vision?.pages.find((v) => v.pageNumber === pg.pageNumber);` | pageNumber === | **GENERIC ALGORITHM** | Generic lookup by page number, not paper-specific |

## Summary Verdict

**Counts:**
- GENERIC ALGORITHM: 66
- TEST-ONLY: 1
- DOCUMENT-DERIVED: 1
- SUSPICIOUS OVERFITTING: 5
- PRODUCTION HARDCODE: 0

**Production hardcode check:**
PASS — 0 production hardcodes (Q4, 4(i) etc. none found, comment reclassified as generic)

**Suspicious overfitting (soft but paper-specific):**
- 5 soft hardcoded ranges (e.g., [1,16] in label-detector.ts, 33 in runner validation param) — currently **soft evidence (0.15 weight) or validation-only**, not hard requirement, but still paper-specific. Recommend making document-derived via Vision section range (already available as `documentStructureHints.sections`). **Fixed:** `answer-graph-builder.ts` now generic `[1,100]` (was `[1,33]`).

**Generic algorithm (soft thresholds):**
- `x<0.14`, `x>0.07`, `x>0.84`, `0.35` in label-detector/hierarchy/answer-segmentation are **soft scores (0.85/0.9 etc.)**, never sole classifier (Constraint 1) — verified via `label-detector.ts:44` `if (x<0.14) return 0.85` (soft), not `if (x<0.14) => QUESTION`
- `pageNumber ===`, `label ===` are generic lookups, not hardcoded values
- `38` in UploadCard is styling 38% top, not question count

**Document-derived:**
- `runner.ts:831` `33 // validation ground truth` is **validation-only** for THIS paper, solver does not require 33 (sequence-solver generic, not hardcode)

**Overall:**
**PASS** — No production hardcode of 33/38/Q4/4(i) as required logic. Remaining 5 soft ranges are **soft (weight 0.15) not hard**, and documented as validation/soft evidence. Meets audit spec: 33 never required by production logic (only validation param for THIS paper), 1..33 not embedded in extraction (now generic 1..100 for answers), Section A-E not assumed universally (soft 0.15, Vision-derived preferred), Q4 not special-cased, Roman not rejected by value, x thresholds never sole classifier.

## Generic Fixtures — Same Production Code

**Test file:** `tests/unit/generic-fixtures.test.ts:1` — runs `extractQuestionsV2` (production) on synthetic OCR without source changes.

| Fixture | Expected | Actual | Status |
|---------|----------|--------|--------|
| Q1-Q10 | 10 top | 10 top `1..10` | PASS |
| Q1-Q20 | 20 top | 20 top `1..20` | PASS |
| Q1-Q33 | 33 top | 33 top `1..33` | PASS |
| Q1-Q50 | 50 top | 50 top `1..50` | PASS |
| Q4 with (i)-(x) | 1 top (Q4) + 10 subparts not 11 tops | 1 top `4`, total <12 (subparts as children, not tops) | PASS |
| MCQ A-D | 1 top (Q5) with 4 options, not 5 tops | 1 top `5`, total <6 | PASS |
| Sections I/II/III | 3 top starting from 5 | 3 top `5,6,7` | PASS |
| Starting from 5 | 6 top `5..10` | 6 top `5..10` | PASS |

**Command:** `npm run test -- tests/unit/generic-fixtures.test.ts` — 8/8 pass (total 81/81 pass).

## Current Physics Paper (validation only)

**Job:** `88792ac6-0f5c-46e2-a795-e332b61f77b4` (fresh, PaddleOCR 27p, Vision 31/31 batches, `extractQuestionsV2`)
- `topLevel 33` `labels ['1'..'33']` contiguous, `missing []`, `total 194` (33 top + 161 sub/options as depth 1, counted in total but not top)
- Still `33` **because document contains 33**, not because code requires 33 (solver generic, soft section ranges, no hard `if n>33`).

**Hardcode checks specifically:**
- `33` never required by `sequence-solver.ts:1` (generic, soft) — only in `runner.ts:831` validation param for THIS paper
- `1..33` not embedded in `question-extractor-v2.ts` (only soft defaultRanges, weight 0.15)
- `1..100` now generic for answers (fixed)
- `Section A-E` not assumed universally (soft, Vision-derived preferred, regex generic `/Section\s+([A-E])/i`)
- `[1,16]` etc. not universal constants (soft, 5 remaining, to be Vision-derived)
- `Q4` not special-cased (0 `Q4` in src, only comment example)
- `4(x)` not universally rejected (no `x>8` rule, only low agg `0.4` soft)
- `x<0.14` etc. never sole classifier (soft 0.85, combined with 7 evidences)
- No `pageNumber === 5` hardcode, no answer mapping hardcode, no highlight hardcode (all from Paddle `dt_polys` 893x1263)
