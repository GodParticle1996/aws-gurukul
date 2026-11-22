#!/usr/bin/env node
// Run the D6 missions through the terminal and check every calculator setting.
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

const level = AG.findLevel('edge');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;

const E=AG.pixEdge;
const inspect=(commands,stage=mission)=>run({...stage,success:()=>false},commands);
const withFile=(stage,name,change)=>{
  const data=JSON.parse(stage.files[name].content);
  change(data);
  return {...stage,files:{...stage.files,[name]:{content:JSON.stringify(data)}}};
};
for(const stage of [mission,interview]){
  const ok=run(stage,stage.solution);
  check(ok.done===1 && stage.tasks.every(t=>t.check(ok.state)),stage.title+'\n'+ok.text.slice(-2200));
  check(ok.trace.slice(0,-1).every(n=>n===0),'only last viewer check completes');
  for(let i=0;i<stage.solution.length;i++) check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'omitted step '+stage.title+' '+i);
}
const [create,grant,update,wait,image,,asha,dev,blocked]=mission.solution;
const requested=inspect([...mission.solution,'aws cloudfront get-distribution-config --id EPIX38']);
check(requested.text.includes('p7-v1') && requested.text.includes('HTTP 403') && requested.text.includes('HTTP 200') &&
  requested.text.includes('asha ka feed') && requested.text.includes('dev ka feed') && requested.text.includes('WebACLId'),'viewer and AWS readbacks');
const a=requested.state.account;
check(a.edgeReceipts.map(r=>r.source).join(',')==='S3,HIT,ALB,ALB,WAF','real order of fixture effects');
const routed=E.deployed(a);
for(const path of ['/api','/api/me','/images','/IMAGES/p7.jpg','/apiary','/images-old/p7.jpg'])
  check(E.behavior(routed,path).TargetOriginId==='private-api','default '+path);
for(const path of ['/images/p7-v1.jpg','/images/thumbs/p7.jpg','/images/'])
  check(E.behavior(routed,path).TargetOriginId==='images','ordered image path '+path);
const apiBase="curl -i -H 'Authorization: Bearer asha' https://edge.pixshare.example";
const more=inspect([...mission.solution,apiBase+'/api',apiBase+'/apiary',dev.replace("-H 'Authorization: Bearer dev' ",''),image.replace('p7-v1','missing')]);
check(more.state.account.edgeReceipts.slice(-4).map(r=>r.status).join(',')==='200,404,401,404','exact API root, unrelated prefix, missing login and missing image');
for(const mutation of [c=>{c.DefaultCacheBehavior.CachePolicyId=E.optimized;}, c=>{delete c.DefaultCacheBehavior.OriginRequestPolicyId;},
  c=>{c.CacheBehaviors.Items[0].PathPattern='/api/*';},c=>{c.CacheBehaviors.Items[0].CachePolicyId=E.disabled;},
  c=>{c.WebACLId='';},c=>{c.Origins.Items[0].OriginAccessControlId='';},c=>{c.CacheBehaviors.Items[0].TargetOriginId='private-api';},
  c=>{c.Origins.Items[1].VpcOriginConfig.VpcOriginId='missing';},c=>{c.DefaultCacheBehavior.ViewerProtocolPolicy='allow-all';}]){
  const wrong=withFile(mission,'routes.json',mutation);
  check(!run(wrong,wrong.solution).done,'wrong route cannot win');
}
for(const mutation of [p=>{p.Statement[0].Resource='arn:aws:s3:::pix-edge-images/*';},p=>{p.Statement[0].Principal.Service='ec2.amazonaws.com';},
  p=>{p.Statement[0].Condition.StringEquals['AWS:SourceArn']+='other';}]){
  const wrong=withFile(mission,'images-policy.json',mutation);
  check(!run(wrong,wrong.solution).done,'only release bucket grant counts');
}
const invalidOac=withFile(mission,'oac.json',c=>{c.SigningBehavior='never';});
check(!run(invalidOac,invalidOac.solution).done,'unsigned OAC cannot fetch private object');
for(const bad of [c=>{c.WebACLId=E.acl.replace(':global/',':regional/');},c=>{c.Origins.Items[1].CustomOriginConfig={};},
  c=>{c.Origins.Quantity=1;},c=>{c.CallerReference='new';},c=>{c.CacheBehaviors.Items[0].TargetOriginId='missing';}]){
  const wrong=withFile(mission,'routes.json',bad),out=inspect([create,update],wrong);
  check(out.state.account.cloudfront[0].etag==='E1' && out.state.account.cloudfront[0].status==='Deployed','bad config rejected atomically');
}
const early=inspect([create,grant,update,image,asha,blocked,wait]);
check(!mission.success(early.state) && early.state.account.edgeReceipts.every(r=>!r.deployed),'pending version cannot prove deployment');
const stale=inspect([create,grant,update,update,wait]);
check(stale.text.includes('PreconditionFailed') && stale.state.account.cloudfront[0].etag==='E2','stale update atomic');
const reuse=inspect([...mission.solution,update.replace('E1','E2'),wait]);
check(!mission.success(reuse.state),'old viewer evidence cannot confirm another deployment');
const again=inspect([...mission.solution,update.replace('E1','E2'),wait,image,image,asha,dev,blocked]);
check(mission.success(again.state),'warm public object survives release and fresh viewers prove new configuration');
const readOnly=inspect(['aws cloudfront get-distribution-config --id EPIX38',image,asha,blocked]);
check(!mission.success(readOnly.state),'read-only cannot win');
const originRead=inspect(['aws elbv2 describe-load-balancers --names pix-api']);
check(originRead.text.includes('internal') && originRead.text.includes('us-east-1b'),'internal ALB readback');
const evict=inspect([...mission.solution,'aws cloudfront create-invalidation --distribution-id EPIX38 --paths /images/p7-v1.jpg',
  'aws cloudfront wait invalidation-completed --distribution-id EPIX38 --id I000001',image]);
check(evict.state.account.edgeReceipts.at(-1).source==='S3','viewer uses the same cache as completed invalidation');
const revoked=inspect([...mission.solution,'aws s3api delete-bucket-policy --bucket pix-edge-images',image]);
check(revoked.state.account.edgeReceipts.at(-1).source==='HIT' && !mission.success(revoked.state),'a warm public photo cannot certify a broken origin grant');
const flow=level.stages.find(s=>s.type==='flowlab');
let settings=0,wins=0;
for(const cache of [0,25,50,75,100])for(const proto of [0,1,2])for(const fixed of [0,1])for(const far of [0,25,50,75,100]){
  const k={cache,proto,fixed,far}, result=flow.model(k),values=result.readouts.map(r=>r.value),f=far/100;
  const hit=proto===0?.8*cache/100:0, times=[45+130*f,(1-hit)*(55+130*f)+hit*(12+8*f),40+100*f];
  const prices=[9,(100-far)*.085+far*.11+(100-far)*.01+far*.022,9+18+7.2+(100-far)*.015+far*.04];
  const allowed=[!fixed,!fixed && proto===0,true];
  for(let i=0;i<3;i++){
    if(!allowed[i]){check(values[i]==='Is shart par fit nahi','protocol and address restrictions');continue;}
    const match=values[i].match(/^([\d.]+) ms · ≈ \$([\d.]+)$/);
    check(match && Math.abs(+match[1]-times[i])<.05001 && Math.abs(+match[2]-prices[i])<.00501,'independent fee and latency calculation');
  }
  const names=[proto===0?'Seedha ALB':'Seedha NLB','CloudFront',proto===0?'GA → ALB':'GA → NLB'];
  const all=[0,1,2].filter(i=>allowed[i]),within=all.filter(i=>times[i]<=85);
  const best=within.length?within.sort((i,j)=>prices[i]-prices[j])[0]:all.sort((i,j)=>times[i]-times[j])[0];
  check(values[3]===names[best] && values[4]===(best===1?Math.round(hit*100):0)+'%','cheapest feasible or fastest supported path');
  const fit=cache===75 && proto===0 && fixed===0 && far===75;
  check(flow.check(k)===fit && result.verdict.ok===fit,'goal settings');
  settings++; if(fit)wins++;
}
check(settings===150 && wins===1,'full edge calculator grid');
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
console.log(`   ✓ ${checks} edge checks · ${settings} settings/1 fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join("/")}`);
