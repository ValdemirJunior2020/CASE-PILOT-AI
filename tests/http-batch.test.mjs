import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import yazl from 'yazl';
const zipBytes=async()=>{const z=new yazl.ZipFile();for(let n=1;n<=2;n++){
 const dir='SyntheticCase'+n+'/';const files={
 'BOOKING_DETAILS.txt':'2026-10-12 09:00 Guest requested a refund.',
 'COLLECTOR_SOURCE.json':'{"demo":true}',
 'COMPLETE_CALL_FOR_CHATGPT.txt':'2026-10-12 09:05 Agent explained the refund process.',
 'DOCUMENTATION_NOTES.txt':'2026-10-12 09:12 Booking audit: no refund request was created during the interaction.',
 'TRANSCRIPT.txt':'2026-10-12 09:03 Property authorized refund.',
 'metadata.json':JSON.stringify({agent_name:'Fictional Agent '+n,center:'Demo Center',itinerary_number:'DEMO'+n,call_id:'CALL'+n})
 };for(const [name,v] of Object.entries(files))z.addBuffer(Buffer.from(v),dir+name)}
 z.end();const chunks=[];return new Promise((resolve,reject)=>{z.outputStream.on('data',x=>chunks.push(x));z.outputStream.on('error',reject);z.outputStream.on('end',()=>resolve(Buffer.concat(chunks)))})};
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
test('HTTP end-to-end ZIP upload, analyze, per-case citations, batch exports',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'casepilot-http-'));const port=await freePort();
 const child=spawn(process.execPath,['--experimental-sqlite','api/server.mjs'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),CASEPILOT_DATA:data},stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',x=>output+=String(x).slice(0,1500));
 const root='http://127.0.0.1:'+port;const api=async(url,body)=>{const r=await fetch(root+'/api'+url,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.ok,true,url+' '+r.status+' '+await r.clone().text());return r.json()};
 try{
  let up=false;for(let i=0;i<100;i++){try{const r=await fetch(root+'/api/cases');if(r.ok){up=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}
  assert.ok(up,'Backend startup failed: '+output);
  const file=await zipBytes(),created=await api('/batches/import',{filename:'synthetic-multicase.zip',dataBase64:file.toString('base64')});
  assert.equal(created.cases,2);
  let b=await api('/batches/'+created.batchId);assert.equal(b.cases.length,2);
  await api('/batches/'+created.batchId+'/analyze',{mode:'rules'});
  for(let i=0;i<160;i++){b=await api('/batches/'+created.batchId);if(b.totals.completed===2)break;await new Promise(r=>setTimeout(r,100))}
  assert.equal(b.totals.completed,2,JSON.stringify(b.totals));
  assert.ok(b.events?.length>0);
  for(const row of b.cases){const item=await api('/cases/'+row.caseId);assert.equal(item.evidence.length,6);assert.ok(item.findings.length);assert.ok(item.findings[0].evidenceSpanIds.every(x=>item.spans.some(y=>y.id===x)))}
  for(const suffix of ['export.csv','summary.pdf','reports.zip']){const res=await fetch(root+'/api/batches/'+created.batchId+'/'+suffix);assert.ok(res.ok,suffix);const bytes=Buffer.from(await res.arrayBuffer());assert.ok(bytes.length>100,suffix);if(suffix.endsWith('.pdf'))assert.equal(bytes.subarray(0,5).toString(),'%PDF-');if(suffix.endsWith('.zip'))assert.equal(bytes.subarray(0,2).toString(),'PK')}
 }finally{child.kill();fs.rmSync(data,{recursive:true,force:true})}
});
