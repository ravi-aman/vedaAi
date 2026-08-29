import * as fs from 'fs';
(async()=>{
  const mupdf: any = await import('mupdf');
  const qpPath = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/94fce398-d5e0-461f-90f5-a02fae3ff468';
  const b = fs.readFileSync(qpPath);
  console.log('buf', b.length);
  const doc = mupdf.Document.openDocument(b, 'application/pdf');
  console.log('pages', doc.countPages());
  const page = doc.loadPage(0);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.5,1.5), mupdf.ColorSpace.DeviceRGB, false, true);
  console.log('pix', pix.getWidth(), pix.getHeight());
  const png = pix.asPNG();
  console.log('png bytes', png.length, png.slice(0,8).toString('hex'));
  fs.mkdirSync('artifacts/test-mupdf', {recursive:true});
  fs.writeFileSync('artifacts/test-mupdf/page-001.png', Buffer.from(png));
  console.log('saved');
})();
