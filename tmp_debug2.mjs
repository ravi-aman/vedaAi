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
const ocr = makeOcr([{pageNumber:7,lines:[{text:"semiconductor band diagram start",x:0.08,y:0.15},{text:"at bottom of page 7",x:0.08,y:0.78}]},{pageNumber:8,lines:[{text:"continuation on page 8 top",x:0.08,y:0.07},{text:"middle",x:0.08,y:0.2}]},{pageNumber:9,lines:[{text:"final part on page 9",x:0.08,y:0.1}]}]);
const {groups}= buildAnswerGraphV2(ocr, makePages(9), null);
console.log("C groups", groups.length, groups.map(g=>[g.suspectedQuestion,g.pageNumbers,g.text.slice(0,20)]));
const ocr2 = makeOcr([{pageNumber:12,lines:[{text:"Ans 25",x:0.05,y:0.08},{text:"answer 25",x:0.08,y:0.15}]},{pageNumber:14,lines:[{text:"Ans 26",x:0.05,y:0.08},{text:"answer 26",x:0.08,y:0.15}]}]);
const {groups: g2}= buildAnswerGraphV2(ocr2, makePages(14), null);
console.log("F groups", g2.length, g2.map(g=>[g.suspectedQuestion,g.pageNumbers]));
