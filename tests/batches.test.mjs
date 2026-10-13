import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import {summaryPdf,reportsZip} from '../api/reports.mjs';
import {initialize,getCase} from '../api/core.mjs';
import {importArchive,batchStatus,processBatch,cancelBatch,batchCsv,batchSummary} from '../api/batches.mjs';
const setup=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp-batch-'));const ctx=initialize(dir);return {ctx,close(){ctx.db.close();fs.rmSync(dir,{recursive:true,force:true})}}};
async function zip(entries){
 const z=new yazl.ZipFile();
 for(const [name,body] of Object.entries(entries))z.addBuffer(Buffer.isBuffer(body)?body:Buffer.from(body),name);
 z.end();
 return await new Promise((resolve,reject)=>{const chunks=[];z.outputStream.on('data',x=>chunks.push(x));z.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));z.outputStream.on('error',reject)});
}
function caseEntries(folder,extra={}){
 const basics={
 'BOOKING_DETAILS.txt':'2026-10-12 09:00 Customer requested refund.',
 'COLLECTOR_SOURCE.json':'{"booking":{"authorized":true}}',
 'COMPLETE_CALL_FOR_CHATGPT.txt':'2026-10-12 09:05 Agent discussed refund.',
 'DOCUMENTATION_NOTES.txt':'2026-10-12 09:10 Agent said refund is pending.',
 'metadata.json':JSON.stringify({agent_name:folder,center:'Synthetic Center',itinerary_number:'H'+folder,call_id:'CA'+folder}),
 'TRANSCRIPT.txt':'2026-10-12 09:06 Customer asked about refund.'
 };
 return Object.fromEntries(Object.entries({...basics,...extra}).filter(([,v])=>v!==null).map(([k,v])=>[folder+'/'+k,v]));
}
test('one synthetic case ZIP registers six separate sources',async()=>{const t=setup();try{const b=await zip(caseEntries('A'));const out=await importArchive(t.ctx,{filename:'sample.zip',dataBase64:b.toString('base64')});assert.equal(out.cases,1);assert.equal(out.files,6);const found=batchStatus(t.ctx,out.batchId);assert.equal(found.cases[0].agent,'A');assert.equal(getCase(t.ctx,found.cases[0].caseId).evidence.length,6);assert.ok(getCase(t.ctx,found.cases[0].caseId).spans.every(x=>x.sourceId));}finally{t.close()}});
test('41 folders and 246 source files remain separated and duplicates are idempotent',async()=>{const t=setup();try{const entries=Object.assign({},...Array.from({length:41},(_,i)=>caseEntries('F'+i)));const b=await zip(entries);const a=await importArchive(t.ctx,{dataBase64:b.toString('base64')});assert.equal(a.cases,41);assert.equal(a.files,246);const again=await importArchive(t.ctx,{dataBase64:b.toString('base64')});assert.equal(again.duplicate,true);assert.equal(again.batchId,a.batchId);assert.equal(t.ctx.db.prepare('SELECT count(*) n FROM cases').get().n,41);}finally{t.close()}});
test('missing files and malformed JSON do not mix evidence',async()=>{const t=setup();try{const b=await zip({...caseEntries('A',{'TRANSCRIPT.txt':null,'metadata.json':'{broken'}),...caseEntries('B')});const a=await importArchive(t.ctx,{dataBase64:b.toString('base64')});const r=batchStatus(t.ctx,a.batchId);assert.equal(r.cases.length,2);const first=r.cases.find(x=>x.folder==='A');assert.equal(getCase(t.ctx,first.caseId).evidence.length,5);assert.equal(first.agent,'');assert.equal(getCase(t.ctx,r.cases.find(x=>x.folder==='B').caseId).evidence.length,6);}finally{t.close()}});
test('reject path traversal, disallowed nested ZIP and ZIP bombs without partial import',async()=>{const t=setup();try{for(const entries of [{'A/unexpected.exe':'bad'},{'A/B/TRANSCRIPT.txt':'bad'},{'A/archive.zip':'PK'}]){const b=await zip(entries);await assert.rejects(()=>importArchive(t.ctx,{dataBase64:b.toString('base64')}),/ZIP rejected/)}const bomb=await zip({'A/TRANSCRIPT.txt':'0'.repeat(200000)});await assert.rejects(()=>importArchive(t.ctx,{dataBase64:bomb.toString('base64')}),/Compression ratio/);assert.equal(t.ctx.db.prepare('SELECT count(*) n FROM cases').get().n,0);}finally{t.close()}});
test('bad archive does not create any SQLite case',async()=>{const t=setup();try{await assert.rejects(()=>importArchive(t.ctx,{dataBase64:Buffer.from('garbage').toString('base64')}));assert.equal(t.ctx.db.prepare('SELECT count(*) n FROM cases').get().n,0);}finally{t.close()}});
test('batch queue supports cancellation and CSV exports',async()=>{const t=setup();try{const b=await zip(caseEntries('A'));const out=await importArchive(t.ctx,{dataBase64:b.toString('base64')});assert.match(batchCsv(t.ctx,out.batchId),/callId/);assert.equal(batchSummary(t.ctx,out.batchId).results.length,0);processBatch(t.ctx,out.batchId,{mode:'rules'});for(let i=0;i<100;i++){if(batchStatus(t.ctx,out.batchId).totals.completed)break;await new Promise(r=>setTimeout(r,25))}assert.equal(batchStatus(t.ctx,out.batchId).totals.completed,1);assert.ok(batchSummary(t.ctx,out.batchId).results[0].findings.length);cancelBatch(t.ctx,out.batchId);assert.equal(batchStatus(t.ctx,out.batchId).canceled,1);}finally{t.close()}});

test('completed batch generates genuine PDF and ZIP with case artifacts',async()=>{const t=setup();try{
 const b=await zip(caseEntries('A'));const x=await importArchive(t.ctx,{dataBase64:b.toString('base64')});
 processBatch(t.ctx,x.batchId,{mode:'rules'});
 for(let i=0;i<100;i++){if(batchStatus(t.ctx,x.batchId).totals.completed)break;await new Promise(r=>setTimeout(r,25))}
 assert.equal(batchStatus(t.ctx,x.batchId).totals.completed,1);
 const pdf=await summaryPdf(t.ctx,x.batchId);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 const archive=await reportsZip(t.ctx,x.batchId);assert.equal(archive.subarray(0,2).toString(),'PK');
 assert.ok(archive.length>1000);
}finally{t.close()}});

test('a call ID already imported from another ZIP is skipped without mixing evidence',async()=>{const t=setup();try{
 const first=await zip(caseEntries('A'));const a=await importArchive(t.ctx,{dataBase64:first.toString('base64')});
 const again=await zip({...caseEntries('A'),...caseEntries('B')});
 const b=await importArchive(t.ctx,{dataBase64:again.toString('base64')});
 const rows=batchStatus(t.ctx,b.batchId).cases;
 assert.equal(rows.length,2);const duplicate=rows.find(x=>x.callId==='CAA');
 assert.equal(duplicate.status,'Skipped');
 assert.equal(getCase(t.ctx,duplicate.caseId).evidence.length,0);
 assert.equal(getCase(t.ctx,batchStatus(t.ctx,a.batchId).cases[0].caseId).evidence.length,6);
 assert.equal(rows.find(x=>x.callId==='CAB').status,'Pending');
}finally{t.close()}});
test('unselected policy always yields Insufficient Evidence, never fake demo violations',async()=>{const t=setup();try{
 const b=await zip(caseEntries('A'));const out=await importArchive(t.ctx,{dataBase64:b.toString('base64')});
 processBatch(t.ctx,out.batchId,{mode:'rules'});
 for(let i=0;i<100;i++){if(batchStatus(t.ctx,out.batchId).totals.completed)break;await new Promise(r=>setTimeout(r,25))}
 const row=batchStatus(t.ctx,out.batchId).cases[0],details=getCase(t.ctx,row.caseId);
 assert.equal(details.findings[0].category,'Insufficient Evidence');
 assert.match(details.findings[0].rationale,/not been matched/i);
 assert.equal(details.findings[0].policySectionIds[0],'NO-POLICY');
}finally{t.close()}});
