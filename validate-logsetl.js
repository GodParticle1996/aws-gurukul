#!/usr/bin/env node
// Run the D5 missions through the terminal and check every calculator setting.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const DIR = __dirname, source = fs.readFileSync(path.join(DIR, 'validate.js'), 'utf8');
const manifest = name => [...source.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/'([^']+\.js)'/g)].map(m => m[1]);
const ENGINE = manifest('ENGINE'), DATA = manifest('DATA'), ALL = [...ENGINE, ...DATA, 'app.js'];
const head = source.slice(source.indexOf('let FAIL = 0;'), source.indexOf('/* ================= 1. SYNTAX'));
const { mkSandbox, mkNode } = new Function('fs', 'path', 'vm', 'DIR', 'ENGINE', 'DATA', 'ALL', head + '\nreturn {mkSandbox,mkNode};')(fs, path, vm, DIR, ENGINE, DATA, ALL);
const sb = mkSandbox(false), AG = vm.runInContext('AG', sb);
const crashes = []; sb.console.error = (...args) => crashes.push(args.join(' '));
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function run(stage, commands) {
  let state, done = 0;
  const trace = [], arena = mkNode('div');
  const wrapped = { ...stage, success(s) { state = s; return stage.success(s); } };
  AG.renderers.terminal(wrapped, arena, () => done++);
  const terminal = arena._kids.find(k => k._cls.has('terminal'));
  const input = terminal.querySelector('input'), output = terminal.querySelector('.term-out');
  for (const command of commands) { input.value = command; input.fire('keydown', { key: 'Enter', preventDefault() {} }); trace.push(done); }
  return { state, trace, done, text: output._kids.map(k => k.textContent).join('\n') };
}

const level = AG.findLevel('logsetl');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;

const inspect=(commands,stage=mission)=>run({...stage,success:()=>false},commands);
const copy=o=>JSON.parse(JSON.stringify(o));
for(const stage of [mission,interview]){
  const solved=run(stage,stage.solution);
  check(solved.done===1,stage.title+'\n'+solved.text.slice(-2600));
  check(stage.tasks.every(t=>t.check(solved.state)),'every task passes');
  for(let i=0;i<stage.solution.length;i++)
    check(!run(stage,stage.solution.filter((_,j)=>i!==j)).done,'omitted command '+i+' in '+stage.title);
}
const [groups,rawRead,hotRead,domain,raw,hot,read,send,view]=mission.solution;
const proper=inspect([...mission.solution,'cat delivery.txt']);
const px=proper.state.account.pixLog,receipt=px.receipts.at(-1);
check(mission.success(proper.state) && proper.text.includes('S3BackupMode') && proper.text.includes('ZoneAwarenessEnabled') &&
  proper.text.includes('"eventId"') && proper.text.includes('logGroupClass'),'actual metadata and receipt visible');
check(receipt.raw.map(x=>JSON.parse(x.message).level).join(',')==='INFO,WARN,ERROR' &&
  receipt.hot.map(x=>x.eventId).join(',')===receipt.raw.slice(1).map(x=>x.id).join(',') &&
  JSON.stringify(receipt.backup)===JSON.stringify(receipt.hot),'two branches share source IDs');
function withFile(stage,file,content){return {...stage,files:{...stage.files,[file]:{content}}};}
function withAccount(stage,change){const account=copy(stage.account);change(account.pixLog);return {...stage,account};}
for(const value of ['', '{ $.level = "ERROR" }','{ $.level != "INFO" }','?WARN ?ERROR','{ $.requestId = "p9" }',
  '{ $.level = "ERROR" || $.level = "WARN" || $.level = "DEBUG" }']){
  check(!run(withFile(mission,'hot.pattern',value),mission.solution).done,'wrong hot pattern '+value);
}
const reversed=withFile(mission,'hot.pattern','{ $.level = "WARN" || $.level = "ERROR" }');
check(run(reversed,mission.solution).done,'equivalent filter order');
const dup=inspect([...mission.solution,hot,raw]);
check(mission.success(dup.state) && dup.state.account.pixLog.subscriptions.length===2,'identical upserts keep evidence');
const changed=inspect([...mission.solution,hot.replace('file://hot.pattern','""'),hot,read]);
check(!mission.success(changed.state),'repair must deliver fresh sample');
check(!run(mission,[...mission.solution.slice(0,-2),view,send]).done,'earlier receipt read cannot certify a new batch');
check(!run(mission,[groups,rawRead,hotRead,domain,read,raw,hot,send]).done,'old readback');
check(!run(interview,[send,hot,read]).done && run(interview,[send,hot,read,send,view]).done,'repair and resubmit');
for(const cmd of [raw.replace('pix-log-forward','bad'),raw.replace(' --role-arn',' --wrong'),
  hot+' --role-arn wrong',hot+' --filter-name hot',hot.replace('hot.pattern','no-such-file'),
  raw+' --region eu-west-1',raw.replace('/pixshare/feed','/other'),hot.replace('pix-split','other'),
  raw.replace('""',''),raw+' ignored',raw.replace('pix-raw','pix-search')]){
  const out=inspect([cmd]);
  check(out.state.account.pixLog.subscriptions.length===0 && out.text.length>0,'reject before mutation '+cmd);
}
const third=inspect([raw,hot,hot.replace('--filter-name hot','--filter-name extra')]);
check(third.state.account.pixLog.subscriptions.length===2 && third.text.includes('LimitExceeded'),'subscription quota');
for(const change of [p=>{p.logClass='ESSENTIALS';},p=>{p.logsRole.trust='lambda.amazonaws.com';},
  p=>{p.invokeSource='wrong';},p=>{p.streams['pix-search'].DeliveryStreamStatus='CREATING';},
  p=>{p.domain.EncryptionAtRestOptions.Enabled=false;},p=>{p.domain.ClusterConfig.ZoneAwarenessEnabled=false;},
  p=>{p.streams['pix-search'].Destinations[0].AmazonopensearchserviceDestinationDescription.S3BackupMode='FailedDocumentsOnly';}]){
  check(!run(withAccount(mission,change),mission.solution).done,'unready config');
}
for(const cmd of [domain.replace('pix-logs','other'),rawRead.replace('pix-raw','other'),hotRead+' --region eu-west-1']){
  check(Object.keys(inspect([cmd]).state.account.pixLog.reads).length===0,'failed read left no evidence');
}
const rows=JSON.parse(mission.files['sample.json'].content);
for(const batch of [rows.slice(1),[rows[1],rows[0],rows[2]],rows.map(r=>({...r,timestamp:r.timestamp-16*86400000})),
  rows.map(r=>({...r,timestamp:r.timestamp+86400000})),rows.map(r=>({...r,message:'{}'})),
  rows.map(r=>({...r,message:r.message.replace('p9','stale')}))]){
  check(!run(withFile(mission,'sample.json',JSON.stringify(batch)),mission.solution).done,'canary evidence requires three accepted source records');
}
const old={...rows[0],timestamp:rows[0].timestamp-15*86400000};
const partial=withFile(mission,'sample.json',JSON.stringify([old,...rows]));
check(run(partial,mission.solution).done && inspect(mission.solution,partial).text.includes('tooOldLogEventEndIndex'),
  'reject old entry and route valid events');
const oversized=withFile(interview,'sample.json',JSON.stringify([{...rows[0],message:'🔥'.repeat(262144)}]));
check(inspect([send],oversized).state.account.pixLog.receipts.length===0,'UTF-8 size cap before delivery');
const plain=withFile(interview,'sample.json',JSON.stringify([{...rows[0],message:'null'}]));
const malformed=inspect([send],plain).state.account.pixLog.receipts[0];
check(malformed.raw.length===1 && malformed.hot.length===0,'raw retains a non-application message');
const flow=level.stages.find(s=>s.type==='flowlab');
let settings=0,wins=0;
for(const daily of [10,20,30,40])for(const out of [0,25,50,75])for(const hot of [7,14,21,28])for(const raw of [30,60,90]){
  const k={daily,out,hot,raw}, m=flow.model(k), values=m.readouts.map(x=>x.value);
  const pass=daily*(100-out)/100, stored=daily*raw/4+pass*7;
  const gb=3*Math.max(10,Math.ceil(pass*hot/1.2)), nodes=967.68;
  const parts=[daily*15,(daily/4+pass)*30*.029,nodes,gb*.122,stored*.023],money=n=>'$'+n.toFixed(2);
  check(values.slice(0,3).join('/')===parts.slice(0,3).map(money).join('/'),'ingest, Firehose and compute');
  check(values[3]===gb+' GB · '+money(parts[3]) && values[4]===money(parts[4]),'disk and two S3 prefixes');
  check(Math.abs(Number(values[5].slice(1))-parts.reduce((a,b)=>a+b))<.005001,'total within half a cent');
  const fit=daily===20 && out===75 && hot===7 && raw===90;
  check(flow.check(k)===fit && m.verdict.ok===fit,'goal');
  if(fit)wins++;
  settings++;
}
check(settings===192 && wins===1,'complete cost grid');
const qs = level.stages.flatMap(s => [...(s.questions || []), ...(s.steps || []).flatMap(t => t.ask ? [t.ask] : []), ...(s.observe ? [s.observe] : [])])
  .concat(level.interview.questions.filter(q => q.choices));
const positions = [0,0,0,0];
let longest = 0;
for (const q of qs) {
  const right = q.choices[q.answer].length, wrong = q.choices.filter((_, i) => i !== q.answer).map(c => c.length);
  check(right < 1.15 * Math.max(...wrong) && right > .85 * Math.min(...wrong), q.q);
  check(q.explain.length > 80, 'explanation: ' + q.q);
  positions[q.answer]++;
  if (right > Math.max(...wrong)) longest++;
}
check(Math.max(...positions) - Math.min(...positions) <= 1 && longest / qs.length >= .17 && longest / qs.length <= .32, 'MCQ positions and lengths');
check(crashes.length === 0, crashes.join('\n'));
console.log(`   ✓ ${checks} logsetl checks · ${settings} settings/1 fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join("/")}`);
