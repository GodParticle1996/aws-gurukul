/* PixShare D5. Keep the two subscription routes and their delivery evidence together. */
(() => {
  const group='/pixshare/feed', region='us-east-1', acct='123456789012';
  const arn=(service,resource)=>['arn','aws',service,region,acct,resource].join(':');
  const raw=arn('firehose','deliverystream/pix-raw'), search=arn('firehose','deliverystream/pix-search');
  const split=arn('lambda','function:pix-split'), role='arn:aws:iam::'+acct+':role/pix-log-forward';
  const domain=arn('es','domain/pix-logs'), bucket='arn:aws:s3:::pix-log-vault';
  const hotPattern='{ $.level = "ERROR" || $.level = "WARN" }';
  const s3=prefix=>({BucketARN:bucket,Prefix:prefix});
  function seed(broken=false) {
    const subscriptions=broken?[{filterName:'raw',filterPattern:'',destinationArn:raw,roleArn:role},
      {filterName:'hot',filterPattern:'',destinationArn:split}]:[];
    return {pixLogs:true,region,now:'2026-11-22T12:30:00Z',pixLog:{
      group,logClass:'STANDARD',stream:'release',subscriptions,version:0,readVersion:-1,receipts:[],reads:{},serial:0,
      logsRole:{arn:role,trust:'logs.amazonaws.com',stream:raw},invokeSource:arn('logs','log-group:'+group+':*'),
      domain:{DomainName:'pix-logs',ARN:domain,Processing:false,ClusterConfig:{InstanceCount:3,InstanceType:'r6g.xlarge.search',ZoneAwarenessEnabled:true,
          ZoneAwarenessConfig:{AvailabilityZoneCount:3},DedicatedMasterEnabled:true,DedicatedMasterType:'c6g.large.search',DedicatedMasterCount:3},
        EncryptionAtRestOptions:{Enabled:true},EBSOptions:{EBSEnabled:true,VolumeType:'gp3',VolumeSize:30}},
      streams:{'pix-raw':{DeliveryStreamName:'pix-raw',DeliveryStreamARN:raw,DeliveryStreamStatus:'ACTIVE',Destinations:[{S3DestinationDescription:s3('raw/')}]},
        'pix-search':{DeliveryStreamName:'pix-search',DeliveryStreamARN:search,DeliveryStreamStatus:'ACTIVE',Destinations:[{AmazonopensearchserviceDestinationDescription:{
          DomainARN:domain,IndexName:'pix-feed',IndexRotationPeriod:'OneDay',S3BackupMode:'AllDocuments',S3DestinationDescription:s3('matched/'),BufferingHints:{SizeInMBs:5,IntervalInSeconds:60}}}]}}}};
  }
  AG.pixLogLab={group,raw,split,role,hotPattern,seed};
  const specs={'describe-log-groups':[],'describe-delivery-stream':['delivery-stream-name'],'describe-domain':['domain-name'],
    'put-subscription-filter':['log-group-name','filter-name','filter-pattern','destination-arn','role-arn'],
    'describe-subscription-filters':['log-group-name'],'put-log-events':['log-group-name','log-stream-name','log-events']};
  function checkBatch(rows,now){
    if(!Array.isArray(rows) || !rows.length || rows.length>10000)throw Error('InvalidParameterException: logEvents count');
    let bytes=0,previous=-Infinity,firstAccepted;
    for(const row of rows){
      if(!row || Object.keys(row).some(k=>!['message','timestamp'].includes(k)) || !Number.isSafeInteger(row.timestamp) ||
        typeof row.message!=='string' || !row.message || row.timestamp<previous)throw Error('InvalidParameterException: log event or order');
      previous=row.timestamp;
      bytes+=26;
      // 26 bytes per entry ke saath message ke UTF-8 bytes bhi gino.
      for(const ch of row.message){
        const point=ch.codePointAt(0);
        bytes+=point<128?1:point<2048?2:point<65536?3:4;
      }
      if(bytes>1048576)throw Error('InvalidParameterException: batch exceeds 1 MiB');
      if(row.timestamp<now-14*86400000 || row.timestamp>now+7200000)continue;
      firstAccepted??=row.timestamp;
      if(row.timestamp-firstAccepted>86400000)throw Error('InvalidParameterException: valid events span more than 24 hours');
    }
  }
  AG.logsetlCLI=function({service,op,toks,flag,sim,print,resultJson}){
    if (!['logs','firehose','opensearch'].includes(service)) return false;
    const fail=msg=>{throw Error(msg);};
    try {
      const ops={logs:['describe-log-groups','put-subscription-filter','describe-subscription-filters','put-log-events'],firehose:['describe-delivery-stream'],opensearch:['describe-domain']};
      if (!ops[service].includes(op)) fail('D5 mein is service ke commands ke liye help padho.');
      const seen=new Set(), allowed=new Set([...specs[op],'region','output']);
      for (let i=3;i<toks.length;i+=2) {
        const key=toks[i].slice(2);
        if (!toks[i].startsWith('--') || !allowed.has(key) || seen.has(key) || flag(key)===null) fail('Invalid argument: '+toks[i]);
        seen.add(key);
      }
      const get=k=>{
        const v=flag(k);
        if(v===null) fail('Missing --'+k);
        if(!v.startsWith('file://'))return v;
        const f=sim.files[v.slice(7)];
        if(!f || typeof f.content!=='string')fail('File nahi mili: '+v);
        return f.content;
      };
      if (seen.has('region') && get('region')!==region) fail('ResourceNotFoundException: wrong region');
      if (seen.has('output') && get('output')!=='json') fail('D5 readback ke liye JSON output chuno.');
      const p=sim.account.pixLog;
      if(service==='logs' && op!=='describe-log-groups' && get('log-group-name')!==p.group) fail('ResourceNotFoundException: log group');
      if(op==='describe-log-groups'){
        p.reads.group=p.group; resultJson({logGroups:[{logGroupName:p.group,logGroupClass:p.logClass}]});
      } else if(op==='describe-domain'){
        if(get('domain-name')!==p.domain.DomainName) fail('ResourceNotFoundException: domain');
        p.reads.domain=p.domain.ARN; resultJson({DomainStatus:p.domain});
      } else if(op==='describe-delivery-stream'){
        const name=get('delivery-stream-name'), d=Object.hasOwn(p.streams,name) && p.streams[name];
        if(!d) fail('ResourceNotFoundException: stream');
        p.reads[name]=d.DeliveryStreamARN; resultJson({DeliveryStreamDescription:d});
      } else if(op==='describe-subscription-filters'){
        p.readVersion=p.version; resultJson({subscriptionFilters:p.subscriptions.map(f=>({logGroupName:p.group,...f}))});
      } else if(op==='put-subscription-filter'){
        if(p.logClass!=='STANDARD') fail('Subscriptions need a Standard group.');
        const name=get('filter-name'), pattern=get('filter-pattern'), dest=get('destination-arn');
        if(!name || /[:*]/.test(name) || name.length>512)fail('Invalid filter name');
        AG.obsPattern(pattern);
        const f={filterName:name,filterPattern:pattern,destinationArn:dest};
        if(dest===split){
          if(seen.has('role-arn') || p.invokeSource!==arn('logs','log-group:'+group+':*')) fail('Check Lambda invoke permission and source ARN.');
        } else {
          if(![raw,search].includes(dest))fail('Unknown destination ARN');
          if(get('role-arn')!==p.logsRole.arn || p.logsRole.trust!=='logs.amazonaws.com' || dest!==p.logsRole.stream)fail('AccessDenied: delivery role');
          f.roleArn=p.logsRole.arn;
        }
        const i=p.subscriptions.findIndex(s=>s.filterName===name);
        if(i<0 && p.subscriptions.length>=2)fail('LimitExceededException: two subscriptions');
        if(JSON.stringify(p.subscriptions[i])!==JSON.stringify(f)){
          p.subscriptions.splice(i<0?p.subscriptions.length:i,i<0?0:1,f); p.version++;
        }
        print('ok','');
      } else {
        if(get('log-stream-name')!==p.stream)fail('ResourceNotFoundException: log stream');
        const rows=JSON.parse(get('log-events')), now=Date.parse(sim.account.now);
        checkBatch(rows,now);
        const receipt={version:p.version,raw:[],hot:[],backup:[]}, rejected={};
        rows.forEach((row,i)=>{
          if(row.timestamp<now-14*86400000){rejected.tooOldLogEventEndIndex=i;return;}
          if(row.timestamp>now+7200000){rejected.tooNewLogEventStartIndex??=i;return;}
          const event={id:String(++p.serial),timestamp:row.timestamp,message:row.message};
          for(const f of p.subscriptions){
            if(!AG.obsPattern(f.filterPattern)(event.message))continue;
            if(f.destinationArn===raw) receipt.raw.push(event);
            if(f.destinationArn===split && p.streams['pix-search'].DeliveryStreamStatus==='ACTIVE'){
              let fields; try{fields=JSON.parse(event.message);}catch{continue;}
              if(!fields || typeof fields.requestId!=='string' || typeof fields.level!=='string')continue;
              const doc={requestId:fields.requestId,level:fields.level,eventId:event.id};
              const dest=p.streams['pix-search'].Destinations[0].AmazonopensearchserviceDestinationDescription;
              if(dest.DomainARN===p.domain.ARN)receipt.hot.push(doc);
              if(dest.S3BackupMode==='AllDocuments')receipt.backup.push(doc);
            }
          }
        });
        p.receipts.push(receipt);
        sim.files['delivery.txt'].content=['Raw batch',...receipt.raw.map(r=>r.id+' '+r.message),
          'Hot index',...receipt.hot.map(d=>JSON.stringify(d)),
          'S3 matched/',...receipt.backup.map(d=>JSON.stringify(d))].join('\n');
        resultJson(Object.keys(rejected).length?{rejectedLogEventsInfo:rejected}:{});
      }
    } catch(e){print('err',String(e.message));}
    return true;
  };
})();
