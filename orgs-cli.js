/* Bounded Organizations metadata/SCP evaluation; no real accounts, service setup or full IAM engine. */
(()=>{
 const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),copy=x=>JSON.parse(JSON.stringify(x)),arr=x=>Array.isArray(x)?x:x===undefined?[]:[x];
 const wild=(p,v,ci=false)=>typeof p==='string'&&typeof v==='string'&&new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$',ci?'i':'').test(v);
 const conditionOps=['StringEquals','StringNotEquals','StringLike','StringNotLike','ArnEquals','ArnNotEquals','ArnLike','ArnNotLike','Bool','Null'];
 const contextKeys=['aws:RequestedRegion','s3:LocationConstraint','aws:PrincipalArn','aws:SecureTransport'];
 const statements=d=>arr(d?.Statement);
 function validate(d){
  if(!object(d)||d.Version!==undefined&&d.Version!=='2012-10-17'||Object.keys(d).some(k=>!['Version','Statement','Id'].includes(k))||!statements(d).length)throw Error('MalformedPolicyDocumentException: reviewed2012-10-17 SCP Statement object/array required');
  for(const s of statements(d)){
   if(!object(s)||!['Allow','Deny'].includes(s.Effect)||Object.keys(s).some(k=>!['Sid','Effect','Action','NotAction','Resource','NotResource','Condition'].includes(k))||!!s.Action===!!s.NotAction||!!s.Resource===!!s.NotResource)throw Error('MalformedPolicyDocumentException: choose Action OR NotAction and Resource OR NotResource; no Principal in an SCP');
   for(const v of [s.Action||s.NotAction,s.Resource||s.NotResource])if(!arr(v).length||arr(v).some(x=>typeof x!=='string'||!x))throw Error('MalformedPolicyDocumentException: nonempty string/list action and resource required');
   if(s.Sid!==undefined&&typeof s.Sid!=='string')throw Error('MalformedPolicyDocumentException: Sid must be a string');
   if(s.Condition!==undefined){if(!object(s.Condition)||!Object.keys(s.Condition).length)throw Error('MalformedPolicyDocumentException: nonempty Condition object required');for(const [op,c]of Object.entries(s.Condition)){if(!conditionOps.includes(op)||!object(c)||!Object.keys(c).length)throw Error('Simulator condition subset:Equals/NotEquals/Like/NotLike/Arn variants, Bool and Null only');for(const [key,value]of Object.entries(c))if(['Bool','Null'].includes(op)&&arr(value).some(v=>!['true','false'].includes(v))||!contextKeys.includes(key)||!arr(value).length||arr(value).some(v=>typeof v!=='string'))throw Error('Simulator condition context:RequestedRegion, LocationConstraint, PrincipalArn, SecureTransport with string/list values only');}}
  }
  return d;
 }
 function matches(s,r){
  const action=arr(s.Action||s.NotAction).some(p=>wild(p,r.action,true)),resource=arr(s.Resource||s.NotResource).some(p=>wild(p,r.resource));if(s.NotAction?action:!action)return false;if(s.NotResource?resource:!resource)return false;
  const ctx={'aws:RequestedRegion':r.region,'s3:LocationConstraint':r.location,'aws:PrincipalArn':r.principalArn,'aws:SecureTransport':r.secureTransport};
  for(const [op,rows]of Object.entries(s.Condition||{}))for(const [k,v]of Object.entries(rows)){
   const actual=ctx[k],values=arr(v);let matched;
   if(op==='Null')matched=values.some(x=>(actual===undefined)===(x.toLowerCase()==='true'));
   else if(op==='Bool')matched=actual!==undefined&&values.some(x=>String(actual).toLowerCase()===x.toLowerCase());
   else{const equal=actual!==undefined&&values.some(x=>op.endsWith('Like')?wild(x,String(actual)):String(actual)===x);matched=op.includes('Not')?!equal:equal;}
   if(!matched)return false;
  }
  return true;
 }
 AG.orgSCPDecision=(a,r)=>{
  const o=a.organization;if(!o||o.featureSet!=='ALL')return {allowed:false,layer:'organization',reason:'ALL-features fixture required'};
  const account=(a.orgAccounts||[]).find(x=>x.id===r.accountId);if(!account)return {allowed:false,layer:'account',reason:'Unknown member/management account'};
  if(account.id===o.managementAccountId||r.principalType==='serviceLinkedRole')return {allowed:true,layer:'SCP exemption',reason:'SCP does not restrict this management identity/service-linked role; IAM/service permissions still apply'};
  if(!(a.orgPolicyTypes||[]).includes('SERVICE_CONTROL_POLICY'))return {allowed:true,layer:'SCP disabled',reason:'Policy type disabled; not a successful guardrail configuration'};
  const nodes=[account.id],seen=new Set(nodes);let id=account.parentId;
  while(id){if(seen.has(id))return {allowed:false,layer:'hierarchy',reason:'Cycle in parent path'};seen.add(id);nodes.push(id);if(id===o.rootId)break;const ou=(a.orgUnits||[]).find(x=>x.id===id);if(!ou)return {allowed:false,layer:'hierarchy',reason:'Parent OU missing'};id=ou.parentId;}
  if(nodes.at(-1)!==o.rootId)return {allowed:false,layer:'hierarchy',reason:'Path does not reach organization root'};
  const decisions=[];
  for(const target of nodes.slice().reverse()){
   let allow=false;const policies=(a.scps||[]).filter(p=>(p.targets||[]).includes(target));
   for(const p of policies){try{validate(p.document);}catch(e){return {allowed:false,layer:target,policy:p.id,reason:e.message};}for(const s of statements(p.document))if(matches(s,r)){if(s.Effect==='Deny')return {allowed:false,layer:target,policy:p.id,reason:'Explicit SCP Deny'};if(s.Effect==='Allow')allow=true;}}
   decisions.push({target,allow});
  }
  const missing=decisions.find(d=>!d.allow);return missing?{allowed:false,layer:missing.target,reason:'No applicable SCP Allow at this path level'}:{allowed:true,layer:'SCP path',reason:'Allow at root/every OU/account; no applicable Deny',path:decisions.map(d=>d.target)};
 };
 AG.orgRequestDecision=(a,r)=>{
  const scp=AG.orgSCPDecision(a,r);if(!scp.allowed)return scp;
  if(r.identity==='deny')return {allowed:false,layer:'IAM',reason:'Explicit identity policy Deny'};
  if(r.resourcePolicy==='deny')return {allowed:false,layer:'Resource policy',reason:'Explicit resource policy Deny'};
  if(r.boundary==='deny')return {allowed:false,layer:'Permissions boundary',reason:'Requested permission outside this role boundary'};
  // Existing same-account object only; role-ARN resource grant, not session/user ARN or cross-account evaluation.
  const resourceGrant=r.resourcePolicy==='allowRoleArn'&&r.action==='s3:PutObject';
  if(r.identity!=='allow'&&!resourceGrant)return {allowed:false,layer:'Grant',reason:'No identity grant or applicable role-ARN object resource grant'};
  return {allowed:true,layer:resourceGrant&&r.identity!=='allow'?'Role-ARN resource grant':'IAM grant',reason:'Bounded same-account role path passes grant, boundary and SCP; no full IAM/RCP/session-policy claim'};
 };
 const specs={
  'describe-organization':[],'list-roots':[],'list-accounts':[],'describe-account':['account-id'],'list-accounts-for-parent':['parent-id'],
  'create-organizational-unit':['parent-id','name'],'update-organizational-unit':['organizational-unit-id','name'],'delete-organizational-unit':['organizational-unit-id'],'list-organizational-units-for-parent':['parent-id'],'list-parents':['child-id'],'move-account':['account-id','source-parent-id','destination-parent-id'],
  'list-policies':['filter'],'describe-policy':['policy-id'],'list-policies-for-target':['target-id','filter'],'list-targets-for-policy':['policy-id'],'create-policy':['content','description','name','type'],'update-policy':['policy-id','content','description','name'],'delete-policy':['policy-id'],'attach-policy':['policy-id','target-id'],'detach-policy':['policy-id','target-id'],
  'enable-aws-service-access':['service-principal'],'disable-aws-service-access':['service-principal'],'list-aws-service-access-for-organization':[],'register-delegated-administrator':['account-id','service-principal'],'deregister-delegated-administrator':['account-id','service-principal'],'list-delegated-administrators':['service-principal'],'list-delegated-services-for-account':['account-id']
 };
 AG.organizationsCLI=({service,op,toks,flag,flags,sim,list,print,resultJson})=>{
  if(service!=='organizations')return false;
  const required=n=>{const v=flag(n);if(v===null||v==='')throw Error('aws: error: required --'+n);return v;};
  const o=sim.account.organization,accounts=()=>list('orgAccounts'),ous=()=>list('orgUnits'),policies=()=>list('scps'),access=()=>list('orgServiceAccess'),delegates=()=>list('orgDelegates');
  const bump=()=>{sim.account.orgRevision=(sim.account.orgRevision||0)+1;};
  const parent=id=>{if(id===o.rootId)return {id,name:'Root',type:'ROOT'};const u=ous().find(u=>u.id===id);if(!u)throw Error('ParentNotFoundException: parent Root/OU does not exist');return {...u,type:'ORGANIZATIONAL_UNIT'};};
  const account=id=>{const a=accounts().find(a=>a.id===id);if(!a)throw Error('AccountNotFoundException: account ID not in this organization');return a;};
  const policy=()=>{const id=required('policy-id'),p=policies().find(p=>p.id===id);if(!p)throw Error('PolicyNotFoundException: unknown policy ID');return p;};
  const target=id=>id===o.rootId||ous().some(u=>u.id===id)?parent(id):{...account(id),type:'ACCOUNT'};
  const type=()=>{if(required('filter')!=='SERVICE_CONTROL_POLICY')throw Error('Simulator scope:SERVICE_CONTROL_POLICY only; tag/backup/RCP/declarative types have separate semantics');};
  const summary=p=>({Id:p.id,Arn:`arn:aws:organizations::${o.managementAccountId}:policy/${o.id}/service_control_policy/${p.id}`,Name:p.name,Description:p.description||'',Type:'SERVICE_CONTROL_POLICY',AwsManaged:!!p.awsManaged});
  const acctView=a=>({Id:a.id,Arn:`arn:aws:organizations::${o.managementAccountId}:account/${o.id}/${a.id}`,Name:a.name,Email:a.email||a.name+'@example.invalid',State:a.state||a.status||'ACTIVE',JoinedMethod:'CREATED'});
  const ouView=u=>({Id:u.id,Arn:`arn:aws:organizations::${o.managementAccountId}:ou/${o.id}/${u.id}`,Name:u.name});
  const doc=()=>{let raw=required('content');if(raw.startsWith('file://')){const f=Object.prototype.hasOwnProperty.call(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error('Unable to load --content paramfile; inspect ls/cat');raw=f.content;}if(raw.length>5120)throw Error('ConstraintViolationException:SCP maximum5120characters');let d;try{d=JSON.parse(raw);}catch(e){throw Error('MalformedPolicyDocumentException:valid JSON required');}return validate(d);};
  const principal=()=>{const p=required('service-principal');if(p.length>128||!/^[a-z0-9.-]+\.amazonaws\.com$/.test(p))throw Error('InvalidInputException:AWS service principal required');return p;};
  try{
   if(!Object.prototype.hasOwnProperty.call(specs,op))throw Error('Organizations operation outside fixture scope:'+op+'; no real account creation/closure or org-wide destructive workflow');
   const allowed=specs[op].concat(['query','output','region','no-cli-pager!']),seen=new Set();for(let i=3;i<toks.length;i+=2){const n=toks[i].startsWith('--')?toks[i].slice(2):'',s=allowed.find(x=>x.replace(/!$/,'')===n);if(!s)throw Error('Unknown options:'+toks[i]);if(seen.has(n))throw Error('Duplicate option --'+n);seen.add(n);if(s.endsWith('!')){i--;continue;}if(!toks[i+1]||toks[i+1].startsWith('--'))throw Error('aws: error: --'+n+' expected one argument');}
   if(!o)throw Error('AWSOrganizationsNotInUseException:fixture is not in an organization');
   if(sim.account.callerIdentity?.Account!==o.managementAccountId)throw Error('AccessDeniedException:these fixture Organizations management operations require the management account');
   if(op==='describe-organization'){resultJson({Organization:{Id:o.id,Arn:`arn:aws:organizations::${o.managementAccountId}:organization/${o.id}`,FeatureSet:o.featureSet,MasterAccountId:o.managementAccountId,MasterAccountEmail:o.email}});return true;}
   if(op==='list-roots'){resultJson({Roots:[{Id:o.rootId,Name:'Root',Arn:`arn:aws:organizations::${o.managementAccountId}:root/${o.id}/${o.rootId}`,PolicyTypes:list('orgPolicyTypes').map(Type=>({Type,Status:'ENABLED'}))}]});return true;}
   if(op==='list-accounts'||op==='list-accounts-for-parent'){const p=op==='list-accounts-for-parent'?parent(required('parent-id')):null;resultJson({Accounts:accounts().filter(a=>!p||a.parentId===p.id).map(acctView)});return true;}
   if(op==='describe-account'){resultJson({Account:acctView(account(required('account-id')))});return true;}
   if(op==='list-parents'){const id=required('child-id'),node=accounts().find(a=>a.id===id)||ous().find(u=>u.id===id);if(!node)throw Error('ChildNotFoundException:account/OU not found');const p=parent(node.parentId);resultJson({Parents:[{Id:p.id,Type:p.type}]});return true;}
   if(op==='list-organizational-units-for-parent'){const p=parent(required('parent-id'));resultJson({OrganizationalUnits:ous().filter(u=>u.parentId===p.id).map(ouView)});return true;}
   if(op==='create-organizational-unit'||op==='update-organizational-unit'){
    const name=required('name');if(name.length>128)throw Error('InvalidInputException:OU name1..128characters');
    let u,p;if(op==='update-organizational-unit'){u=ous().find(u=>u.id===required('organizational-unit-id'));if(!u)throw Error('OrganizationalUnitNotFoundException:OU not found');p=parent(u.parentId);}else p=parent(required('parent-id'));
    if(ous().some(x=>x!==u&&x.parentId===p.id&&x.name===name))throw Error('DuplicateOrganizationalUnitException:OU name already exists under this parent');
    if(!u){let depth=0,walk=p.id;const visited=new Set();while(walk!==o.rootId){if(visited.has(walk))throw Error('InvalidInputException:cycle in parent path');visited.add(walk);const ancestor=ous().find(x=>x.id===walk);if(!ancestor)throw Error('ParentNotFoundException:ancestor missing');depth++;walk=ancestor.parentId;}if(depth>=5)throw Error('ConstraintViolationException:OU_DEPTH_LIMIT_EXCEEDED; maximum5OU levels below root');let id;do{sim.account.orgOuSequence=(sim.account.orgOuSequence||0)+1;id='ou-'+o.rootId.slice(2)+'-'+String(sim.account.orgOuSequence).padStart(8,'0');}while(ous().some(x=>x.id===id));u={id,name,parentId:p.id,fixtureId:'created-'+id};ous().push(u);if(list('orgPolicyTypes').includes('SERVICE_CONTROL_POLICY')){const full=policies().find(p=>p.id==='p-FullAWSAccess');if(!full){ous().pop();throw Error('Fixture scope:managed FullAWSAccess baseline missing');}full.targets.push(id);}}else u.name=name;
    bump();resultJson({OrganizationalUnit:ouView(u)});return true;
   }
   if(op==='delete-organizational-unit'){const id=required('organizational-unit-id'),i=ous().findIndex(u=>u.id===id);if(i<0)throw Error('OrganizationalUnitNotFoundException:OU not found');if(ous().some(u=>u.parentId===id)||accounts().some(a=>a.parentId===id))throw Error('OrganizationalUnitNotEmptyException:move children before deletion');ous().splice(i,1);for(const p of policies())p.targets=(p.targets||[]).filter(t=>t!==id);bump();resultJson({});return true;}
   if(op==='move-account'){const a=account(required('account-id')),source=parent(required('source-parent-id')),dest=parent(required('destination-parent-id'));if(a.id===o.managementAccountId)throw Error('ConstraintViolationException:management account cannot move into an OU');if(a.parentId!==source.id)throw Error('SourceParentNotFoundException:actual account parent differs');if(source.id===dest.id)throw Error('DuplicateAccountException:account already in destination');if((a.state||a.status)!=='ACTIVE')throw Error('ConstraintViolationException:active account required');a.parentId=dest.id;bump();resultJson({});return true;}
   if(op==='list-policies'||op==='list-policies-for-target'){type();let id;if(op==='list-policies-for-target'){id=required('target-id');target(id);}resultJson({Policies:policies().filter(p=>!id||(p.targets||[]).includes(id)).map(summary)});return true;}
   if(op==='describe-policy'){const p=policy();if(resultJson({Policy:{PolicySummary:summary(p),Content:JSON.stringify(p.document)}})&&!flag('query'))(sim.account.orgPolicyReads||(sim.account.orgPolicyReads=[])).push({id:p.id,revision:p.revision||0,document:copy(p.document)});return true;}
   if(op==='list-targets-for-policy'){const p=policy();resultJson({Targets:(p.targets||[]).map(id=>{const t=target(id);return {TargetId:id,Name:t.name,Type:t.type};})});return true;}
   if(op==='create-policy'||op==='update-policy'){
    let p=op==='update-policy'?policy():null;if(p?.awsManaged)throw Error('InvalidInputException:AWS-managed policy cannot be changed');if(op==='create-policy'&&required('type')!=='SERVICE_CONTROL_POLICY')throw Error('Simulator policy type:SERVICE_CONTROL_POLICY only');
    const name=flag('name')??p?.name,description=flag('description')??p?.description;if(!name||name.length>128||description===undefined||description.length>1000)throw Error('InvalidInputException:policy name1..128 and description≤1000required');
    const document=flag('content')!==null?doc():p?.document;if(!document)throw Error('aws: error:required --content');if(policies().some(x=>x!==p&&x.name===name))throw Error('DuplicatePolicyException:policy name exists');
    if(!p){let id;do{sim.account.orgPolicySequence=(sim.account.orgPolicySequence||0)+1;id='p-'+String(sim.account.orgPolicySequence).padStart(8,'0');}while(policies().some(x=>x.id===id));p={id,targets:[],awsManaged:false,revision:0};policies().push(p);}Object.assign(p,{name,description,document:copy(document),revision:(p.revision||0)+1});bump();resultJson({Policy:{PolicySummary:summary(p),Content:JSON.stringify(p.document)}});return true;
   }
   if(op==='delete-policy'){const p=policy();if(p.awsManaged)throw Error('InvalidInputException:AWS-managed policy cannot be deleted');if(p.targets?.length)throw Error('PolicyInUseException:detach before deletion');policies().splice(policies().indexOf(p),1);bump();resultJson({});return true;}
   if(op==='attach-policy'||op==='detach-policy'){const p=policy(),id=required('target-id');target(id);if(!list('orgPolicyTypes').includes('SERVICE_CONTROL_POLICY'))throw Error('PolicyTypeNotEnabledException:SCP policy type must be enabled');const attached=(p.targets||[]).includes(id),count=policies().filter(p=>(p.targets||[]).includes(id)).length;if(op==='attach-policy'){if(attached)throw Error('DuplicatePolicyAttachmentException:already attached');if(count>=5)throw Error('ConstraintViolationException:maximum5direct SCP attachments per target');(p.targets||(p.targets=[])).push(id);}else{if(!attached)throw Error('PolicyNotAttachedException:attachment not present');if(count<=1)throw Error('ConstraintViolationException:cannot detach the last policy from an enabled target');p.targets=p.targets.filter(t=>t!==id);}bump();resultJson({});return true;}
   if(['enable-aws-service-access','disable-aws-service-access'].includes(op)){if(o.featureSet!=='ALL')throw Error('ConstraintViolationException:ORGANIZATION_NOT_IN_ALL_FEATURES_MODE; ALL features required for trusted access');const p=principal(),i=access().indexOf(p);if(op==='enable-aws-service-access'){if(i<0){access().push(p);bump();}}else if(i>=0){access().splice(i,1);bump();}resultJson({});print('sys','Trusted-access configuration only; no service-linked roles, Config rules or other service setup is executed here.');return true;}
   if(op==='list-aws-service-access-for-organization'){resultJson({EnabledServicePrincipals:access().map(ServicePrincipal=>({ServicePrincipal}))});return true;}
   if(op==='register-delegated-administrator'||op==='deregister-delegated-administrator'){
    const a=account(required('account-id')),p=principal();if(!['config.amazonaws.com','config-multiaccountsetup.amazonaws.com'].includes(p))throw Error('Simulator delegation scope:documented Config principals only; GuardDuty/SecurityHub/etc need service-specific administration workflows');if(a.id===o.managementAccountId||(a.state||a.status)!=='ACTIVE')throw Error('ConstraintViolationException:active member account required');const old=delegates().find(d=>d.accountId===a.id&&d.service===p);
    if(op==='register-delegated-administrator'){if(o.featureSet!=='ALL'||!access().includes(p))throw Error('ConstraintViolationException:SERVICE_ACCESS_NOT_ENABLED; enable trusted access for this service principal before delegation');if(old)throw Error('AccountAlreadyRegisteredException:already delegated');sim.account.orgDelegateSequence=(sim.account.orgDelegateSequence||0)+1;delegates().push({accountId:a.id,service:p,id:'delegation-'+sim.account.orgDelegateSequence});}else{if(!old)throw Error('AccountNotRegisteredException:delegation not found');delegates().splice(delegates().indexOf(old),1);}bump();resultJson({});print('sys','Service-specific registration metadata only; not an organization owner, SCP exemption or deployed Config service.');return true;
   }
   if(op==='list-delegated-administrators'){const p=flag('service-principal'),rows=delegates().filter(d=>!p||d.service===p);const ids=[...new Set(rows.map(d=>d.accountId))];if(resultJson({DelegatedAdministrators:ids.map(id=>acctView(account(id)))})&&!flag('query'))(sim.account.orgDelegationReads||(sim.account.orgDelegationReads=[])).push({revision:sim.account.orgRevision||0,service:p,ids});return true;}
   if(op==='list-delegated-services-for-account'){const a=account(required('account-id'));resultJson({DelegatedServices:delegates().filter(d=>d.accountId===a.id).map(d=>({ServicePrincipal:d.service}))});return true;}
   throw Error('Organizations branch not modeled');
  }catch(e){print('err',e.message);return true;}
 };
})();
