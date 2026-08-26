import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612,792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y=750;
  const draw = (text: string, indent=0) => {
    page.drawText(text, {x:50+indent,y,size:11,font, color: rgb(0,0,0)});
    y-=20;
    if (y<50) { y=750; pdfDoc.addPage([612,792]); }
  };
  draw('Question Paper - Combined',0);
  y-=10;
  draw('Q1. What is photosynthesis? Explain (5 marks)',0);
  draw('Q2. Solve x^2 -5x+6=0 (5 marks)',0);
  draw('Q2(a) Find roots',20);
  draw('Q3. Define Depositories Act 1996 (5 marks)',0);
  draw('Q4. Write short note on ... (5 marks)',0);
  y-=10;
  draw('Section T',0);
  draw('T1. Explain ... (5 marks)',0);
  draw('T2. Explain ... (5 marks)',0);
  draw('T3. Explain ... (5 marks)',0);
  draw('T4. Explain ... (5 marks)',0);
  draw('T5. Explain ... (5 marks)',0);
  const bytes = await pdfDoc.save();
  fs.writeFileSync('C:/Users/Dell/AppData/Local/Temp/full-question-paper.pdf', bytes);
  console.log('wrote full question', bytes.length);

  const pdfDoc2 = await PDFDocument.create();
  const p2 = pdfDoc2.addPage([612,792]);
  const f2 = await pdfDoc2.embedFont(StandardFonts.Helvetica);
  let y2=750;
  const draw2 = (t:string)=>{ p2.drawText(t,{x:50,y:y2,size:11,font:f2}); y2-=25; };
  draw2('Answer Sheet');
  draw2('Q1. Photosynthesis is ...');
  draw2('Q2. Roots are 2 and 3');
  draw2('Q2(a) x=2, x=3');
  draw2('Q3. Depositories Act is ...');
  draw2('Q4. Short note ...');
  draw2('T1. Answer for T1 ...');
  draw2('T2. Answer for T2 ...');
  draw2('T3. Answer for T3 ...');
  draw2('T4. Answer for T4 ...');
  draw2('T5. Answer for T5 is final answer with some semantic content about photosynthesis and depositories');
  const bytes2 = await pdfDoc2.save();
  fs.writeFileSync('C:/Users/Dell/AppData/Local/Temp/full-answer-sheet.pdf', bytes2);
  console.log('wrote full answer', bytes2.length);
}
main();
