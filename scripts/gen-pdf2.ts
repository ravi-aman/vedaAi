import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612,792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('Question Paper - Science', {x:50,y:750,size:16,font, color: rgb(0,0,0)});
  page.drawText('Q1. What is photosynthesis? Explain the process. (5 marks)', {x:50,y:700,size:12,font});
  page.drawText('Q2. Solve the equation x^2 - 5x + 6 = 0 (5 marks)', {x:50,y:670,size:12,font});
  page.drawText('Q2(a) Find the roots', {x:70,y:640,size:12,font});
  page.drawText('Q3. Define Depositories Act 1996', {x:50,y:610,size:12,font});
  page.drawText('Q4. Write short note on ...', {x:50,y:580,size:12,font});
  const bytes = await pdfDoc.save();
  const out = path.join(process.cwd(), '..', 'AppData', 'Local', 'Temp', 'question-paper-final.pdf');
  // Use temp path
  const tmp = 'C:/Users/Dell/AppData/Local/Temp/question-paper-final.pdf';
  fs.writeFileSync(tmp, bytes);
  console.log('wrote', tmp, bytes.length);
  // also answer sheet
  const pdfDoc2 = await PDFDocument.create();
  const p2 = pdfDoc2.addPage([612,792]);
  const f2 = await pdfDoc2.embedFont(StandardFonts.Helvetica);
  p2.drawText('Answer Sheet', {x:50,y:750,size:16,font: f2});
  p2.drawText('Q1. Photosynthesis is process by which plants make food using sunlight.', {x:50,y:700,size:11,font: f2});
  p2.drawText('Q2. Roots are 2 and 3', {x:50,y:670,size:11,font: f2});
  p2.drawText('Q2(a) x=2, x=3', {x:50,y:640,size:11,font: f2});
  const bytes2 = await pdfDoc2.save();
  const tmp2 = 'C:/Users/Dell/AppData/Local/Temp/answer-sheet-final.pdf';
  fs.writeFileSync(tmp2, bytes2);
  console.log('wrote', tmp2, bytes2.length);
}
main();
