import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { initialize,listCases,listPolicies,newPolicy,newCase,getCase,registerEvidence,seedDemo,runInvestigation,reviewFinding,exportJson,getEvents,MAX_BYTES } from './core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const app=Fastify({ logger:{level:'warn'}, bodyLimit:Math.ceil(MAX_BYTES*1.38+4096), requestTimeout:120000 });
const ctx=initialize(process.env.CASEPILOT_DATA || path.resolve(here,'../data'));
const port=Number(process.env.PORT||4317);
function fail(reply,error){reply.code(/not found/i.test(error.message)?404:400).send({error:String(error.message).slice(0,250)});}
app.addHook('onRequest',async(req,reply)=>{
  const origin=req.headers.origin;
  if(origin && !/^http:\/\/(127\.0\.0\.1|localhost):(4317|5173)$/.test(origin)){reply.code(403).send({error:'Only local browser origins allowed.'});return;}
  if(origin){ reply.header('Access-Control-Allow-Origin',origin);reply.header('Vary','Origin'); }
  reply.header('X-Content-Type-Options','nosniff');reply.header('Cache-Control','no-store');
});
app.options('/*',async(_,reply)=>reply.header('Access-Control-Allow-Methods','GET,POST,OPTIONS').header('Access-Control-Allow-Headers','Content-Type').code(204).send());
app.get('/api/health',async()=>{
  let ollama=false,models=[];
  try{const controller=new AbortController(),t=setTimeout(()=>controller.abort(),1000);try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:controller.signal});if(r.ok){ollama=true;models=((await r.json()).models||[]).map(x=>x.name);}}finally{clearTimeout(t)}}catch{}
  return {status:'ok',app:'CasePilot AI',mode:'100% local',ollama,models,defaultModel:process.env.CASEPILOT_MODEL||'qwen2.5:7b'};
});
app.get('/api/cases',async()=>listCases(ctx));
app.get('/api/cases/:id',async(req,reply)=>getCase(ctx,req.params.id)||reply.code(404).send({error:'Case not found'}));
app.post('/api/cases',async(req,reply)=>{try{return {id:newCase(ctx,req.body?.name,false)};}catch(e){return fail(reply,e);}});
app.post('/api/demo',async()=>seedDemo(ctx));
app.get('/api/policies',async()=>listPolicies(ctx));
app.post('/api/policies',async(req,reply)=>{try{return {id:newPolicy(ctx,req.body||{})};}catch(e){return fail(reply,e);}});
app.post('/api/cases/:id/evidence',async(req,reply)=>{try{return registerEvidence(ctx,req.params.id,req.body||{});}catch(e){return fail(reply,e);}});
app.post('/api/cases/:id/analyze',async(req,reply)=>{
  try {return {jobId:runInvestigation(ctx,req.params.id,{mode:req.body?.mode||'auto',model:req.body?.model||process.env.CASEPILOT_MODEL||'qwen2.5:7b',policyId:req.body?.policyId||null})};}
  catch(e){return fail(reply,e);}
});
app.get('/api/jobs/:id',async(req,reply)=>{
  const job=ctx.db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id); if(!job) return reply.code(404).send({error:'Job not found'});
  return {...job,events:getEvents(ctx,job.id)};
});
app.get('/api/jobs/:id/stream',(req,reply)=>{
  const job=ctx.db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);if(!job) return reply.code(404).send({error:'Job not found'});
  reply.hijack();const res=reply.raw;res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':req.headers.origin||'http://127.0.0.1:4317'});
  const seen=new Set();let timer;
  const tick=()=>{try{for(const e of getEvents(ctx,job.id)){if(!seen.has(e.id)){seen.add(e.id);res.write('data: '+JSON.stringify(e)+'\n\n');}}
    const j=ctx.db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id);
    if(j.status==='Completed'||j.status==='Failed'){res.write('event: done\ndata: '+JSON.stringify({status:j.status})+'\n\n');cleanup();res.end();}}
    catch{cleanup();res.end();}};
  const cleanup=()=>{if(timer)clearInterval(timer);};tick();if(!res.writableEnded)timer=setInterval(tick,350);req.raw.on('close',cleanup);
});
app.post('/api/cases/:caseId/findings/:findingId/review',async(req,reply)=>{
  try{return {reviewId:reviewFinding(ctx,req.params.caseId,req.params.findingId,req.body||{})};}catch(e){return fail(reply,e);}
});
app.get('/api/cases/:id/export.json',async(req,reply)=>{
  const report=exportJson(ctx,req.params.id);if(!report)return reply.code(404).send({error:'Not found'});
  return reply.header('Content-Disposition','attachment; filename="casepilot-report.json"').header('Content-Type','application/json').send(report);
});
app.get('/api/cases/:id/export.pdf',async(req,reply)=>{
  const report=exportJson(ctx,req.params.id);if(!report)return reply.code(404).send({error:'Not found'});
  const {default:PDFDocument}=await import('pdfkit');
  reply.hijack();const res=reply.raw;res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="casepilot-report.pdf"'});
  const pdf=new PDFDocument({margin:48,size:'A4'});pdf.pipe(res);
  pdf.fontSize(22).text('CASEPILOT AI');pdf.fontSize(11).fillColor('#667085').text('LOCAL | Evidence-Based Investigation | HUMAN REVIEW REQUIRED');pdf.moveDown();
  pdf.fillColor('#111827').fontSize(17).text(report.name);pdf.fontSize(10).text(`Case ID: ${report.id}`);pdf.text(`Status: ${report.status}`);pdf.moveDown();
  for(const f of report.findings){pdf.fontSize(13).text(`${f.category}: ${f.title}`,{continued:false});pdf.fontSize(10).text(f.rationale||'');pdf.text('Policy section(s): '+f.policySectionIds.join(', '));pdf.text('Evidence span IDs: '+f.evidenceSpanIds.join(', '));pdf.text('Uncertainty: '+f.uncertainty);pdf.text('Coaching: '+f.coaching);pdf.text('Human review: '+f.status);pdf.moveDown();}
  pdf.addPage().fontSize(16).text('Evidence manifest');pdf.moveDown();for(const e of report.evidence){pdf.fontSize(9).text(`${e.filename} | ${e.sha256} | ${e.extractionStatus}`);}pdf.moveDown().text('This report documents supplied evidence only. No booking, payment or support system was changed.');pdf.end();
});
const dist=path.resolve(here,'../web/dist');
if(fs.existsSync(dist)) {
  const {default:staticPlugin}=await import('@fastify/static');await app.register(staticPlugin,{root:dist,prefix:'/'});
  app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.type('text/html').send(fs.readFileSync(path.join(dist,'index.html'))));
} else app.get('/',async(_,reply)=>reply.type('text/html').send('<p>CasePilot API is running. Use START.bat to launch the React UI, or run npm run dev:ui.</p>'));
try{await app.listen({port,host:'127.0.0.1'});console.log(`CasePilot API: http://127.0.0.1:${port}`);}catch(e){console.error(e);process.exitCode=1;}
