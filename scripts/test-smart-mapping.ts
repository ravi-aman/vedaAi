import * as fs from "fs";
import * as path from "path";
import { buildAnswerEvidences, runSmartMapping } from "../src/lib/mapping/smart-mapping";
import type { QuestionNode, AnswerGroup, AnswerRegion } from "../src/types";
import { generateId } from "../src/lib/storage";

// Load real job data from persisted result
async function main() {
  const jobId = "043fa6f4-3468-4492-a785-17724e7a4adc";
  // Load pages meta from artifacts if available, else synthesize
  const agPath = path.join(process.cwd(), `artifacts/${jobId}/answer-debug/answer-graph.json`);
  const qStructPath = path.join(process.cwd(), `artifacts/${jobId}/question-paper-debug/document-structure.json`);
  const agData = JSON.parse(fs.readFileSync(agPath, "utf-8"));
  const qStruct = JSON.parse(fs.readFileSync(qStructPath, "utf-8"));
  const topQsRaw = qStruct.allCandidates.filter((c: any) => c.candidateType === "QUESTION");
  console.log(`Loaded ${topQsRaw.length} top Qs, ${agData.length} AGs`);

  // Build QuestionNodes similar to structuring
  const qNodes: QuestionNode[] = topQsRaw.map((c: any, idx: number) => ({
    id: `Q-${c.normalizedLabel}-${idx}`,
    sourceDocumentId: "qp-doc",
    pageRefs: [`page-${c.pageNumber}`],
    sourceRegions: [c.bbox],
    rawNumber: c.rawLabel,
    normalizedNumber: c.normalizedLabel,
    displayNumber: c.normalizedLabel,
    text: c.rawOCRText || c.normalizedText || `Question ${c.normalizedLabel} placeholder text with some physics content`,
    rawText: c.rawOCRText || c.normalizedText,
    normalizedText: c.normalizedText + " " + (c.rawOCRText || ""),
    orderIndex: idx,
    depth: 0,
    confidence: c.confidence || 0.9,
    evidence: c.evidence || [],
    sourcePageNumbers: [c.pageNumber],
  } as any));

  // Need to load real question text from question-candidates.json if available for better semantic
  const qcPath = path.join(process.cwd(), `artifacts/${jobId}/question-paper-debug/document-structure.json`);
  // For simplicity, enrich Q text with actual longer text if we have it
  // Let's try to load from page artifacts
  // Instead, we will just use rawOCRText which for this paper is short; synthetic semantic will be weak
  // Build AnswerGroups similar to structuring
  const asPages = Array.from({ length: 31 }, (_, i) => ({ id: `as-page-${i + 1}`, pageNumber: i + 1, width: 1263, height: 893, rotation: 0 } as any));
  const agGroups: AnswerGroup[] = agData.map((g: any, idx: number) => {
    const pageNumbers: number[] = g.pageNumbers || [1];
    const regions: AnswerRegion[] = pageNumbers.map((pn: number, rIdx: number) => ({
      id: generateId(),
      documentId: "as-doc",
      pageId: `as-page-${pn}`,
      regionType: "HANDWRITING" as const,
      rawText: rIdx === 0 ? g.text : "",
      normalizedText: rIdx === 0 ? g.text : "",
      sourceBoxes: [{ x: 0.08, y: 0.12, width: 0.82, height: 0.2 }],
      normalizedBoxes: [{ x: 0.08, y: 0.12, width: 0.82, height: 0.2 }],
      questionLabel: g.suspectedQuestion || undefined,
      labelConfidence: g.suspectedQuestion ? 0.9 : 0.2,
      ocrConfidence: g.confidence || 0.75,
      visualConfidence: 0.6,
      orderIndex: g.orderIndex ?? idx,
    }));
    return {
      id: g.id,
      documentId: "as-doc",
      regions,
      primaryRegionId: regions[0].id,
      normalizedText: g.text,
    } as AnswerGroup;
  });

  const evs = buildAnswerEvidences(agGroups, asPages, null);
  console.log(`Built ${evs.length} evidences`);
  for (const ev of evs.slice(0, 5)) {
    console.log(ev.answerGroupId, ev.detectedLabels.map(l=>`${l.finalLabel}(${l.classification}:${l.confidence.toFixed(2)})`).join(","), ev.presentType, ev.answerType, ev.QUESTION_LABEL_DETECTED);
  }

  const result = await runSmartMapping({ jobId: "test-" + jobId, questions: qNodes, answerGroups: agGroups, answerEvidences: evs, visionData: null, pagesAs: asPages, enableTargetedVision: false });
  console.log(`\nDecisions: ${result.decisions.length}`);
  const topDecisions = result.decisions.filter((d) => qNodes.find(q=>q.id===d.questionId));
  for (const d of topDecisions.sort((a,b)=> {
    const qa = qNodes.find(q=>q.id===a.questionId)?.normalizedNumber || "";
    const qb = qNodes.find(q=>q.id===b.questionId)?.normalizedNumber || "";
    return parseInt(qa,10)-parseInt(qb,10);
  })) {
    const qn = qNodes.find(q=>q.id===d.questionId)?.normalizedNumber;
    console.log(`Q${qn} -> ${d.status} ${d.answerGroupId || "none"} conf ${d.confidence?.toFixed(2)} ${d.evidence.slice(0,2).map(e=>e.explanation).join(" | ")}`);
  }
  console.log(`\nMatched: ${result.decisions.filter(d=>d.status==="MATCHED").length}`);
  console.log(`Uncertain: ${result.decisions.filter(d=>d.status==="UNCERTAIN").length}`);
  console.log(`Unanswered: ${result.decisions.filter(d=>d.status==="UNANSWERED").length}`);
  console.log(`Unmatched answers: ${result.unmatchedAnswers.length}`);
  console.log(`Anchors: ${result.anchors.map(a=>a.label).join(",")}`);
}

main().catch(e=>{ console.error(e); process.exit(1);});
