import fs from 'fs';
const data = JSON.parse(fs.readFileSync('C:/Users/Dell/AppData/Local/Temp/veda-ai/f064702a-2364-49d8-b500-a2aa5b86fad9/debug/questionPaper-textract.json','utf8'));
function isSectionOrInstruction(text){
  const SECTION_RE=/^\s*(?:Section|Part)\s+[A-Z]\b/i;
  const INSTRUCTIONS_RE=/^\s*(?:Instructions|Note|General Instructions)\s*:?/i;
  const INSTRUCTION_PHRASES=[
   /question paper contains/i,
   /All Questions are compulsory/i,
   /divided into.*Sections/i,
   /Question numbers.*are/i,
   /multiple choice/i,
   /Assertion.*Reason/i,
   /There is no overall choice/i,
   /internal choice/i,
   /Draw neat/i,
   /Take π/i,
   /Use of calculators is not allowed/i,
   /Time:\s*3 hours/i,
   /Time allowed/i,
   /For Visually Impaired/i,
   /Please note that the assessment scheme/i,
   /Please check that this question/i,
   /Candidates must write the Code/i,
   /question paper will be distributed/i,
   /students will read the/i,
   /write any answer on the answer/i,
   /P\.T\.O\./i,
   /Answer question numbers.*to/i,
   /Answer should be brief/i,
   /word limit be adhered/i,
   /There is no overall choice/i,
   /separate instructions are given with each section/i,
  ];
  if(SECTION_RE.test(text)) return true;
  if(INSTRUCTIONS_RE.test(text)) return true;
  for(const re of INSTRUCTION_PHRASES) if(re.test(text)) return true;
  return false;
}
const QUESTION_LABEL_RE=/^\s*(?:Q(?:uestion)?\.?\s*)?(\d+[a-z]?\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?|\d+\s*[\.\)]\s*(?:\([a-z]\)\s*)?(?:\([ivx0-9]+\))?)\s*[\.\)\-:\s]*\s*/i;
const STANDALONE_SUBPART_RE=/^\s*\(([a-z]+|[ivx]+|[0-9]+)\)\s*[\.\)\-:\s]*\s*/i;
const STANDALONE_ROMAN_DOT_RE=/^\s*(i{1,3}|iv|v|vi|vii|viii|ix|x)\s*[\.\)]\s*/i;

function isHeader(text,bbox){
  const PAGE_HEADER_FOOTER_RE=/(Page\s*\d+\s*of\s*\d+|^\s*\d+\s*Page\s*\d+|^\s*\d+\s*$)/i;
  const t=text.trim();
  if(PAGE_HEADER_FOOTER_RE.test(t) && t.length<30) return true;
  if(/^\s*Page \d+ of \d+/i.test(t)) return true;
  if(/^P\.T\.O\./i.test(t)) return true;
  if(/^NOTE$/i.test(t) && t.length<10) return true;
  const inHeaderBand= bbox && bbox.y<0.08;
  const inFooterBand= bbox && bbox.y>0.92;
  if(inHeaderBand||inFooterBand){
    if(/^\s*\d+\s*$/.test(t)) return true;
    if(t.length<30){
      if(/^(Code|Roll)\s*No\.?/i.test(t)) return true;
      if(/^SET\s*[-–]/i.test(t)) return true;
      if(/^Series\s*:/i.test(t)) return true;
      if(/^(Maximum Marks|Time)\b/i.test(t)) return true;
      if(/^(CLASS|SAMPLE QUESTION PAPER|SCIENCE|MATHEMATICS)\b/i.test(t) && t.length<35) return true;
    }
    if(inHeaderBand && t.length<18 && /^[\w\s\/\-\.#]+$/.test(t) && /[0-9]/.test(t) && /[A-Z]/.test(t) && t.split(/\s+/).length<=3){
      if(/[\/\\]/.test(t) && /\d/.test(t)) return true;
    }
  }
  if(/Please note that the assessment scheme/i.test(t)) return true;
  if(/Candidates must write the Code/i.test(t)) return true;
  if(/Please check that this question/i.test(t)) return true;
  if(QUESTION_LABEL_RE.test(t) || STANDALONE_SUBPART_RE.test(t)){
  } else {
    if(/^[^\w]*$/.test(t) && t.length<10) return true;
    if(t.length<18 && t.length>=4){
      const nonAlpha=(t.match(/[^a-zA-Z0-9\s]/g)||[]).length;
      const ratio=nonAlpha/t.length;
      if(ratio>0.25 && /\d/.test(t) && !/[a-z]{3,}/i.test(t)) return true;
      if(/^\d{3,5}(\s+[\w\/\-\.]{1,6})?$/.test(t) && t.length<14 && !t.includes("marks")){
        if((bbox && (bbox.y<0.10||bbox.y>0.88||bbox.x>0.7))||ratio>0.15) return true;
      }
    }
  }
  return false;
}

for(const pg of data.pages){
  console.log('=== PAGE',pg.pageNumber,'textLen',pg.text.length,'lines',pg.lines.length,'===');
  for(const l of pg.lines){
    const txt=l.text;
    const bb=l.boundingBox;
    // simple detect
    let flag='';
    if(isHeader(txt,bb)) flag+=' HEADER';
    if(isSectionOrInstruction(txt)) flag+=' INSTR';
    if(QUESTION_LABEL_RE.test(txt)) flag+=' QLABEL';
    if(STANDALONE_SUBPART_RE.test(txt)) flag+=' SUBPART';
    if(STANDALONE_ROMAN_DOT_RE.test(txt)) flag+=' ROMAN';
    // if flag contains QLABEL or SUBPART print
    if(flag.includes('QLABEL')||flag.includes('INSTR')||flag.includes('HEADER')){
      console.log(`  y=${bb.y.toFixed(3)} x=${bb.x.toFixed(3)} w=${bb.width.toFixed(3)} ${JSON.stringify(txt.slice(0,120))} =>${flag}`);
    } else if(txt.length<40 && /^\s*\d/.test(txt)){
      console.log(`  y=${bb.y.toFixed(3)} x=${bb.x.toFixed(3)} w=${bb.width.toFixed(3)} ${JSON.stringify(txt.slice(0,120))} =>${flag} (digit start)`);
    }
  }
}
