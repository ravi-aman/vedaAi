import { buildAnswerGraphV2 } from "./src/lib/structure/answer-graph-builder.ts";
function makeOcr(pages) {
  return {
    jobId: "test-job",
    documentId: "test-doc",
    kind: "answerSheet",
    provider: "paddleocr",
    providerVersion: "PP-OCRv5",
    operationId: "test-op",
    completedAt: new Date().toISOString(),
    pages: pages.map(pg=>({
      pageNumber: pg.pageNumber,
      text: pg.lines.map(l=>l.text).join("\n"),
      blocks: [],
      lines: pg.lines.map((l,idx)=>({text:l.text,boundingBox:{x:l.x??0.08,y:l.y??0.1+idx*0.06,width:0.3,height:l.h??0.02},confidence:0.9,pageNumber:pg.pageNumber})),
      confidence:0.9,width:1263,height:893,rotation:0
    }))
  };
}
function makePages(n){return Array.from({length:n},(_,i)=>({id:"p"+(i+1),documentId:"d1",pageNumber:i+1,width:1263,height:893,rotation:0}));}

// Simulate structuring fixed logic
function simulateStructuringFixed(segmentedAnswers, asPages) {
  const asDetected = {
    regions: segmentedAnswers.map((a, idx) => {
      const bboxes = a.bboxesByPage instanceof Map ? a.bboxesByPage : new Map(Object.entries(a.bboxesByPage || {}).map(([k,v])=>[parseInt(k),v]));
      // For JSON artifact where bboxesByPage is {}, fallback to pageNumbers
      const hasBBoxes = bboxes.size>0;
      const fallbackPages = hasBBoxes ? [] : (a.pageNumbers||[1]).map(pn=>({pn, boxes:[{x:0.1,y:0.1,width:0.8,height:0.2}]}));
      return {
        pageId: asPages.find(p=>p.pageNumber===a.pageNumbers[0])?.id || asPages[0].id,
        boxes: hasBBoxes ? Array.from(bboxes.values()).flat().map(b=>[b.x,b.y,b.width,b.height]) : fallbackPages.flatMap(f=>f.boxes.map(b=>[b.x,b.y,b.width,b.height])),
        rawText: a.text,
        questionLabel: a.suspectedQuestion,
        labelConfidence: a.suspectedQuestion?0.95:0.2,
        ocrConfidence: a.confidence,
        orderIndex: a.orderIndex,
        _segmented: {...a, bboxesByPage: hasBBoxes ? bboxes : new Map(fallbackPages.map(f=>[f.pn, f.boxes])) },
      };
    })
  };
  // Apply fixed structuring: one group per logical segment
  const answerGroups = [];
  for (let idx=0; idx<asDetected.regions.length; idx++) {
    const r = asDetected.regions[idx];
    const seg = r._segmented;
    const bboxesMap = seg.bboxesByPage instanceof Map ? seg.bboxesByPage : new Map(Object.entries(seg.bboxesByPage||{}));
    const regionsForGroup = [];
    for (const [pnRaw, boxesArr] of bboxesMap.entries()) {
      const pn = parseInt(String(pnRaw));
      const boxes = (boxesArr as any).map((b:any)=>({x:b.x,y:b.y,width:b.width,height:b.height}));
      const pageId = asPages.find(p=>p.pageNumber===pn)?.id || r.pageId;
      regionsForGroup.push({pageId, normalizedBoxes: boxes, questionLabel: r.questionLabel});
    }
    // Fallback if map empty: use pageNumbers
    if (regionsForGroup.length===0) {
      for (const pn of seg.pageNumbers||[1]) {
        const pageId = asPages.find(p=>p.pageNumber===pn)?.id || r.pageId;
        regionsForGroup.push({pageId, normalizedBoxes: [{x:0.1,y:0.1,width:0.8,height:0.2}], questionLabel: r.questionLabel});
      }
    }
    answerGroups.push({id: seg.id || `AG-${idx}`, regions: regionsForGroup, normalizedText: r.rawText});
  }
  return answerGroups;
}

// Test with real data from artifact
import * as fs from "fs";
const data = JSON.parse(fs.readFileSync("artifacts/16160d67-dab4-400f-9041-7c5ce325fcf6/answer-debug/answer-graph.json","utf-8"));
console.log("V2 groups", data.length);
const mockOcr = makeOcr([{pageNumber:1,lines:[{text:"dummy"}]}]); // not needed
const asPages = Array.from({length:31},(_,i)=>({id:`as-p${i+1}`,pageNumber:i+1,width:1263,height:893,rotation:0}));
const simulatedGroups = simulateStructuringFixed(data, asPages);
console.log("Fixed structuring groups", simulatedGroups.length, "expected 23");
console.log("Groups detail:", simulatedGroups.map(g=>[g.id, g.regions.length, g.regions.map(r=>r.pageId.slice(4))]));
console.log("Invariant Y==Z?", data.length===simulatedGroups.length);

// Also test old buggy logic for comparison
function simulateOldBug(segmentedAnswers, asPages){
  const asDetected = {
    regions: segmentedAnswers.map((a, idx) => ({
      pageId: asPages.find(p=>p.pageNumber===a.pageNumbers[0])?.id || asPages[0].id,
      boxes: Array.from(a.bboxesByPage.values()).flat().map(b=>[b.x,b.y,b.width,b.height]),
      rawText: a.text,
      questionLabel: a.suspectedQuestion,
      _segmented: a,
    }))
  };
  const answerRegions = [];
  for (let idx=0; idx<asDetected.regions.length; idx++) {
    const r = asDetected.regions[idx];
    for (const [pn, boxesArr] of r._segmented.bboxesByPage.entries()) {
      answerRegions.push({pageId: asPages.find(p=>p.pageNumber===pn)?.id, questionLabel: r.questionLabel});
    }
  }
  const answerGroupsOld = answerRegions.map(reg=>({regions:[reg]}));
  // groupedByLabel merging
  const grouped = new Map();
  const final = [];
  for (const g of answerGroupsOld){
    const label=g.regions[0].questionLabel;
    if(label && grouped.has(label)){ grouped.get(label).regions.push(...g.regions); } else { if(label) grouped.set(label,g); final.push(g); }
  }
  return final;
}
const oldGroups = simulateOldBug(data, asPages);
console.log("Old buggy groups", oldGroups.length);
