/* A bounded Terraform native-JSON fixture, not a Terraform process. Only literal
   aws_security_group/aws_s3_bucket configs, S3 backend metadata and the documented
   CLI operations below are modeled. Real provider/conditional-lock proof: lab26. */
(()=>{
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),copy=v=>JSON.parse(JSON.stringify(v));
 const canon=v=>Array.isArray(v)?v.map(canon):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
 const same=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
 const safe=v=>!obj(v)&&!Array.isArray(v)||Object.keys(v).every(k=>!['__proto__','prototype','constructor'].includes(k)&&safe(v[k]));
 const ipv4=c=>typeof c==='string'&&/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(c)&&c.split('/')[0].split('.').every(n=>Number(n)<=255)&&Number(c.split('/')[1])<=32;
 const address=/^(aws_s3_bucket|aws_security_group)\.[a-zA-Z_][a-zA-Z0-9_]*$/;
 // Live AWS uses the shared EC2 rule schema; native Terraform sets stay at the provider boundary.
 AG.iacIngressToAWS=rules=>rules.flatMap(r=>r.cidr_blocks.map(cidr=>({protocol:r.protocol,fromPort:r.from_port,toPort:r.to_port,cidr})));
 AG.iacIngressFromAWS=rules=>{
  const groups=new Map();
  for(const r of rules){
   const key=JSON.stringify([r.protocol||'tcp',r.fromPort??0,r.toPort??0]);
   if(!groups.has(key))groups.set(key,{from_port:r.fromPort??0,to_port:r.toPort??0,protocol:r.protocol||'tcp',cidr_blocks:[],description:'',ipv6_cidr_blocks:[],prefix_list_ids:[],security_groups:[],self:false});
   const g=groups.get(key);
   if(r.cidr&&!g.cidr_blocks.includes(r.cidr))g.cidr_blocks.push(r.cidr);
   if(r.sourceGroup&&!g.security_groups.includes(r.sourceGroup))g.security_groups.push(r.sourceGroup);
  }
  return [...groups.values()];
 };
 function config(sim){
  const f=sim.files['main.tf.json'];if(!f)return {};
  let d;try{d=JSON.parse(f.content);}catch(e){throw Error('Invalid JSON configuration: main.tf.json. cat templates/reviewed.json shows valid Terraform native JSON.');}
  if(!obj(d)||!safe(d)||Object.keys(d).some(k=>k!=='resource')||(d.resource!==undefined&&!obj(d.resource)))throw Error('Unsupported configuration: fixture accepts only literal resource blocks in main.tf.json; lab26 runs real HCL/Terraform.');
  const out={};for(const [type,rs] of Object.entries(d.resource||{})){
   if(!['aws_s3_bucket','aws_security_group'].includes(type)||!obj(rs))throw Error('Unsupported resource type or block: '+type);
   for(const [name,r] of Object.entries(rs)){
    const key=type+'.'+name;if(!address.test(key)||!obj(r))throw Error('Invalid resource address/block: '+key);
    const allowed=type==='aws_s3_bucket'?['bucket','force_destroy','lifecycle']:['name','description','vpc_id','ingress','lifecycle'];
    if(Object.keys(r).some(k=>!allowed.includes(k)))throw Error('Unsupported argument in '+key+'. This fixture models literal bucket/SG attributes and prevent_destroy only.');
    if(r.lifecycle!==undefined&&(!obj(r.lifecycle)||Object.keys(r.lifecycle).some(k=>k!=='prevent_destroy')||typeof r.lifecycle.prevent_destroy!=='boolean'))throw Error('Invalid lifecycle: prevent_destroy must be a literal boolean in '+key);
    if(type==='aws_s3_bucket'){
     if(typeof r.bucket!=='string'||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(r.bucket)||(r.force_destroy!==undefined&&typeof r.force_destroy!=='boolean'))throw Error('Invalid bucket configuration in '+key+': bucket name and boolean force_destroy required.');
    }else{
     if(typeof r.name!=='string'||!r.name||typeof r.description!=='string'||typeof r.vpc_id!=='string'||!Array.isArray(r.ingress))throw Error('Invalid security group configuration in '+key+': name, description, vpc_id and ingress array required.');
     for(const rule of r.ingress){
      if(!obj(rule)||Object.keys(rule).some(k=>!['from_port','to_port','protocol','cidr_blocks','description','ipv6_cidr_blocks','prefix_list_ids','security_groups','self'].includes(k))||!Number.isInteger(rule.from_port)||!Number.isInteger(rule.to_port)||rule.from_port<0||rule.to_port>65535||rule.to_port<rule.from_port||rule.protocol!=='tcp'||!Array.isArray(rule.cidr_blocks)||!rule.cidr_blocks.length||rule.cidr_blocks.some(c=>!ipv4(c))||rule.description!==''||rule.self!==false||['ipv6_cidr_blocks','prefix_list_ids','security_groups'].some(k=>!Array.isArray(rule[k])||rule[k].length))throw Error('Invalid ingress: native JSON SG rules need all literal set attributes (see templates/reviewed.json). Fixture supports TCP IPv4 CIDRs only.');
     }
    }
    out[key]=copy(r);
   }
  }return out;
 }
 const remote=(a,key,id)=>key.startsWith('aws_s3_bucket.')?(a.buckets||[]).find(b=>b.name===id):(a.securityGroups||[]).find(g=>g.id===id);
 const attrs=(key,r,b)=>!r?null:key.startsWith('aws_s3_bucket.')?{bucket:r.name,force_destroy:!!b?.attrs?.force_destroy}:{name:r.name,description:r.description,vpc_id:r.vpcId,ingress:AG.iacIngressFromAWS(r.ingress)};
 const desired=(key,c)=>key.startsWith('aws_s3_bucket.')?{bucket:c.bucket,force_destroy:!!c.force_destroy}:{name:c.name,description:c.description,vpc_id:c.vpc_id,ingress:copy(c.ingress)};
 const replacing=(key,old,c)=>key.startsWith('aws_s3_bucket.')?old.bucket!==c.bucket:old.name!==c.name||old.vpc_id!==c.vpc_id||old.description!==c.description;
 const view=sim=>({files:sim.files['main.tf.json']?.content??null,state:sim.account.iacState,backend:sim.account.iacBackend,buckets:sim.account.buckets,sgs:sim.account.securityGroups});
 AG.iacFingerprint=sim=>JSON.stringify(canon(view(sim)));
 AG.iacConfig=config;
 AG.iacCurrentPlan=sim=>!!sim.account.iacReceipt&&sim.account.iacReceipt.normal===true&&sim.account.iacReceipt.changes===0&&sim.account.iacReceipt.fingerprint===AG.iacFingerprint(sim);
 AG.iacCLI=(sim,toks,print)=>{
  if(!sim.account.iacMode)return false;
  if(!['terraform','cp','rm'].includes(toks[0]))return false;
  const a=sim.account,st=a.iacState;
  const say=v=>print('ok',typeof v==='string'?v:JSON.stringify(v,null,2));
  try{
   if(toks[0]==='cp'){
    if(toks.length!==3)throw Error('usage: cp <mission-file> main.tf.json');
    if(toks[2]!=='main.tf.json')throw Error('cp: fixture allows writes to main.tf.json only. Plans and backend state are not editable files.');
    const f=own(sim.files,toks[1])&&sim.files[toks[1]];if(!f||typeof f.content!=='string')throw Error('cp: cannot stat '+toks[1]+': No such file (ls lists files)');
    sim.files['main.tf.json']={content:f.content};say('Copied '+toks[1]+' to main.tf.json. No AWS resource changed.');return true;
   }
   if(toks[0]==='rm'){
    if(toks.length!==2||toks[1]!=='main.tf.json')throw Error('rm: fixture permits only rm main.tf.json; Terraform state/backend cannot be reset by shell commands.');
    if(!own(sim.files,'main.tf.json'))throw Error('rm: main.tf.json: No such file');delete sim.files['main.tf.json'];say('Removed config only. State bindings and AWS resources remain. Next normal plan proposes destruction.');return true;
   }
   const op=toks[1],opts={},pos=[];
   const specs={init:['reconfigure','input'],validate:[],plan:['out','detailed-exitcode','refresh-only','destroy','refresh','lock','lock-timeout','input','target'],apply:['auto-approve','input','refresh-only','destroy','refresh','lock','lock-timeout','target'],destroy:['auto-approve','input','lock','lock-timeout'],import:['input','lock','lock-timeout'],state:[]};
   if(!own(specs,op))throw Error('Terraform fixture: use init, validate, plan, apply, import, state list/show/mv/rm/pull, destroy. Full Terraform/HCL runs in lab26.');
   const bool=['reconfigure','detailed-exitcode','refresh-only','destroy','auto-approve','no-color'];
   for(let i=2;i<toks.length;i++){
    const t=toks[i];if(!t.startsWith('-')){pos.push(t);continue;}
    const m=t.match(/^-([a-z-]+)(?:=(.*))?$/);if(!m||(!specs[op].includes(m[1])&&m[1]!=='no-color'))throw Error('Failed to parse command-line flags: flag provided but not defined: '+t);
    const k=m[1];if(own(opts,k))throw Error('Duplicate flag -'+k);
    const v=m[2]!==undefined?m[2]:bool.includes(k)?'true':toks[++i];
    if(v===undefined||(!bool.includes(k)&&v.startsWith('-')))throw Error('Missing value for -'+k);
    if((bool.includes(k)||['refresh','lock','input'].includes(k))&&!['true','false'].includes(v))throw Error('Invalid boolean value for -'+k+': '+v);
    if(k==='lock-timeout'&&!/^\d+(ms|s|m|h)$/.test(v))throw Error('Invalid duration for -lock-timeout: '+v);
    opts[k]=v;
   }
   if(op==='init'){
    if(pos.length)throw Error('Too many command line arguments. Use the current fixture working directory.');
    if(!a.iacBackend||a.iacBackend.type!=='s3'||!a.iacBackend.private||!a.iacBackend.versioning||!a.iacBackend.encrypted||a.iacBackend.use_lockfile!==true)throw Error('Backend initialization failed: training contract requires private versioned encrypted S3 backend with use_lockfile=true. Real S3 backend supports other settings.');
    config(sim);a.iacInitialized=true;say('Terraform has been successfully initialized! S3 backend; native lockfile enabled. Provider model: aws_s3_bucket + aws_security_group only.');return true;
   }
   if(!a.iacInitialized)throw Error('Backend initialization required, please run "terraform init".');
   if(op==='validate'){if(pos.length)throw Error('validate: unexpected arguments');config(sim);say('Success! The configuration is valid for this bounded native-JSON fixture. Validation does not inspect live drift.');return true;}
   if(a.iacLock&&opts.lock!=='false')throw Error('Error acquiring the state lock: ConditionalCheckFailedException. Lock held by '+String(a.iacLock.who||'another writer')+'. Inspect owner/run before releasing; -lock=false removes writer protection.');
   if(op==='state'){
    const sub=pos.shift();if(!['list','show','pull','mv','rm'].includes(sub))throw Error('state: use list, show ADDRESS, pull, mv SOURCE DESTINATION, rm ADDRESS.');
    if(sub==='list'||sub==='pull'){if(pos.length)throw Error('state '+sub+': unexpected arguments');say(sub==='list'?Object.keys(st.bindings).sort().join('\n')||'No state bindings.':st);return true;}
    if(sub==='show'){if(pos.length!==1||!own(st.bindings,pos[0]))throw Error('No instance found for the given address! terraform state list shows current bindings.');say(st.bindings[pos[0]]);return true;}
    if(sub==='rm'){
     if(pos.length!==1||!own(st.bindings,pos[0]))throw Error('Invalid target address: no matching state instance.');delete st.bindings[pos[0]];st.serial++;say('Removed '+pos[0]+' from state. Remote object still exists; next plan can propose a conflicting create.');return true;
    }
    if(pos.length!==2||!address.test(pos[0])||!address.test(pos[1])||pos[0].split('.')[0]!==pos[1].split('.')[0])throw Error('Invalid source/destination: state mv requires two same-type resource addresses.');
    if(!own(st.bindings,pos[0]))throw Error('Invalid source address: no matching state instance.');if(own(st.bindings,pos[1]))throw Error('Invalid target address: destination already exists.');
    st.bindings[pos[1]]=st.bindings[pos[0]];delete st.bindings[pos[0]];st.serial++;say('Successfully moved 1 object(s). Remote object unchanged.');return true;
   }
   if(op==='import'){
    const c=config(sim);if(pos.length!==2||!address.test(pos[0]))throw Error('The import command expects two arguments: terraform import ADDRESS ID');
    const [key,id]=pos;if(!own(c,key))throw Error('Configuration for import target does not exist: '+key+'. Add the resource block before CLI import.');if(own(st.bindings,key))throw Error('Resource already managed by Terraform: '+key);
    const r=remote(a,key,id);if(!r)throw Error('Cannot import non-existent remote object: '+id+'. Verify account, region and physical ID.');
    if(Object.entries(st.bindings).some(([k,b])=>k.split('.')[0]===key.split('.')[0]&&b.id===id))throw Error('Fixture refuses duplicate binding: one remote object must have one resource address.');
    st.bindings[key]={id,attrs:attrs(key,r)};st.serial++;say('Import successful! 1 existing object bound; remote data/configuration unchanged. Review the next plan.');return true;
   }
   if(pos.length>(op==='apply'?1:0))throw Error('Too many command line arguments. plan accepts -out=FILE; apply accepts one saved plan.');
   if(opts['refresh-only']==='true'&&(opts.destroy==='true'||op==='destroy'))throw Error('Invalid planning mode options: -refresh-only and -destroy are mutually exclusive.');
   if(opts['refresh-only']==='true'&&opts.refresh==='false')throw Error('Incompatible plan options: -refresh=false cannot be used in refresh-only mode.');
   if(op==='apply'&&pos.length&&Object.keys(opts).some(k=>['refresh-only','destroy','refresh','target'].includes(k)))throw Error('Saved plan mode: planning options cannot be passed when applying a saved plan.');
   const makePlan=()=>{
    const c=config(sim),bindings=copy(st.bindings),actions=[],refreshOnly=opts['refresh-only']==='true',destroy=op==='destroy'||opts.destroy==='true';
    if(opts.target&&!address.test(opts.target))throw Error('Invalid target address: '+opts.target);
    const keys=[...new Set([...Object.keys(c),...Object.keys(bindings)])].filter(k=>!opts.target||opts.target===k);
    if(opts.target&&!keys.length)throw Error('Invalid target address: no matching configuration or state.');
    for(const key of keys){
     const b=bindings[key],r=b&&remote(a,key,b.id),old=b?(opts.refresh==='false'?b.attrs:attrs(key,r,b)):null,now=c[key];
     if(b&&opts.refresh!=='false'){if(r)b.attrs=attrs(key,r,b);else delete bindings[key];}
     if(refreshOnly)continue;
     if(destroy||!now){if(old){if(now?.lifecycle?.prevent_destroy===true)throw Error('Instance cannot be destroyed: '+key+' has lifecycle.prevent_destroy set.');actions.push({key,kind:'delete',id:b.id,old});}continue;}
     if(!old){actions.push({key,kind:'create',want:desired(key,now)});continue;}
     const want=desired(key,now);if(replacing(key,old,now)){
      if(now.lifecycle?.prevent_destroy===true)throw Error('Instance cannot be destroyed: '+key+' requires replacement but lifecycle.prevent_destroy is set. Revert physical-name change; moved/state mv only fix address renames.');
      actions.push({key,kind:'replace',id:b.id,old,want});
     }else if(!same(old,want))actions.push({key,kind:'update',id:b.id,old,want});
    }
    return {config:c,bindings,actions,serial:st.serial,lineage:st.lineage,refreshOnly,destroy,normal:!refreshOnly&&!destroy&&!opts.target&&opts.refresh!=='false'&&opts.lock!=='false'};
   };
   let p;if(op==='apply'&&pos.length){p=a.iacPlans?.[pos[0]];if(!p)throw Error('Failed to load '+pos[0]+' as a plan file: no saved plan (terraform plan -out='+pos[0]+').');p=copy(p);if(p.serial!==st.serial)throw Error('Saved plan is stale: state changed after planning. Create and review a new plan.');if(p.lineage!==st.lineage)throw Error('Saved plan does not match the given state: different state lineage.');}else p=makePlan();
   const lines=p.actions.map(x=>`${x.kind==='update'?'~':x.kind==='create'?'+':x.kind==='replace'?'-/+':'-'} ${x.key} ${x.kind==='update'?'will be updated in-place':x.kind==='replace'?'must be replaced (physical identity forces replacement)':x.kind==='create'?'will be created':'will be destroyed'}${x.key.startsWith('aws_security_group.')?'\n  ingress: '+JSON.stringify(x.old?.ingress||[])+' -> '+JSON.stringify(x.want?.ingress||[]):''}`);
   const adds=p.actions.filter(x=>['create','replace'].includes(x.kind)).length,changes=p.actions.filter(x=>x.kind==='update').length,dels=p.actions.filter(x=>['delete','replace'].includes(x.kind)).length;
   if(op==='plan'){
    const stateDiff=!same(p.bindings,st.bindings),count=p.refreshOnly?Number(stateDiff):p.actions.length;
    say(lines.join('\n')+(lines.length?'\n':'')+(p.refreshOnly?'Refresh-only: updates state records; no remote repair.':`Plan: ${adds} to add, ${changes} to change, ${dels} to destroy.`)+(count?'':'\nNo changes.'));
    if(opts.out){if(!/^[a-zA-Z0-9_-]+\.tfplan$/.test(opts.out))throw Error('Invalid plan path: use a simple name ending .tfplan.');(a.iacPlans||(a.iacPlans={}))[opts.out]=copy(p);say('Saved the plan to: '+opts.out+' (sensitive artifact; contains configuration and state).');}
    a.iacReceipt={normal:p.normal,changes:count,fingerprint:AG.iacFingerprint(sim)};
    if(opts['detailed-exitcode']==='true')say('Exit code: '+(count?2:0)+' (0=no changes, 1=error, 2=changes).');return true;
   }
   if(!pos.length&&opts['auto-approve']!=='true')throw Error('Apply requires approval. Fixture has no interactive yes prompt; review terraform plan -out=FILE then terraform apply FILE, or explicitly use -auto-approve.');
   /* Execute actual modeled operations, then persist refreshed records. No implicit rollback;
      a provider failure retains already-completed actions, just like a partial apply. */
   let wrote=false;const persist=()=>{st.bindings=copy(p.bindings);st.serial++;wrote=true;};
   const remove=x=>{
    const r=remote(a,x.key,x.id);if(!r)return;
    if(x.key.startsWith('aws_s3_bucket.')){if((r.objects||[]).length&&x.old?.force_destroy!==true)throw Error('Error deleting S3 Bucket: BucketNotEmpty. force_destroy=false protects contents; inspect plan and resource ownership.');a.buckets=a.buckets.filter(b=>b.name!==x.id);}
    else a.securityGroups=a.securityGroups.filter(g=>g.id!==x.id);
   };
   const create=x=>{
    if(x.key.startsWith('aws_s3_bucket.')){if((a.buckets||[]).some(b=>b.name===x.want.bucket))throw Error('Error creating S3 Bucket: BucketAlreadyOwnedByYou. Import the existing bucket; do not recreate production data.');const b={name:x.want.bucket,objects:[]};a.buckets.push(b);return b.name;}
    if(!(a.vpcs||[]).some(v=>v.id===x.want.vpc_id))throw Error('InvalidVpcID.NotFound: VPC does not exist.');
    if(a.securityGroups.some(g=>g.name===x.want.name&&g.vpcId===x.want.vpc_id))throw Error('InvalidGroup.Duplicate: security group name already exists in this VPC. Import the existing SG.');
    const id='sg-iac-created-'+(++a.iacSeq|| (a.iacSeq=1));a.securityGroups.push({id,name:x.want.name,description:x.want.description,vpcId:x.want.vpc_id,ingress:AG.iacIngressToAWS(x.want.ingress)});return id;
   };
   try{
    for(const x of p.actions){
     if(['delete','replace'].includes(x.kind)){remove(x);delete p.bindings[x.key];persist();}
     if(['create','replace'].includes(x.kind)){const id=create(x);p.bindings[x.key]={id,attrs:copy(x.want)};persist();}
     if(x.kind==='update'){
      const r=remote(a,x.key,x.id);if(!r)throw Error('Remote object missing during apply: '+x.id+'. Create a fresh plan.');
      if(!x.key.startsWith('aws_s3_bucket.'))r.ingress=AG.iacIngressToAWS(x.want.ingress); // force_destroy is provider-state metadata, not an S3 API setting
      p.bindings[x.key]={id:x.id,attrs:copy(x.want)};persist();
     }
    }
    if(!wrote&&!same(p.bindings,st.bindings))persist();
   }catch(e){a.iacReceipt=null;throw e;}
   a.iacReceipt=null;say(`Apply complete! Resources: ${adds} added, ${changes} changed, ${dels} destroyed.`+(p.refreshOnly?' State refreshed only; remote objects unchanged.':''));return true;
  }catch(e){print('err','Error: '+e.message);return true;}
 };
})();
