import fs from 'fs';
const data = JSON.parse(fs.readFileSync('C:/Users/Dell/AppData/Local/Temp/veda-ai/f064702a-2364-49d8-b500-a2aa5b86fad9/debug/questionPaper-textract.json','utf8'));
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
for(const pg of data.pages){
  const txt=pg.text||"";
  let count=0;
  for(const re of INSTRUCTION_PHRASES) if(re.test(txt)) count++;
  if(/General Instructions/i.test(txt)) count+=2;
  if(/Please check that this question paper contains/i.test(txt)) count+=2;
  console.log('page',pg.pageNumber,'count',count,'flag',count>=2,'textSnippet',txt.slice(0,80).replace(/\n/g,'|'));
}
