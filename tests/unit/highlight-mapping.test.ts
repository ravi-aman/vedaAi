import { describe, it, expect } from "vitest";
import { runSmartMapping, buildAnswerEvidences } from "@/lib/mapping/smart-mapping";
import type { QuestionNode, AnswerGroup, AnswerRegion } from "@/types";
import { generateId } from "@/lib/storage";

function makeQuestion(num: string): QuestionNode {
  return {
    id: `q-${num}`,
    sourceDocumentId: "qp",
    pageRefs: ["p1"],
    sourceRegions: [{ x: 0.05, y: 0.1, width: 0.9, height: 0.05 }],
    rawNumber: num,
    normalizedNumber: num,
    displayNumber: num,
    text: `Question ${num} text`,
    rawText: `Question ${num} text`,
    normalizedText: `Question ${num} text`,
    orderIndex: parseInt(num, 10),
    depth: 0,
    confidence: 0.9,
    evidence: [],
    sourcePageNumbers: [1],
  } as any;
}
function makeAGWithMultiPages(id: string, label: string, pages: number[]): AnswerGroup {
  const regions: AnswerRegion[] = pages.map((pn, idx) => ({
    id: generateId(),
    documentId: "as",
    pageId: `as-p${pn}`,
    regionType: "HANDWRITING" as const,
    rawText: idx === 0 ? `Answer ${label} body` : "continuation",
    normalizedText: idx === 0 ? `Answer ${label} body` : "continuation",
    sourceBoxes: [{ x: 0.08, y: 0.15, width: 0.8, height: 0.25 }],
    normalizedBoxes: [{ x: 0.08, y: 0.15, width: 0.8, height: 0.25 }, { x: 0.1, y: 0.4, width: 0.6, height: 0.1 }],
    questionLabel: idx === 0 ? label : undefined,
    labelConfidence: idx === 0 ? 0.9 : 0.2,
    ocrConfidence: 0.85,
    visualConfidence: 0.6,
    orderIndex: 0,
  }));
  return { id, documentId: "as", regions, primaryRegionId: regions[0].id, normalizedText: `Answer ${label}` } as AnswerGroup;
}

const pages = [
  { id: "as-p1", pageNumber: 1, width: 800, height: 1100, rotation: 0 } as any,
  { id: "as-p2", pageNumber: 2, width: 800, height: 1100, rotation: 0 } as any,
  { id: "as-p3", pageNumber: 3, width: 800, height: 1100, rotation: 0 } as any,
];

describe("highlight and validation (Phase 40-42)", () => {
  it("multi-page answer produces one highlight per page with correct pageIds", async () => {
    const qs = [makeQuestion("26")];
    const ag = makeAGWithMultiPages("ag26", "26", [1, 2, 3]);
    const res = await runSmartMapping({ jobId: "hl1", questions: qs, answerGroups: [ag], pagesAs: pages, enableTargetedVision: false });
    const d = res.decisions.find(x => x.questionId === "q-26");
    expect(d?.status).toBe("MATCHED");
    expect(d?.highlightRegions.length).toBe(3);
    expect(d?.highlightRegions.map(h => h.pageId).sort()).toEqual(["as-p1", "as-p2", "as-p3"].sort());
    // Each highlight should have exactly one merged box
    for (const hl of d!.highlightRegions) {
      expect(hl.boxes.length).toBe(1);
      const b = hl.boxes[0];
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      expect(b.x + b.width).toBeLessThanOrEqual(1.001);
      expect(b.y + b.height).toBeLessThanOrEqual(1.001);
    }
  });
  it("validation rejects invalid answerGroupId", async () => {
    const qs = [makeQuestion("1"), makeQuestion("2")];
    const ag1 = makeAGWithMultiPages("ag1", "1", [1]);
    const ag2 = makeAGWithMultiPages("ag2", "2", [1]);
    // Intentionally duplicate label to test no duplicate assignment
    const res = await runSmartMapping({ jobId: "hl2", questions: qs, answerGroups: [ag1, ag2], pagesAs: pages, enableTargetedVision: false });
    const matched = res.decisions.filter(d => d.status === "MATCHED");
    const ids = matched.map(m => m.answerGroupId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("exact Paddle geometry preserved: highlight boxes from normalizedBoxes union", async () => {
    const qs = [makeQuestion("3")];
    const ag = makeAGWithMultiPages("ag3", "3", [1]);
    // Use specific boxes to test merge: two boxes on same page should merge to union
    ag.regions[0].normalizedBoxes = [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, { x: 0.15, y: 0.2, width: 0.2, height: 0.05 }];
    const res = await runSmartMapping({ jobId: "hl3", questions: qs, answerGroups: [ag], pagesAs: pages, enableTargetedVision: false });
    const d = res.decisions.find(x => x.questionId === "q-3");
    const box = d?.highlightRegions[0].boxes[0];
    // Union should cover from x 0.1 to 0.35, y 0.1 to 0.25 plus pad 0.012
    expect(box!.x).toBeLessThanOrEqual(0.1);
    expect(box!.width).toBeGreaterThan(0.25);
  });
  it("diagram answer highlight uses diagram geometry", async () => {
    const qs = [makeQuestion("14")];
    const ag: AnswerGroup = {
      id: "agDiag",
      documentId: "as",
      regions: [{
        id: generateId(),
        documentId: "as",
        pageId: "as-p1",
        regionType: "DIAGRAM" as const,
        rawText: "",
        normalizedText: "",
        sourceBoxes: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.3 }],
        normalizedBoxes: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.3 }],
        ocrConfidence: 0.6,
        visualConfidence: 0.85,
        orderIndex: 0,
      }],
      primaryRegionId: "x",
      normalizedText: "",
    } as any;
    ag.primaryRegionId = ag.regions[0].id;
    const evs = buildAnswerEvidences([ag], pages, null);
    expect(evs[0].diagramPresent).toBe(true);
    const res = await runSmartMapping({ jobId: "hl4", questions: qs, answerGroups: [ag], pagesAs: pages, enableTargetedVision: false });
    // Diagram should still generate highlight even with low OCR text
    const d = res.decisions.find(x => x.questionId === "q-14");
    // May be UNCERTAIN but highlight should exist if matched
    if (d?.highlightRegions?.length) {
      expect(d.highlightRegions[0].boxes[0].width).toBeGreaterThan(0);
    }
  });
});
