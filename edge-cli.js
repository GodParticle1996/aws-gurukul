/* PixShare's local viewer uses the deployed CloudFront version and its ordered behaviors. */
(() => {
  const optimized='658327ea-f89d-4fab-a63d-7e88639e58f6', disabled='4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
  const forward='216adef6-5c7f-47e4-b989-5492eafa07d3', id='EPIX38', oac='OAC000001', vpc='vo-pix38';
  const bucket='pix-edge-images', host='edge.pixshare.example', account='123456789012', region='us-east-1';
  const alb='internal-pix-api.us-east-1.elb.amazonaws.com', imagePath='/images/p7-v1.jpg';
  const aclId='38000000-0000-4000-8000-000000000001';
  const acl='arn:aws:wafv2:us-east-1:'+account+':global/webacl/pix-edge/'+aclId;
  const distArn='arn:aws:cloudfront::'+account+':distribution/'+id;
  const albArn='arn:aws:elasticloadbalancing:us-east-1:'+account+':loadbalancer/app/pix-api/123456789abcdeff';
  const policy={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'cloudfront.amazonaws.com'},Action:'s3:GetObject',
    Resource:'arn:aws:s3:::'+bucket+'/images/*',Condition:{StringEquals:{'AWS:SourceArn':distArn}}}]};
  const signing={Name:'pix-images',Description:'PixShare ki images',SigningBehavior:'always',SigningProtocol:'sigv4',OriginAccessControlOriginType:'s3'};
  const clone=x=>JSON.parse(JSON.stringify(x));
  function config(){
    return {CallerReference:'pix-edge-release',Comment:'PixShare feed',Enabled:true,WebACLId:acl,
      Aliases:{Quantity:1,Items:[host]},ViewerCertificate:{ACMCertificateArn:'arn:aws:acm:us-east-1:'+account+':certificate/38000000-0000-4000-8000-000000000002',SSLSupportMethod:'sni-only',MinimumProtocolVersion:'TLSv1.2_2021'},
      Origins:{Quantity:2,Items:[{Id:'images',DomainName:bucket+'.s3.us-east-1.amazonaws.com',OriginAccessControlId:oac,S3OriginConfig:{OriginAccessIdentity:''}},
        {Id:'private-api',DomainName:alb,VpcOriginConfig:{VpcOriginId:vpc}}]},
      DefaultCacheBehavior:{TargetOriginId:'private-api',ViewerProtocolPolicy:'https-only',CachePolicyId:disabled,OriginRequestPolicyId:forward,
        AllowedMethods:{Quantity:7,Items:['GET','HEAD','OPTIONS','PUT','POST','PATCH','DELETE'],CachedMethods:{Quantity:2,Items:['GET','HEAD']}}},
      CacheBehaviors:{Quantity:1,Items:[{PathPattern:'/images/*',TargetOriginId:'images',ViewerProtocolPolicy:'https-only',CachePolicyId:optimized,Compress:true}]}};
  }
  function seed(repair=false){
    const cfg=config();
    if(repair){cfg.CacheBehaviors.Items[0].CachePolicyId=disabled;delete cfg.DefaultCacheBehavior.OriginRequestPolicyId;}
    else{cfg.CacheBehaviors={Quantity:0};cfg.Origins.Items.shift();cfg.Origins.Quantity=1;cfg.WebACLId='';}
    const subnets=['a','b'].map((az,i)=>({id:'subnet-38'+i,az:'us-east-1'+az}));
    return {pixEdge:true,region,subnets,elbs:[{name:'pix-api',arn:albArn,type:'application',scheme:'internal',dns:alb,subnetIds:subnets.map(s=>s.id)}],cloudfront:[{id,domain:'d38pix.cloudfront.net',enabled:true,status:'Deployed',etag:'E1',version:1,
      config:cfg,deployedConfig:clone(cfg),edgeCache:[]}],originAccessControls:repair?[{id:oac,etag:'O1',config:clone(signing)}]:[],cdnOacCounter:repair?1:0,
      buckets:[{name:bucket,region,public:false,policy:repair?clone(policy):undefined,bpa:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true},
        objects:[{key:imagePath.slice(1),version:'p7-v1'}]}],
      edgeVpc:{Id:vpc,Status:'Deployed',VpcOriginEndpointConfig:{Name:'pix-vpc',Arn:albArn,OriginProtocolPolicy:'https-only',HTTPPort:80,HTTPSPort:443}},
      edgeAcl:{Id:aclId,Name:'pix-edge',ARN:acl,Scope:'CLOUDFRONT',blockedPath:'/release-check'},
      edgeReceipts:[]};
  }
  function validate(cfg,a){
    if(cfg.WebACLId && cfg.WebACLId!==a.edgeAcl.ARN)throw Error('InvalidWebACLId: use the CLOUDFRONT web ACL ARN');
    for(const o of cfg.Origins.Items){
      if([o.S3OriginConfig,o.VpcOriginConfig,o.CustomOriginConfig].filter(Boolean).length!==1)
        throw Error('InvalidArgument: choose one origin type');
      if(o.VpcOriginConfig && (o.VpcOriginConfig.VpcOriginId!==a.edgeVpc.Id || a.edgeVpc.Status!=='Deployed' || o.DomainName!==alb))
        throw Error('NoSuchOrigin: private ALB needs its deployed VPC origin');
    }
  }
  const deployed=a=>a.cloudfront.find(d=>d.id===id)?.deployedConfig;
  function behavior(cfg,path){
    return cfg.CacheBehaviors?.Items?.find(b=>{
      const pattern='/'+b.PathPattern.replace(/^\//,'');
      // CloudFront path patterns are case-sensitive, with * and ? wildcards.
      const escaped=Array.from(pattern,c=>{
        if(c==='*')return '.*';
        if(c==='?')return '.';
        return /[\w/-]/.test(c)?c:'\\'+c;
      }).join('');
      return new RegExp('^'+escaped+'$').test(path);
    }) || cfg.DefaultCacheBehavior;
  }
  function viewer(a,path,user){
    const d=a.cloudfront.find(d=>d.id===id),cfg=deployed(a);
    const r={path,user:user||'',version:d?.version,status:503,source:'distribution',body:'Unavailable'};
    if(!cfg?.Enabled || !cfg.Aliases?.Items?.includes(host))return r;
    if(cfg.WebACLId===a.edgeAcl.ARN && path===a.edgeAcl.blockedPath)return {...r,status:403,source:'WAF',body:'Blocked'};
    const b=behavior(cfg,path),o=cfg.Origins.Items.find(o=>o.Id===b.TargetOriginId);
    if(o?.S3OriginConfig){
      const previous=d.edgeCache.find(x=>x.path===path && x.origin===o.Id);
      if(b.CachePolicyId===optimized && previous)return {...r,status:200,source:'HIT',body:previous.version};
      const response=AG.cdnResponse(a,{...d,edgeCache:[]},path,b);
      if(response.status===200 && b.CachePolicyId===optimized)d.edgeCache.push({path,origin:o.Id,version:response.version});
      return {...r,status:response.status,source:'S3',body:response.version || response.reason};
    }
    if(o?.VpcOriginConfig?.VpcOriginId!==a.edgeVpc.Id || a.edgeVpc.Status!=='Deployed' ||
      !a.elbs.some(lb=>lb.arn===a.edgeVpc.VpcOriginEndpointConfig.Arn && lb.dns===o.DomainName && lb.scheme==='internal'))return r;
    if(path!=='/api' && !path.startsWith('/api/'))return {...r,status:404,source:'ALB',body:'Unknown path'};
    if(b.OriginRequestPolicyId!==forward || !['asha','dev'].includes(user))return {...r,status:401,source:'ALB',body:'Login chahiye'};
    return {...r,status:200,source:'ALB',body:user+' ka feed'};
  }
  // Only the named local viewer host answers. No HTTP call leaves the browser.
  const responses=[{re:/^curl -i (?:-H 'Authorization: Bearer (asha|dev)' )?https:\/\/edge\.pixshare\.example(\/[a-zA-Z0-9_./-]*)$/,
    out(s,m){const a=s.account,r=viewer(a,m[2],m[1]);r.deployed=a.cloudfront[0]?.status==='Deployed';a.edgeReceipts.push(r);
      return 'HTTP '+r.status+'\nPixShare fixture · '+r.source+'\n'+r.body;}}];
  AG.pixEdge={id,bucket,imagePath,distArn,optimized,disabled,forward,acl,alb,vpc,policy,signing,config,seed,validate,deployed,behavior,responses};
})();
