#!/usr/bin/env node
// Focused regressions for the real-syntax VPC simulator. No AWS or Moto calls.
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
const level=AG.findLevel('cloudfront'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
const never={...mission,success:()=>false},json=x=>JSON.parse(JSON.stringify(x));
const withFile=(name,doc,base=never)=>({...base,files:{...base.files,[name]:{content:typeof doc==='string'?doc:JSON.stringify(doc)}}});
function solved(stage){const r=run(stage,stage.solution);check(r.done===1,'intended solve wins');check(r.trace.slice(0,-1).every(x=>x===0)&&r.trace.at(-1)===1,'only final action wins');check(stage.tasks.every(t=>t.check(r.state)),'tasks and win agree');return r;}
for(const stage of [mission,interview]){solved(stage);solved(stage);for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'omitted state action '+i+' fails');check(!stage.success(run({...stage,success:()=>false},['help']).state),'fresh reset not won');}
const done=solved(mission),c=done.state.account.cloudfront[0];
check(c.etag==='E2'&&c.status==='Deployed','update advances ETag and deployment');
check(AG.cdnResponse(done.state.account,c,'/img/kurta-red.jpg').version==='v2','fresh origin fixture content v2');
const pending=run(never,mission.solution.slice(0,-1));check(!mission.success(pending.state),'InProgress invalidation cannot win');check(AG.cdnResponse(pending.state.account,pending.state.account.cloudfront[0],'/img/kurta-red.jpg').version==='v1','old edge bytes remain until completion');
const missingPolicy=run(never,mission.solution.filter((_,i)=>i!==3));check(AG.cdnResponse(missingPolicy.state.account,missingPolicy.state.account.cloudfront[0],'/img/kurta-red.jpg').status===403,'completed eviction exposes actual missing origin permission');
const stale=run(never,[mission.solution[0],mission.solution[1],mission.solution[1]]);check(stale.text.includes('PreconditionFailed'),'stale ETag rejected');check(stale.state.account.cloudfront[0].etag==='E2','stale failure leaves version unchanged');
const copied=json(mission.files);check(JSON.stringify(mission.files)===JSON.stringify(copied),'solution does not mutate lesson file data');
const cfg=JSON.parse(mission.files['distribution-fixed.json'].content),policy=JSON.parse(mission.files['origin-policy.json'].content),oac=JSON.parse(mission.files['oac.json'].content);
for(const [label,mutate] of [
 ['OAC unattached',d=>delete d.Origins.Items[0].OriginAccessControlId],['API cached',d=>d.CacheBehaviors.Items[0].CachePolicyId=d.DefaultCacheBehavior.CachePolicyId],['API no forwarding',d=>delete d.CacheBehaviors.Items[0].OriginRequestPolicyId],['API wrong origin',d=>d.CacheBehaviors.Items[0].TargetOriginId='images'],['API behavior deleted',d=>{delete d.CacheBehaviors;}],['disabled',d=>d.Enabled=false],['viewer insecure',d=>d.DefaultCacheBehavior.ViewerProtocolPolicy='allow-all'],['API lacks POST',d=>{d.CacheBehaviors.Items[0].AllowedMethods={Quantity:2,Items:['GET','HEAD']};}],['unexpected viewer restriction',d=>{d.DefaultCacheBehavior.TrustedKeyGroups={Enabled:true,Quantity:1,Items:['paid']};}],['API viewer insecure',d=>d.CacheBehaviors.Items[0].ViewerProtocolPolicy='allow-all'],['origin changed',d=>d.Origins.Items[0].DomainName='other.s3.ap-south-1.amazonaws.com'],
]){const d=json(cfg);mutate(d);check(!run(withFile('distribution-fixed.json',d,mission),mission.solution).done,label+' cannot win');}
for(const [label,mutate] of [['wrong SourceArn',p=>p.Statement[0].Condition.StringEquals['AWS:SourceArn']='arn:aws:cloudfront::123456789012:distribution/OTHER'],['missing condition',p=>delete p.Statement[0].Condition],['wrong principal',p=>p.Statement[0].Principal={AWS:'arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity OLD'}],['bucket not object ARN',p=>p.Statement[0].Resource='arn:aws:s3:::shop-images'],['wrong action',p=>p.Statement[0].Action='s3:ListBucket'],['explicit deny',p=>p.Statement.push({Effect:'Deny',Principal:'*',Action:'s3:GetObject',Resource:'arn:aws:s3:::shop-images/*'})]]){const p=json(policy);mutate(p);check(!run(withFile('origin-policy.json',p,mission),mission.solution).done,label+' cannot win');}
for(const signing of ['never','no-override'])check(!run(withFile('oac.json',{...oac,SigningBehavior:signing},mission),mission.solution).done,'wrong required signing '+signing+' fails');
const otherPath=mission.solution.slice();otherPath[4]=otherPath[4].replace('kurta-red','different');check(!run(mission,otherPath).done,'wrong-path eviction cannot win');
const noComplete=run(never,[...mission.solution.slice(0,-1),'aws cloudfront get-invalidation --distribution-id ESHOP --id I000001']);check(!mission.success(noComplete.state),'read invalidation not fake completion');
const broad=mission.solution.slice();broad[4]="aws cloudfront create-invalidation --distribution-id ESHOP --paths '/img/*'";check(run(mission,broad).done===1,'valid wildcard eviction alternative works');
for(const command of ['terraform destroy','aws cloudfront disable-distribution --id ESHOP','aws cloudfront delete-distribution --id ESHOP --if-match E1','aws s3api delete-bucket --bucket shop-images']){
 const r=run(never,[...mission.solution.slice(0,-1),command,mission.solution.at(-1)]);if(command.includes('delete-bucket'))check(!mission.success(r.state),'deleting bucket cannot win');else check(!r.text.includes('simulator error:'),'destructive shortcut produces handled response');
}
// Invalid full-config updates must be atomic, including malformed nested data.
for(const bad of [null,[],{}, {...cfg,CallerReference:'changed'}, {...cfg,Enabled:'true'}, {...cfg,Origins:null}, {...cfg,Origins:{Quantity:2,Items:[null,null]}}, {...cfg,Origins:{Quantity:1,Items:cfg.Origins.Items}}, {...cfg,DefaultCacheBehavior:{}}, {...cfg,CacheBehaviors:{Quantity:1,Items:[null]}}, {...cfg,Aliases:{Quantity:1,Items:['cdn.shopkaro.in']},ViewerCertificate:{ACMCertificateArn:'arn:aws:acm:ap-south-1:123:certificate/x'}}, {...cfg,PriceClass:'cheap'}]){
 const r=run(withFile('bad.json',bad),[mission.solution[0],'aws cloudfront update-distribution --id ESHOP --if-match E1 --distribution-config file://bad.json']);
 check(r.state.account.cloudfront[0].etag==='E1','invalid config no version mutation');check(r.state.account.cloudfront[0].status==='Deployed','invalid config leaves serving status');check(!r.text.includes('simulator error:'),'bad nested config guarded');
}
for(const bad of [null,{}, {...oac,Name:''}, {...oac,SigningProtocol:'sigv2'}, {...oac,OriginAccessControlOriginType:'website'}, {...oac,SigningBehavior:'sometimes'}]){const r=run(withFile('bad.json',bad),['aws cloudfront create-origin-access-control --origin-access-control-config file://bad.json']);check(!r.state.account.originAccessControls.length,'invalid OAC atomic');}
const wrongSigning=withFile('bad-signing.json',{...oac,SigningBehavior:'never'});const recover=run(wrongSigning,[mission.solution[0].replace('oac.json','bad-signing.json'),...mission.solution.slice(1),'aws cloudfront update-origin-access-control --id OAC000001 --if-match O1 --origin-access-control-config file://oac.json']);check(mission.success(recover.state),'wrong signing can be repaired on same OAC');check(recover.state.account.originAccessControls[0].etag==='O2','OAC update advances concurrency version');const staleOac=run(wrongSigning,[mission.solution[0].replace('oac.json','bad-signing.json'),'aws cloudfront update-origin-access-control --id OAC000001 --if-match wrong --origin-access-control-config file://oac.json']);check(staleOac.text.includes('PreconditionFailed')&&staleOac.state.account.originAccessControls[0].config.SigningBehavior==='never','stale OAC repair atomic');
const duplicate=run(never,[mission.solution[0],mission.solution[0]]);check(duplicate.text.includes('AlreadyExists')&&duplicate.state.account.originAccessControls.length===1,'OAC names unique');
const noDescription={...oac};delete noDescription.Description;check(run(withFile('oac.json',noDescription),[mission.solution[0]]).state.account.originAccessControls.length===1,'OAC Description optional per AWS API');
const blocked=run(never,[...mission.solution.slice(0,3),'aws cloudfront delete-origin-access-control --id OAC000001 --if-match O1']);check(blocked.text.includes('OriginAccessControlInUse'),'attached OAC cannot delete');
const detached=json(cfg);delete detached.Origins.Items[0].OriginAccessControlId;const detachCmd='aws cloudfront update-distribution --id ESHOP --if-match E2 --distribution-config file://detach.json';const dc='aws cloudfront delete-origin-access-control --id OAC000001 --if-match O1';const detachPending=run(withFile('detach.json',detached),[...mission.solution,detachCmd,dc]);check(detachPending.text.includes('OriginAccessControlInUse'),'deployed OAC reference still protects pending detach');const detachDone=run(withFile('detach.json',detached),[...mission.solution,detachCmd,'aws cloudfront wait distribution-deployed --id ESHOP',dc]);check(detachDone.state.account.originAccessControls.length===0,'completed detach allows OAC deletion');
const duringUpdate=run(never,mission.solution.slice(0,2));check(AG.cdnResponse(duringUpdate.state.account,duringUpdate.state.account.cloudfront[0],'/img/kurta-red.jpg').version==='v1','old deployed snapshot still serves during config update');
const item={CallerReference:'test-idempotent',Paths:{Quantity:1,Items:['/img/kurta-red.jpg']}};
const icmd='aws cloudfront create-invalidation --distribution-id ESHOP --invalidation-batch file://inv.json';
const idem=run(withFile('inv.json',item),[icmd,icmd]);check(idem.state.account.cloudfront[0].invalidations.length===1,'same caller+paths invalidation idempotent');
for(const bad of [null,{}, {CallerReference:'x',Paths:{Quantity:1,Items:[]}}, {CallerReference:'x',Paths:{Quantity:1,Items:[null]}}, {CallerReference:'x',Paths:{Quantity:1,Items:['img/a']}}, {CallerReference:'x',Paths:{Quantity:1,Items:['/im*g/x']}}]){const r=run(withFile('inv.json',bad),[icmd]);check(!(r.state.account.cloudfront[0].invalidations||[]).length,'bad invalidation atomic');check(!r.text.includes('simulator error:'),'invalid path never throws');}
const junk=['','  ','aws','aws cloudfront','sudo aws cloudfront list-distributions','AWS CLOUDFRONT LIST-DISTRIBUTIONS','aws cloudfront nope','aws cloudfront update-distribution','aws cloudfront update-distribution --id ESHOP','aws cloudfront update-distribution --id ESHOP --if-match E1 --distribution-config file://missing.json','cat __proto__','aws cloudfront get-distribution-config --id missing','aws cloudfront create-invalidation --distribution-id ESHOP --paths','aws cloudfront list-cache-policies --type nope','aws cloudfront list-distributions --query constructor','aws cloudfront list-distributions --query','aws cloudfront list-distributions --output','aws cloudfront list-distributions --wrong yes','aws cloudfront wait nope --id ESHOP','aws cloudfront get-origin-access-control --id missing','aws cloudfront get-invalidation --distribution-id ESHOP --id missing','aws cloudfront get-cache-policy --id missing'];
check(!run(never,junk).text.includes('simulator error:'),'garbage flags/missing fields handled');check(!crashes.length,'no logged internal crashes');
const reorder=run(never,['aws   cloudfront get-distribution-config --output text --query ETag --id ESHOP']);check(reorder.text.includes('E1'),'extra spaces/flag order/query supported');
const read=run(never,['aws cloudfront list-cache-policies --type managed','aws cloudfront get-cache-policy --id 4135ea2d-6df8-44a3-9df3-4b5a84be39ad']);check(read.text.includes('Managed-CachingDisabled')&&read.text.includes('"MinTTL": 0'),'actual managed policies inspectable');
// Both origin authorization and content source are checked; cached bytes alone cannot certify origin access.
const before=run(never,['help']);check(AG.cdnResponse(before.state.account,before.state.account.cloudfront[0],'/img/kurta-red.jpg').version==='v1','old cache hit remains despite broken origin auth');
const denied=json(done.state.account);denied.buckets[0].policy.Statement.push({Effect:'Deny',Principal:'*',Action:'s3:GetObject',Resource:'arn:aws:s3:::shop-images/*'});check(AG.cdnResponse(denied,denied.cloudfront[0],'/img/kurta-red.jpg').status===403,'explicit deny overrides scoped allow');
const diagram=level.stages.find(s=>s.type==='dryrun');for(const n of diagram.nodes){const w=Math.max(180,Math.round(84+n.label.length*12.4));check(n.x-w/2>=0&&n.x+w/2<=1000&&n.y-33>=0&&n.y+33<=520,'diagram node not clipped '+n.id);}for(let i=0;i<diagram.nodes.length;i++)for(let j=i+1;j<diagram.nodes.length;j++){const a=diagram.nodes[i],b=diagram.nodes[j],aw=Math.max(180,Math.round(84+a.label.length*12.4)),bw=Math.max(180,Math.round(84+b.label.length*12.4));check(Math.abs(a.x-b.x)>=(aw+bw)/2+8||Math.abs(a.y-b.y)>=74,'diagram nodes not touching '+a.id+'/'+b.id);}
const planner=level.stages.find(s=>s.type==='flowlab');let count=0,wins=0;
for(let days=0;days<=7;days++)for(let key=0;key<=2;key++)for(let requests=10;requests<=50;requests+=10)for(let versioned=0;versioned<=1;versioned++){
 const k={days,key,requests,versioned},m=planner.model(k);count++;check(m.readouts.every(r=>!/NaN|Infinity|undefined/.test(r.value)),'finite readouts');check(m.verdict.ok===planner.check(k),'check/render agree');if(requests<20)check(!planner.check(k),'fixed demand cannot shrink');if(days===0||!versioned)check(!planner.check(k),'no-cache or stale path cannot meet combined goals');if(planner.check(k))wins++;
}
check(count===240&&wins>0,'all240 model configurations tested');check(planner.check({days:1,key:0,requests:20,versioned:1}),'documented planner solution wins');
const qs=[...level.stages.flatMap(s=>s.questions||[]),...level.stages.filter(s=>s.observe).map(s=>s.observe),...level.interview.questions.filter(q=>q.choices)],positions=[0,0,0,0],flags=[];
for(const q of qs){const ns=q.choices.map(s=>s.replace(/<[^>]*>/g,'').length),n=ns[q.answer],other=ns.filter((_,i)=>i!==q.answer);if(other.every(x=>n>=x*1.15)||other.every(x=>n<=x*0.85))flags.push(q.q);positions[q.answer]++;check(!!q.explain,'all MCQs explain correct and wrong approaches');}
check(flags.length/qs.length<0.05,'MCQ length bias '+flags.length+'/'+qs.length+': '+flags.join('; '));check(Math.max(...positions)-Math.min(...positions)<=1,'balanced positions '+positions);check(!crashes.length,'all focused tests no engine errors');
console.log(`✅ ${checks} CloudFront regression checks passed (${count} cache budgets; ETags, OAC, private policy, deployment, eviction, parser and reset). MCQ bias ${flags.length}/${qs.length}; positions ${positions}.`);
