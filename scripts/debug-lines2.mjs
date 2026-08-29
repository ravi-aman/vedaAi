import fs from 'fs';
const data = JSON.parse(fs.readFileSync('C:/Users/Dell/AppData/Local/Temp/veda-ai/f064702a-2364-49d8-b500-a2aa5b86fad9/debug/questionPaper-textract.json','utf8'));
for(const pg of data.pages.slice(0,1)){
  console.log('PAGE',pg.pageNumber);
  for(const l of pg.lines){
    console.log(JSON.stringify(l.text), 'x',l.boundingBox.x.toFixed(3), 'y',l.boundingBox.y.toFixed(3));
  }
}
