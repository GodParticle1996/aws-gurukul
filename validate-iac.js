#!/usr/bin/env node
// IaC native-JSON fixture regressions; offline only.
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
  for (const action of commands) {
    const command = typeof action === 'function' ? action(state) : action;
    input.value = command;
    input.fire('keydown', { key: 'Enter', preventDefault() {} });
    trace.push(done);
  }
  return { state, trace, done, text: output._kids.map(k => k.textContent).join('\n'), arena };
}

const level=AG.findLevel('iac'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal,copy=v=>JSON.parse(JSON.stringify(v));
const sol=mission.solution,isol=interview.solution,never={...mission,success:()=>false},neverI={...interview,success:()=>false};
const final=sol.at(-1),APP='shopkaro-orders-prod',ARCH='shopkaro-invoices-prod';
for(const stage of [mission,interview]){
 const r=run(stage,stage.solution);check(r.done===1,'intended solution wins: '+r.text.slice(-1600));check(r.trace.slice(0,-1).every(v=>v===0)&&r.trace.at(-1)===1,'wins only final action');check(stage.tasks.every(t=>t.check(r.state)),'tasks agree');
 check(run(stage,stage.solution).done===1,'reset replay');
 for(let i=0;i<stage.solution.length;i++){const o=run(stage,stage.solution.filter((_,j)=>j!==i));if(o.done)console.log('OMITTED',stage.title,i,o.trace,o.text);check(o.done===0,'omission '+i+' loses');}
}
const r=run(never,sol);check(mission.success(r.state),'reference ready');check(AG.iacCurrentPlan(r.state),'receipt current');check(r.state.account.securityGroups[0].ingress.length===1,'SSH actually removed');
function loses(label,cmds,stage=mission){const r=run(stage,cmds);check(r.done===0,label+' must lose');return r;}
function alt(label,cmds,stage=mission){const r=run(stage,cmds);check(r.done===1,label+' wins '+r.text.slice(-1200));check(r.trace.slice(0,-1).every(v=>!v),'alternative final-only '+label);}
alt('copy before init',[sol[1],sol[0],...sol.slice(2)]);
alt('automatic normal plan apply',[...sol.slice(0,3),'terraform apply -auto-approve',final]);
alt('non-detailed final full plan',[...sol.slice(0,-1),'terraform plan']);
alt('flags reordered and spaced',[...sol.slice(0,3),'terraform plan -input=false -out repair.tfplan','terraform apply -input=false repair.tfplan','terraform plan -no-color -detailed-exitcode']);
alt('optional audit and state inspection',[sol[0],'terraform validate','terraform plan','terraform state list','terraform state show aws_security_group.app',...sol.slice(1)]);
alt('same-type binding move before config rename',[isol[1],isol[0],isol[2]],interview);
loses('refresh only does not repair',[...sol.slice(0,3),'terraform plan -refresh-only -out=refresh.tfplan','terraform apply refresh.tfplan',final]);
loses('validate is not live repair',[...sol.slice(0,3),'terraform validate',final]);
for(const command of ['terraform plan -refresh-only','terraform plan -refresh=false','terraform plan -target=aws_s3_bucket.app','terraform plan -lock=false','terraform plan -destroy'])loses('incomplete final receipt '+command,[...sol.slice(0,-1),command]);
loses('import before config',[sol[0],sol[2],sol[1],...sol.slice(3)]);
const stale=loses('import stales saved plan',[sol[0],sol[1],sol[3],sol[2],sol[4],final]);check(stale.text.includes('Saved plan is stale'),'real stale diagnostic');
const refresh=run(never,[...sol.slice(0,3),'terraform plan -refresh-only -out=refresh.tfplan','terraform apply refresh.tfplan']);check(refresh.state.account.securityGroups[0].ingress.length===2,'refresh-only live drift remains');check(refresh.state.account.iacState.bindings['aws_security_group.app'].attrs.ingress.length===2,'refresh-only writes recorded state');
const guarded=run(never,[...sol,'terraform plan -destroy']);check(guarded.text.includes('prevent_destroy'),'guard blocks destruction');check(guarded.state.account.buckets.length===2,'guard leaves original data');
const removed=loses('removing config loses guard',[...sol.slice(0,-1),'rm main.tf.json','terraform plan','terraform destroy -auto-approve']);check(removed.text.includes('BucketNotEmpty'),'nonempty actual delete fails');check(removed.text.includes('will be destroyed'),'removed resource config bypasses lifecycle guard');check(removed.state.account.securityGroups.length===0&&!removed.state.account.iacState.bindings['aws_security_group.app'],'partial delete persists successful SG removal before bucket error; no fake transaction rollback');
const forgotten=loses('state rm forgets not deletes',[...sol.slice(0,-1),'terraform state rm aws_s3_bucket.archive',final]);check(forgotten.state.account.buckets.some(b=>b.name===ARCH),'state rm remote object remains');check(forgotten.text.includes('1 to add'),'forgotten existing bucket proposed create');
loses('state clear not reset',[sol[0],'terraform state rm aws_security_group.app','terraform state rm aws_s3_bucket.app',...sol.slice(1)]);
loses('wrong physical import',[...sol.slice(0,2),'terraform import aws_s3_bucket.archive '+APP,...sol.slice(3)]);
loses('wrong binding rename',[isol[0],'terraform state mv aws_s3_bucket.app aws_s3_bucket.invoices',isol[2]],interview);
const duplicate=run(never,[...sol,'terraform import aws_s3_bucket.archive '+ARCH]);check(duplicate.text.includes('already managed'),'duplicate address error');
// Save/apply uses planned config; current files alone must NOT trigger fake stale error.
const saved=run(never,[...sol.slice(0,4),s=>{s.files['main.tf.json'].content=JSON.stringify({resource:{}});return sol[4];}]);check(saved.state.account.securityGroups[0].ingress.length===1,'saved apply executes captured configuration');check(!saved.text.includes('Saved plan is stale'),'editing config alone not serial staleness');check(!mission.success(saved.state),'changed current config not certified');
const lineage=run(never,[...sol.slice(0,4),s=>{s.account.iacState.lineage='other';return sol[4];}]);check(lineage.text.includes('does not match'),'lineage mismatch rejected');
// Saved plan only rejects state changes; remote-only drift is not a state-serial detector.
const changed=run(never,[...sol.slice(0,4),s=>{s.account.securityGroups[0].ingress.push({...s.account.securityGroups[0].ingress[0],from_port:8080,to_port:8080});return sol[4];}]);check(!changed.text.includes('Saved plan is stale'),'remote drift alone does not bump Terraform serial');
const init={...mission,account:{...copy(mission.account),iacLock:{who:'owned-ci-run'}},success:()=>false};const lock=run(init,[sol[0],sol[1],sol[2]]);check(lock.text.includes('Error acquiring the state lock')&&lock.text.includes('owned-ci-run'),'held lock refuses mutation');check(Object.keys(lock.state.account.iacState.bindings).length===2,'lock failure no binding mutation');
// Config fixtures vary, not command-history matching. Malicious/destructive paths never win.
function variant(change){const v=copy(mission.files);const c=JSON.parse(v['templates/reviewed.json'].content);change(c);v['templates/reviewed.json'].content=JSON.stringify(c);return {...mission,files:v};}
for(const [label,change] of [
 ['no lifecycle',c=>Object.values(c.resource.aws_s3_bucket).forEach(b=>delete b.lifecycle)],
 ['force destroy',c=>c.resource.aws_s3_bucket.app.force_destroy=true],
 ['physical name replacement',c=>c.resource.aws_s3_bucket.app.bucket='different-orders-prod'],
 ['world SSH intent',c=>c.resource.aws_security_group.app.ingress[0].cidr_blocks=['0.0.0.0/0']],
 ['rename SG',c=>c.resource.aws_security_group.app.name='new-sg'],
 ['wrong VPC',c=>c.resource.aws_security_group.app.vpc_id='vpc-missing'],
 ['no archive config',c=>delete c.resource.aws_s3_bucket.archive],
 ['new archive physical name',c=>c.resource.aws_s3_bucket.archive.bucket='new-invoices-prod']
])loses(label,sol,variant(change));
const destructive=variant(c=>{delete c.resource.aws_s3_bucket.app.lifecycle;c.resource.aws_s3_bucket.app.force_destroy=true;c.resource.aws_s3_bucket.app.bucket='replacement-orders-prod';});
const firstForced=loses('force flag first set with replacement cannot delete nonempty bucket',sol,destructive);check(firstForced.text.includes('BucketNotEmpty')&&firstForced.state.account.buckets.some(b=>b.name===APP),'force flag needs prior successful apply');
const stagedForce=variant(c=>{delete c.resource.aws_s3_bucket.app.lifecycle;c.resource.aws_s3_bucket.app.force_destroy=true;});stagedForce.files['templates/destructive.json']=destructive.files['templates/reviewed.json'];const destroyed=loses('previously applied force flag permits destruction but loses mission',[...sol.slice(0,-1),'cp templates/destructive.json main.tf.json','terraform plan -out=delete.tfplan','terraform apply delete.tfplan',final],stagedForce);check(!destroyed.state.account.buckets.some(b=>b.name===APP),'previous state force flag empties/deletes original bucket; no invented backup');
check(mission.files['main.tf.json'].content===JSON.stringify({resource:{aws_security_group:{app:{name:'orders-app',description:'ShopKaro internal TLS',vpc_id:'vpc-iac-026',ingress:[{from_port:443,to_port:443,protocol:'tcp',cidr_blocks:['10.42.0.0/16'],description:'',ipv6_cidr_blocks:[],prefix_list_ids:[],security_groups:[],self:false}]}},aws_s3_bucket:{app:{bucket:APP,force_destroy:false}}}},null,2),'editable mission config did not leak across replays');
const defaultSafe=variant(c=>Object.values(c.resource.aws_s3_bucket).forEach(b=>delete b.force_destroy));alt('omitted force_destroy retains real false default',sol,defaultSafe);
const reimport=run({...stagedForce,success:()=>false},[...sol.slice(0,-1),'terraform state rm aws_s3_bucket.app','terraform import aws_s3_bucket.app '+APP]);check(reimport.state.account.iacState.bindings['aws_s3_bucket.app'].attrs.force_destroy===false,'CLI import does not recover provider force flag from remote S3');check(reimport.state.account.buckets.find(b=>b.name===APP).objects.length===1,'provider flag alone does not delete objects');
const malformed=[null,[],1,'bad',{}, {resource:[]},{resource:{aws_s3_bucket:null}},{resource:{aws_s3_bucket:{app:null}}},{resource:{aws_security_group:{app:{name:'n'}}}},{resource:{aws_s3_bucket:{app:{bucket:APP,force_destroy:'true'}}}},{resource:{aws_s3_bucket:{app:{bucket:APP,lifecycle:[]}}}},{resource:{aws_s3_bucket:{app:{bucket:APP,lifecycle:{prevent_destroy:'true'}}}}},{resource:{aws_instance:{web:{}}}}];
for(const data of malformed){const files=copy(mission.files);files['main.tf.json']={content:JSON.stringify(data)};const q=run({...never,files},['terraform init','terraform validate','terraform plan','terraform apply -auto-approve']);check(q.text.includes('Error:'),'malformed config useful error');check(!q.text.includes('simulator error'),'malformed config handled');}
for(const content of ['{bad','{"resource":{"__proto__":{}}}','{"resource":{"aws_s3_bucket":{"constructor":{"bucket":"abc"}}}}']){const files=copy(mission.files);files['main.tf.json']={content};const q=run({...never,files},['terraform init']);check(q.text.includes('Error:')&&!q.text.includes('simulator error'),'invalid JSON/prototype rejected');}
const garbage=['',' ','?','terraform','TERRAFORM init','sudo terraform init','tf plan','terraform nope','terraform plan --out=x','terraform plan -out','terraform plan -lock=maybe','terraform plan -lock-timeout=banana','terraform plan -target=bad','terraform plan -refresh-only -destroy','terraform plan -refresh-only -refresh=false','terraform plan -out=../../state','terraform apply no.tfplan','terraform state','terraform state mv','terraform state mv a b','terraform state show missing','terraform state rm absent','terraform import','terraform import bad x','terraform import aws_s3_bucket.archive missing','terraform destroy','cp','cp missing main.tf.json','cp templates/reviewed.json terraform.tfstate','rm -rf /','rm terraform.tfstate','terraform plan -unknown','terraform plan -out=x.tfplan -out=y.tfplan',"terraform plan 'bad",'apply -f main.tf.json','reset','terraform workspace delete prod'];
const helper=run(never,['help']);check(helper.text.includes('Terraform native-JSON fixture')&&!helper.text.includes('aws ec2'),'scoped IaC help');
const fuzz=run(never,[sol[0],...garbage]);check(!fuzz.text.includes('simulator error'),'garbage never escapes handler');check(!mission.success(fuzz.state),'garbage no win');
const spaced=run(mission,sol.map(x=>'  '+x.replace(/ /g,'   ')+'  '));check(spaced.done===1,'extra whitespace works');
// Current-state mutations invalidate receipt and cannot forge wins by retaining history.
for(const mutate of [s=>s.account.buckets[0].objects=[],s=>s.account.securityGroups[0].ingress.push({...s.account.securityGroups[0].ingress[0],from_port:22,to_port:22}),s=>s.account.iacBackend.use_lockfile=false,s=>delete s.account.iacState.bindings['aws_s3_bucket.archive'],s=>s.account.iacState.bindings['aws_s3_bucket.archive'].id=APP,s=>s.account.iacLock={who:'other'},s=>s.files['main.tf.json'].content='{}',s=>s.account.callerIdentity.Account='555555555555',s=>s.account.region='us-east-1',s=>s.account.vpcs=[]]){
 const q=run(never,[...sol,s=>{mutate(s);return 'terraform state list';}]);check(!mission.success(q.state),'current-state corruption loses after solved history');}
check(run(mission,sol).done===1,'fresh mission after corrupt fixture');
let states=0,winners=0;const flow=level.stages.find(s=>s.type==='flowlab');for(let address=0;address<3;address++)for(let physical=0;physical<2;physical++)for(let sg=0;sg<2;sg++)for(let guard=0;guard<2;guard++)for(let backend=0;backend<3;backend++){const k={address,physical,sg,guard,backend},m=flow.model(k);check(m.verdict.ok===flow.check(k),'planner state verdict');states++;if(flow.check(k))winners++;}check(states===72&&winners===1,'72 states unique safe refactor');
const qs=[];for(const st of level.stages){if(st.questions)qs.push(...st.questions);if(st.observe)qs.push(st.observe);for(const step of st.steps||[])if(step.ask)qs.push(step.ask);}qs.push(...level.interview.questions.filter(q=>q.choices));
let flagged=0;const positions=[0,0,0,0];for(const q of qs){positions[q.answer]++;const n=q.choices.map(x=>x.length),right=n[q.answer],wrong=n.filter((_,i)=>i!==q.answer);if(right>=1.15*Math.max(...wrong)||right<=.85*Math.min(...wrong)){flagged++;console.log('BIAS',q.q,n);}check(typeof q.explain==='string'&&q.explain.length>80,'meaningful explanation');}
check(flagged/qs.length<.05,'under5% length flags: '+flagged+'/'+qs.length);check(Math.max(...positions)-Math.min(...positions)<=1,'positions balanced '+positions);
check(!crashes.length,'no console error: '+crashes.join('; '));
console.log(`IaC focused: ${checks} checks · ${states} review states/${winners} safe · ${qs.length} MCQs/${flagged} length flags · positions ${positions.join('/')} · final-only wins`);
