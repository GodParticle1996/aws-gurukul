/* PixShare D7 adds replica placement, the app's reader setting and EC2 cost tags. */
(() => {
  const region='us-east-1', account='123456789012', service='com.amazonaws.us-east-1.s3', vpc='vpc-pix';
  const group='pix-feed', parameter='/pix/feed/az-a/reader', local='pix-reader-a', remote='pix-reader-b';
  const address=name=>name+'.local-fixture.cache.amazonaws.com';
  const budget={BudgetName:'pix-month',BudgetType:'COST',TimeUnit:'MONTHLY',BudgetLimit:{Amount:'12000',Unit:'USD'}};
  const notice={NotificationType:'ACTUAL',ComparisonOperator:'GREATER_THAN',Threshold:80,ThresholdType:'PERCENTAGE'};
  const subscribers=[{SubscriptionType:'EMAIL',Address:'finops@example.test'}];
  const assets=['i-feed','vol-idle'];
  const clone=o=>JSON.parse(JSON.stringify(o));
  function seed(repair=false){
    const subnets=[],routeTables=[],natGateways=[];
    for(const az of ['a','b','c']){
      const index=az.charCodeAt(0)-97;
      subnets.push({id:'subnet-'+az,name:'private-'+az,cidr:'10.39.'+(11+index)+'.0/24',vpcId:vpc,az:region+az});
      const routes=[{type:'local',destination:'10.39.0.0/16',target:'local'}];
      if(az!=='c'){
        const nat='nat-'+az, pub='subnet-pub-'+az;
        subnets.push({id:pub,name:'public-'+az,cidr:'10.39.'+(1+index)+'.0/24',vpcId:vpc,az:region+az});
        natGateways.push({id:nat,state:'available',vpcId:vpc,subnetId:pub,connectivityType:'public'});
        routes.push({type:'nat',destination:'0.0.0.0/0',target:nat,state:'active'});
        routeTables.push({id:'rtb-pub-'+az,vpcId:vpc,associations:[{id:'assoc-pub-'+az,subnetId:pub}],routes:[
          {type:'local',destination:'10.39.0.0/16',target:'local'},{type:'igw',destination:'0.0.0.0/0',target:'igw-pix'}]});
      }
      routeTables.push({id:'rtb-'+az,vpcId:vpc,associations:[{id:'assoc-'+az,subnetId:'subnet-'+az}],routes});
    }
    const node=(id,role,zone)=>({id,role,az:region+zone,status:'available'});
    const nodes=[node('pix-writer-c','primary','c'),node(remote,'replica','b')];
    const a={pixBill:true,region,callerIdentity:{Account:account},vpcs:[{id:vpc,name:'PixShare',cidr:'10.39.0.0/16',dnsHostnames:true,dnsSupport:true}],
      subnets,routeTables,natGateways,internetGateways:[{id:'igw-pix',vpcId:vpc}],vpcEndpoints:[],
      prefixLists:[{id:'pl-s3',name:service,cidrs:['52.216.0.0/15']}],
      securityGroups:[{id:'sg-feed',vpcId:vpc,name:'feed'},{id:'sg-cache',vpcId:vpc,name:'cache',
        ingress:[{protocol:'tcp',fromPort:6379,toPort:6379,sourceGroup:'sg-feed'}]}],
      cacheSubnetGroups:[{name:'pix-private',subnetIds:['subnet-a','subnet-b','subnet-c']}],
      cacheGroups:[{id:group,status:'available',engine:'valkey',engineVersion:'8.0',nodeType:'cache.r7g.large',subnetGroup:'pix-private',securityGroupIds:['sg-cache'],
        automaticFailover:true,multiAZ:true,transitEncryption:true,atRestEncryption:true,nodes}],
      instances:[{id:assets[0],name:'feed',subnetId:'subnet-a',state:'running',type:'m7g.large',privateIp:'10.39.11.10',az:region+'a',vpcId:vpc,sgIds:['sg-feed'],tags:{Name:'feed'}}],
      volumes:[{id:assets[1],state:'available',size:100,type:'gp3',tags:{Name:'old-thumbs'}}],
      readerSetting:{name:parameter,value:address(remote),version:1},budgets:[],costRead:null,
      costHistory:[{TimePeriod:{Start:'2026-10-01',End:'2026-11-01'},Total:{UnblendedCost:{Amount:'28000',Unit:'USD'}},Estimated:false,Groups:[]}],
      costUsageGroups:{'2026-10-01':[{key:'NatGateway-Bytes',usd:'9000'},{key:'DataTransfer-Regional-Bytes',usd:'6000'},
        {key:'BoxUsage:m7g.large',usd:'8000'},{key:'EBS:VolumeUsage.gp3',usd:'4500'},{key:'NatGateway-Hours',usd:'64.80'},
        {key:'USE1-PublicIPv4:InUseAddress',usd:'7.20'},{key:'TimedStorage-ByteHrs',usd:'428'}]}};
    if(repair){
      nodes.push(node(local,'replica','a'));
      a.vpcEndpoints.push({id:'vpce-pix',type:'Gateway',serviceName:service,vpcId:vpc,state:'available',routeTableIds:['rtb-a'],prefixListId:'pl-s3'});
      routeTables.find(t=>t.id==='rtb-a').routes.push({prefixListId:'pl-s3',target:'vpce-pix',type:'endpoint',state:'active'});
      for(const x of [a.instances[0],a.volumes[0]])x.tags.Team='feed';
      a.budgets.push({definition:clone(budget),notifications:[]});
    }
    return a;
  }
  const params={
    'elasticache/create-cache-cluster':['cache-cluster-id','replication-group-id','preferred-availability-zone'],
    'ssm/put-parameter':['name','value','type','overwrite!'], 'ssm/get-parameter':['name'],
    'ec2/create-tags':['resources*','tags*']};
  AG.costdecCLI=function({service,op,toks,flag,flags,sim,print,resultJson}){
    const spec=params[service+'/'+op];if(!spec)return false;
    const a=sim.account, fail=m=>{throw Error(m);};
    try{
      const allowed=[...spec,'query','output','region'], seen=new Set();
      for(let i=3;i<toks.length;){
        const key=toks[i].slice(2),f=allowed.find(n=>n.replace(/[!*]$/,'')===key);
        if(!toks[i].startsWith('--') || !f || seen.has(key))fail('Unknown or duplicate option: '+toks[i]);
        seen.add(key);i++;
        if(f.endsWith('!'))continue;
        if(!toks[i] || toks[i].startsWith('--'))fail('Expected argument for --'+key);
        i++;
        if(f.endsWith('*'))while(i<toks.length && !toks[i].startsWith('--'))i++;
      }
      const req=k=>flag(k)||fail('aws: error: required --'+k);
      if(flag('region') && flag('region')!==region)fail('ResourceNotFound: wrong Region');
      if(service==='elasticache'){
        const g=a.cacheGroups.find(g=>g.id===req('replication-group-id'));
        if(!g)fail('ReplicationGroupNotFoundFault');
        const id=req('cache-cluster-id'),az=req('preferred-availability-zone');
        if(!/^[a-z][a-z0-9-]{0,49}$/.test(id) || id.endsWith('-') || id.includes('--'))fail('InvalidParameterValue: cache cluster identifier');
        if(a.cacheGroups.some(x=>x.nodes.some(n=>n.id===id)))fail('CacheClusterAlreadyExists');
        if(g.status!=='available')fail('InvalidReplicationGroupState');
        const sg=a.cacheSubnetGroups.find(s=>s.name===g.subnetGroup);
        if(!sg?.subnetIds.some(s=>a.subnets.some(n=>n.id===s && n.az===az)))fail('InvalidParameterValue: AZ outside cache subnet group');
        g.nodes.push({id,az,role:'replica',status:'creating'});g.status='modifying';
        resultJson({CacheCluster:{CacheClusterId:id,ReplicationGroupId:g.id,CacheClusterStatus:'creating',PreferredAvailabilityZone:az}});
      } else if(service==='ssm'){
        const p=a.readerSetting;
        if(req('name')!==p.name)fail('ParameterNotFound: D7 reader setting');
        if(op==='get-parameter')resultJson({Parameter:{Name:p.name,Type:'String',Value:p.value,Version:p.version}});
        else{
          if(!seen.has('overwrite'))fail('ParameterAlreadyExists: use --overwrite to update');
          if(flag('type') && flag('type')!=='String')fail('Parameter type cannot be changed');
          p.value=req('value');p.version++;resultJson({Version:p.version,Tier:'Standard'});
        }
      } else {
        req('resources');req('tags');
        const resources=flags('resources').map(id=>[...a.instances,...a.volumes].find(x=>x.id===id) || fail('InvalidID.NotFound: '+id));
        const changes=flags('tags').map(t=>{const m=/^Key=([^,]+),Value=([^,]*)$/.exec(t);
          if(!m || m[1].startsWith('aws:') || ['__proto__','constructor','prototype'].includes(m[1]) || m[1].length>127 || m[2].length>256)fail('InvalidParameterValue: tag');
          return [m[1],m[2]];});
        for(const resource of resources)Object.assign(resource.tags,Object.fromEntries(changes));
        print('ok','');
      }
    }catch(e){print('err',e.message);}
    return true;
  };
  function route(a,zone,ip){
    const t=a.routeTables.find(t=>t.associations?.some(x=>x.subnetId==='subnet-'+zone));
    const num=s=>s.split('.').reduce((v,o)=>v*256+Number(o),0);
    const routes=[];
    for(const r of t?.routes||[]){
      const ranges=r.prefixListId?a.prefixLists.find(p=>p.id===r.prefixListId)?.cidrs||[]:[r.destination];
      for(const range of ranges.filter(Boolean)){
        const [cidr,len]=range.split('/'), divisor=2**(32-Number(len));
        if(Math.floor(num(cidr)/divisor)===Math.floor(num(ip)/divisor))routes.push({r,len:Number(len)});
      }
    }
    const best=routes.sort((x,y)=>y.len-x.len)[0]?.r;
    if(!best || best.state==='blackhole')return 'unavailable';
    return best.target;
  }
  function pathState(a){
    const groupState=a.cacheGroups.find(g=>g.id===group);
    const app=a.instances.find(i=>i.id===assets[0]);
    const az=a.subnets.find(s=>s.id===app?.subnetId)?.az;
    const nodes=(groupState?.nodes||[]).filter(n=>n.status==='available');
    const fallback=nodes.find(n=>n.id===remote && n.role==='replica' && n.az!==az);
    const reader=nodes.find(n=>address(n.id)===a.readerSetting.value && n.role==='replica') || fallback;
    const writer=nodes.find(n=>n.role==='primary');
    return {s3:['a','b'].map(z=>route(a,z,'52.216.1.39')),other:['a','b'].map(z=>route(a,z,'198.51.100.9')),
      reader:reader?.id||'unavailable',az:reader?.az,appAZ:az,writer:writer?.id,writerAZ:writer?.az,
      fallback:!!fallback,fallbackAZ:fallback?.az,version:a.readerSetting.version};
  }
  function routes(a){
    const p=pathState(a), endpoints=a.vpcEndpoints.filter(e=>e.state==='available' && e.type==='Gateway' && e.vpcId===vpc && e.serviceName===service);
    return endpoints.some(e=>a.prefixLists.some(pl=>pl.id===e.prefixListId && pl.name===service) &&
      ['a','b'].every((zone,index)=>{
        const table=a.routeTables.find(t=>t.vpcId===vpc && t.associations.some(x=>x.subnetId==='subnet-'+zone));
        const nat='nat-'+zone;
        return table && e.routeTableIds.includes(table.id) &&
          table.routes.some(r=>r.prefixListId===e.prefixListId && r.state==='active' && r.target===e.id) &&
          table.routes.some(r=>r.destination==='0.0.0.0/0' && r.state==='active' && r.target===nat) &&
          p.s3[index]===e.id && p.other[index]===nat &&
          a.natGateways.some(n=>n.id===nat && n.state==='available' && n.subnetId==='subnet-pub-'+zone);
      }));
  }
  function cache(a){
    const g=a.cacheGroups.find(g=>g.id===group),p=pathState(a);
    return g?.status==='available' && g.multiAZ && g.automaticFailover && p.appAZ===region+'a' && p.az===p.appAZ &&
      p.reader===local && p.writer==='pix-writer-c' && p.writerAZ===region+'c' && p.fallback && p.fallbackAZ===region+'b';
  }
  AG.pixBill={region,account,vpc,service,group,local,remote,parameter,address,budget,notice,subscribers,assets,seed,pathState,routes,cache};
})();
