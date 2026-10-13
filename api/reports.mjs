import PDFDocument from 'pdfkit';
import yazl from 'yazl';
import {exportJson} from './core.mjs';
import {batchStatus,batchSummary,batchCsv} from './batches.mjs';
function pdfBuffer(report){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({margin:42,size:'A4'});const out=[];
  doc.on('data',x=>out.push(x));doc.on('end',()=>resolve(Buffer.concat(out)));doc.on('error',reject);
  doc.fontSize(20).text('CASEPILOT AI — CASE INVESTIGATION');
  doc.moveDown().fontSize(12).text(report.name||'Case');doc.fontSize(9).text('Case: '+report.id+' | '+report.status);
  doc.moveDown().text('Evidence and findings below are analytical observations pending human review unless explicitly approved.');
  doc.moveDown();
  for(const f of report.findings){
   doc.fontSize(12).text(f.category+' — '+f.title);doc.fontSize(9).text(f.rationale||'No rationale provided');
   doc.text('Policy: '+f.policySectionIds.join(', '));doc.text('Citations: '+f.evidenceSpanIds.join(', '));
   doc.text('Uncertainty: '+f.uncertainty);doc.text('Coaching: '+f.coaching);doc.text('Review status: '+f.status);doc.moveDown();
  }
  doc.addPage().fontSize(15).text('Evidence manifest');doc.moveDown();
  for(const e of report.evidence)doc.fontSize(9).text(e.filename+' | SHA256 '+e.sha256+' | '+e.extractionStatus);
  doc.end();
 });
}
export async function summaryPdf(ctx,id){
 const batch=batchStatus(ctx,id);if(!batch)return null;
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({margin:42});const out=[];
  doc.on('data',x=>out.push(x));doc.on('end',()=>resolve(Buffer.concat(out)));doc.on('error',reject);
  doc.fontSize(21).text('CASEPILOT AI — BATCH SUMMARY');doc.moveDown().fontSize(12).text(batch.name);
  for(const [key,count] of Object.entries(batch.totals))doc.fontSize(10).text(key+': '+count);
  doc.moveDown().fontSize(10).text('Results are local, evidence-linked investigative suggestions, not adjudicated QA outcomes.');
  doc.moveDown();
  for(const row of batch.cases){doc.fontSize(9).text([row.itinerary||row.callId||row.folder,row.agent||'Unknown agent',row.center||'Unknown center',row.status,'Findings '+row.findings].join(' | '))}
  doc.end();
 });
}
export async function reportsZip(ctx,id){
 const batch=batchStatus(ctx,id);if(!batch)return null;
 const zip=new yazl.ZipFile();
 zip.addBuffer(Buffer.from(batchCsv(ctx,id),'utf8'),'batch-results.csv');
 zip.addBuffer(Buffer.from(JSON.stringify(batchSummary(ctx,id),null,2),'utf8'),'batch-summary.json');
 for(const row of batch.cases.filter(c=>c.status==='Completed')){
  const report=exportJson(ctx,row.caseId);
  const safeName=String(row.itinerary||row.callId||row.caseId).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
  const prefix='reports/'+safeName+'-'+row.caseId.slice(0,8);
  zip.addBuffer(Buffer.from(JSON.stringify(report,null,2),'utf8'),prefix+'.json');
  zip.addBuffer(await pdfBuffer(report),prefix+'.pdf');
 }
 zip.end();
 return new Promise((resolve,reject)=>{const parts=[];zip.outputStream.on('data',x=>parts.push(x));zip.outputStream.on('end',()=>resolve(Buffer.concat(parts)));zip.outputStream.on('error',reject)});
}
