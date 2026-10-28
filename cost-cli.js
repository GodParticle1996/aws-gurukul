/* Scoped cost fixture: metadata and declared TEST preservation contracts, not a
   billing meter or disk/runtime emulator. CE history is immutable training data. */
(()=>{
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),copy=v=>JSON.parse(JSON.stringify(v));
 const canon=v=>Array.isArray(v)?v.map(canon):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
 const safe=(v,depth=0)=>depth<=30&&(!obj(v)&&!Array.isArray(v)||Object.keys(v).every(k=>!['__proto__','constructor','prototype'].includes(k)&&safe(v[k],depth+1)));
 const specs={ec2:{'describe-volumes':['volume-ids*','filters*'],'create-snapshot':['volume-id','description'],'describe-snapshots':['snapshot-ids*','owner-ids*'],'wait':['snapshot-ids*'],'delete-volume':['volume-id'],'delete-snapshot':['snapshot-id'],'modify-volume':['volume-id','volume-type','size','iops','throughput'],'describe-volumes-modifications':['volume-ids*'],'describe-addresses':['allocation-ids*'],'release-address':['allocation-id']},
  logs:{'describe-log-groups':['log-group-name-prefix'],'put-retention-policy':['log-group-name','retention-in-days'],'delete-retention-policy':['log-group-name'],'delete-log-group':['log-group-name']},
  budgets:{'create-budget':['account-id','budget','notifications-with-subscribers'],'describe-budget':['account-id','budget-name'],'delete-budget':['account-id','budget-name'],'create-notification':['account-id','budget-name','notification','subscribers'],'describe-notifications-for-budget':['account-id','budget-name'],'describe-subscribers-for-notification':['account-id','budget-name','notification']},
  sns:{'get-topic-attributes':['topic-arn'],'set-topic-attributes':['topic-arn','attribute-name','attribute-value']},
  ce:{'get-cost-and-usage':['time-period','granularity','metrics*','group-by*']}};
 AG.costFingerprint=a=>JSON.stringify(canon({region:a.region,identity:a.callerIdentity,volumes:a.volumes,snapshots:a.snapshots,addresses:a.addresses,logs:a.logGroups,topics:a.topics,budgets:a.budgets,instances:a.instances,vpcs:a.vpcs}));
 AG.costCurrentRead=(a,kind)=>!!a.costRead&&a.costRead.kind===kind&&a.costRead.fingerprint===AG.costFingerprint(a);
 // Deliberately limited estimate, not a statement about incremental snapshot bytes.
 AG.costEstimate=a=>({usd:(a.volumes||[]).reduce((sum,v)=>sum+v.size*(v.type==='gp3'?.08:.10)+(v.type==='gp3'?Math.max(0,v.iops-3000)*.005+Math.max(0,v.throughput-125)*.04:0),0)+(a.addresses||[]).length*.005*730,scope:'Approx us-east-1 EBS capacity/provisioned gp3 I/O + listed AWS-provided Elastic IP allocations only; excludes EC2, snapshots, logs, network, tax, credits and commitments.'});
 AG.costTopicAllowed=(a,arn)=>{
  const p=(a.topics||[]).find(t=>t.arn===arn)?.policy,one=(v,w)=>v===w||Array.isArray(v)&&v.length===1&&v[0]===w;
  if(!obj(p)||p.Version!=='2012-10-17'||!Array.isArray(p.Statement)||p.Statement.length!==1)return false;
  const s=p.Statement[0],c=s?.Condition;
  return obj(s)&&Object.keys(s).every(k=>['Sid','Effect','Principal','Action','Resource','Condition'].includes(k))&&s.Effect==='Allow'&&obj(s.Principal)&&Object.keys(s.Principal).length===1&&one(s.Principal.Service,'budgets.amazonaws.com')&&one(s.Action,'SNS:Publish')&&one(s.Resource,arn)&&obj(c)&&Object.keys(c).length===2&&obj(c.StringEquals)&&Object.keys(c.StringEquals).length===1&&one(c.StringEquals['aws:SourceAccount'],a.callerIdentity.Account)&&obj(c.ArnLike)&&Object.keys(c.ArnLike).length===1&&one(c.ArnLike['aws:SourceArn'],`arn:aws:budgets::${a.callerIdentity.Account}:*`);
 };
 AG.costCLI=({service,op,toks,flag,flags,sim,print,resultJson})=>{
  if(!sim.account.costMode||!own(specs,service))return false;
  const a=sim.account,req=k=>{const v=flag(k);if(v===null||v==='')throw Error('aws: error: the following arguments are required: --'+k);return v;},rows=k=>a[k]||(a[k]=[]);
  const file=raw=>{if(!raw.startsWith('file://'))return raw;const f=own(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error('Unable to load paramfile '+raw+'; ls lists mission files.');return f.content;};
  const json=k=>{let d;try{d=JSON.parse(file(req(k)));}catch(e){throw Error('Error parsing --'+k+': '+e.message);}if(!safe(d))throw Error('InvalidParameterException: unsafe keys or nesting exceeds the fixture limit');return d;};
  const integer=(v,lo,hi,k)=>{if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<lo||Number(v)>hi)throw Error('InvalidParameterValue: '+k+' must be an integer '+lo+'..'+hi);return Number(v);};
  const missing=(code,id)=>{throw Error(code+': '+id+' does not exist in this account/Region.');};
  const vol=id=>rows('volumes').find(v=>v.id===id)||missing('InvalidVolume.NotFound',id),snap=id=>rows('snapshots').find(s=>s.id===id)||missing('InvalidSnapshot.NotFound',id);
  const topic=arn=>rows('topics').find(t=>t.arn===arn)||missing('NotFound',arn);
  const volumeJSON=v=>({VolumeId:v.id,Size:v.size,VolumeType:v.type,Iops:v.iops,...(v.type==='gp3'?{Throughput:v.throughput}:{}),State:v.state,Encrypted:v.encrypted,Attachments:v.attachedTo?[{InstanceId:v.attachedTo,State:'attached'}]:[],Tags:Object.entries(v.tags||{}).map(([Key,Value])=>({Key,Value}))});
  const snapshotJSON=s=>({SnapshotId:s.id,VolumeId:s.volumeId,VolumeSize:s.size,State:s.state,Encrypted:s.encrypted,Description:s.description,OwnerId:a.callerIdentity.Account});
  const notice=d=>{
   if(!obj(d)||Object.keys(d).some(k=>!['NotificationType','ComparisonOperator','Threshold','ThresholdType','NotificationState'].includes(k))||!['ACTUAL','FORECASTED'].includes(d.NotificationType)||!['GREATER_THAN','LESS_THAN','EQUAL_TO'].includes(d.ComparisonOperator)||typeof d.Threshold!=='number'||!Number.isFinite(d.Threshold)||d.Threshold<0||d.Threshold>1.5e13||(d.ThresholdType!==undefined&&!['PERCENTAGE','ABSOLUTE_VALUE'].includes(d.ThresholdType))||(d.NotificationState!==undefined&&!['OK','ALARM'].includes(d.NotificationState)))throw Error('InvalidParameterException: valid NotificationType, ComparisonOperator, numeric Threshold and ThresholdType required.');
   return {...copy(d),ThresholdType:d.ThresholdType||'PERCENTAGE'};
  };
  const subscribers=d=>{if(!Array.isArray(d)||!d.length||d.length>11||d.some(s=>!obj(s)||Object.keys(s).some(k=>!['SubscriptionType','Address'].includes(k))||!['SNS','EMAIL'].includes(s.SubscriptionType)||typeof s.Address!=='string'||!s.Address||/[\s]/.test(s.Address))||d.filter(s=>s.SubscriptionType==='SNS').length>1||d.filter(s=>s.SubscriptionType==='EMAIL').length>10)throw Error('InvalidParameterException: Subscribers needs up to1 SNS and10 EMAIL entries.');
   for(const s of d)if(s.SubscriptionType==='SNS'&&!AG.costTopicAllowed(a,s.Address))throw Error('InvalidParameterException: Invalid SNS topic. Same-account topic policy must allow budgets.amazonaws.com; inspect SourceAccount/SourceArn.');else if(s.SubscriptionType==='EMAIL'&&!/^[^@]+@[^@]+\.[^@]+$/.test(s.Address))throw Error('InvalidParameterException: invalid email subscriber. Fixture stores metadata only; sends no mail.');return copy(d);};
  const group=name=>rows('logGroups').find(g=>g.name===name)||missing('ResourceNotFoundException',name);
  try{
   if(!own(specs[service],op))throw Error('Cost fixture does not model aws '+service+' '+op+'. Inspect volumes/snapshots/addresses/log groups/budgets; no live billing engine.');
   const allowed=specs[service][op].concat(['query','output','region','no-cli-pager!'],service==='ec2'?['dry-run!','no-dry-run!']:[]),seen=new Set();
   for(let i=3;i<toks.length;){if(service==='ec2'&&op==='wait'&&i===3){i++;continue;}const key=toks[i].startsWith('--')?toks[i].slice(2):'',spec=allowed.find(x=>x.replace(/[*!]$/,'')===key);if(!spec)throw Error('Unknown options: '+toks[i]);if(seen.has(key))throw Error('Duplicate option --'+key);seen.add(key);if(spec.endsWith('!')){i++;continue;}if(!toks[i+1]||toks[i+1].startsWith('--'))throw Error('aws: error: --'+key+' expected an argument');i+=2;if(spec.endsWith('*'))while(i<toks.length&&!toks[i].startsWith('--'))i++;}
   if(flag('output')&&!['json','table','text'].includes(flag('output')))throw Error('Unknown output type: '+flag('output'));
   if(flag('region')&&flag('region')!==a.region&&!['ce','budgets'].includes(service))throw Error('Cost fixture resources are in '+a.region);
   if(toks.includes('--dry-run')){const requiredByOperation={'create-snapshot':['volume-id'],'delete-volume':['volume-id'],'modify-volume':['volume-id'],'delete-snapshot':['snapshot-id'],'release-address':['allocation-id']};for(const name of requiredByOperation[op]||[])req(name);print('err','DryRunOperation: Request would have succeeded, but DryRun flag is set. No changes made.');return true;}
   if(service==='ec2'){
    if(op==='describe-volumes'){
     let data=rows('volumes');const ids=flags('volume-ids');if(ids.length)data=ids.map(vol);
     for(const f of flags('filters')){const m=f.match(/^Name=(status|volume-id|tag:[A-Za-z0-9_-]+),Values=(.+)$/);if(!m)throw Error('InvalidParameterValue: fixture filters status, volume-id or tag:KEY only.');const vals=m[2].split(',');data=data.filter(v=>vals.includes(m[1]==='status'?v.state:m[1]==='volume-id'?v.id:(v.tags||{})[m[1].slice(4)]));}
     resultJson({Volumes:data.map(volumeJSON)});return true;
    }
    if(op==='create-snapshot'){
     const v=vol(req('volume-id'));if((flag('description')||'').length>255)throw Error('InvalidParameterValue: snapshot description exceeds255 characters.');const n=(a.costSnapshotSeq||0)+1;a.costSnapshotSeq=n;const s={id:'snap-0c027'+String(n).padStart(12,'0'),volumeId:v.id,size:v.size,encrypted:v.encrypted,description:flag('description')||'',state:'pending',testData:copy(v.testData||[])};rows('snapshots').push(s);resultJson(snapshotJSON(s));print('sys','Declared metadata snapshot; snapshot-completed waiter models completion. No block copy or restore benchmark runs in this browser.');return true;
    }
    if(op==='wait'){
     if(toks[3]!=='snapshot-completed')throw Error('Cost fixture models aws ec2 wait snapshot-completed --snapshot-ids ID only.');const ids=flags('snapshot-ids');if(!ids.length)throw Error('aws: error: --snapshot-ids is required');const ss=ids.map(snap);if(ss.some(s=>!['pending','completed'].includes(s.state)))throw Error('Waiter SnapshotCompleted failed: snapshot state not pending/completed.');ss.forEach(s=>s.state='completed');print('ok','');return true;
    }
    if(op==='describe-snapshots'){const ids=flags('snapshot-ids'),owners=flags('owner-ids'),selected=ids.length?ids.map(snap):rows('snapshots');resultJson({Snapshots:(owners.length&&!owners.some(o=>o==='self'||o===a.callerIdentity.Account)?[]:selected).map(snapshotJSON)});return true;}
    if(op==='delete-volume'){const v=vol(req('volume-id'));if(v.attachedTo||v.state!=='available')throw Error('VolumeInUse: Volume is currently attached or not available; inspect ownership and attachment.');a.volumes=rows('volumes').filter(x=>x!==v);resultJson({});return true;}
    if(op==='delete-snapshot'){const s=snap(req('snapshot-id'));if(s.inUseByImage)throw Error('InvalidSnapshot.InUse: snapshot is referenced by an AMI.');a.snapshots=rows('snapshots').filter(x=>x!==s);resultJson({});return true;}
    if(op==='modify-volume'){
     const v=vol(req('volume-id')),type=flag('volume-type')||v.type;if(!['gp2','gp3'].includes(type))throw Error('InvalidParameterValue: cost fixture models gp2/gp3 only.');const size=flag('size')===null?v.size:integer(flag('size'),v.size,type==='gp3'?65536:16384,'size; EBS cannot shrink');
     if(type!=='gp3'&&(flag('iops')!==null||flag('throughput')!==null))throw Error('InvalidParameterValue: this fixture accepts IOPS/throughput for gp3 only.');
     const iops=type==='gp3'?(flag('iops')===null?(v.type==='gp3'?v.iops:3000):integer(flag('iops'),3000,80000,'iops')):Math.min(16000,Math.max(100,size*3)),throughput=type==='gp3'?(flag('throughput')===null?(v.type==='gp3'?v.throughput:125):integer(flag('throughput'),125,2000,'throughput')):250;
     if(type==='gp3'&&(iops>Math.max(3000,size*500)||throughput>Math.max(125,iops*.25)))throw Error('InvalidParameterValue: gp3 size/IOPS/throughput ratios exceeded.');
     Object.assign(v,{type,size,iops,throughput});a.costModification={VolumeId:v.id,TargetVolumeType:type,TargetSize:size,TargetIops:iops,TargetThroughput:throughput,ModificationState:'modifying'};resultJson({VolumeModification:copy(a.costModification)});print('sys','Requested metadata updated in bounded model. Real AWS: poll describe-volumes-modifications; modification timing/filesystem/I/O are not simulated. Explicit performance targets avoid CLI/default ambiguity.');return true;
    }
    if(op==='describe-volumes-modifications'){const ids=flags('volume-ids');if(ids.length)ids.forEach(vol);resultJson({VolumesModifications:a.costModification&&(!ids.length||ids.includes(a.costModification.VolumeId))?[copy(a.costModification)]:[]});return true;}
    if(op==='describe-addresses'){const ids=flags('allocation-ids');resultJson({Addresses:(ids.length?ids.map(id=>rows('addresses').find(x=>x.allocationId===id)||missing('InvalidAllocationID.NotFound',id)):rows('addresses')).map(x=>({AllocationId:x.allocationId,PublicIp:x.publicIp,...(x.instanceId?{InstanceId:x.instanceId,AssociationId:x.associationId}:{} )}))});return true;}
    if(op==='release-address'){const id=req('allocation-id'),ip=rows('addresses').find(x=>x.allocationId===id);if(!ip)missing('InvalidAllocationID.NotFound',id);if(ip.instanceId||ip.natId)throw Error('InvalidIPAddress.InUse: address is associated; production connectivity is not disposable.');a.addresses=rows('addresses').filter(x=>x!==ip);resultJson({});return true;}
   }
   if(service==='logs'){
    if(op==='describe-log-groups'){const prefix=flag('log-group-name-prefix')||'';resultJson({logGroups:rows('logGroups').filter(g=>g.name.startsWith(prefix)).map(g=>({logGroupName:g.name,...(g.retention?{retentionInDays:g.retention}:{})}))});return true;}
    const g=group(req('log-group-name'));if(op==='delete-log-group')a.logGroups=rows('logGroups').filter(x=>x!==g);else if(op==='delete-retention-policy')delete g.retention;else{const n=integer(req('retention-in-days'),1,3653,'retention-in-days');if(![1,3,5,7,14,30,60,90,120,150,180,365,400,545,731,1096,1827,2192,2557,2922,3288,3653].includes(n))throw Error('InvalidParameterException: unsupported retention duration.');g.retention=n;}resultJson({});return true;
   }
   if(service==='sns'){
    const t=topic(req('topic-arn'));if(op==='get-topic-attributes'){resultJson({Attributes:{TopicArn:t.arn,Policy:JSON.stringify(t.policy)}});return true;}
    if(req('attribute-name')!=='Policy')throw Error('Cost fixture models SNS Policy attribute only.');let p;try{p=JSON.parse(file(req('attribute-value')));}catch(e){throw Error('InvalidParameter: Policy requires valid JSON/file.');}if(!obj(p)||!safe(p)||!Array.isArray(p.Statement)||p.Statement.some(s=>!obj(s)))throw Error('InvalidParameter: Policy needs Statement objects.');t.policy=copy(p);resultJson({});return true;
   }
   if(service==='budgets'){
    if(req('account-id')!==a.callerIdentity.Account)throw Error('AccessDeniedException: account-id does not match current platform role.');
    if(op==='create-budget'){
     const d=json('budget');if(!obj(d)||Object.keys(d).some(k=>!['BudgetName','BudgetLimit','TimeUnit','BudgetType'].includes(k))||typeof d.BudgetName!=='string'||!d.BudgetName||d.BudgetName.length>100||/[:\\\x00-\x1f]/.test(d.BudgetName)||/<script>/i.test(d.BudgetName)||!obj(d.BudgetLimit)||typeof d.BudgetLimit.Amount!=='string'||!/^\d+(?:\.\d+)?$/.test(d.BudgetLimit.Amount)||Number(d.BudgetLimit.Amount)<=0||d.BudgetLimit.Unit!=='USD'||d.TimeUnit!=='MONTHLY'||d.BudgetType!=='COST')throw Error('InvalidParameterException: fixture needs monthly COST budget, positive string BudgetLimit.Amount and Unit USD.');
     if(rows('budgets').some(b=>b.definition.BudgetName===d.BudgetName))throw Error('DuplicateRecordException: Budget already exists.');let ns=[];
     if(flag('notifications-with-subscribers')!==null){const raw=json('notifications-with-subscribers');if(!Array.isArray(raw)||raw.length>5||raw.some(n=>!obj(n)||Object.keys(n).some(k=>!['Notification','Subscribers'].includes(k))))throw Error('InvalidParameterException: notifications must be an array with up to5 entries.');ns=raw.map(n=>({Notification:notice(n.Notification),Subscribers:subscribers(n.Subscribers)}));}
     rows('budgets').push({definition:copy(d),notifications:ns});resultJson({});return true;
    }
    const name=req('budget-name'),b=rows('budgets').find(b=>b.definition.BudgetName===name);if(!b)throw Error('NotFoundException: budget '+name+' does not exist.');
    if(op==='delete-budget'){a.budgets=rows('budgets').filter(x=>x!==b);resultJson({});return true;}
    if(op==='create-notification'){const n=notice(json('notification')),ss=subscribers(json('subscribers'));if(b.notifications.some(x=>JSON.stringify(canon(x.Notification))===JSON.stringify(canon(n))))throw Error('DuplicateRecordException: notification already exists.');if(b.notifications.length>=5)throw Error('CreationLimitExceededException: maximum5 notifications per budget.');b.notifications.push({Notification:n,Subscribers:ss});resultJson({});return true;}
    if(op==='describe-subscribers-for-notification'){const n=notice(json('notification')),hit=b.notifications.find(x=>JSON.stringify(canon(x.Notification))===JSON.stringify(canon(n)));if(!hit)throw Error('NotFoundException: notification does not exist.');resultJson({Subscribers:copy(hit.Subscribers)});return true;}
    resultJson(op==='describe-budget'?{Budget:copy(b.definition)}:{Notifications:b.notifications.map(n=>copy(n.Notification))});
    if(!toks.includes('--query'))a.costRead={kind:op==='describe-budget'?'budget':'notifications',fingerprint:AG.costFingerprint(a)};return true;
   }
   if(service==='ce'){
    const t=req('time-period'),m=t.match(/^Start=(\d{4}-\d\d-\d\d),End=(\d{4}-\d\d-\d\d)$/);if(!m||m[1]>=m[2])throw Error('ValidationException: time-period requires Start=YYYY-MM-DD,End=YYYY-MM-DD; end exclusive.');if(req('granularity')!=='MONTHLY'||flags('metrics').join(',')!=='UnblendedCost')throw Error('Cost fixture exposes recorded MONTHLY UnblendedCost only.');
    const gs=flags('group-by');if(gs.length&&gs.join('|')!=='Type=DIMENSION,Key=USAGE_TYPE')throw Error('Cost fixture supports only group-by Type=DIMENSION,Key=USAGE_TYPE.');const validDate=d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;if(!validDate(m[1])||!validDate(m[2]))throw Error('ValidationException: invalid calendar date.');const history=copy((a.costHistory||[]).filter(p=>p.TimePeriod.Start>=m[1]&&p.TimePeriod.End<=m[2]));if(gs.length)history.forEach(p=>{p.Groups=(a.costUsageGroups?.[p.TimePeriod.Start]||[]).map(g=>({Keys:[g.key],Metrics:{UnblendedCost:{Amount:g.usd,Unit:'USD'}}}));p.Total={};});resultJson({ResultsByTime:history});print('sys','Fictional recorded billing fixture, not actual AWS costs. Resource cleanup does not rewrite historical charges. Live billing/alerts are delayed.');return true;
   }
  }catch(e){print('err',e.message);return true;}
  return true;
 };
})();
