/* Bounded CloudTrail configuration and seeded management-event inspection.
   No automatic event collection, S3 delivery, digest validation or AWS assessment. */
(()=>{
 const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),copy=x=>JSON.parse(JSON.stringify(x)),arr=x=>Array.isArray(x)?x:x===undefined?[]:[x];
 const wild=(p,v)=>typeof p==='string'&&new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$').test(v);
 AG.auditTrailAccess=(account,trail)=>{
  const b=(account.buckets||[]).find(b=>b.name===trail.bucket);if(!b||b.requesterPays)return false;
  const arn=trail.arn,A=account.callerIdentity?.Account||'123456789012',base='arn:aws:s3:::'+b.name,prefix=trail.prefix?trail.prefix+'/':'';
  return [['s3:GetBucketAcl',base],['s3:PutObject',base+'/'+prefix+'AWSLogs/'+A+'/TRAINING.json.gz']].every(([action,resource])=>{
   let allow=false,deny=false;
   for(const s of arr(b.policy?.Statement)){
    if(!object(s)||!['Allow','Deny'].includes(s.Effect))continue;
    if(s.Principal!=='*'&&!arr(s.Principal?.Service).includes('cloudtrail.amazonaws.com'))continue;
    if(!arr(s.Action).some(p=>wild(p,action))||!arr(s.Resource).some(p=>wild(p,resource)))continue;
    let match=true;for(const [op,c]of Object.entries(s.Condition||{})){
     if(!['StringEquals','ArnEquals','StringLike','ArnLike'].includes(op)||!object(c)){match=false;break;}
     for(const [k,values]of Object.entries(c)){const key=k.toLowerCase(),actual=key==='aws:sourcearn'?arn:key==='aws:sourceaccount'?A:key==='s3:x-amz-acl'?'bucket-owner-full-control':undefined;match=match&&actual!==undefined&&arr(values).some(v=>op.endsWith('Like')?wild(v,actual):v===actual);}
    }
    if(match){if(s.Effect==='Deny')deny=true;else allow=true;}
   }
   return allow&&!deny;
  });
 };
 const toggles=['include-global-service-events','is-multi-region-trail','enable-log-file-validation'];
 const settings=['s3-bucket-name','s3-key-prefix',...toggles.flatMap(k=>[k+'!','no-'+k+'!'])];
 const specs={'create-trail':['name',...settings],'update-trail':['name',...settings],'describe-trails':['trail-name-list*','include-shadow-trails!','no-include-shadow-trails!'],'get-trail':['name'],'start-logging':['name'],'stop-logging':['name'],'get-trail-status':['name'],'delete-trail':['name'],'get-event-selectors':['trail-name'],'put-event-selectors':['trail-name','event-selectors'],'lookup-events':['lookup-attributes*','start-time','end-time','max-results']};
 AG.auditCLI=({service,op,toks,flag,flags,sim,list,print,resultJson})=>{
  if(service!=='cloudtrail')return false;
  const required=n=>{const v=flag(n);if(v===null||v==='')throw Error('aws: error: required --'+n);return v;};
  const json=n=>{let raw=required(n);if(raw.startsWith('file://')){const f=Object.prototype.hasOwnProperty.call(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error('Unable to load paramfile; inspect ls/cat');raw=f.content;}try{return JSON.parse(raw);}catch(e){throw Error('InvalidEventSelectorsException: --'+n+' requires valid JSON');}};
  const trails=()=>list('trails'),region=sim.account.region||'us-east-1',A=sim.account.callerIdentity?.Account||'123456789012';
  const get=(arg='name')=>{const name=required(arg),t=trails().find(t=>t.name===name||t.arn===name);if(!t)throw Error('TrailNotFoundException: trail not found in this fixture');return t;};
  const view=t=>({Name:t.name,TrailARN:t.arn,HomeRegion:t.homeRegion,S3BucketName:t.bucket,S3KeyPrefix:t.prefix||undefined,IncludeGlobalServiceEvents:t.global,IsMultiRegionTrail:t.multi,LogFileValidationEnabled:t.validation,IsOrganizationTrail:false,HasCustomEventSelectors:t.selectorsCustomized===true});
  try{
   if(!Object.prototype.hasOwnProperty.call(specs,op))throw Error('CloudTrail simulator operation not modeled: '+op+'; no live collection/delivery/digest validation');
   const allowed=specs[op].concat(['region','query','output','no-cli-pager!']),seen=new Set();
   for(let i=3;i<toks.length;){const name=toks[i].startsWith('--')?toks[i].slice(2):'',spec=allowed.find(a=>a.replace(/[*!]$/,'')===name);if(!spec)throw Error('Unknown options: '+toks[i]);if(seen.has(name))throw Error('Duplicate option --'+name);seen.add(name);if(spec.endsWith('!')){i++;continue;}if(!toks[i+1]||toks[i+1].startsWith('--'))throw Error('aws: error: --'+name+' expected one argument');i+=2;if(spec.endsWith('*'))while(i<toks.length&&!toks[i].startsWith('--'))i++;}
   if(flag('region')&&flag('region')!==region)throw Error('Fixture scope: inspect/create trail in its home Region '+region+'; cross-Region shadow APIs are not modeled');
   if(op==='create-trail'||op==='update-trail'){
    const name=required('name');let t=op==='update-trail'?get():null;
    if(!t&&(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,126}[A-Za-z0-9]$/.test(name)||/[._-]{2}/.test(name)||/^\d+\.\d+\.\d+\.\d+$/.test(name)))throw Error('InvalidTrailNameException:3..128 ASCII letters/numbers/._-; alphanumeric ends, no adjacent punctuation/IP format');
    if(!t&&trails().some(t=>t.name===name))throw Error('TrailAlreadyExistsException: update the existing trail');
    const row=t?copy(t):{name,arn:`arn:aws:cloudtrail:${region}:${A}:trail/${name}`,homeRegion:region,multi:false,global:true,validation:false,logging:false,revision:0,selectors:[{ReadWriteType:'All',IncludeManagementEvents:true,DataResources:[]}]};
    if(flag('s3-bucket-name')!==null)row.bucket=required('s3-bucket-name');if(!row.bucket)throw Error('aws: error: required --s3-bucket-name');
    if(flag('s3-key-prefix')!==null){row.prefix=flag('s3-key-prefix');if(row.prefix.length>200)throw Error('InvalidS3PrefixException: maximum200characters');}
    for(const [key,arg]of [['multi','is-multi-region-trail'],['global','include-global-service-events'],['validation','enable-log-file-validation']]){const yes=toks.includes('--'+arg),no=toks.includes('--no-'+arg);if(yes&&no)throw Error('InvalidParameterCombination: conflicting --'+arg+' flags');if(yes||no)row[key]=yes;}
    if(!AG.auditTrailAccess(sim.account,row))throw Error('InsufficientS3BucketPolicyException: review CloudTrail GetBucketAcl and PutObject AWSLogs/account path, SourceArn and bucket-owner-full-control conditions');
    if(!t){sim.account.trailSequence=(sim.account.trailSequence||0)+1;row.trailId='trail-'+sim.account.trailSequence;trails().push(row);t=row;}else Object.assign(t,row);
    t.revision++;resultJson(view(t));print('sys','Trail configuration only. No historical backfill, automatic file/digest delivery or validation occurs in this simulator.');return true;
   }
   if(op==='describe-trails'){const names=flags('trail-name-list');resultJson({trailList:trails().filter(t=>!names.length||names.includes(t.name)||names.includes(t.arn)).map(view)});return true;}
   if(op==='get-trail'){resultJson({Trail:view(get())});return true;}
   if(op==='delete-trail'){const t=get();trails().splice(trails().indexOf(t),1);resultJson({});print('sys','Trail removed; existing S3 evidence retained. Event history is a separate service view.');return true;}
   if(['start-logging','stop-logging'].includes(op)){const t=get();if(op==='start-logging'&&!AG.auditTrailAccess(sim.account,t))throw Error('InsufficientS3BucketPolicyException: destination permission unavailable; no delivery proof');t.logging=op==='start-logging';t.revision++;resultJson({});return true;}
   if(op==='get-trail-status'){const t=get(),valid=AG.auditTrailAccess(sim.account,t),out={IsLogging:t.logging};if(!valid)out.LatestDeliveryError='Training permission check failed; actual delivery is not modeled';if(resultJson(out)&&!flag('query')){const reads=sim.account.trailReads||(sim.account.trailReads=[]);reads.push({trailId:t.trailId,revision:t.revision,view:copy(t),destinationAllowed:valid});}print('sys','IsLogging is configuration metadata, not proof of delivered logs, digests or runtime coverage.');return true;}
   if(op==='get-event-selectors'){const t=get('trail-name');resultJson({TrailARN:t.arn,EventSelectors:copy(t.selectors||[]),AdvancedEventSelectors:[]});return true;}
   if(op==='put-event-selectors'){
    const t=get('trail-name'),selectors=json('event-selectors');if(!Array.isArray(selectors)||selectors.length<1||selectors.length>5||selectors.some(s=>!object(s)||Object.keys(s).some(k=>!['ReadWriteType','IncludeManagementEvents','DataResources'].includes(k))||!['All','ReadOnly','WriteOnly'].includes(s.ReadWriteType||'All')||s.IncludeManagementEvents!==undefined&&typeof s.IncludeManagementEvents!=='boolean'||s.DataResources!==undefined&&(!Array.isArray(s.DataResources)||s.DataResources.length)))throw Error('Simulator selector subset:1..5 basic selectors, ReadWriteType All/ReadOnly/WriteOnly, boolean IncludeManagementEvents, empty DataResources; data events need separately reviewed selectors/costs');
    t.selectors=selectors.map(s=>({ReadWriteType:s.ReadWriteType||'All',IncludeManagementEvents:s.IncludeManagementEvents!==false,DataResources:[]}));t.selectorsCustomized=true;t.revision++;resultJson({TrailARN:t.arn,EventSelectors:copy(t.selectors)});return true;
   }
   if(op==='lookup-events'){
    const start=flag('start-time'),end=flag('end-time'),max=flag('max-results')===null?50:Number(flag('max-results'));if(!Number.isInteger(max)||max<1||max>50)throw Error('InvalidMaxResultsException: max-results integer1..50');
    for(const v of [start,end])if(v!==null&&!Number.isFinite(Date.parse(v)))throw Error('InvalidTimeRangeException: valid ISO time required');if(start&&end&&Date.parse(start)>Date.parse(end))throw Error('InvalidTimeRangeException: start must be≤end');
    let filters=flags('lookup-attributes');if(filters.length===1&&(filters[0].startsWith('[')||filters[0].startsWith('file://')))filters=json('lookup-attributes');else filters=filters.map(raw=>Object.fromEntries(raw.split(',').map(p=>{const i=p.indexOf('=');return [p.slice(0,i),p.slice(i+1)];})));
    const supported=['EventId','EventName','ReadOnly','Username','ResourceType','ResourceName','EventSource','AccessKeyId'];if(!Array.isArray(filters)||filters.length>1||filters.some(f=>!object(f)||!supported.includes(f.AttributeKey)||typeof f.AttributeValue!=='string'||!f.AttributeValue||Object.keys(f).some(k=>!['AttributeKey','AttributeValue'].includes(k))))throw Error('InvalidLookupAttributesException: one AttributeKey/AttributeValue filter; use EventName/Username/etc');
    const now=Date.parse(sim.account.now||'2026-10-27T12:00:00Z'),rows=list('managementEvents').filter(e=>Number.isFinite(Date.parse(e.EventTime))&&Date.parse(e.EventTime)>=now-90*86400000&&Date.parse(e.EventTime)<=now&&(!start||Date.parse(e.EventTime)>=Date.parse(start))&&(!end||Date.parse(e.EventTime)<=Date.parse(end))&&filters.every(f=>f.AttributeKey==='ResourceName'||f.AttributeKey==='ResourceType'?(e.Resources||[]).some(r=>r[f.AttributeKey]===f.AttributeValue):String(e[f.AttributeKey])===f.AttributeValue));resultJson({Events:copy(rows.slice(0,max))});print('sys','Seeded management events in this Region/last90days only; no live event collection, data-event search, complete pagination or historical backfill.');return true;
   }
  }catch(e){print('err',e.message);return true;}
  return true;
 };
})();
