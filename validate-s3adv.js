#!/usr/bin/env node
// Focused S3 lifecycle, retention, replication and recovery regressions. No AWS or Moto calls.
// Reuse validate.js's DOM/load manifest so fixtures exercise the shipped engine.
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
  for (const command of commands) {
    input.value = command;
    input.fire('keydown', { key: 'Enter', preventDefault() {} });
    trace.push(done);
  }
  return { state, trace, done, text: output._kids.map(k => k.textContent).join('\n'), arena };
}
const level=AG.findLevel('s3adv'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
const never={...mission,success:()=>false},json=x=>JSON.parse(JSON.stringify(x));
const withFile=(name,value,base=never)=>({...base,files:{...base.files,[name]:{content:typeof value==='string'?value:JSON.stringify(value)}}});
const b=(s,name)=>s.account.buckets.find(b=>b.name===name),invoice=s=>b(s,'shop-invoices').versions['invoices/INV-301.pdf'][0];
function solved(stage){const r=run(stage,stage.solution);check(r.done===1,'intended solution wins');check(r.trace.slice(0,-1).every(x=>x===0)&&r.trace.at(-1)===1,'won only after final state action');check(stage.tasks.every(t=>t.check(r.state)),'tasks and win agree');return r;}
for(const stage of [mission,interview]){solved(stage);solved(stage);for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'omitted action '+i+' fails');check(!stage.success(run({...stage,success:()=>false},['help']).state),'fresh reset incomplete');}
const done=solved(mission),files=Object.fromEntries(Object.entries(mission.files).map(([n,f])=>[n,JSON.parse(f.content)]));
check(invoice(done.state).retention.Mode==='COMPLIANCE','exact old invoice retained');
const defaultOnly=run(never,mission.solution.filter((_,i)=>i!==3));check(!invoice(defaultOnly.state).retention&&!mission.success(defaultOnly.state),'bucket default not retroactive');
const replFirst=run(never,[mission.solution[5]]);check(replFirst.text.includes('versioning must be Enabled'),'dest versioning error teaches prerequisite');check(!b(replFirst.state,'shop-invoices').replication,'invalid replication atomic');
const noDestLock=run(never,mission.solution.filter((_,i)=>i!==4));check(noDestLock.text.includes('Object Lock destination'),'locked source requires locked destination');
const repEmpty=run(never,mission.solution);check(Object.keys(b(repEmpty.state,'shop-invoices-dr').versions).length===0,'config does not fabricate replicated data');
const marker='aws s3api delete-object --bucket shop-invoices --key invoices/INV-301.pdf';
const protectedDelete=marker+' --version-id v-keep --bypass-governance-retention';
const locked=run(never,[...mission.solution,protectedDelete]);check(locked.text.includes('AccessDenied'),'compliance rejects governance bypass');check(invoice(locked.state).body==='original invoice INV-301','locked version survives');
const hidden=run(never,[...mission.solution,marker]);check(b(hidden.state,'shop-invoices').versions['invoices/INV-301.pdf'][0].deleteMarker,'simple delete adds marker');check(!mission.success(hidden.state),'hidden original cannot satisfy business visibility task');check(b(hidden.state,'shop-invoices').versions['invoices/INV-301.pdf'].some(v=>v.versionId==='v-keep'),'original still retained below marker');
const suspend=run(never,[...mission.solution,'aws s3api put-bucket-versioning --bucket shop-invoices --versioning-configuration Status=Suspended']);check(suspend.text.includes('InvalidBucketState')&&b(suspend.state,'shop-invoices').versioning,'cannot suspend Object Lock versioning');
const shorten=run(withFile('short.json',{Mode:'COMPLIANCE',RetainUntilDate:'2027-01-01T00:00:00Z'}),[...mission.solution,'aws s3api put-object-retention --bucket shop-invoices --key invoices/INV-301.pdf --version-id v-keep --retention file://short.json --bypass-governance-retention']);check(shorten.text.includes('AccessDenied'),'cannot shorten active compliance');check(invoice(shorten.state).retention.RetainUntilDate.startsWith('2033-10-26'),'shortening leaves date unchanged');
const future=run(never,[...mission.solution,'aws s3 cp invoice.txt s3://shop-invoices/invoices/new.pdf']);const newVersion=b(future.state,'shop-invoices').versions['invoices/new.pdf'][0];check(newVersion.retention.Mode==='COMPLIANCE'&&newVersion.retention.RetainUntilDate.startsWith('2033-10-26'),'future write gets default calendar7year retention');
const moved=json(files['lifecycle.json']);moved.Rules.reverse().forEach((r,i)=>r.ID='valid-renamed-'+i);check(run(withFile('lifecycle.json',moved,mission),mission.solution).done===1,'equivalent lifecycle rule order/IDs allowed');
const idempotent=run(never,[...mission.solution,...mission.solution]);check(mission.success(idempotent.state),'clean idempotent config replay stays correct');
for(const [name,mutate] of [['wrong source mode',d=>d.Rule.DefaultRetention.Mode='GOVERNANCE'],['wrong default years',d=>d.Rule.DefaultRetention.Years=1]]){const d=json(files['lock-seven-years.json']);mutate(d);check(!run(withFile('lock-seven-years.json',d,mission),mission.solution).done,name+' fails');}
for(const [name,mutate] of [['broad log prefix',d=>d.Rules[0].Filter.And.Prefix=''],['small override',d=>d.Rules[0].Filter.And.ObjectSizeGreaterThan=0],['no noncurrent cleanup',d=>d.Rules.splice(1,1)],['no incomplete abort',d=>d.Rules.splice(2,1)],['disabled rule',d=>d.Rules[0].Status='Disabled']]){const d=json(files['lifecycle.json']);mutate(d);check(!run(withFile('lifecycle.json',d,mission),mission.solution).done,name+' fails');}
for(const [name,patch] of [['governance old version',{Mode:'GOVERNANCE',RetainUntilDate:'2033-10-26T00:00:00Z'}],['short old version',{Mode:'COMPLIANCE',RetainUntilDate:'2027-10-26T00:00:00Z'}]])check(!run(withFile('existing-invoice-retention.json',patch,mission),mission.solution).done,name+' fails');
for(const [name,mutate] of [['wrong replication prefix',d=>d.Rules[0].Filter.Prefix='logs/'],['rep disabled',d=>d.Rules[0].Status='Disabled'],['rep markers enabled',d=>d.Rules[0].DeleteMarkerReplication.Status='Enabled'],['role missing',d=>d.Role='arn:aws:iam::123456789012:role/missing']]){const d=json(files['replication.json']);mutate(d);check(!run(withFile('replication.json',d,mission),mission.solution).done,name+' fails');}
const untrusted={...never,account:json(mission.account)};untrusted.account.roles[0].replication.trust='ec2.amazonaws.com';check(run(untrusted,mission.solution).text.includes('S3-trusted'),'replication service trust checked');
const roleMissing={...never,account:json(mission.account)};roleMissing.account.roles[0].replication.readLegalHold=false;check(run(roleMissing,mission.solution).text.includes('AccessDenied'),'source lock read permissions checked');
const noConvert={...mission,account:json(mission.account)};noConvert.account.buckets.find(b=>b.name==='shop-media').versions['photos/kurta.jpg'][0].storageClass='STANDARD';check(!run(noConvert,mission.solution).done,'tiering config does not convert Standard object');
const kmsCommand='aws s3api put-bucket-encryption --bucket shop-invoices --server-side-encryption-configuration \'{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms","KMSMasterKeyID":"alias/invoices"},"BucketKeyEnabled":true}]}\'';
const encryptionChange=run(never,[kmsCommand,'aws s3 cp invoice.txt s3://shop-invoices/invoices/new.pdf','aws s3api head-object --bucket shop-invoices --key invoices/INV-301.pdf --version-id v-keep','aws s3api head-object --bucket shop-invoices --key invoices/new.pdf']);
check(invoice(encryptionChange.state).serverSideEncryption==='AES256','new KMS default does not re-encrypt old invoice');
const encryptedNew=b(encryptionChange.state,'shop-invoices').versions['invoices/new.pdf'][0];check(encryptedNew.serverSideEncryption==='aws:kms'&&encryptedNew.kmsKey==='alias/invoices'&&encryptedNew.bucketKey,'future write snapshots KMS key and bucket-key state');
check(encryptionChange.text.includes('"SSEKMSKeyId": "alias/invoices"')&&encryptionChange.text.includes('"ServerSideEncryption": "AES256"'),'head-object reports version encryption');
const aesCommand='aws s3api put-bucket-encryption --bucket shop-invoices --server-side-encryption-configuration \'{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}\'';
const changedAgain=run(never,[kmsCommand,'aws s3 cp invoice.txt s3://shop-invoices/invoices/new.pdf',aesCommand,'aws s3api head-object --bucket shop-invoices --key invoices/new.pdf']);check(changedAgain.text.includes('"SSEKMSKeyId": "alias/invoices"'),'later default reset preserves previous KMS object');
const invalidLC=[null,{}, {Rules:[]},{Rules:[null]}, {Rules:[{Status:'Maybe',Filter:{},Expiration:{Days:1}}]}, {Rules:[{Status:'Enabled',Filter:{}}]}, {Rules:[{Status:'Enabled',Filter:{},Transitions:[{Days:15,StorageClass:'STANDARD_IA'}]}]}, {Rules:[{Status:'Enabled',Filter:{},Transitions:[{Days:30,StorageClass:'STANDARD_IA'},{Days:45,StorageClass:'GLACIER'}]}]}, {Rules:[{Status:'Enabled',Filter:{And:{Prefix:'logs/',ObjectSizeGreaterThan:-1}},Transitions:[{Days:30,StorageClass:'GLACIER'}]}]}, {Rules:[{Status:'Enabled',Filter:{},AbortIncompleteMultipartUpload:{DaysAfterInitiation:0}}]}, {Rules:[{Status:'Enabled',Filter:{},NoncurrentVersionExpiration:{NoncurrentDays:-1}}]}, {Rules:[{ID:'same',Status:'Enabled',Filter:{},Expiration:{Days:1}},{ID:'same',Status:'Enabled',Filter:{},Expiration:{Days:2}}]}];
const lcCmd=mission.solution[1].replace('lifecycle.json','bad.json');for(const cfg of invalidLC){const r=run(withFile('bad.json',cfg),[lcCmd]);check(!b(r.state,'shop-logs').lifecycle,'bad lifecycle atomic');check(!r.text.includes('simulator error:'),'bad lifecycle guarded');}
for(const cfg of [null,{}, {ObjectLockEnabled:'Disabled'}, {ObjectLockEnabled:'Enabled',Rule:{}}, {ObjectLockEnabled:'Enabled',Rule:{DefaultRetention:{Mode:'COMPLIANCE',Days:7,Years:7}}}, {ObjectLockEnabled:'Enabled',Rule:{DefaultRetention:{Mode:'COMPLIANCE',Years:0}}}]){const r=run(withFile('bad.json',cfg),[mission.solution[2].replace('lock-seven-years.json','bad.json')]);check(!b(r.state,'shop-invoices').objectLock,'bad lock config atomic');check(!r.text.includes('simulator error:'),'bad lock guarded');}
for(const cfg of [null,{}, {Mode:'COMPLIANCE',RetainUntilDate:'bad'}, {Mode:'COMPLIANCE',RetainUntilDate:'2020-01-01T00:00:00Z'}, {Mode:'WRONG',RetainUntilDate:'2033-01-01T00:00:00Z'}]){const r=run(withFile('bad.json',cfg),[mission.solution[2],mission.solution[3].replace('existing-invoice-retention.json','bad.json')]);check(!invoice(r.state).retention,'bad existing retention atomic');}
const g={...never,account:json(mission.account)};const ib=g.account.buckets[0];ib.objectLock={ObjectLockEnabled:'Enabled'};ib.versions['invoices/INV-301.pdf'][0].retention={Mode:'GOVERNANCE',RetainUntilDate:'2033-10-26T00:00:00Z'};
check(run(g,[protectedDelete]).state.account.buckets[0].versions['invoices/INV-301.pdf'].length===0,'authorized governance bypass works');
const noPermission={...g,account:json(g.account)};noPermission.account.canBypassGovernance=false;check(run(noPermission,[protectedDelete]).text.includes('AccessDenied'),'bypass flag without permission fails');
const hold={...g,account:json(g.account)};hold.account.buckets[0].versions['invoices/INV-301.pdf'][0].legalHold='ON';check(run(hold,[protectedDelete]).text.includes('AccessDenied'),'legal hold defeats governance bypass');
const readLock=run(never,[...mission.solution,'aws s3api get-object-retention --bucket shop-invoices --key invoices/INV-301.pdf --version-id v-keep','aws s3api get-object-lock-configuration --bucket shop-invoices']);check(readLock.text.includes('COMPLIANCE')&&readLock.text.includes('2033-10-26'),'retention reads report actual state');
for(const bad of [null,{}, {...files['tiering.json'],Id:'other'}, {...files['tiering.json'],Tierings:[{Days:89,AccessTier:'ARCHIVE_ACCESS'}]}, {...files['tiering.json'],Tierings:[{Days:731,AccessTier:'DEEP_ARCHIVE_ACCESS'}]}, {...files['tiering.json'],Tierings:[null]}]){const r=run(withFile('bad.json',bad),[mission.solution.at(-1).replace('tiering.json','bad.json')]);check(!b(r.state,'shop-media').intelligentTiering,'invalid tiering atomic');check(!r.text.includes('simulator error:'),'invalid tiering guarded');}
// Restore: pending read fails, polls needed, original class/data preserved, output verifies content.
const restoreNever={...interview,success:()=>false};
const premature=run(restoreNever,[interview.solution[0],interview.solution.at(-1)]);check(premature.text.includes('InvalidObjectState')&&!premature.state.downloads,'pending archive cannot download');
const firstPoll=run(restoreNever,interview.solution.slice(0,2));check(firstPoll.text.includes('ongoing-request=\"true\"')||firstPoll.text.includes('ongoing-request=\\\"true'),'first poll pending');
const secondPoll=run(restoreNever,interview.solution.slice(0,3));check(!secondPoll.state.downloads&&!interview.success(secondPoll.state),'readiness alone without verified download cannot win');
const restored=solved(interview);check(restored.state.downloads['audit-restored.txt'].body==='dummy audit source','restored bytes match fixture');
const duplicateRestore=run(restoreNever,[interview.solution[0],interview.solution[0]]);check(duplicateRestore.text.includes('RestoreAlreadyInProgress'),'resubmission not speedup');
const wrongVersion=interview.solution.map(c=>c.replaceAll('v-archive','missing'));check(!run(interview,wrongVersion).done,'wrong version cannot win');
const wrongOutput=interview.solution.slice();wrongOutput[3]=wrongOutput[3].replace('audit-restored.txt','wrong.txt');check(!run(interview,wrongOutput).done,'required recovery output not faked');
const junk=['','aws','aws s3api','sudo aws s3api get-bucket-versioning --bucket shop-invoices','AWS S3API GET-BUCKET-VERSIONING','aws s3api put-bucket-versioning --bucket shop-invoices --versioning-configuration Status=notEnabled','aws s3api head-object --bucket missing --key x','aws s3api head-object --bucket shop-invoices --key __proto__','aws s3api get-object --bucket shop-invoices --key constructor outfile','aws s3api put-bucket-replication --bucket shop-invoices --replication-configuration file://missing.json','aws s3api restore-object --bucket shop-invoices --key invoices/INV-301.pdf --restore-request Days=2,GlacierJobParameters={Tier=Standard}','aws s3api put-object-retention --bucket shop-invoices --key invoices/INV-301.pdf --retention null','aws s3api get-object-retention --bucket shop-invoices --key invoices/INV-301.pdf','aws s3api put-bucket-lifecycle-configuration --bucket shop-logs --unknown x','aws s3api head-object --bucket shop-invoices --key invoices/INV-301.pdf --query constructor','aws s3api get-bucket-versioning --bucket shop-invoices --output','cat __proto__'];
check(!run(never,junk).text.includes('simulator error:'),'garbage/types/prototype names guarded');check(!crashes.length,'no internal errors');
const discover=run(never,['aws s3api get-bucket-versioning --output text --query Status --bucket shop-invoices']);check(discover.text.includes('Enabled'),'flag order/query works');
const planner=level.stages.find(s=>s.type==='flowlab');let configurations=0,wins=0;
for(let size=0;size<=4;size++)for(let count=0;count<=3;count++)for(let ia=15;ia<=90;ia+=15)for(let glacier=0;glacier<=4;glacier++)for(let reads=0;reads<=50;reads+=10)for(let override=0;override<=1;override++){
 const k={size,count,ia,glacier,reads,override},m=planner.model(k);configurations++;check(m.readouts.every(r=>!/NaN|Infinity|undefined/.test(r.value)),'finite budget readouts');check(m.verdict.ok===planner.check(k),'planner/check agree');if(reads===0||size===0)check(!planner.check(k),'no shrinking reads or tiny-object penalty cheat');if(ia<30||glacier===4)check(!planner.check(k),'invalid age/early expiry cannot win');if(planner.check(k))wins++;
}
check(configurations===7200&&wins>0,'all7200 budgets tested');check(planner.check({size:3,count:1,ia:30,glacier:3,reads:10,override:0}),'explicit batch example wins');
const qs=[...level.stages.flatMap(s=>s.questions||[]),...level.stages.filter(s=>s.observe).map(s=>s.observe),...level.interview.questions.filter(q=>q.choices)],positions=[0,0,0,0],bias=[];
for(const q of qs){const lengths=q.choices.map(c=>c.replace(/<[^>]*>/g,'').length),n=lengths[q.answer],others=lengths.filter((_,i)=>i!==q.answer);if(others.every(x=>n>=x*1.15)||others.every(x=>n<=x*0.85))bias.push(q.q);positions[q.answer]++;check(!!q.explain,'every MCQ explains choices');}
check(bias.length/qs.length<0.05,'MCQ bias '+bias.length+'/'+qs.length+': '+bias.join('; '));check(Math.max(...positions)-Math.min(...positions)<=1,'positions balanced '+positions);check(!crashes.length,'no simulator crashes across focused runs');
console.log(`✅ ${checks} S3 Advanced regression checks passed (${configurations} annual-cost settings; retention, markers, replication prerequisites, restore bytes, parser and replay). MCQ bias ${bias.length}/${qs.length}; positions ${positions}.`);
