#!/usr/bin/env node
// Focused EFS configuration, readiness and shared-file decision regressions. No AWS or Moto calls.
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
const level=AG.findLevel('efs'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
const never={...mission,success:()=>false},json=x=>JSON.parse(JSON.stringify(x));
const withFile=(name,value,base=never)=>({...base,files:{...base.files,[name]:{content:typeof value==='string'?value:JSON.stringify(value)}}});
const filesystem=s=>s.account.fileSystems.find(f=>f.id==='fs-web-shared'),target=(s,id)=>s.account.mountTargets.find(m=>m.id===id);
function solved(stage){const r=run(stage,stage.solution);check(r.done===1,'intended solution wins: '+r.text);check(r.trace.slice(0,-1).every(x=>x===0)&&r.trace.at(-1)===1,'only final readiness step wins');check(stage.tasks.every(t=>t.check(r.state)),'tasks agree with end state');return r;}
for(const stage of [mission,interview]){solved(stage);solved(stage);for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'every omitted action fails '+i);check(!stage.success(run({...stage,success:()=>false},['help']).state),'fresh replay reset incomplete');}
const complete=solved(mission);
check(filesystem(complete.state).files['/seller/catalog.txt']==='kurta catalogue v1','original fixture bytes preserved');
check(complete.state.account.accessPoints[0].state==='available','AP availability state required');
const readOnly=run(mission,['aws efs describe-file-systems','aws efs describe-mount-targets --file-system-id fs-web-shared','aws efs describe-access-points --file-system-id fs-web-shared']);check(!readOnly.done,'read-only list commands cannot repair state');
const pending=run(never,mission.solution.slice(0,-1));check(pending.state.account.accessPoints[0].state==='creating'&&!mission.success(pending.state),'AP acceptance alone not readiness');
const updating=run(never,mission.solution.slice(0,6));check(filesystem(updating.state).throughputMode==='bursting'&&filesystem(updating.state).state==='updating','old mode retained until completion');
const missingPoll=run(never,[...mission.solution.slice(0,6),mission.solution[7]]);check(!filesystem(missingPoll.state).lifecyclePolicies&&missingPoll.text.includes('IncorrectFileSystemLifeCycleState'),'cannot configure lifecycle on updating fixture');
const arbitraryTarget=run(mission,['aws efs create-mount-target --file-system-id fs-web-shared --subnet-id does-not-exist --security-groups sg-efs']);check(!arbitraryTarget.done&&arbitraryTarget.text.includes('SubnetNotFound')&&arbitraryTarget.state.account.mountTargets.length===2,'unknown subnet never fabricates AZ/default target');
const anotherSubnet={...never,account:json(mission.account)};anotherSubnet.account.subnets.push({id:'same-az-second-subnet',az:'ap-south-1a',vpcId:'vpc-prod'});
const duplicate=run(anotherSubnet,['aws efs create-mount-target --file-system-id fs-web-shared --subnet-id same-az-second-subnet --security-groups sg-efs']);check(duplicate.text.includes('MountTargetConflict')&&duplicate.state.account.mountTargets.length===2,'one per AZ, not per subnet');
const foreign={...never,account:json(mission.account)};foreign.account.subnets.push({id:'subnet-foreign',az:'ap-south-1c',vpcId:'vpc-other'});foreign.account.securityGroups.push({id:'sg-foreign',vpcId:'vpc-other',ingress:[]});
check(run(foreign,['aws efs create-mount-target --file-system-id fs-web-shared --subnet-id subnet-foreign --security-groups sg-foreign']).text.includes('one VPC'),'cross-VPC mount targets rejected');
check(run(foreign,['aws efs modify-mount-target-security-groups --mount-target-id fsmt-a --security-groups sg-foreign']).text.includes('must belong'),'foreign SG rejected on existing endpoint');
for(const suffix of ['', ' --security-groups missing', ' --security-groups sg-efs --nonsense true']){const r=run(never,['aws efs create-mount-target --file-system-id fs-web-shared --subnet-id subnet-priv-1c'+suffix]);check(r.state.account.mountTargets.length===2,'bad/missing security group atomic');check(!r.text.includes('simulator error:'),'error handled');}
const wrongAttachment=run(mission,mission.solution.map(c=>c.startsWith('aws efs modify-mount-target')?c.replace('--security-groups sg-efs','--security-groups sg-app'):c));check(!wrongAttachment.done,'rule on unattached SG cannot win');
const publicIngress=mission.solution.map(c=>c.includes('--source-group')?c.replace('--source-group sg-app','--cidr 0.0.0.0/0'):c);check(!run(mission,publicIngress).done,'broad NFS ingress cannot win');
const wrongPort=mission.solution.map(c=>c.replace('--port 2049','--port 22'));check(!run(mission,wrongPort).done,'SSH does not solve NFS');
const wrongMode=mission.solution.map(c=>c.replace('--throughput-mode elastic','--throughput-mode bursting'));check(!run(mission,wrongMode).done,'no throughput/Archive cheat');
const removeData={...mission,account:json(mission.account)};removeData.account.fileSystems[0].files={};check(!run(removeData,mission.solution).done,'deleting shared file cannot win');
const oneZone={...never,account:json(mission.account)};oneZone.account.fileSystems[0].az='ap-south-1a';check(run(oneZone,[mission.solution[3]]).text.includes('One Zone'),'One Zone cannot add foreign-AZ target');
const maxio={...never,account:json(mission.account)};maxio.account.fileSystems[0].performanceMode='maxIO';check(run(maxio,[mission.solution[5]]).text.includes('General Purpose'),'MaxIO incompatible with Elastic');
const invalidPolicies=[null,{},[null],[{}],[{TransitionToIA:'AFTER_2_DAYS'}],[{TransitionToIA:'AFTER_30_DAYS',TransitionToArchive:'AFTER_90_DAYS'}],[{TransitionToArchive:'AFTER_90_DAYS'}],[{TransitionToIA:'AFTER_90_DAYS'},{TransitionToArchive:'AFTER_30_DAYS'}],[{TransitionToPrimaryStorageClass:'AFTER_2_ACCESS'}],[{TransitionToIA:'AFTER_30_DAYS'},{TransitionToIA:'AFTER_60_DAYS'}]];
for(const cfg of invalidPolicies){const r=run(withFile('bad.json',cfg),[mission.solution[5],mission.solution[6],mission.solution[7].replace('lifecycle.json','bad.json')]);check(!filesystem(r.state).lifecyclePolicies,'invalid lifecycle atomic');check(!r.text.includes('simulator error:'),'invalid lifecycle guarded');}
const cleared=run(withFile('empty.json',[]),[...mission.solution,'aws efs put-lifecycle-configuration --file-system-id fs-web-shared --lifecycle-policies file://empty.json']);check(filesystem(cleared.state).lifecyclePolicies.length===0&&!mission.success(cleared.state),'valid empty array clears config and revokes goal');
const lockedMode=run(never,[...mission.solution,'aws efs update-file-system --file-system-id fs-web-shared --throughput-mode bursting']);check(lockedMode.text.includes('Remove Archive')&&filesystem(lockedMode.state).throughputMode==='elastic','cannot leave Elastic while Archive configured');
const reordered=JSON.parse(mission.files['lifecycle.json'].content).reverse();check(run(withFile('lifecycle.json',reordered,mission),mission.solution).done===1,'semantic lifecycle policy order allowed');
for(const [name,value] of [['user.json',null],['user.json',{}],['user.json',{Uid:-1,Gid:1001}],['user.json',{Uid:'1001',Gid:1001}],['user.json',{Uid:1001,Gid:1001,SecondaryGids:[-1]}],['root.json',null],['root.json',{Path:'relative'}],['root.json',{Path:'/seller',CreationInfo:{OwnerUid:1001,OwnerGid:1001,Permissions:'999'}}]]){const r=run(withFile(name,value),[mission.solution[8]]);check(r.state.account.accessPoints.length===0,'bad AP input atomic');check(!r.text.includes('simulator error:'),'AP errors handled');}
for(const [name,value] of [['user.json',{Uid:0,Gid:0}],['root.json',{Path:'/',CreationInfo:{OwnerUid:1001,OwnerGid:1001,Permissions:'750'}}],['root.json',{Path:'/seller',CreationInfo:{OwnerUid:1001,OwnerGid:1001,Permissions:'777'}}],['root.json',{Path:'/seller'}]])check(!run(withFile(name,value,mission),mission.solution).done,'valid but wrong/broad application config cannot win');
const sameAP=run(never,[mission.solution[8],mission.solution[8],mission.solution[9]]);check(sameAP.state.account.accessPoints.length===1&&sameAP.state.account.accessPoints[0].state==='available','same token replay not duplicate AP');
const defaultsAP=run(never,['aws efs create-access-point --file-system-id fs-web-shared --client-token defaults','aws efs describe-access-points --file-system-id fs-web-shared']);check(defaultsAP.state.account.accessPoints[0].rootDirectory.Path==='/'&&!defaultsAP.state.account.accessPoints[0].posixUser&&!mission.success(defaultsAP.state),'valid optional AP flags do not imply requested identity');
const reorderedRoot={CreationInfo:{Permissions:'750',OwnerGid:1001,OwnerUid:1001},Path:'/seller'},reorderedUser={Gid:1001,Uid:1001};
const semanticFiles=withFile('user2.json',reorderedUser,withFile('root2.json',reorderedRoot));const semanticAP=run(semanticFiles,[mission.solution[8],mission.solution[8].replace('user.json','user2.json').replace('root.json','root2.json')]);check(semanticAP.state.account.accessPoints.length===1&&!semanticAP.text.includes('AccessPointAlreadyExists'),'semantically identical JSON key order replays');
const deleteFs=run(never,['aws efs delete-file-system --file-system-id fs-web-shared']);check(deleteFs.text.includes('FileSystemInUse')&&filesystem(deleteFs.state),'cannot delete in-use FS to bypass repair');
const delMt=run(never,[...mission.solution,'aws efs delete-mount-target --mount-target-id fsmt-a']);check(!mission.success(delMt.state),'removing original target revokes readiness');
const delAP=run(never,[...mission.solution,'aws efs delete-access-point --access-point-id fsap-000000002']);check(!mission.success(delAP.state),'AP deletion revokes goal');
const newFs=run(never,['aws efs create-file-system --creation-token isolated --encrypted --throughput-mode elastic','aws efs describe-file-systems --creation-token isolated','aws efs create-file-system --creation-token isolated']);check(newFs.state.account.fileSystems.length===2&&newFs.text.includes('FileSystemAlreadyExists'),'creation token duplicate guarded');
const fakeNewFs=run(mission,['aws efs create-file-system --creation-token substitute --encrypted --throughput-mode elastic',...mission.solution]);check(!fakeNewFs.done,'substitute extra file system cannot win preservation requirement');
for(const command of ['aws efs update-file-system --file-system-id fs-web-shared --throughput-mode provisioned','aws efs update-file-system --file-system-id fs-web-shared --throughput-mode provisioned --provisioned-throughput-in-mibps NaN','aws efs update-file-system --file-system-id fs-web-shared --throughput-mode elastic --provisioned-throughput-in-mibps 100']){const r=run(never,[command]);check(filesystem(r.state).state==='available'&&!filesystem(r.state).pendingThroughput,'invalid throughput atomic');}
const provisioned=run(never,['aws efs update-file-system --file-system-id fs-web-shared --throughput-mode provisioned --provisioned-throughput-in-mibps 100','aws efs describe-file-systems --file-system-id fs-web-shared']);check(filesystem(provisioned.state).provisionedThroughputInMibps===100,'valid reservation persists after available');
const shortcut=run(never,['aws efs create-access-point --file-system-id fs-web-shared --client-token shorthand --posix-user Uid=1001,Gid=1001 --root-directory Path=/seller,CreationInfo={OwnerUid=1001,OwnerGid=1001,Permissions=750}']);check(shortcut.state.account.accessPoints[0].rootDirectory.Path==='/seller','real CLI shorthand supported');
const junk=['','aws','aws efs','sudo aws efs describe-file-systems','AWS EFS DESCRIBE-FILE-SYSTEMS','aws efs update-file-system','aws efs describe-mount-targets','aws efs describe-mount-targets --file-system-id missing','aws efs describe-mount-targets --file-system-id fs-web-shared --mount-target-id fsmt-a','aws efs modify-mount-target-security-groups --mount-target-id missing --security-groups sg-efs','aws efs create-access-point --file-system-id fs-web-shared --client-token x --posix-user null --root-directory null','aws efs put-lifecycle-configuration --file-system-id fs-web-shared --lifecycle-policies file://__proto__','aws efs create-mount-target --file-system-id fs-web-shared --subnet-id __proto__ --security-groups constructor','aws efs describe-file-systems --query constructor','aws efs wait file-system-available --file-system-id fs-web-shared'];
check(!run(never,junk).text.includes('simulator error:'),'garbage/prototype/missing branches never throw');check(!crashes.length,'no internal errors');
const flagsOrder=run(never,['  aws   efs describe-file-systems --query FileSystems[0].ThroughputMode --output text --file-system-id=fs-web-shared  ']);check(flagsOrder.text.includes('bursting'),'whitespace/equals/flag order/query');
const idempotent=run(never,[...mission.solution,...mission.solution]);check(mission.success(idempotent.state),'configuration replay preserves final correct state');
const planner=level.stages.find(s=>s.type==='flowlab');let configurations=0,wins=0;
for(let data=0;data<=2;data++)for(let hot=20;hot<=100;hot+=20)for(let peak=50;peak<=250;peak+=50)for(let hours=1;hours<=7;hours+=2)for(let mode=0;mode<=2;mode++)for(let provisioned=50;provisioned<=250;provisioned+=50){const k={data,hot,peak,hours,mode,provisioned},m=planner.model(k);configurations++;check(m.readouts.every(r=>!/NaN|Infinity|undefined/.test(r.value)),'finite planner');check(m.verdict.ok===planner.check(k),'planner verdict agrees');if(data===0||peak<200)check(!planner.check(k),'shrinking required data/demand cannot win');if(planner.check(k))wins++;}
check(configurations===4500&&wins>0,'all4500 planner settings checked');check(planner.check({data:1,hot:20,peak:200,hours:1,mode:1,provisioned:100}),'documented Elastic example wins');check(planner.check({data:1,hot:20,peak:200,hours:1,mode:2,provisioned:100}),'known read/write mix can choose valid Provisioned alternative');
for(const n of level.stages[0].nodes){const w=Math.max(180,84+12.4*n.label.length);check(n.x-w/2>=8&&n.x+w/2<=992,'node horizontally inside diagram');check(n.y>=34&&n.y<=486,'node vertically inside diagram');}
const qs=[...level.stages.flatMap(s=>s.questions||[]),...level.stages.filter(s=>s.observe).map(s=>s.observe),...level.interview.questions.filter(q=>q.choices)],positions=[0,0,0,0],bias=[];
for(const q of qs){const lengths=q.choices.map(c=>c.replace(/<[^>]*>/g,'').length),n=lengths[q.answer],others=lengths.filter((_,i)=>i!==q.answer);if(others.every(x=>n>=x*1.15)||others.every(x=>n<=x*0.85))bias.push({q:q.q,lengths});positions[q.answer]++;check(!!q.explain,'MCQ explanation');}
check(bias.length/qs.length<0.05,'MCQ length bias '+JSON.stringify(bias));check(Math.max(...positions)-Math.min(...positions)<=1,'positions balanced '+positions);check(!crashes.length,'no final crashes');
console.log(`✅ ${checks} EFS regression checks passed (${configurations} planner settings; state readiness, SG attachments, AZ/VPC constraints, identity, lifecycle, parser and replay). MCQ bias ${bias.length}/${qs.length}; positions ${positions}.`);
