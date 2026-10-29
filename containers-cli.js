/* Scoped container fixture (account.containerMode only). Real CLI syntax for ECR (tag immutability incl. exclusion
   filters, registry/repository scan on push, lifecycle policy + preview) and ECS on Fargate (task definitions,
   services with a launch type or FARGATE/FARGATE_SPOT strategy, rolling deployments with the circuit breaker,
   tasks, services-stable waiter), plus read-only IAM roles and target groups. A declared start contract decides
   each deployment: roles trusted by ecs-tasks, a network path to ECR (NAT, IGW + public IP, or ecr.api + ecr.dkr +
   S3 gateway endpoints), execution-role pull/log permissions, tag → digest resolution, CPU architecture, an
   existing log group, and a task security group the ALB can reach. App S3 calls follow the task role. No container
   runtime, image push, real health probe, scheduling delay or Spot interruption is simulated. */
(()=>{
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x),clone=x=>JSON.parse(JSON.stringify(x));
 const BAD=['__proto__','constructor','prototype'],steps=(a,b,s)=>{const r=[];for(let v=a;v<=b;v+=s)r.push(v);return r;};
 /* Fargate Linux task sizes: CPU units → allowed memory (MiB). 8/16/32 vCPU need platform 1.4.0. */
 const FARGATE={256:[512,1024,2048],512:[1024,2048,3072,4096],1024:steps(2048,8192,1024),2048:steps(4096,16384,1024),4096:steps(8192,30720,1024),8192:steps(16384,61440,4096),16384:steps(32768,122880,8192),32768:[61440,122880,249856]};
 const specs={
  ecr:{'describe-repositories':['repository-names*'],'create-repository':['repository-name','image-tag-mutability','image-tag-mutability-exclusion-filters*','image-scanning-configuration'],
   'describe-images':['repository-name','image-ids*'],'list-images':['repository-name'],'put-image-tag-mutability':['repository-name','image-tag-mutability','image-tag-mutability-exclusion-filters*'],
   'put-image-scanning-configuration':['repository-name','image-scanning-configuration'],'put-registry-scanning-configuration':['scan-type','rules*'],'get-registry-scanning-configuration':[],
   'put-lifecycle-policy':['repository-name','lifecycle-policy-text'],'get-lifecycle-policy':['repository-name'],'delete-lifecycle-policy':['repository-name'],
   'start-lifecycle-policy-preview':['repository-name','lifecycle-policy-text'],'get-lifecycle-policy-preview':['repository-name'],'batch-delete-image':['repository-name','image-ids*'],'get-login-password':[]},
  ecs:{'list-clusters':[],'describe-clusters':['clusters*'],'create-cluster':['cluster-name','capacity-providers*'],
   'register-task-definition':['cli-input-json','family','execution-role-arn','task-role-arn','cpu','memory','network-mode','requires-compatibilities*','runtime-platform','container-definitions'],
   'describe-task-definition':['task-definition'],'list-task-definitions':['family-prefix','status'],'deregister-task-definition':['task-definition'],
   'create-service':['cli-input-json','cluster','service-name','task-definition','desired-count','launch-type','capacity-provider-strategy*','network-configuration','load-balancers*','deployment-configuration','deployment-controller'],
   'update-service':['cluster','service','task-definition','desired-count','deployment-configuration','force-new-deployment!'],'describe-services':['cluster','services*'],'list-services':['cluster'],
   'delete-service':['cluster','service','force!'],'list-tasks':['cluster','service-name','desired-status'],'describe-tasks':['cluster','tasks*'],'wait':['cluster','services*']},
  iam:{'get-role':['role-name'],'list-attached-role-policies':['role-name'],'list-roles':[]},
  elbv2:{'describe-target-groups':['target-group-arns*','names*'],'describe-target-health':['target-group-arn']}
 };
 const wild=(p,t)=>new RegExp('^'+String(p).split('*').map(x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(String(t));
 /* AWS CLI shorthand subset: a=b,c={d=e},f=[x,y]. Prototype keys are rejected. */
 function shorthand(text){
  const s=String(text);let i=0;
  const key=()=>{const j=i;while(i<s.length&&/[A-Za-z0-9_]/.test(s[i]))i++;const k=s.slice(j,i);if(!k||BAD.includes(k))throw Error('key');return k;};
  const val=()=>{
   if(s[i]==='{'){i++;const o={};while(s[i]!=='}'){const k=key();if(s[i++]!=='=')throw Error('=');o[k]=val();if(s[i]===',')i++;else if(s[i]!=='}')throw Error(',');}i++;return o;}
   if(s[i]==='['){i++;const l=[];while(s[i]!==']'){if(i>=s.length)throw Error(']');l.push(val());if(s[i]===',')i++;else if(s[i]!==']')throw Error(',');}i++;return l;}
   const j=i;while(i<s.length&&!',{}[]'.includes(s[i]))i++;const raw=s.slice(j,i);if(!raw)throw Error('value');return raw==='true'?true:raw==='false'?false:/^\d+$/.test(raw)?Number(raw):raw;};
  const o={};while(i<s.length){const k=key();if(s[i++]!=='=')throw Error('=');o[k]=val();if(i<s.length&&s[i++]!==',')throw Error(',');}
  if(!Object.keys(o).length)throw Error('empty');return o;
 }
 const roleBy=(a,arn)=>(a.iamRoles||[]).find(r=>r.arn===arn),assumable=(a,arn)=>{const r=roleBy(a,arn);return !!r&&r.trust==='ecs-tasks.amazonaws.com';};
 const grants=(a,arn,g)=>{const r=roleBy(a,arn);return !!r&&(r.grants||[]).includes(g);};
 const repoOf=(a,name)=>(a.ecrRepositories||[]).find(r=>r.name===name);
 AG.containerImageRef=image=>{const m=String(image||'').match(/^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com\/([a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)(?::([A-Za-z0-9_][A-Za-z0-9._-]{0,127})|@(sha256:[0-9a-f]{64}))$/);return m?{account:m[1],region:m[2],repo:m[3],tag:m[4]||null,digest:m[5]||null}:null;};
 /* Digest an image reference resolves to right now (ECS pins it per deployment), or null. */
 AG.containerResolve=(a,image)=>{const ref=AG.containerImageRef(image);if(!ref||ref.account!==a.callerIdentity.Account||ref.region!==a.region)return null;const r=repoOf(a,ref.repo);const i=r&&(r.images||[]).find(i=>ref.digest?i.digest===ref.digest:(i.tags||[]).includes(ref.tag));return i?i.digest:null;};
 AG.ecrTagImmutable=(repo,tag)=>{const hit=(repo.exclusions||[]).some(f=>wild(f.filter,tag));return repo.tagMutability==='IMMUTABLE'||(repo.tagMutability==='IMMUTABLE_WITH_EXCLUSION'&&!hit)||(repo.tagMutability==='MUTABLE_WITH_EXCLUSION'&&hit);};
 /* ENHANCED uses registry rules only; BASIC uses a matching registry rule or the older repository-level flag. */
 AG.ecrScanOnPush=(a,name)=>{const reg=a.ecrRegistryScanning||{scanType:'BASIC',rules:[]},ok=reg.scanType==='ENHANCED'?['SCAN_ON_PUSH','CONTINUOUS_SCAN']:['SCAN_ON_PUSH'];if(reg.scanType==='ENHANCED'&&!(reg.rules||[]).length)return true;if((reg.rules||[]).some(r=>ok.includes(r.scanFrequency)&&(r.repositoryFilters||[]).some(f=>f.filter.includes('*')?wild(f.filter,name):name.includes(f.filter))))return true;const r=repoOf(a,name);return reg.scanType==='BASIC'&&!!r&&r.scanOnPush===true;};
 /* Documented evaluator: all rules select at once, lower rulePriority wins, an image selected by a higher-priority
    rule cannot be expired by a lower one (it still counts), imageCountMoreThan keeps the youngest N by push time. */
 AG.ecrLifecyclePreview=(repo,policy,now)=>{
  const imgs=(repo.images||[]).slice().sort((x,y)=>Date.parse(y.pushedAt)-Date.parse(x.pushedAt)),claimed=new Set(),out=[];
  const sel=(s,i)=>{const t=i.tags||[];if(s.tagStatus==='any')return true;if(s.tagStatus==='untagged')return !t.length;if(!t.length)return false;return s.tagPrefixList?s.tagPrefixList.every(p=>t.some(x=>x.startsWith(p))):s.tagPatternList.every(p=>t.some(x=>wild(p,x)));};
  for(const r of policy.rules.slice().sort((x,y)=>x.rulePriority-y.rulePriority)){
   const c=imgs.filter(i=>sel(r.selection,i)),s=r.selection;
   const over=s.countType==='imageCountMoreThan'?c.slice(s.countNumber):c.filter(i=>(Date.parse(now)-Date.parse(i.pushedAt))/864e5>s.countNumber);
   for(const i of over)if(!claimed.has(i.digest)){claimed.add(i.digest);out.push({imageDigest:i.digest,imageTags:(i.tags||[]).slice(),imagePushedAt:i.pushedAt,action:{type:'EXPIRE'},appliedRulePriority:r.rulePriority});}
   c.forEach(i=>claimed.add(i.digest));
  }
  return out;
 };
 function lifecyclePolicy(raw){
  const bad=m=>Error("InvalidParameterException: Invalid parameter at 'LifecyclePolicyText' failed to satisfy constraint: 'Lifecycle policy validation failure: "+m+"'");
  let p;try{p=JSON.parse(raw);}catch(e){throw bad('invalid JSON');}
  if(!obj(p)||!Array.isArray(p.rules)||!p.rules.length||p.rules.length>50)throw bad('a rules array with 1-50 rules is required');
  const pri=new Set(),prefixSets=new Set();let untagged=0;
  for(const r of p.rules){
   if(!obj(r)||!Number.isInteger(r.rulePriority)||r.rulePriority<1||pri.has(r.rulePriority))throw bad('each rule needs a unique positive integer rulePriority');pri.add(r.rulePriority);
   const s=r.selection;if(!obj(s)||!obj(r.action))throw bad('each rule needs selection and action objects');
   if(r.action.type!=='expire')throw bad('action.type must be expire in this fixture (real ECR also has archive/transition rules)');
   if(!['tagged','untagged','any'].includes(s.tagStatus))throw bad('tagStatus must be tagged, untagged or any');
   const P=s.tagPrefixList,T=s.tagPatternList;
   if(s.tagStatus==='tagged'&&!(Array.isArray(P)&&P.length)&&!(Array.isArray(T)&&T.length))throw bad('a tagged rule needs tagPrefixList or tagPatternList');
   if(P!==undefined&&T!==undefined)throw bad('use either tagPrefixList or tagPatternList, not both');
   if(s.tagStatus!=='tagged'&&(P!==undefined||T!==undefined))throw bad('tagPrefixList/tagPatternList are only valid with tagStatus tagged');
   if([P,T].some(l=>l!==undefined&&(!Array.isArray(l)||!l.length||l.some(x=>typeof x!=='string'||!x||(x.match(/\*/g)||[]).length>4))))throw bad('tag lists need nonempty strings with at most four * wildcards');
   if(s.storageClass!==undefined&&s.storageClass!=='standard')throw bad('this fixture selects standard storage only; archive rules need a different countType');
   if(P){
    // ECR requires unique prefix sets across rules selecting the same storage class.
    // List order and repeated entries do not create a different selection.
    const key=JSON.stringify([...new Set(P)].sort());
    if(prefixSets.has(key))throw bad('tagPrefixList must be a unique set across rules selecting standard storage');
    prefixSets.add(key);
   }
   if(!['imageCountMoreThan','sinceImagePushed'].includes(s.countType))throw bad('countType imageCountMoreThan or sinceImagePushed in this fixture (sinceImagePulled/sinceImageTransitioned belong to archive rules)');
   if(!Number.isInteger(s.countNumber)||s.countNumber<1)throw bad('countNumber must be a positive integer');
   if(s.countType==='sinceImagePushed'&&s.countUnit!=='days')throw bad('sinceImagePushed needs countUnit days');
   if(s.countType==='imageCountMoreThan'&&s.countUnit!==undefined)throw bad('countUnit is only valid with sinceImagePushed');
   if(s.tagStatus==='untagged'&&++untagged>1)throw bad('only one rule may select untagged images');
  }
  const top=Math.max(...p.rules.map(r=>r.rulePriority));if(p.rules.some(r=>r.selection.tagStatus==='any'&&r.rulePriority!==top))throw bad('a tagStatus any rule must have the highest rulePriority');
  return p;
 }
 /* Network path for image pull (and awslogs) from every subnet a task can land in. */
 AG.containerPullPath=(a,net,needLogs)=>{
  const R=a.region,tables=a.routeTables||[],ep=(v,svc)=>(a.vpcEndpoints||[]).find(e=>e.vpcId===v&&e.serviceName===`com.amazonaws.${R}.${svc}`&&e.state==='available');
  for(const id of net.subnets){
   const sub=(a.subnets||[]).find(s=>s.id===id);if(!sub)return {ok:false,stage:'ecr',subnet:id};
   const rt=tables.find(t=>(t.associations||[]).some(x=>x.subnetId===id))||tables.find(t=>t.vpcId===sub.vpcId&&t.main),def=rt&&(rt.routes||[]).find(r=>r.destination==='0.0.0.0/0');
   if(def&&/^nat-/.test(def.target)&&(a.natGateways||[]).some(n=>n.id===def.target&&n.state==='available'))continue;
   if(def&&/^igw-/.test(def.target)&&net.assignPublicIp==='ENABLED')continue;
   const api=ep(sub.vpcId,'ecr.api'),dkr=ep(sub.vpcId,'ecr.dkr'),s3=ep(sub.vpcId,'s3');
   if(!api||!dkr||!api.privateDnsEnabled||!dkr.privateDnsEnabled)return {ok:false,stage:'ecr',subnet:id};
   if(!s3||s3.type!=='Gateway'||!rt||!(s3.routeTableIds||[]).includes(rt.id))return {ok:false,stage:'s3',subnet:id};
   if(needLogs&&!ep(sub.vpcId,'logs'))return {ok:false,stage:'logs',subnet:id};
  }
  return {ok:true};
 };
 /* Why a task of this deployment would stop before RUNNING, or null when the declared start contract holds. */
 AG.containerStartFailure=(a,td,net,digest,taskId='0')=>{
  const acct=a.callerIdentity.Account,R=a.region,c=td.containerDefinitions[0],ref=AG.containerImageRef(c.image),repo=ref&&repoOf(a,ref.repo),lc=c.logConfiguration,logs=!!lc&&lc.logDriver==='awslogs';
  const init=m=>({reason:'ResourceInitializationError: '+m,stopCode:'TaskFailedToStart'}),pull=m=>({reason:'CannotPullContainerError: '+m,stopCode:'TaskFailedToStart'});
  for(const arn of [td.executionRoleArn,td.taskRoleArn])if(arn&&!assumable(a,arn))return {reason:`ECS was unable to assume the role '${arn}' that was provided for this task. Please verify that the role being passed has the proper trust relationship and permissions and that your IAM user has permissions to pass this role.`,stopCode:'TaskFailedToStart'};
  const path=AG.containerPullPath(a,net,logs);
  if(!path.ok&&path.stage==='ecr')return pull(`The task cannot pull '${c.image}' from the Amazon ECR repository '${acct}.dkr.ecr.${R}.amazonaws.com/${ref?ref.repo:''}'. There is a connection issue between the task and Amazon ECR. Check your task network configuration.`);
  if(!td.executionRoleArn)return pull(`pull access denied for ${c.image}: no basic auth credentials (no task execution role to fetch an Amazon ECR authorization token)`);
  const who=`arn:aws:sts::${acct}:assumed-role/${roleBy(a,td.executionRoleArn).name}/${taskId}`;
  if(!grants(a,td.executionRoleArn,'ecr-pull'))return pull(`The task can't pull the image. Check that the role has the permissions to pull images from the registry. AccessDeniedException: User: ${who} is not authorized to perform: ecr:GetAuthorizationToken on resource: * because no identity-based policy allows the ecr:GetAuthorizationToken action`);
  const img=digest&&repo&&(repo.images||[]).find(i=>i.digest===digest);
  if(!img)return pull(`pull image manifest has been retried 5 time(s): failed to resolve ref ${c.image}: not found`);
  if(!path.ok&&path.stage==='s3')return pull(`ref pull has been retried 1 time(s): failed to copy: httpReaderSeeker: failed open: failed to do request: Get "https://prod-${R}-starport-layer-bucket.s3.${R}.amazonaws.com/": dial tcp: i/o timeout`);
  const requiredArch=td.runtimePlatform?.cpuArchitecture==='ARM64'?'arm64':'amd64';
  if(!(img.arch||['amd64']).includes(requiredArch))return {reason:'Essential container in task exited',stopCode:'EssentialContainerExited',exitCode:255,containerReason:`exec /app/orders: exec format error (image ${img.tags[0]||img.digest.slice(0,19)} has no linux/${requiredArch} variant)`};
  if(logs){
   const o=lc.options||{},group=o['awslogs-group'],stream='failed to validate logger args: create stream has been retried 1 times: failed to create Cloudwatch log stream: ',exists=(a.logGroups||[]).some(g=>g.name===group);
   if(!path.ok&&path.stage==='logs')return init(stream+`RequestError: send request failed caused by: Post "https://logs.${R}.amazonaws.com/": dial tcp: i/o timeout : exit status 1`);
   if(!grants(a,td.executionRoleArn,'logs'))return init(stream+`AccessDeniedException: User: ${who} is not authorized to perform: logs:CreateLogStream on resource: arn:aws:logs:${R}:${acct}:log-group:${group}:log-stream:${o['awslogs-stream-prefix']||'ecs'}/${c.name}/${taskId} : exit status 1`);
   if(!exists&&o['awslogs-create-group']==='true'&&!grants(a,td.executionRoleArn,'logs-create-group'))return init(`failed to validate logger args: create group: AccessDeniedException: User: ${who} is not authorized to perform: logs:CreateLogGroup on resource: arn:aws:logs:${R}:${acct}:log-group:${group} : exit status 1`);
   if(!exists&&o['awslogs-create-group']!=='true')return init(stream+'ResourceNotFoundException: The specified log group does not exist. : exit status 1');
  }
  return null;
 };
 /* ALB health check can reach the task only if a task security group allows the container port from the ALB. */
 AG.containerHealthFailure=(a,svc)=>{
  for(const lb of svc.loadBalancers||[]){
   const tg=(a.containerTargetGroups||[]).find(t=>t.arn===lb.targetGroupArn),albSgs=tg&&tg.loadBalancer?tg.loadBalancer.securityGroups:[],vpc=(a.vpcs||[]).find(v=>tg&&v.id===tg.vpcId);
   const ok=(a.securityGroups||[]).filter(g=>svc.network.securityGroups.includes(g.id)).some(g=>(g.ingress||[]).some(r=>(r.protocol==='-1'||((r.protocol||'tcp')==='tcp'&&r.fromPort<=lb.containerPort&&r.toPort>=lb.containerPort))&&((r.sourceGroup&&albSgs.includes(r.sourceGroup))||r.cidr==='0.0.0.0/0'||(vpc&&r.cidr===vpc.cidr))));
   if(!ok)return {reason:`Task failed ELB health checks in (target-group ${lb.targetGroupArn})`,stopCode:'ServiceSchedulerInitiated'};
  }
  return null;
 };
 /* What the orders app logs when it uploads an invoice: credentials come only from the task role. */
 AG.containerAppResult=(a,td,taskId='0')=>{
  if(!td.taskRoleArn)return {ok:false,line:'ERROR invoice upload failed: NoCredentialsError: Unable to locate credentials (no task role; Fargate has no instance profile)'};
  const r=roleBy(a,td.taskRoleArn);if(r&&(r.grants||[]).includes('s3-invoices'))return {ok:true,line:'INFO POST /checkout 201 · invoice INV-88231 uploaded to s3://shopkaro-invoices/2026/10/INV-88231.pdf'};
  return {ok:false,line:`ERROR invoice upload failed: AccessDenied: User: arn:aws:sts::${a.callerIdentity.Account}:assumed-role/${r?r.name:'unknown'}/${taskId} is not authorized to perform: s3:PutObject on resource: "arn:aws:s3:::shopkaro-invoices/2026/10/INV-88231.pdf" because no identity-based policy allows the s3:PutObject action`};
 };
 const cbThreshold=AG.containerCbThreshold=(cb,desired)=>{const t=cb.thresholdConfiguration||{type:'BOUNDED_PERCENT',value:50};if(t.type==='COUNT')return t.value;const v=Math.ceil(t.value/100*desired);return t.type==='UNBOUNDED_PERCENT'?Math.max(1,v):Math.min(200,Math.max(3,v));};
 AG.containerCLI=({service,op,toks,flag,sim,list,print,resultJson})=>{
  if(!sim.account.containerMode||!own(specs,service))return false;
  const a=sim.account,acct=a.callerIdentity.Account,region=a.region;
  if(!own(specs[service],op)){print('err',`Container fixture: aws ${service} ${op} is not modeled here. Modeled ${service} operations: ${Object.keys(specs[service]).join(', ')}.`);return true;}
  if(op==='wait'&&toks[3]!=='services-stable'){print('err','Container fixture models only: aws ecs wait services-stable --cluster <cluster> --services <service>');return true;}
  const required=n=>{const v=flag(n);if(v===null||v==='')throw Error('aws: error: the following arguments are required: --'+n);return v;};
  const values=n=>{const i=toks.indexOf('--'+n);if(i<0)return [];let j=i+1;while(j<toks.length&&!toks[j].startsWith('--'))j++;return toks.slice(i+1,j);};
  const bump=()=>{a.containerRevision=(a.containerRevision||0)+1;};
  const fileText=raw=>{raw=String(raw);if(!raw.startsWith('file://'))return raw;const f=own(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error('Error parsing parameter: Unable to load paramfile '+raw+' (ls lists mission files)');return f.content;};
  const parse=(raw,label)=>{let d;try{d=JSON.parse(fileText(raw));}catch(e){if(/^Error parsing/.test(e.message))throw e;throw Error('Error parsing parameter --'+label+': Invalid JSON');}return d;};
  const structure=(raw,label)=>{const t=fileText(raw).trim();if(t.startsWith('{')||t.startsWith('[')){const d=parse(t,label);if(!obj(d))throw Error('Error parsing parameter --'+label+': a JSON object is required');return d;}try{return shorthand(t);}catch(e){throw Error('Error parsing parameter --'+label+': expected shorthand like a=b,c={d=e},f=[x,y] or JSON');}};
  const many=(n,label)=>{const v=values(n);if(v.length===1&&/^\s*\[/.test(fileText(v[0]))){const d=parse(v[0],label);if(!Array.isArray(d)||d.some(x=>!obj(x)))throw Error('Error parsing parameter --'+label+': a JSON array of objects is required');return d;}return v.map(x=>structure(x,label));};
  const keys=(o,allowed,label)=>{if(!obj(o))throw Error('InvalidParameterException: '+label+' must be a JSON object');const extra=Object.keys(o).filter(k=>!allowed.includes(k));if(extra.length)throw Error(`InvalidParameterException: ${label}: ${extra.join(', ')} not modeled in this fixture. Modeled: ${allowed.join(', ')}`);};
  const repo=()=>{const n=required('repository-name'),r=repoOf(a,n);if(!r)throw Error(`RepositoryNotFoundException: The repository with name '${n}' does not exist in the registry with id '${acct}'`);return r;};
  const repoUri=r=>`${acct}.dkr.ecr.${region}.amazonaws.com/${r.name}`;
  const rv=r=>({repositoryArn:`arn:aws:ecr:${region}:${acct}:repository/${r.name}`,registryId:acct,repositoryName:r.name,repositoryUri:repoUri(r),createdAt:r.createdAt,imageTagMutability:r.tagMutability,...((r.exclusions||[]).length?{imageTagMutabilityExclusionFilters:clone(r.exclusions)}:{}),imageScanningConfiguration:{scanOnPush:!!r.scanOnPush},encryptionConfiguration:{encryptionType:'AES256'}});
  const mutability=()=>{const v=required('image-tag-mutability'),f=many('image-tag-mutability-exclusion-filters','image-tag-mutability-exclusion-filters');if(!['MUTABLE','IMMUTABLE','IMMUTABLE_WITH_EXCLUSION','MUTABLE_WITH_EXCLUSION'].includes(v))throw Error('InvalidParameterException: --image-tag-mutability must be MUTABLE, IMMUTABLE, IMMUTABLE_WITH_EXCLUSION or MUTABLE_WITH_EXCLUSION');
   if(v.endsWith('_WITH_EXCLUSION')!==!!f.length)throw Error('InvalidParameterException: *_WITH_EXCLUSION needs --image-tag-mutability-exclusion-filters filterType=WILDCARD,filter=<pattern>; plain MUTABLE/IMMUTABLE takes no filters');
   if(f.length>5||f.some(x=>{try{keys(x,['filterType','filter'],'exclusion filter');}catch(e){return true;}return x.filterType!=='WILDCARD'||typeof x.filter!=='string'&&typeof x.filter!=='number'||!/^[0-9A-Za-z._*-]{1,128}$/.test(String(x.filter));}))throw Error('InvalidParameterException: exclusion filters are filterType=WILDCARD,filter=<1-128 chars of A-Z a-z 0-9 . _ - *> (fixture limit 5)');
   return {v,f:f.map(x=>({filterType:'WILDCARD',filter:String(x.filter)}))};};
  const now=a.containerNow||'2026-10-27T10:00:00Z';
  /* ---- ECS helpers ---- */
  const cluster=name=>{const n=name||required('cluster'),c=(a.ecsClusters||[]).find(c=>c.name===n||c.arn===n);if(!c)throw Error('ClusterNotFoundException: Cluster not found.');return c;};
  const tdArn=t=>`arn:aws:ecs:${region}:${acct}:task-definition/${t.family}:${t.revision}`;
  const tdRef=ref=>{const m=String(ref).match(/^(?:arn:aws:ecs:([a-z0-9-]+):(\d{12}):task-definition\/)?([A-Za-z0-9_-]{1,255})(?::(\d+))?$/);if(!m||(m[1]&&(m[1]!==region||m[2]!==acct)))throw Error('ClientException: Unable to describe task definition.');
   const fam=list('taskDefinitions').filter(t=>t.family===m[3]),t=m[4]?fam.find(t=>t.revision===+m[4]):fam.filter(t=>t.status==='ACTIVE').sort((x,y)=>y.revision-x.revision)[0];if(!t)throw Error('ClientException: Unable to describe task definition.');return t;};
  const byArn=arn=>list('taskDefinitions').find(t=>tdArn(t)===arn);
  const svcArn=s=>`arn:aws:ecs:${region}:${acct}:service/${s.cluster}/${s.name}`,taskArn=t=>`arn:aws:ecs:${region}:${acct}:task/${t.cluster}/${t.id}`;
  const tasks=()=>a.containerTasks||(a.containerTasks=[]);
  const running=(s,d)=>tasks().filter(t=>t.cluster===s.cluster&&t.service===s.name&&t.lastStatus==='RUNNING'&&(!d||t.deploymentId===d.id));
  const primary=s=>s.deployments.find(d=>d.status==='PRIMARY');
  const event=(s,m)=>s.events.push(`(service ${s.name}) ${m}`);
  const newId=()=>{a.containerTaskSeq=(a.containerTaskSeq||0)+1;return a.containerTaskSeq.toString(16).padStart(8,'0')+'4c7e9d2b6a1f43e8a5c0b7d9';};
  const deployment=(s,td)=>{a.containerDeploySeq=(a.containerDeploySeq||0)+1;const id='ecs-svc/44100000000000'+String(a.containerDeploySeq).padStart(5,'0');return {id,status:'PRIMARY',taskDefinition:tdArn(td),imageDigest:AG.containerResolve(a,td.containerDefinitions[0].image),running:0,failed:0,rolloutState:'IN_PROGRESS',reason:`ECS deployment ${id} in progress.`};};
  const deploymentConfig=(raw,old)=>{
   const d=raw===null?{}:structure(raw,'deployment-configuration');keys(d,['deploymentCircuitBreaker','maximumPercent','minimumHealthyPercent','strategy'],'deploymentConfiguration (alarms, bake time, lifecycle hooks, canary/linear configs)');
   if(d.strategy!==undefined&&d.strategy!=='ROLLING')throw Error('InvalidParameterException: strategy '+d.strategy+' is real ECS (BLUE_GREEN/LINEAR/CANARY with bakeTimeInMinutes, test listener rules and lifecycle hooks) but outside this fixture; use the rolling strategy here');
   const cb=d.deploymentCircuitBreaker===undefined?(old?old.deploymentCircuitBreaker:{enable:false,rollback:false}):d.deploymentCircuitBreaker;
   if(!obj(cb)||typeof cb.enable!=='boolean'||typeof cb.rollback!=='boolean')throw Error('InvalidParameterException: deploymentCircuitBreaker needs enable=true|false,rollback=true|false');
   keys(cb,['enable','rollback','resetOnHealthyTask','thresholdConfiguration'],'deploymentCircuitBreaker');
   if(cb.resetOnHealthyTask!==undefined&&typeof cb.resetOnHealthyTask!=='boolean')throw Error('InvalidParameterException: resetOnHealthyTask must be true or false');
   const t=cb.thresholdConfiguration;if(t!==undefined&&(!obj(t)||!['BOUNDED_PERCENT','UNBOUNDED_PERCENT','COUNT'].includes(t.type)||!Number.isInteger(t.value)||t.value<1||(t.type!=='COUNT'&&t.value>100)))throw Error('InvalidParameterException: thresholdConfiguration needs type BOUNDED_PERCENT|UNBOUNDED_PERCENT|COUNT and an integer value (percent types 1-100)');
   const mx=d.maximumPercent??(old?old.maximumPercent:200),mn=d.minimumHealthyPercent??(old?old.minimumHealthyPercent:100);
   if(!Number.isInteger(mx)||mx<100||mx>400||!Number.isInteger(mn)||mn<0||mn>100)throw Error('InvalidParameterException: maximumPercent 100-400 and minimumHealthyPercent 0-100 (integers) in this fixture');
   return {deploymentCircuitBreaker:clone(cb),maximumPercent:mx,minimumHealthyPercent:mn};
  };
  /* Split desired tasks across a capacity provider strategy: base first, then by weight (largest remainder). */
  const placement=s=>{if(!s.strategy)return Array(s.desired).fill('FARGATE');const out=[],st=s.strategy,b=st.find(x=>x.base>0);let left=s.desired;if(b){const n=Math.min(b.base,left);for(let i=0;i<n;i++)out.push(b.capacityProvider);left-=n;}
   const total=st.reduce((n,x)=>n+x.weight,0),share=st.map(x=>({p:x.capacityProvider,n:Math.floor(left*x.weight/total),r:left*x.weight/total%1}));let rest=left-share.reduce((n,x)=>n+x.n,0);share.slice().sort((x,y)=>y.r-x.r).forEach(x=>{if(rest>0){x.n++;rest--;}});share.forEach(x=>{for(let i=0;i<x.n;i++)out.push(x.p);});return out;};
  const ipFor=(subnetId,n)=>{const sub=(a.subnets||[]).find(x=>x.id===subnetId),base=(sub?sub.cidr:'10.0.0.0/24').split('/')[0].split('.');return base.slice(0,3).join('.')+'.'+(10+n);};
  const startTasks=(s,d,count)=>{const out=[],have=running(s).length,cps=placement({...s,desired:running(s,d).length+count}).slice(running(s,d).length);for(let i=0;i<count;i++){const id=newId(),k=(have+i)%s.network.subnets.length,sn=s.network.subnets[k],sub=(a.subnets||[]).find(x=>x.id===sn);
   const t={id,cluster:s.cluster,service:s.name,deploymentId:d.id,taskDefinition:d.taskDefinition,lastStatus:'RUNNING',subnet:sn,az:sub?sub.az:null,ip:ipFor(sn,a.containerTaskSeq),capacityProvider:cps[i]||'FARGATE',imageDigest:d.imageDigest};tasks().push(t);out.push(t);}return out;};
  const stop=(t,reason,code)=>{t.lastStatus='STOPPED';t.stoppedReason=reason;t.stopCode=code;};
  const appLog=(s,td,ts)=>{const lc=td.containerDefinitions[0].logConfiguration,g=lc&&lc.logDriver==='awslogs'&&(a.logGroups||[]).find(x=>x.name===(lc.options||{})['awslogs-group']);if(!g)return;g.events=g.events||[];
   for(const t of ts){a.containerLogSeq=(a.containerLogSeq||0)+1;const at=new Date(Date.parse(now)+a.containerLogSeq*60000).toISOString().replace('.000','');g.events.push(`${at} ${t.id.slice(0,8)} INFO orders ${td.family}:${td.revision} listening on :${(td.containerDefinitions[0].portMappings||[{}])[0].containerPort||8080} (image ${td.containerDefinitions[0].image.split(/[:@]/).pop().slice(0,19)})`);g.events.push(`${at} ${t.id.slice(0,8)} ${AG.containerAppResult(a,td,t.id).line}`);}};
  /* services-stable: settle the PRIMARY deployment once (declared contract), then report stability. */
  const settle=s=>{
   let changed=false;const p=primary(s);
   if(p&&p.rolloutState==='IN_PROGRESS'){
    const td=byArn(p.taskDefinition),cb=s.deploymentConfiguration.deploymentCircuitBreaker;
    const oldCount=running(s).filter(t=>t.deploymentId!==p.id).length,total=running(s).length;
    const ceiling=Math.floor(s.desired*s.deploymentConfiguration.maximumPercent/100),floor=Math.ceil(s.desired*s.deploymentConfiguration.minimumHealthyPercent/100);
    if(oldCount>0&&total>=ceiling&&total<=floor){event(s,'was unable to stop or start tasks during a deployment because of the service deployment configuration. Update the minimumHealthyPercent or maximumPercent value and try again.');return {changed:true,stable:false};}
    let why=AG.containerStartFailure(a,td,s.network,p.imageDigest,'TASK_ID');
    if(!why)why=AG.containerHealthFailure(a,s);
    changed=true;
    if(!why){const old=s.deployments.filter(d=>d!==p),oldTasks=running(s).filter(t=>t.deploymentId!==p.id);oldTasks.forEach(t=>stop(t,`Scaling activity initiated by (deployment ${p.id})`,'ServiceSchedulerInitiated'));
     const started=startTasks(s,p,s.desired-running(s,p).length);s.deployments=[p];p.running=running(s,p).length;p.rolloutState='COMPLETED';p.reason=`ECS deployment ${p.id} completed.`;
     if(started.length)event(s,`has started ${started.length} tasks: ${started.map(t=>'(task '+t.id+')').join(' ')}.`);if((s.loadBalancers||[]).length&&started.length)event(s,`registered ${started.length} targets in (target-group ${s.loadBalancers[0].targetGroupArn})`);
     if(oldTasks.length)event(s,`has stopped ${oldTasks.length} running tasks of the previous deployment.`);old.forEach(d=>{d.running=0;});event(s,`(deployment ${p.id}) deployment completed.`);event(s,'has reached a steady state.');appLog(s,td,started);
    }else{
     const n=cb.enable?cbThreshold(cb,s.desired):4,prior=tasks().filter(t=>t.deploymentId===p.id&&t.lastStatus==='STOPPED').length,shown=Math.min(n,5,Math.max(0,10-prior));for(let i=0;i<shown;i++){const t={id:newId(),cluster:s.cluster,service:s.name,deploymentId:p.id,taskDefinition:p.taskDefinition,lastStatus:'STOPPED',subnet:s.network.subnets[i%s.network.subnets.length],capacityProvider:placement(s)[0]||'FARGATE',imageDigest:p.imageDigest};
      stop(t,why.reason.replace(/TASK_ID/g,t.id),why.stopCode);if(why.containerReason){t.exitCode=why.exitCode;t.containerReason=why.containerReason;}tasks().push(t);}
     p.failed=(p.failed||0)+n;event(s,`${why.stopCode==='ServiceSchedulerInitiated'?'task failed ELB health checks':'failed to launch a task'}: ${why.reason.replace(/TASK_ID/g,'<task-id>').slice(0,420)}`);
     if(cb.enable){p.rolloutState='FAILED';p.reason=`ECS deployment circuit breaker: tasks failed to start (failure threshold ${n} reached).`;event(s,`(deployment ${p.id}) deployment failed: tasks failed to start.`);
      const prev=s.deployments.filter(d=>d!==p&&d.lastCompleted).pop();
      if(cb.rollback&&prev){prev.status='PRIMARY';prev.rolloutState='COMPLETED';prev.reason=`ECS deployment ${prev.id} completed (rolled back from ${p.id}).`;s.deployments=[prev];(s.failedDeployments||(s.failedDeployments=[])).push(p);event(s,`(deployment ${p.id}) rolling back to deployment ${prev.id}.`);event(s,'has reached a steady state.');}
     }else{p.reason='ECS deployment '+p.id+' in progress: tasks keep failing to start (no circuit breaker).';}
    }
   }else if(p&&p.rolloutState==='COMPLETED'&&s.deployments.length===1&&running(s,p).length!==s.desired){
    changed=true;const have=running(s,p);
    if(have.length>s.desired){have.slice(s.desired).forEach(t=>stop(t,'Scaling activity initiated by (service '+s.name+')','ServiceSchedulerInitiated'));event(s,`has stopped ${have.length-s.desired} running tasks.`);}
    else{const td=byArn(p.taskDefinition),why=AG.containerStartFailure(a,td,s.network,p.imageDigest,'TASK_ID')||AG.containerHealthFailure(a,s);
     if(why){const t={id:newId(),cluster:s.cluster,service:s.name,deploymentId:p.id,taskDefinition:p.taskDefinition,lastStatus:'STOPPED',subnet:s.network.subnets[0],capacityProvider:'FARGATE',imageDigest:p.imageDigest};stop(t,why.reason.replace(/TASK_ID/g,t.id),why.stopCode);tasks().push(t);event(s,'failed to launch a task: '+why.reason.replace(/TASK_ID/g,'<task-id>').slice(0,420));}
     else{const st=startTasks(s,p,s.desired-have.length);event(s,`has started ${st.length} tasks: ${st.map(t=>'(task '+t.id+')').join(' ')}.`);event(s,'has reached a steady state.');appLog(s,td,st);}}
    p.running=running(s,p).length;
   }
   const q=primary(s);if(q&&q.rolloutState==='COMPLETED')q.lastCompleted=true;
   return {changed,stable:!!q&&s.deployments.length===1&&q.rolloutState==='COMPLETED'&&running(s,q).length===s.desired};
  };
  const view=s=>{const p=primary(s);return {serviceArn:svcArn(s),serviceName:s.name,clusterArn:`arn:aws:ecs:${region}:${acct}:cluster/${s.cluster}`,status:'ACTIVE',desiredCount:s.desired,runningCount:running(s).length,pendingCount:0,
   ...(s.strategy?{capacityProviderStrategy:clone(s.strategy)}:{launchType:'FARGATE'}),platformVersion:'LATEST',taskDefinition:p?p.taskDefinition:null,deploymentConfiguration:clone(s.deploymentConfiguration),deploymentController:{type:'ECS'},
   loadBalancers:clone(s.loadBalancers),networkConfiguration:{awsvpcConfiguration:clone(s.network)},
   deployments:s.deployments.map(d=>({id:d.id,status:d.status,taskDefinition:d.taskDefinition,desiredCount:d.status==='PRIMARY'?s.desired:0,runningCount:running(s,d).length,failedTasks:d.failed||0,rolloutState:d.rolloutState,rolloutStateReason:d.reason})),
   events:s.events.slice(-6).reverse().map((m,i)=>({id:`${s.name}-${s.events.length-i}`,message:m}))};};
  const network=raw=>{const n=structure(raw,'network-configuration');keys(n,['awsvpcConfiguration'],'networkConfiguration');const v=n.awsvpcConfiguration;if(!obj(v))throw Error('InvalidParameterException: networkConfiguration needs awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=DISABLED}');keys(v,['subnets','securityGroups','assignPublicIp'],'awsvpcConfiguration');
   if(!Array.isArray(v.subnets)||!v.subnets.length||v.subnets.length>16||v.subnets.some(x=>typeof x!=='string'))throw Error('InvalidParameterException: subnets must be a list of 1-16 subnet IDs');
   const subs=v.subnets.map(id=>(a.subnets||[]).find(x=>x.id===id));if(subs.some(x=>!x))throw Error('InvalidParameterException: Error retrieving subnet information for ['+v.subnets.filter((id,i)=>!subs[i]).join(', ')+']: The subnet ID does not exist');
   if(new Set(subs.map(x=>x.vpcId)).size>1)throw Error('InvalidParameterException: subnets must belong to the same VPC');
   if(!Array.isArray(v.securityGroups)||!v.securityGroups.length||v.securityGroups.length>5||v.securityGroups.some(id=>!(a.securityGroups||[]).some(g=>g.id===id&&g.vpcId===subs[0].vpcId)))throw Error('InvalidParameterException: securityGroups must be 1-5 existing security group IDs in the subnets’ VPC');
   if(v.assignPublicIp!==undefined&&!['ENABLED','DISABLED'].includes(v.assignPublicIp))throw Error('InvalidParameterException: assignPublicIp must be ENABLED or DISABLED');
   return {subnets:v.subnets.slice(),securityGroups:v.securityGroups.slice(),assignPublicIp:v.assignPublicIp||'DISABLED'};};
  const strategyOf=(items,c)=>{if(!items.length)return null;const st=items.map(x=>{keys(x,['capacityProvider','base','weight'],'capacityProviderStrategy item');return {capacityProvider:String(x.capacityProvider),base:x.base===undefined?0:x.base,weight:x.weight===undefined?0:x.weight};});
   if(st.some(x=>!['FARGATE','FARGATE_SPOT'].includes(x.capacityProvider)))throw Error('InvalidParameterException: this fixture models FARGATE and FARGATE_SPOT capacity providers (Auto Scaling group and ECS Managed Instances providers are taught in the lesson)');
   if(st.some(x=>!(c.capacityProviders||[]).includes(x.capacityProvider)))throw Error('InvalidParameterException: The specified capacity provider is not associated with the cluster.');
   if(st.some(x=>!Number.isInteger(x.base)||x.base<0||x.base>100000||!Number.isInteger(x.weight)||x.weight<0||x.weight>1000))throw Error('InvalidParameterException: base 0-100000 and weight 0-1000 must be integers');
   if(st.filter(x=>x.base>0).length>1)throw Error('InvalidParameterException: Only one capacity provider in a strategy can have a base value.');
   if(!st.some(x=>x.weight>0))throw Error('InvalidParameterException: At least one capacity provider in the strategy must have a weight greater than zero.');
   if(new Set(st.map(x=>x.capacityProvider)).size!==st.length)throw Error('InvalidParameterException: a capacity provider can appear only once in a strategy');return st;};
  try{
   const allowed=specs[service][op].concat(['region','query','output','no-cli-pager!']),seen=new Set();
   for(let i=op==='wait'?4:3;i<toks.length;){const n=toks[i].startsWith('--')?toks[i].slice(2):'',entry=allowed.find(x=>x.replace(/[!*]$/,'')===n);if(!entry)throw Error('Unknown options: '+toks[i]+'. This container fixture models the documented flags for aws '+service+' '+op+(op==='wait'?' services-stable':'')+'.');
    if(seen.has(n))throw Error('aws: error: duplicate option --'+n+'; supply it once.');seen.add(n);i++;if(entry.endsWith('!'))continue;if(i>=toks.length||toks[i].startsWith('--'))throw Error('aws: error: argument --'+n+': expected one argument');i++;if(entry.endsWith('*'))while(i<toks.length&&!toks[i].startsWith('--'))i++;}
   if((flag('region')??region)!==region)throw Error(`Container fixture scope: ShopKaro's registry and cluster live in ${region}.`);
   /* ---------------- IAM (read-only) ---------------- */
   if(service==='iam'){
    if(op==='list-roles'){resultJson({Roles:(a.iamRoles||[]).map(r=>({RoleName:r.name,Arn:r.arn,Description:r.description}))});return true;}
    const r=(a.iamRoles||[]).find(r=>r.name===required('role-name'));if(!r)throw Error('NoSuchEntity: The role with name '+flag('role-name')+' cannot be found.');
    if(op==='get-role')resultJson({Role:{RoleName:r.name,Arn:r.arn,Description:r.description,AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:r.trust},Action:'sts:AssumeRole'}]}}});
    else resultJson({AttachedPolicies:(r.policies||[]).map(p=>({PolicyName:p.split('/').pop(),PolicyArn:p}))});
    return true;
   }
   /* ---------------- ELBv2 (read-only) ---------------- */
   if(service==='elbv2'){
    const all=a.containerTargetGroups||[];
    if(op==='describe-target-groups'){const ids=values('target-group-arns'),names=values('names');let rows=all;if(ids.length){if(ids.some(id=>!all.some(t=>t.arn===id)))throw Error('TargetGroupNotFound: One or more target groups not found');rows=rows.filter(t=>ids.includes(t.arn));}
     if(names.length){if(names.some(n=>!all.some(t=>t.name===n)))throw Error('TargetGroupNotFound: One or more target groups not found');rows=rows.filter(t=>names.includes(t.name));}
     resultJson({TargetGroups:rows.map(t=>({TargetGroupArn:t.arn,TargetGroupName:t.name,Protocol:'HTTP',Port:t.port,VpcId:t.vpcId,TargetType:t.targetType,HealthCheckPath:t.healthPath,LoadBalancerArns:t.loadBalancer?[t.loadBalancer.arn]:[]}))});return true;}
    const tg=all.find(t=>t.arn===required('target-group-arn'));if(!tg)throw Error('TargetGroupNotFound: One or more target groups not found');
    const svcs=list('ecsServices').filter(s=>(s.loadBalancers||[]).some(l=>l.targetGroupArn===tg.arn));
    resultJson({TargetHealthDescriptions:svcs.flatMap(s=>running(s).map(t=>({Target:{Id:t.ip,Port:s.loadBalancers.find(l=>l.targetGroupArn===tg.arn).containerPort,AvailabilityZone:t.az},HealthCheckPort:String(s.loadBalancers.find(l=>l.targetGroupArn===tg.arn).containerPort),TargetHealth:{State:'healthy'}})))});
    print('sys','Fixture health: targets are the private IPs of RUNNING tasks (awsvpc → target type ip). Real ALB probes are not sent.');return true;
   }
   /* ---------------- ECR ---------------- */
   if(service==='ecr'){
    if(op==='get-login-password'){print('ok','eyJwYXlsb2FkIjoiRklYVFVSRSJ9.training-token-not-a-real-credential');print('sys','Real flow: aws ecr get-login-password | docker login --username AWS --password-stdin '+acct+'.dkr.ecr.'+region+'.amazonaws.com — docker push is not simulated here.');return true;}
    if(op==='describe-repositories'){const ids=values('repository-names'),rows=(a.ecrRepositories||[]).filter(r=>!ids.length||ids.includes(r.name));if(ids.some(n=>!rows.some(r=>r.name===n)))throw Error(`RepositoryNotFoundException: The repository with name '${ids.find(n=>!rows.some(r=>r.name===n))}' does not exist in the registry with id '${acct}'`);resultJson({repositories:rows.map(rv)});return true;}
    if(op==='get-registry-scanning-configuration'){resultJson({registryId:acct,scanningConfiguration:clone(a.ecrRegistryScanning||{scanType:'BASIC',rules:[]})});return true;}
    if(op==='put-registry-scanning-configuration'){
     const type=flag('scan-type')??'BASIC';if(!['BASIC','ENHANCED'].includes(type))throw Error('InvalidParameterException: --scan-type must be BASIC or ENHANCED');
     const rules=many('rules','rules');if(type==='ENHANCED'&&!rules.length)rules.push({scanFrequency:'CONTINUOUS_SCAN',repositoryFilters:[{filter:'*',filterType:'WILDCARD'}]});if(rules.length>2)throw Error('InvalidParameterException: at most 2 scanning rules');
     for(const r of rules){keys(r,['scanFrequency','repositoryFilters'],'scanning rule');const okF=type==='BASIC'?['SCAN_ON_PUSH','MANUAL']:['SCAN_ON_PUSH','CONTINUOUS_SCAN'];
      if(!okF.includes(r.scanFrequency))throw Error(`InvalidParameterException: scanFrequency for ${type} must be ${okF.join(' or ')}`);
      if(!Array.isArray(r.repositoryFilters)||!r.repositoryFilters.length||r.repositoryFilters.length>100||r.repositoryFilters.some(f=>!obj(f)||f.filterType!=='WILDCARD'||!/^[a-z0-9*](?:[._\/a-z0-9*-]*[a-z0-9*])?$/.test(String(f.filter))||String(f.filter).length>255))throw Error('InvalidParameterException: repositoryFilters need filter=<lowercase repo pattern, * allowed>,filterType=WILDCARD');}
     a.ecrRegistryScanning={scanType:type,rules:rules.map(r=>({scanFrequency:r.scanFrequency,repositoryFilters:r.repositoryFilters.map(f=>({filter:String(f.filter),filterType:'WILDCARD'}))}))};bump();
     resultJson({registryScanningConfiguration:clone(a.ecrRegistryScanning)});print('sys',type==='ENHANCED'?'ENHANCED = Amazon Inspector (OS + language packages; continuous option) and is billed by Inspector. Applies to images pushed or rescanned from now on.':'BASIC scan on push = AWS-native OS CVE scan when an image is pushed. Existing images are not rescanned automatically; findings come from describe-image-scan-findings (not modeled).');return true;}
    if(op==='create-repository'){
     const n=required('repository-name');if(n.length<2||n.length>256||!/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(n))throw Error('InvalidParameterException: Invalid parameter at \'repositoryName\': lowercase letters, digits, . _ - and / (2-256 chars)');
     if(repoOf(a,n))throw Error(`RepositoryAlreadyExistsException: The repository with name '${n}' already exists in the registry with id '${acct}'`);
     const m=flag('image-tag-mutability')===null?{v:'MUTABLE',f:[]}:mutability();let scan=false;if(flag('image-scanning-configuration')!==null){const c=structure(flag('image-scanning-configuration'),'image-scanning-configuration');keys(c,['scanOnPush'],'imageScanningConfiguration');if(typeof c.scanOnPush!=='boolean')throw Error('InvalidParameterException: scanOnPush must be true or false');scan=c.scanOnPush;}
     const r={name:n,createdAt:now,tagMutability:m.v,exclusions:m.f,scanOnPush:scan,lifecyclePolicy:null,images:[]};list('ecrRepositories').push(r);bump();resultJson({repository:rv(r)});return true;}
    const r=repo();
    if(op==='describe-images'||op==='list-images'||op==='batch-delete-image'){
     const want=op==='list-images'?[]:many('image-ids','image-ids');for(const w of want)keys(w,['imageTag','imageDigest'],'imageId');
     const hit=i=>w=>(w.imageTag!==undefined||w.imageDigest!==undefined)&&(w.imageTag===undefined||(i.tags||[]).includes(String(w.imageTag)))&&(w.imageDigest===undefined||w.imageDigest===i.digest);
     if(op==='batch-delete-image'){if(!want.length)throw Error('aws: error: the following arguments are required: --image-ids');const gone=[],fail=[];for(const w of want){const i=(r.images||[]).find(i=>hit(i)(w));if(i){if(w.imageDigest!==undefined||i.tags.length<=1)r.images=r.images.filter(x=>x!==i);else i.tags=i.tags.filter(t=>t!==String(w.imageTag));gone.push({imageDigest:i.digest,...(w.imageTag!==undefined?{imageTag:String(w.imageTag)}:{})});}else fail.push({imageId:w,failureCode:'ImageNotFound',failureReason:'Requested image not found'});}if(gone.length)bump();resultJson({imageIds:gone,failures:fail});if(gone.length)print('sys','Requested tags/images removed. Removing one tag preserves the image while another tag remains; deleting the last tag or the digest removes the image. Running tasks keep their image; future pulls need the pinned digest to remain available.');return true;}
     const rows=(r.images||[]).filter(i=>!want.length||want.some(hit(i)));if(want.length&&!rows.length)throw Error(`ImageNotFoundException: The image with imageId {${Object.entries(want[0]).map(([k,v])=>k+':\''+v+'\'').join(', ')}} does not exist within the repository with name '${r.name}' in the registry with id '${acct}'`);
     if(op==='list-images')resultJson({imageIds:rows.flatMap(i=>(i.tags||[]).length?i.tags.map(t=>({imageDigest:i.digest,imageTag:t})):[{imageDigest:i.digest}])});
     else resultJson({imageDetails:rows.map(i=>({registryId:acct,repositoryName:r.name,imageDigest:i.digest,...((i.tags||[]).length?{imageTags:i.tags.slice()}:{}),imageSizeInBytes:i.size,imagePushedAt:i.pushedAt,imageManifestMediaType:(i.arch||[]).length>1?'application/vnd.oci.image.index.v1+json':'application/vnd.oci.image.manifest.v1+json',artifactMediaType:'application/vnd.oci.image.config.v1+json'}))});
     return true;}
    if(op==='put-image-tag-mutability'){const m=mutability();r.tagMutability=m.v;r.exclusions=m.f;bump();resultJson({registryId:acct,repositoryName:r.name,imageTagMutability:m.v,...(m.f.length?{imageTagMutabilityExclusionFilters:clone(m.f)}:{})});print('sys','Immutable tags block pushing an existing tag again (ImageTagAlreadyExistsException). Tags already in the repository stay as they are.');return true;}
    if(op==='put-image-scanning-configuration'){const c=structure(required('image-scanning-configuration'),'image-scanning-configuration');keys(c,['scanOnPush'],'imageScanningConfiguration');if(typeof c.scanOnPush!=='boolean')throw Error('InvalidParameterException: scanOnPush must be true or false');r.scanOnPush=c.scanOnPush;bump();resultJson({registryId:acct,repositoryName:r.name,imageScanningConfiguration:{scanOnPush:c.scanOnPush}});print('sys','Note: PutImageScanningConfiguration is being deprecated in favour of registry-level rules (aws ecr put-registry-scanning-configuration). Accepted here for BASIC scanning.');return true;}
    if(op==='put-lifecycle-policy'||op==='start-lifecycle-policy-preview'){const text=fileText(required('lifecycle-policy-text')),p=lifecyclePolicy(text);
     if(op==='put-lifecycle-policy'){r.lifecyclePolicy=clone(p);bump();resultJson({registryId:acct,repositoryName:r.name,lifecyclePolicyText:JSON.stringify(p)});print('sys','Applied. ECR expires matching images within 24 hours of meeting the criteria; nothing is deleted instantly in this fixture. Preview first: start-lifecycle-policy-preview.');}
     else{r.preview={policy:clone(p),at:now};resultJson({registryId:acct,repositoryName:r.name,lifecyclePolicyText:JSON.stringify(p),status:'IN_PROGRESS'});print('sys','Preview started. Read it with: aws ecr get-lifecycle-policy-preview --repository-name '+r.name);}
     return true;}
    if(op==='get-lifecycle-policy'){if(!r.lifecyclePolicy)throw Error(`LifecyclePolicyNotFoundException: Lifecycle policy does not exist for the repository with name '${r.name}' in the registry with id '${acct}'`);resultJson({registryId:acct,repositoryName:r.name,lifecyclePolicyText:JSON.stringify(r.lifecyclePolicy),lastEvaluatedAt:now});return true;}
    if(op==='delete-lifecycle-policy'){if(!r.lifecyclePolicy)throw Error(`LifecyclePolicyNotFoundException: Lifecycle policy does not exist for the repository with name '${r.name}' in the registry with id '${acct}'`);const old=r.lifecyclePolicy;r.lifecyclePolicy=null;bump();resultJson({registryId:acct,repositoryName:r.name,lifecyclePolicyText:JSON.stringify(old)});return true;}
    if(op==='get-lifecycle-policy-preview'){const pv=r.preview||(r.lifecyclePolicy?{policy:r.lifecyclePolicy}:null);if(!pv)throw Error(`LifecyclePolicyPreviewNotFoundException: There is no dry run for the repository with name '${r.name}' in the registry with id '${acct}'`);const res=AG.ecrLifecyclePreview(r,pv.policy,now);
     resultJson({registryId:acct,repositoryName:r.name,lifecyclePolicyText:JSON.stringify(pv.policy),status:'COMPLETE',previewResults:res,summary:{expiringImageTotalCount:res.length}});print('sys',`Preview (fixture date ${now.slice(0,10)}): ${res.length} image(s) would expire; ${(r.images||[]).length-res.length} kept. Read imageTags before applying.`);return true;}
    return false;
   }
   /* ---------------- ECS ---------------- */
   if(op==='list-clusters'){resultJson({clusterArns:(a.ecsClusters||[]).map(c=>c.arn)});return true;}
   if(op==='describe-clusters'){const ids=values('clusters'),rows=(a.ecsClusters||[]).filter(c=>!ids.length||ids.includes(c.name)||ids.includes(c.arn));
    resultJson({clusters:rows.map(c=>({clusterArn:c.arn,clusterName:c.name,status:'ACTIVE',capacityProviders:c.capacityProviders.slice(),defaultCapacityProviderStrategy:clone(c.defaultStrategy||[]),activeServicesCount:list('ecsServices').filter(s=>s.cluster===c.name).length,runningTasksCount:tasks().filter(t=>t.cluster===c.name&&t.lastStatus==='RUNNING').length})),failures:ids.filter(id=>!rows.some(c=>c.name===id||c.arn===id)).map(id=>({arn:id,reason:'MISSING'}))});return true;}
   if(op==='create-cluster'){const n=required('cluster-name');if(!/^[A-Za-z0-9_-]{1,255}$/.test(n))throw Error('InvalidParameterException: cluster name: letters, digits, hyphens, underscores (1-255)');const cps=values('capacity-providers');if(cps.some(x=>!['FARGATE','FARGATE_SPOT'].includes(x)))throw Error('InvalidParameterException: this fixture associates FARGATE and FARGATE_SPOT only');
    let c=(a.ecsClusters||[]).find(c=>c.name===n);if(c){resultJson({cluster:{clusterArn:c.arn,clusterName:c.name,status:'ACTIVE',capacityProviders:c.capacityProviders.slice()}});print('sys','CreateCluster is idempotent: the existing cluster '+n+' was returned unchanged.');return true;}
    c={name:n,arn:`arn:aws:ecs:${region}:${acct}:cluster/${n}`,capacityProviders:cps};list('ecsClusters').push(c);bump();resultJson({cluster:{clusterArn:c.arn,clusterName:c.name,status:'ACTIVE',capacityProviders:cps.slice()}});return true;}
   if(op==='register-task-definition'){
    const base=flag('cli-input-json')!==null?structure(flag('cli-input-json'),'cli-input-json'):{};
    for(const [f,k] of [['family','family'],['execution-role-arn','executionRoleArn'],['task-role-arn','taskRoleArn'],['cpu','cpu'],['memory','memory'],['network-mode','networkMode']])if(flag(f)!==null)base[k]=flag(f);
    if(values('requires-compatibilities').length)base.requiresCompatibilities=values('requires-compatibilities');if(flag('runtime-platform')!==null)base.runtimePlatform=structure(flag('runtime-platform'),'runtime-platform');if(flag('container-definitions')!==null)base.containerDefinitions=parse(flag('container-definitions'),'container-definitions');
    keys(base,['family','executionRoleArn','taskRoleArn','networkMode','requiresCompatibilities','cpu','memory','runtimePlatform','containerDefinitions'],'task definition');
    if(typeof base.family!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(base.family))throw Error('ClientException: Family contains invalid characters or is missing.');
    if(!Array.isArray(base.containerDefinitions)||base.containerDefinitions.length!==1||!obj(base.containerDefinitions[0]))throw Error('ClientException: containerDefinitions must hold exactly one container in this fixture.');
    const c=base.containerDefinitions[0];keys(c,['name','image','essential','portMappings','logConfiguration','environment','stopTimeout'],'container definition (secrets, dependsOn, volumes …)');
    if(typeof c.name!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(c.name)||typeof c.image!=='string'||!c.image)throw Error('ClientException: Container.image and Container.name should not be null or empty.');
    const ref=AG.containerImageRef(c.image);if(!ref||ref.account!==acct||ref.region!==region)throw Error(`ClientException: Container fixture scope: use a ShopKaro Amazon ECR image like ${acct}.dkr.ecr.${region}.amazonaws.com/<repo>:<tag> or @sha256:<digest>.`);
    if(c.essential!==undefined&&c.essential!==true)throw Error('ClientException: the only container must be essential (true).');
    const pm=c.portMappings===undefined?[]:c.portMappings;if(!Array.isArray(pm)||pm.some(p=>!obj(p)||!Number.isInteger(p.containerPort)||p.containerPort<1||p.containerPort>65535||(p.protocol!==undefined&&!['tcp','udp'].includes(p.protocol))||Object.keys(p).some(k=>!['containerPort','hostPort','protocol','name'].includes(k))))throw Error('ClientException: portMappings need integer containerPort (protocol tcp|udp).');
    if(c.stopTimeout!==undefined&&(!Number.isInteger(c.stopTimeout)||c.stopTimeout<2||c.stopTimeout>120))throw Error('ClientException: Fargate stopTimeout must be 2-120 seconds (default 30).');
    if(c.environment!==undefined&&(!Array.isArray(c.environment)||c.environment.some(e=>!obj(e)||typeof e.name!=='string'||typeof e.value!=='string')))throw Error('ClientException: environment needs [{"name":"…","value":"…"}].');
    const lc=c.logConfiguration;if(lc!==undefined&&(!obj(lc)||lc.logDriver!=='awslogs'||!obj(lc.options)||typeof lc.options['awslogs-group']!=='string'||lc.options['awslogs-region']!==region||Object.keys(lc.options).some(k=>!['awslogs-group','awslogs-region','awslogs-stream-prefix','awslogs-create-group','mode'].includes(k))))throw Error(`ClientException: this fixture models logDriver awslogs with options awslogs-group, awslogs-region (${region}), awslogs-stream-prefix, awslogs-create-group.`);
    for(const k of ['executionRoleArn','taskRoleArn'])if(base[k]!==undefined&&!(a.iamRoles||[]).some(r=>r.arn===base[k]))throw Error('ClientException: Role is not valid');
    const toCpu=v=>{const s=String(v).trim(),m=s.match(/^(\d*\.?\d+)\s*vcpu$/i);return m?Math.round(parseFloat(m[1])*1024):/^\d+$/.test(s)?Number(s):NaN;},toMem=v=>{const s=String(v).trim(),m=s.match(/^(\d*\.?\d+)\s*gb$/i);return m?Math.round(parseFloat(m[1])*1024):/^\d+$/.test(s)?Number(s):NaN;};
    const comp=base.requiresCompatibilities===undefined?['EC2']:base.requiresCompatibilities;if(!Array.isArray(comp)||!comp.length||comp.some(x=>!['EC2','FARGATE','EXTERNAL','MANAGED_INSTANCES'].includes(x)))throw Error('ClientException: requiresCompatibilities values are EC2, FARGATE, EXTERNAL, MANAGED_INSTANCES.');
    const nm=base.networkMode;if(nm!==undefined&&!['awsvpc','bridge','host','none'].includes(nm))throw Error('ClientException: networkMode must be awsvpc, bridge, host or none.');
    const rp=base.runtimePlatform;if(rp!==undefined){if(!obj(rp))throw Error('ClientException: runtimePlatform needs cpuArchitecture and operatingSystemFamily');keys(rp,['cpuArchitecture','operatingSystemFamily'],'runtimePlatform');if(rp.cpuArchitecture!==undefined&&!['X86_64','ARM64'].includes(rp.cpuArchitecture)||rp.operatingSystemFamily!==undefined&&rp.operatingSystemFamily!=='LINUX')throw Error('ClientException: runtimePlatform: cpuArchitecture X86_64|ARM64, operatingSystemFamily LINUX (Windows is outside this fixture)');}
    if(nm==='awsvpc'&&pm.some(p=>p.hostPort!==undefined&&p.hostPort!==p.containerPort))throw Error('ClientException: When networkMode=awsvpc, the host ports and container ports in port mappings must match.');
    if(!comp.includes('FARGATE'))throw Error('Container fixture scope: this ShopKaro cluster runs Fargate tasks; set requiresCompatibilities ["FARGATE"].');
    if(nm!=='awsvpc')throw Error('ClientException: Fargate only supports network mode ‘awsvpc’.');
    if(base.cpu===undefined||base.memory===undefined)throw Error('ClientException: Fargate requires that \'cpu\' be defined at the task level.');
    const cpu=toCpu(base.cpu),mem=toMem(base.memory);if(!own(FARGATE,cpu)||!FARGATE[cpu].includes(mem))throw Error(`ClientException: No Fargate configuration exists for given values: ${base.cpu} CPU, ${base.memory} memory. See the Amazon ECS documentation for the valid combinations.`);
    if(lc&&!base.executionRoleArn)throw Error('ClientException: Fargate requires task definition to have execution role ARN to support log driver awslogs.');
    const tds=list('taskDefinitions'),rev=tds.filter(t=>t.family===base.family).reduce((n,t)=>Math.max(n,t.revision),0)+1;
    const t={family:base.family,revision:rev,status:'ACTIVE',...(base.executionRoleArn?{executionRoleArn:base.executionRoleArn}:{}),...(base.taskRoleArn?{taskRoleArn:base.taskRoleArn}:{}),networkMode:'awsvpc',requiresCompatibilities:comp.slice(),cpu:String(cpu),memory:String(mem),...(rp?{runtimePlatform:clone(rp)}:{}),containerDefinitions:[{...clone(c),essential:true,portMappings:pm.map(p=>({containerPort:p.containerPort,hostPort:p.containerPort,protocol:p.protocol||'tcp'}))}]};
    tds.push(t);bump();resultJson({taskDefinition:{...clone(t),taskDefinitionArn:tdArn(t),compatibilities:['EC2','FARGATE'],registeredAt:now}});
    print('sys',`Registered ${t.family}:${rev}. A task definition is the recipe; nothing runs until a service (or run-task) uses it.${t.taskRoleArn?'':' No taskRoleArn: the app gets no AWS credentials.'}`);return true;
   }
   if(op==='describe-task-definition'){const t=tdRef(required('task-definition'));resultJson({taskDefinition:{...clone(t),taskDefinitionArn:tdArn(t)}});return true;}
   if(op==='list-task-definitions'){const p=flag('family-prefix'),st=flag('status')??'ACTIVE';if(!['ACTIVE','INACTIVE'].includes(st))throw Error('InvalidParameterException: --status must be ACTIVE or INACTIVE');resultJson({taskDefinitionArns:list('taskDefinitions').filter(t=>t.status===st&&(p===null||t.family.startsWith(p))).map(tdArn)});return true;}
   if(op==='deregister-task-definition'){const ref=required('task-definition');if(!/:\d+$/.test(ref))throw Error('ClientException: deregister needs family:revision or a full task definition ARN');const t=tdRef(ref);t.status='INACTIVE';bump();resultJson({taskDefinition:{...clone(t),taskDefinitionArn:tdArn(t)}});print('sys','INACTIVE revisions keep running in existing deployments but cannot start new services or deployments.');return true;}
   if(op==='list-services'){const c=cluster();resultJson({serviceArns:list('ecsServices').filter(s=>s.cluster===c.name).map(svcArn)});return true;}
   if(op==='create-service'){
    const base=flag('cli-input-json')!==null?structure(flag('cli-input-json'),'cli-input-json'):{},cfgRaw=flag('deployment-configuration');
    for(const [f,k] of [['cluster','cluster'],['service-name','serviceName'],['task-definition','taskDefinition'],['launch-type','launchType']])if(flag(f)!==null)base[k]=flag(f);
    if(flag('desired-count')!==null)base.desiredCount=/^\d+$/.test(flag('desired-count'))?Number(flag('desired-count')):NaN;
    if(flag('network-configuration')!==null)base.networkConfiguration=flag('network-configuration');if(values('load-balancers').length)base.loadBalancers=many('load-balancers','load-balancers');if(values('capacity-provider-strategy').length)base.capacityProviderStrategy=many('capacity-provider-strategy','capacity-provider-strategy');
    if(flag('deployment-controller')!==null){const dc=structure(flag('deployment-controller'),'deployment-controller');keys(dc,['type'],'deploymentController');if(dc.type!=='ECS')throw Error('Container fixture scope: deploymentController '+dc.type+' (CodeDeploy blue/green or EXTERNAL) is taught in the lesson; use type=ECS here.');}
    keys(base,['cluster','serviceName','taskDefinition','desiredCount','launchType','capacityProviderStrategy','networkConfiguration','loadBalancers','deploymentConfiguration'],'service');
    const c=cluster(base.cluster||'default');if(typeof base.serviceName!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(base.serviceName))throw Error('InvalidParameterException: serviceName is required (letters, digits, hyphens, underscores).');
    if(list('ecsServices').some(s=>s.cluster===c.name&&s.name===base.serviceName))throw Error('InvalidParameterException: Creation of service was not idempotent.');
    if(base.taskDefinition===undefined)throw Error('aws: error: the following arguments are required: --task-definition');const t=tdRef(base.taskDefinition);if(t.status!=='ACTIVE')throw Error('ClientException: TaskDefinition is inactive');
    if(!Number.isInteger(base.desiredCount)||base.desiredCount<0||base.desiredCount>20)throw Error('InvalidParameterException: desiredCount must be an integer 0-20 in this fixture.');
    if(base.capacityProviderStrategy!==undefined&&!Array.isArray(base.capacityProviderStrategy))throw Error('InvalidParameterException: capacityProviderStrategy must be an array of objects');
    if(base.loadBalancers!==undefined&&!Array.isArray(base.loadBalancers))throw Error('InvalidParameterException: loadBalancers must be an array of objects');
    const cps=base.capacityProviderStrategy||[];if(base.launchType!==undefined&&cps.length)throw Error('InvalidParameterException: Specifying both a launch type and capacity provider strategy is not supported.');
    const lt=cps.length?null:base.launchType??((c.defaultStrategy||[]).length?null:'EC2');if(lt!==null&&!['FARGATE','EC2','EXTERNAL','MANAGED_INSTANCES'].includes(lt))throw Error('InvalidParameterException: launchType must be FARGATE, EC2, EXTERNAL or MANAGED_INSTANCES');
    if(lt==='EC2'&&base.launchType===undefined)throw Error(`Container fixture scope: no --launch-type, no --capacity-provider-strategy and no cluster default strategy, so ECS uses launch type EC2. ${c.name} has no EC2 container instances: real ECS accepts the service, then reports "unable to place a task". Pass --launch-type FARGATE or a FARGATE/FARGATE_SPOT strategy.`);
    if(lt!==null&&lt!=='FARGATE')throw Error(`Container fixture scope: launch type ${lt} needs container instances or on-prem hosts that ${c.name} does not have; this fixture runs FARGATE tasks.`);
    const strategy=strategyOf(cps.length?cps:lt===null?clone(c.defaultStrategy||[]):[],c);
    if(base.networkConfiguration===undefined)throw Error("InvalidParameterException: Network Configuration must be provided when networkMode 'awsvpc' is specified.");
    const net=network(typeof base.networkConfiguration==='string'?base.networkConfiguration:JSON.stringify(base.networkConfiguration));
    const lbs=(base.loadBalancers||[]).map(lb=>{keys(lb,['targetGroupArn','containerName','containerPort'],'loadBalancer');return {targetGroupArn:String(lb.targetGroupArn),containerName:String(lb.containerName),containerPort:lb.containerPort};});if(lbs.length>5)throw Error('InvalidParameterException: at most 5 load balancers per service');
    for(const lb of lbs){const tg=(a.containerTargetGroups||[]).find(x=>x.arn===lb.targetGroupArn);if(!tg)throw Error('InvalidParameterException: Unable to assume role and validate the specified targetGroupArn. Please verify that the ECS service role being passed has the proper permissions.');
     if(!tg.loadBalancer)throw Error(`InvalidParameterException: The target group with targetGroupArn ${tg.arn} does not have an associated load balancer.`);
     if(tg.targetType!=='ip')throw Error(`InvalidParameterException: The provided target group ${tg.arn} has target type ${tg.targetType}, which is incompatible with the awsvpc network mode specified in the task definition.`);
     const cd=t.containerDefinitions[0];if(lb.containerName!==cd.name||!(cd.portMappings||[]).some(p=>p.containerPort===lb.containerPort))throw Error(`InvalidParameterException: The container ${lb.containerName} did not have a container port ${lb.containerPort} defined.`);
     if(tg.vpcId!==((a.subnets||[]).find(x=>x.id===net.subnets[0])||{}).vpcId)throw Error('InvalidParameterException: The target group and the task subnets must be in the same VPC.');}
    const dcfg=deploymentConfig(cfgRaw!==null?cfgRaw:base.deploymentConfiguration===undefined?null:JSON.stringify(base.deploymentConfiguration),null);
    const s={cluster:c.name,name:base.serviceName,desired:base.desiredCount,strategy,network:net,loadBalancers:lbs,deploymentConfiguration:dcfg,deployments:[],events:[]};s.deployments.push(deployment(s,t));
    list('ecsServices').push(s);bump();resultJson({service:view(s)});print('sys','Deployment IN_PROGRESS. Fixture time advances only through: aws ecs wait services-stable --cluster '+c.name+' --services '+s.name);return true;
   }
   const svcOf=name=>{const c=cluster(),s=list('ecsServices').find(s=>s.cluster===c.name&&(s.name===name||svcArn(s)===name));if(!s)throw Error('ServiceNotFoundException: Service not found.');return s;};
   if(op==='update-service'){
    const s=svcOf(required('service')),p=primary(s);let td=null;
    if(flag('task-definition')!==null){td=tdRef(flag('task-definition'));if(td.status!=='ACTIVE')throw Error('ClientException: TaskDefinition is inactive');}
    let desired=s.desired;if(flag('desired-count')!==null){if(!/^\d+$/.test(flag('desired-count'))||+flag('desired-count')>20)throw Error('InvalidParameterException: desiredCount must be an integer 0-20 in this fixture.');desired=+flag('desired-count');}
    const cfg=flag('deployment-configuration')!==null?deploymentConfig(flag('deployment-configuration'),s.deploymentConfiguration):null;
    s.desired=desired;if(cfg)s.deploymentConfiguration=cfg;
    const next=td||byArn(p.taskDefinition);
    if((td&&tdArn(td)!==p.taskDefinition)||toks.includes('--force-new-deployment')||p.rolloutState==='FAILED'&&td){
     s.deployments=s.deployments.filter(d=>d.rolloutState!=='FAILED'||running(s,d).length);s.deployments.forEach(d=>{if(d.status==='PRIMARY')d.status='ACTIVE';});s.deployments.push(deployment(s,next));event(s,'has started a new deployment '+primary(s).id+'.');
     print('sys','New deployment IN_PROGRESS; the previous deployment keeps serving until the new tasks are healthy. Run the services-stable waiter.');}
    bump();resultJson({service:view(s)});return true;
   }
   if(op==='delete-service'){const s=svcOf(required('service'));if(s.desired>0&&!toks.includes('--force'))throw Error('InvalidParameterException: The service cannot be stopped while it is scaled above 0.');running(s).forEach(t=>stop(t,'Service deleted','ServiceSchedulerInitiated'));a.ecsServices=list('ecsServices').filter(x=>x!==s);bump();resultJson({service:{...view(s),status:'DRAINING'}});return true;}
   if(op==='describe-services'){const names=values('services');if(!names.length)throw Error('aws: error: the following arguments are required: --services');const c=cluster(),rows=names.map(n=>list('ecsServices').find(s=>s.cluster===c.name&&(s.name===n||svcArn(s)===n)));
    if(resultJson({services:rows.filter(Boolean).map(view),failures:names.filter((n,i)=>!rows[i]).map(n=>({arn:n,reason:'MISSING'}))})&&flag('query')===null&&rows.some(Boolean))list('containerReads').push({revision:a.containerRevision||0,services:rows.filter(Boolean).map(s=>s.name)});return true;}
   if(op==='wait'){const names=values('services');if(!names.length)throw Error('aws: error: services-stable needs --services <name>');const res=names.map(n=>settle(svcOf(n)));if(res.some(r=>r.changed))bump();
    if(res.some(r=>!r.stable))throw Error('Waiter ServicesStable failed: Max attempts exceeded. Inspect describe-services (deployments, events) and list-tasks --desired-status STOPPED + describe-tasks (stoppedReason).');
    print('sys','Services stable (declared contract settled once). Steady state means tasks run and pass health checks; read events and app logs to know whether the new version is the one serving.');return true;}
   if(op==='list-tasks'){const c=cluster(),sn=flag('service-name'),st=flag('desired-status')??'RUNNING';if(!['RUNNING','STOPPED','PENDING'].includes(st))throw Error('InvalidParameterException: --desired-status must be RUNNING, PENDING or STOPPED');if(sn!==null&&!list('ecsServices').some(s=>s.cluster===c.name&&s.name===sn))throw Error('ServiceNotFoundException: Service not found.');
    resultJson({taskArns:tasks().filter(t=>t.cluster===c.name&&(sn===null||t.service===sn)&&t.lastStatus===(st==='PENDING'?'PENDING':st)).map(taskArn)});return true;}
   if(op==='describe-tasks'){const c=cluster(),ids=values('tasks');if(!ids.length)throw Error('aws: error: the following arguments are required: --tasks');if(ids.length>100)throw Error('InvalidParameterException: at most 100 tasks');const rows=ids.map(id=>tasks().find(t=>t.cluster===c.name&&(t.id===id||taskArn(t)===id)));
    resultJson({tasks:rows.filter(Boolean).map(t=>{const td=byArn(t.taskDefinition),cd=td?td.containerDefinitions[0]:{name:'?',image:'?'};return {taskArn:taskArn(t),clusterArn:`arn:aws:ecs:${region}:${acct}:cluster/${t.cluster}`,taskDefinitionArn:t.taskDefinition,group:'service:'+t.service,launchType:'FARGATE',capacityProviderName:t.capacityProvider,lastStatus:t.lastStatus,desiredStatus:t.lastStatus==='RUNNING'?'RUNNING':'STOPPED',
     ...(t.lastStatus==='STOPPED'?{stopCode:t.stopCode,stoppedReason:t.stoppedReason}:{}),availabilityZone:t.az,attachments:[{type:'ElasticNetworkInterface',status:t.lastStatus==='RUNNING'?'ATTACHED':'DELETED',details:[{name:'subnetId',value:t.subnet},...(t.ip?[{name:'privateIPv4Address',value:t.ip}]:[])]}],
     containers:[{name:cd.name,image:cd.image,...(t.imageDigest?{imageDigest:t.imageDigest}:{}),lastStatus:t.lastStatus,...(t.exitCode!==undefined?{exitCode:t.exitCode}:{}),...(t.containerReason?{reason:t.containerReason}:{})}]};}),failures:ids.filter((id,i)=>!rows[i]).map(id=>({arn:id,reason:'MISSING'}))});return true;}
   return false;
  }catch(e){print('err',e.message);return true;}
 };
})();
