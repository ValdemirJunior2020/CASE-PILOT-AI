import yauzl from 'yauzl';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {newCase,registerEvidence,getCase,runInvestigation,exportJson} from './core.mjs';

const FILES=new Set(['BOOKING_DETAILS.txt','COLLECTOR_SOURCE.json','COMPLETE_CALL_FOR_CHATGPT.txt','DOCUMENTATION_NOTES.txt','metadata.json','TRANSCRIPT.txt']);
const MAX_ZIP=32*1024*1024,MAX_UNPACKED=80*1024*1024,MAX_ENTRIES=5000,MAX_FILE=8*1024*1024,MAX_DEPTH=3;
const fingerprint=b=>createHash('sha256').update(b).digest('hex');
const uid=()=>randomUUID();
const stamp=()=>new Date().toISOString();
function schema(ctx){
 ctx.db.exec("CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY, archiveHash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, createdAt TEXT NOT NULL, status TEXT NOT NULL, canceled INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS batch_cases(batchId TEXT NOT NULL REFERENCES batches(id), caseId TEXT PRIMARY KEY REFERENCES cases(id), folder TEXT NOT NULL, agent TEXT, center TEXT, itinerary TEXT, callId TEXT, status TEXT NOT NULL DEFAULT 'Pending', error TEXT); CREATE INDEX IF NOT EXISTS idx_batch_cases_batch ON batch_cases(batchId);");
}
function archiveError(msg){throw Error('ZIP rejected: '+msg);}
function safeEntry(name){
 if(typeof name!=='string'||!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||/^[a-zA-Z]:/.test(name)||name.split('/').some(x=>x==='.'||x==='..'))archiveError('Unsafe archive path');
 const parts=name.replace(/\/$/,'').split('/');
 if(parts.length>MAX_DEPTH)archiveError('Folder nesting too deep');
 return parts;
}
async function unzip(buffer){
 if(buffer.length<22||buffer.length>MAX_ZIP)archiveError('Archive must be between 22 bytes and 32 MiB');
 const zip=await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,autoClose:false,decodeStrings:true,validateEntrySizes:true},(e,z)=>e?reject(e):resolve(z)));
 return new Promise((resolve,reject)=>{
  const files=new Map();let count=0,total=0,settled=false;
  const fail=(e)=>{if(settled)return;settled=true;zip.close();reject(e)};
  zip.on('error',fail);
  zip.on('entry',entry=>{
   try{
    if(++count>MAX_ENTRIES)archiveError('Too many entries');
    const name=entry.fileName,parts=safeEntry(name);
    const mode=(entry.externalFileAttributes>>>16)&0o170000;
    if(mode===0o120000||mode&&mode!==0o100000&&mode!==0o040000)archiveError('Links or special files not allowed');
    if(entry.generalPurposeBitFlag&1)archiveError('Encrypted entries are forbidden');
    if(name.endsWith('/')){zip.readEntry();return}
    if(parts.length!==2||!FILES.has(parts[1]))archiveError('Unsupported file or folder structure');
    if(entry.uncompressedSize>MAX_FILE)archiveError('Single file exceeds 8 MiB');
    if(entry.compressedSize===0&&entry.uncompressedSize>0||entry.compressedSize>0&&entry.uncompressedSize/entry.compressedSize>200)archiveError('Compression ratio exceeds security limit');
    total+=entry.uncompressedSize;if(total>MAX_UNPACKED)archiveError('Total extracted size exceeds 80 MiB');
    if(files.has(name))archiveError('Duplicate filename inside archive');
    zip.openReadStream(entry,(err,stream)=>{
     if(err){fail(err);return}const chunks=[];let bytes=0;
     stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_FILE||bytes>entry.uncompressedSize){stream.destroy(Error('Entry size mismatch'));return}chunks.push(chunk)});
     stream.on('error',fail);
     stream.on('end',()=>{if(settled)return;if(bytes!==entry.uncompressedSize){fail(Error('Entry size mismatch'));return}files.set(name,Buffer.concat(chunks));zip.readEntry()});
    });
   }catch(e){fail(e)}
  });
  zip.on('end',()=>{if(settled)return;settled=true;zip.close();resolve(files)});
  zip.readEntry();
 });
}
function inspect(files){
 const folders=new Map();
 for(const [key,buf] of files){const [folder,name]=key.split('/');if(!folders.has(folder))folders.set(folder,new Map());folders.get(folder).set(name,buf)}
 if(!folders.size)archiveError('No case folders found');
 const cases=[];
 for(const [folder,items] of folders){
  let meta={};if(items.has('metadata.json')){try{meta=JSON.parse(items.get('metadata.json').toString('utf8'));if(!meta||Array.isArray(meta)||typeof meta!=='object')throw Error()}catch{meta={};}}
  const str=k=>typeof meta[k]==='string'?meta[k].trim().slice(0,180):'';
  cases.push({folder,items,agent:str('agent_name'),center:str('center'),itinerary:str('itinerary_number'),callId:str('call_id'),warning:items.has('metadata.json')&&!str('call_id')?'Missing call ID in metadata':''});
 }
 return cases;
}
export async function importArchive(ctx,{filename='cases.zip',dataBase64}){
 schema(ctx);
 if(typeof dataBase64!=='string'||dataBase64.length>MAX_ZIP*1.4||!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64))archiveError('Malformed or oversized ZIP payload');
 const buffer=Buffer.from(dataBase64,'base64');const archiveHash=fingerprint(buffer);
 const existing=ctx.db.prepare('SELECT id FROM batches WHERE archiveHash=?').get(archiveHash);
 if(existing)return {batchId:existing.id,duplicate:true,cases:batchStatus(ctx,existing.id).cases.length};
 const files=await unzip(buffer);const cases=inspect(files);
 const batchId=uid(),dirs=[];
 ctx.db.exec('BEGIN IMMEDIATE');
 try{
  ctx.db.prepare('INSERT INTO batches VALUES(?,?,?,?,?,0)').run(batchId,archiveHash,path.basename(filename).slice(0,160),stamp(),'Ready');
  for(const item of cases){
   const caseId=newCase(ctx,[item.itinerary,item.agent,item.callId].filter(Boolean).join(' — ')||item.folder);
   dirs.push(path.join(ctx.baseDir,'evidence',caseId));
   ctx.db.prepare('INSERT INTO batch_cases(batchId,caseId,folder,agent,center,itinerary,callId,status,error) VALUES(?,?,?,?,?,?,?,?,?)').run(batchId,caseId,item.folder,item.agent,item.center,item.itinerary,item.callId,'Pending',item.warning);
   for(const [name,data] of item.items)registerEvidence(ctx,caseId,{filename:name,mime:name.endsWith('.json')?'application/json':'text/plain',dataBase64:data.toString('base64')});
  }
  ctx.db.exec('COMMIT');
 }catch(e){ctx.db.exec('ROLLBACK');for(const dir of dirs)fs.rmSync(dir,{recursive:true,force:true});throw e}
 return {batchId,duplicate:false,cases:cases.length,files:files.size};
}
export function batchStatus(ctx,batchId){
 schema(ctx);
 const batch=ctx.db.prepare('SELECT * FROM batches WHERE id=?').get(batchId);if(!batch)return null;
 const cases=ctx.db.prepare('SELECT bc.*,c.name, (SELECT count(*) FROM findings f WHERE f.caseId=c.id) AS findings FROM batch_cases bc JOIN cases c ON c.id=bc.caseId WHERE bc.batchId=? ORDER BY bc.rowid').all(batchId);
 return {...batch,cases,totals:{all:cases.length,completed:cases.filter(x=>x.status==='Completed').length,failed:cases.filter(x=>x.status==='Failed').length,processing:cases.filter(x=>x.status==='Processing').length,pending:cases.filter(x=>x.status==='Pending').length,skipped:cases.filter(x=>x.status==='Skipped').length,review:cases.filter(x=>x.status==='Completed'&&x.findings>0).length}};
}
export function listBatches(ctx){schema(ctx);return ctx.db.prepare('SELECT id,name,createdAt,status,canceled FROM batches ORDER BY createdAt DESC').all()}
const running=new Map();
export function cancelBatch(ctx,batchId){schema(ctx);ctx.db.prepare('UPDATE batches SET canceled=1,status=? WHERE id=?').run('Cancel requested',batchId);return batchStatus(ctx,batchId)}
export function processBatch(ctx,batchId,{mode='rules',model='qwen2.5:7b',selected=[]}={}){
 schema(ctx);const batch=batchStatus(ctx,batchId);if(!batch)throw Error('Batch not found');
 if(running.has(batchId))throw Error('This batch is already running');
 if(!['rules','auto','ollama'].includes(mode))throw Error('Invalid analysis mode');
 ctx.db.prepare('UPDATE batches SET canceled=0,status=? WHERE id=?').run('Processing',batchId);
 const allowed=new Set(selected.length?selected:batch.cases.map(c=>c.caseId));
 const queue=batch.cases.filter(c=>allowed.has(c.caseId)&&['Pending','Failed'].includes(c.status));
 const controller={cancel:false};running.set(batchId,controller);
 (async()=>{
  try{
   for(const row of queue){
    if(controller.cancel||ctx.db.prepare('SELECT canceled FROM batches WHERE id=?').get(batchId).canceled)break;
    ctx.db.prepare('UPDATE batch_cases SET status=?,error=NULL WHERE caseId=?').run('Processing',row.caseId);
    try{
     const jobId=runInvestigation(ctx,row.caseId,{mode,model});
     let result;
     for(let i=0;i<1200;i++){await new Promise(r=>setTimeout(r,100));result=ctx.db.prepare('SELECT status FROM jobs WHERE id=?').get(jobId);if(result?.status==='Completed'||result?.status==='Failed')break}
     if(result?.status!=='Completed')throw Error('Investigation failed or timed out');
     ctx.db.prepare('UPDATE batch_cases SET status=? WHERE caseId=?').run('Completed',row.caseId);
    }catch(e){ctx.db.prepare('UPDATE batch_cases SET status=?,error=? WHERE caseId=?').run('Failed',String(e.message).slice(0,300),row.caseId)}
   }
  }finally{const state=ctx.db.prepare('SELECT canceled FROM batches WHERE id=?').get(batchId);ctx.db.prepare('UPDATE batches SET status=? WHERE id=?').run(state?.canceled?'Canceled':'Idle',batchId);running.delete(batchId)}
 })();
 return batchStatus(ctx,batchId);
}
export function batchCsv(ctx,batchId){
 const batch=batchStatus(ctx,batchId);if(!batch)return null;
 const esc=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+\-@\t\r]/,'\u0027$&')+'"';
 const cols=['caseId','agent','center','itinerary','callId','status','findings','error'];
 return [cols.map(esc).join(','),...batch.cases.map(row=>cols.map(k=>esc(row[k])).join(','))].join('\r\n');
}
export function batchSummary(ctx,batchId){
 const batch=batchStatus(ctx,batchId);if(!batch)return null;
 return {...batch,results:batch.cases.filter(x=>x.status==='Completed').map(x=>exportJson(ctx,x.caseId))};
}
