import fs from 'fs';
import { parseQuestionsFromTextract } from '../src/lib/structure/question-parser.ts';
import { validateQuestionStructure } from '../src/lib/structure/validator.ts';
const data = JSON.parse(fs.readFileSync('C:/Users/Dell/AppData/Local/Temp/veda-ai/f064702a-2364-49d8-b500-a2aa5b86fad9/debug/questionPaper-textract.json','utf8'));
const pagesMeta = data.pages.map((pg)=>({id:'page-'+pg.pageNumber, documentId:'d1', pageNumber:pg.pageNumber, width:800, height:1100, rotation:0}));
const parsed = parseQuestionsFromTextract(data, pagesMeta);
console.log('parsed count', parsed.length);
for(const q of parsed) {
  console.log(q.normalizedNumber, JSON.stringify(q.rawNumber), 'depth',q.depth, q.text.slice(0,80).replace(/\n/g,' | '));
}
const v=validateQuestionStructure(parsed);
console.log('valid', v.valid);
console.log(JSON.stringify(v.errors,null,2));
console.log(JSON.stringify(v.warnings,null,2));
