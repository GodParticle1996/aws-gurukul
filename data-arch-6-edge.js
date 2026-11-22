/* PixShare D6. Two behaviors keep public thumbnails and personal feed responses separate. */
(() => {
  const E=AG.pixEdge, file=o=>({content:JSON.stringify(o,null,2)}), origin='https://edge.pixshare.example';
  const image='curl -i '+origin+E.imagePath, block='curl -i '+origin+'/release-check';
  const feed=u=>"curl -i -H 'Authorization: Bearer "+u+"' "+origin+'/api/me';
  const create='aws cloudfront create-origin-access-control --origin-access-control-config file://oac.json';
  const grant='aws s3api put-bucket-policy --bucket '+E.bucket+' --policy file://images-policy.json';
  const update='aws cloudfront update-distribution --id '+E.id+' --if-match E1 --distribution-config file://routes.json';
  const wait='aws cloudfront wait distribution-deployed --id '+E.id;
  const files={'oac.json':file(E.signing),'images-policy.json':file(E.policy),'routes.json':file(E.config()),
    'release.txt':{content:'Distribution EPIX38 hai. aws cloudfront get-distribution-config --id EPIX38 se current ETag padho. routes.json release ka poora config hai. VPC origin vo-pix38 aur global WAF pix-edge pehle se bane hain. aws elbv2 describe-load-balancers --names pix-api se internal ALB dekho. pix-edge-images private bucket hai. OAC aur bucket policy ki files ls mein dekho. Update ke baad distribution-deployed ka wait karo.'},
    'viewers.txt':{content:'Photo ke liye pehli aur doosri request milao. Phir demo logins aur WAF ka local check chalao.\n'+[image,image,feed('asha'),feed('dev'),block].join('\n')}};
  const task=(text,check)=>({text,check:s=>check(s.account)});
  const dist=a=>a.cloudfront.find(d=>d.id===E.id);
  const cfg=a=>dist(a)?.status==='Deployed' && E.deployed(a)?.Enabled && E.deployed(a);
  function imageReady(a){
    const c=cfg(a),bucket=a.buckets.find(b=>b.name===E.bucket);
    if(!c || bucket?.public!==false || !['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'].every(k=>bucket.bpa?.[k]))return false;
    const statements=bucket.policy?.Statement, s=statements?.[0];
    if(statements?.length!==1 || s.Effect!=='Allow' || s.Action!=='s3:GetObject' || s.Principal?.Service!=='cloudfront.amazonaws.com' ||
      s.Resource!=='arn:aws:s3:::'+E.bucket+'/images/*' || (s.Condition?.StringEquals?.['AWS:SourceArn']||s.Condition?.StringEquals?.['aws:SourceArn'])!==E.distArn)return false;
    const b=E.behavior(c,E.imagePath);
    return b.CachePolicyId===E.optimized && AG.cdnResponse(a,{...dist(a),edgeCache:[]},E.imagePath,b).status===200;
  }
  function apiReady(a){
    const c=cfg(a);
    if(!c || c.Origins.Quantity!==2 || c.CacheBehaviors?.Quantity!==1 || !c.Aliases?.Items?.includes('edge.pixshare.example'))return false;
    const b=c.DefaultCacheBehavior, o=c.Origins.Items.find(o=>o.Id===b.TargetOriginId), images=c.CacheBehaviors.Items[0];
    return images.PathPattern.replace(/^\//,'')==='images/*' && images.ViewerProtocolPolicy!=='allow-all' && b.ViewerProtocolPolicy!=='allow-all' &&
      b.CachePolicyId===E.disabled && b.OriginRequestPolicyId===E.forward && b.AllowedMethods?.Items?.includes('POST') &&
      o?.DomainName===E.alb && o.VpcOriginConfig?.VpcOriginId===a.edgeVpc.Id && a.edgeVpc.Status==='Deployed' && c.WebACLId===a.edgeAcl.ARN;
  }
  const current=a=>a.edgeReceipts.filter(r=>r.deployed && r.version===dist(a)?.version);
  const imageTask=task('Private S3 photo ke liye signed OAC aur sirf images/ ki policy hai',imageReady);
  const apiTask=task('API ka private origin, zero cache, login forwarding aur global WAF deploy hue',apiReady);
  const hitTask=task('Photo ki do successful reads mili. Doosri edge hit thi.',a=>{
    const reads=current(a).filter(r=>r.path===E.imagePath && r.status===200 && r.body==='p7-v1');
    return reads.length>=2 && reads.at(-1).source==='HIT';
  });
  const viewerTask=task('Asha aur Dev ko apna feed mila. Release check par WAF ka 403 mila.',a=>{
    const rows=current(a);
    return ['asha','dev'].every(u=>rows.some(r=>r.path==='/api/me' && r.source==='ALB' && r.status===200 && r.body===u+' ka feed' && r.user===u)) &&
      rows.some(r=>r.path==='/release-check' && r.source==='WAF' && r.status===403);
  });
  const tasks=[imageTask,apiTask,hitTask,viewerTask];
  const checks=[image,image,feed('asha'),feed('dev'),block];
  function mission(repair){
    const solution=[...(repair?[]:[create,grant]),update,wait,...checks];
    return {type:'terminal',title:repair?'Release repair · photo hit aur feed login wapas lao':'PixShare ke do routes deploy karo',
      goal:repair?'Photo ki har read S3 ja rahi hai. API ko login header nahi mil raha. Usi distribution ke dono behaviors theek karo. Dono logins, photo ki doosri read aur WAF ka release check dekho.':
        'Private pix-edge-images bucket par signed OAC aur policy lagao. EPIX38 par images aur API ke do behaviors aur global WAF lagao. Deployment ke baad dono raaston ko test karo.',
      instructions:'cat release.txt se IDs aur ETag ka command padho. ls se JSON files dekho. cat viewers.txt mein local curl checks hain. Stale ETag mile toh naya config aur ETag padho.',
      files,account:E.seed(repair),responses:E.responses,tasks,solution,hints:['Pehle cat release.txt aur cat viewers.txt padho.',...solution],
      success:AG.allOf(tasks),successText:'Doosri photo edge se mili. Asha aur Dev ka feed alag se private ALB tak gaya. Release-check par global WAF ka 403 mila.'};
  }
  const q=(q,choices,answer,explain,domain='performance')=>({q,choices,answer,explain,domain});
  const dry={type:'dryrun',title:'São Paulo se photo ki teen raahen',goal:'Same photo ko warm edge, accelerator aur seedhe ALB ke raaste trace karo.',
    intro:'PixShare story · Brazil mein Asha p7 ki public photo kholti hai. Origin Virginia mein hai. Neeche diye times is story ke example hain.',
    nodes:[{id:'user',icon:'U',label:'São Paulo',x:150,y:245},{id:'edge',icon:'C',label:'CloudFront',x:475,y:80},
      {id:'ga',icon:'G',label:'Accelerator',x:475,y:255},{id:'alb',icon:'A',label:'Virginia ALB',x:845,y:390}],
    edges:[{from:'user',to:'edge'},{from:'user',to:'ga'},{from:'ga',to:'alb'},{from:'user',to:'alb'}],
    panels:[{id:'time',title:'Example ka waqt'},{id:'origin',title:'Origin par kitne calls?'}],steps:[
      {say:'CloudFront ke paas p7-v1 ki fresh copy hai. Edge par WAF request ko allow karta hai. Asha ko copy wahin se milti hai.',
       flows:[{from:'user',to:'edge'}],panels:{time:['Warm photo · 20 ms'],origin:['Is hit se koi naya origin call nahi.']},
       ask:q('Fresh p7-v1 edge par hai. Photo kaun bhejta hai?', ['CloudFront ki edge cache','Virginia ka API listener','Global Accelerator ka IP','S3 ka gateway endpoint'],0,'Fresh cache hit mein edge saved response deta hai. Viewer ki is request ke liye Virginia ya S3 tak ek aur round trip ki zaroorat nahi hoti.')},
      {say:'Usi distance par accelerator se jaane wala web request AWS edge mein aata hai. Accelerator backbone se healthy ALB endpoint tak traffic bhejta hai.',
       flows:[{from:'user',to:'ga'},{from:'ga',to:'alb'}],panels:{time:['Accelerated origin call · 140 ms'],origin:['Ek request ALB tak gayi.']},
       ask:q('Accelerator ne photo ki doosri request li. Ab kya hoga?', ['Edge ki saved photo milegi','Regional endpoint kaam karega','DNS apna payload bhejega','S3 ki local copy banegi'],1,'Global Accelerator network ka raasta badal sakta hai. Photo ki bytes cache nahi karta. Har nayi request ka jawab endpoint ke peeche ki service degi.')},
      {say:'Seedhe public ALB ke comparison mein user regional endpoint tak internet se gaya. Is story mein direct path 175 ms ka hai. App ka kaam dono origin paths mein juda hai.',
       flows:[{from:'user',to:'alb'}],panels:{time:['Direct ALB · 175 ms'],origin:['Ek aur regional request.','Production mission mein API ka ALB private hai.']},
       ask:q('In teen samples mein sabse kam origin work kahan hua?', ['Seedhe regional ALB par','Accelerator ke listener par','CloudFront ki warm hit par','ALB ke default target par'],2,'Sirf fresh edge hit ne regional request bachayi. Direct aur accelerated path dono origin tak gaye. Asli users ke hits, misses aur latency ko alag naapo.')}
    ],lesson:'Paas ki cache se jawab dena aur door ke origin tak behtar raasta lena do alag kaam hain.'};
  const knob=(id,label,min,max,step,value,unit)=>({id,label,min,max,step,value,unit});
  const fits=k=>k.cache===75 && k.proto===0 && k.fixed===0 && k.far===75;
  const flow={type:'flowlab',title:'Protocol, users aur bill se entry chuno',
    goal:'PixShare web traffic mein 75% requests cacheable hain. 75% users Brazil mein hain. Do fixed global IPv4 addresses ki shart nahi hai. Is mix ka route aur average time dekho.',
    scenario:'Virginia origin se 30 din mein 100 GB download aur das lakh requests hain. Local users North America mein hain. Model ka target average 85 ms hai. Har group ka response size barabar hai. Har ghante download traffic upload se zyada hai. Cacheable requests ka 80% warm hit maana hai. Protocol mein 0 HTTPS, 1 TCP aur 2 UDP hai.',
    knobs:[knob('cache','Cacheable requests',0,100,25,0,'%'),knob('proto','Protocol · HTTPS / TCP / UDP',0,2,1,1,''),
      knob('fixed','Do global IPv4 chahiye? 0 nahi · 1 haan',0,1,1,1,''),knob('far','Brazil ke users',0,100,25,0,'%')],
    check:fits,model(k){
      const remote=k.far/100,hit=k.proto===0?k.cache/100*.8:0;
      const mix=(near,far)=>near*(1-remote)+far*remote;
      const direct=k.proto===0?'Seedha ALB':'Seedha NLB';
      const options=[
        {name:direct,ok:!k.fixed,ms:mix(45,175),cost:9},
        {name:'CloudFront',ok:k.proto===0 && !k.fixed,ms:hit*mix(12,20)+(1-hit)*mix(55,185),cost:mix(9.50,13.20)},
        {name:k.proto===0?'GA → ALB':'GA → NLB',ok:true,ms:mix(40,140),cost:9+720*(.025+2*.005)+100*mix(.015,.04)}];
      const available=options.filter(o=>o.ok),within=available.filter(o=>o.ms<=85);
      const best=(within.length?within:available).reduce((a,b)=>(within.length?b.cost<a.cost:b.ms<a.ms)?b:a);
      const show=o=>o.ok?o.ms.toFixed(1)+' ms · ≈ $'+(Math.round((o.cost+1e-10)*100)/100).toFixed(2):'Is shart par fit nahi';
      return {readouts:[{label:'Seedha regional raasta',value:show(options[0])},{label:'CloudFront',value:show(options[1])},
        {label:'Global Accelerator',value:show(options[2])},{label:'Chuna entry point',value:best.name},{label:'Kul requests mein edge hits',value:best===options[1]?Math.round(hit*100)+'%':'0%'}],
        verdict:{ok:fits(k),text:(within.length?'85 ms ke andar sabse kam model bill':'Koi route 85 ms tak nahi pahuncha. Sabse kam model time')+' · '+best.name+' · '+show(best)}};
    },lesson:'Paid example mein allowances pehle hi kharch hain. Seedhe aur GA download ka regional transfer ≈ $0.09/GB hai. GA ke 720 ghante ≈ $0.025/hour, do IPv4 ≈ $0.005/hour har IP, premium ≈ $0.015 ya $0.040/GB hai. CloudFront ka paid transfer ≈ $0.085 ya $0.110/GB aur 10,000 HTTPS requests ≈ $0.010 ya $0.022 hain. Pehla rate North America ka hai, doosra Brazil ka. ALB/NLB, backend, WAF, S3 requests, tax aur doosre plans alag hain. Fixed ka matlab exactly do global IPv4 hai. Model ke times teaching inputs hain.'};
  const decide={type:'decide',tree:'edge',scenarios:4,title:'Decision Dojo · Cache, global IP ya DNS?'};
  const triage={type:'triage',title:'Accelerator ka bill aaya. Photos ab bhi slow hain.',goal:'PixShare ke sample mein origin calls aur latency milao.',
    symptom:'PixShare story · 80% requests public versioned photos ke liye hain. Accelerator lagaane ke baad bhi Brazil ka p95 lagbhag wahi hai.',
    commands:[{cmd:'cat viewer-sample.txt',out:'Brazil p95: direct 182 ms, GA 179 ms. Photo URLs mein version hai. Profile responses personal hain.',clue:true,note:'Teen ms ke farak se har user ko fayda milna prove nahi hota. Repeated photo URLs dekho.'},
      {cmd:'cat origin-count.txt',out:'10,000 photo reads par lagbhag 10,000 origin calls mile. Doosri p7 read bhi backend tak gayi.',clue:true,note:'GA ke paas response cache nahi hai. Ek hi photo ko phir se backend ne serve kiya.'},
      {cmd:'cat billing-sample.txt',out:'GA par hourly fee aur data transfer premium dikhe. Origin CPU pehle jaisa hai.',clue:false,note:'Billing se nayi service dikhti hai. Cache hit aur user time ke liye request samples dekho.'}],
    questions:[q('Bill badha par photos ko kam fayda kyun mila?', ['Bucket ki expiry kam thi','WAF ka scope global tha','API ka listener naya tha','GA par photo cache nahi thi'],3,'Request count bataata hai ki har photo phir origin tak gayi. Accelerator network route ko badalta hai. App aur transfer ka kaam har request par bacha raha.'),
      q('Agli release ka sabse saaf test kya hai?', ['Photo ki warm hit naapo','Saare feed ka TTL badhao','GA ka hourly alarm hatao','Har image ki nayi URL do'],0,'Version wali public photo par pehli aur doosri request ka time aur origin count milao. Personal API ko CachingDisabled rakho aur login forwarding alag check karo.')]};
  const lab={type:'docker',project:'38-edge-entry-points',title:'Lab 38 · CloudFront aur ALB ki settings padho',
    goal:'Do routes, private bucket, WAF aur internal ALB ka readback milao. GA ka support isi local server par check karo.',
    why:'Ek resource ka ARN milne se viewer request ka result pata nahi chalta. Saved settings aur host par kiye path check ko alag dekho.',
    steps:[{text:'Repo root se lab chalao.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/38-edge-entry-points/lab.py',expect:'Apna Moto server ek khaali local port par khulega.'},
      {text:'ALB listener, WAF aur CloudFront ka readback padho.',expect:'Image aur default API ke alag origins milte hain. Jo field Moto ne nahi lautaayi us par GAP aayega.'},
      {text:'Host check aur cleanup padho.',expect:'Teen paths ka target milega. Aakhir mein resources ki lists khaali hongi aur owned port band hoga.'}],
    observe:q('Host check ne kya verify kiya?', ['Brazil se real cache hit','Teen paths ka chuna origin','WAF se real viewer block','GA se real regional switch'],1,'Python ne readback ke path pattern aur default origin se teen paths milaye. S3 se object bhi padha. Is check mein koi viewer AWS edge par nahi gaya.')};
  const quiz={type:'quiz',bonus:true,title:'PixShare ke aath edge faisle',questions:[
    q('Public p7 photo par baar baar wahi GET aata hai. Kya lagao?', ['GA ka TCP listener','NLB ka UDP listener','CloudFront ki cache','ALB ka path matcher'],2,'Version wali public photo ka fresh response edge dobara de sakta hai. Cache key mein sirf zaroori fields rakho. Hit ratio aur origin calls dono dekho.'),
    q('Regional TCP service ko har AZ mein fixed address chahiye. Kya chuno?', ['ALB ka path matcher','REST API ka authorizer','CloudFront ka behavior','NLB ka TCP listener'],3,'Network Load Balancer raw TCP ya UDP listener deta hai. Internet-facing NLB mein har enabled AZ ke liye Elastic IP de sakte ho. Global anycast ki alag zaroorat hoti hai.'),
    q('API ko usage plans, client keys aur request validation chahiye. Kya chuno?', ['API Gateway ka REST API','API Gateway ka HTTP API','ALB ka default listener','NLB ka naya target group'],0,'REST API mein usage plans, API keys aur request validation hain. Key ko login ka badal mat maano. Identity ke liye authorizer ya IAM bhi chuno.','secure'),
    q('Kam features wali public API ko native JWT authorizer chahiye. Pehle kya dekho?', ['NLB par token rule','HTTP API ka JWT auth','GA par auth listener','S3 par viewer policy'],1,'API Gateway HTTP API JWT authorizer se issuer aur audience check kar sakta hai. Agar usage plans ya direct WAF association chahiye toh REST ke features bhi dekho.','secure'),
    q('CloudFront distribution ko WAF v2 se jodna hai. Kaunsa ACL?', ['ALB ka regional web ACL','NLB ka global web ACL','CloudFront scope ka ACL','S3 ka regional web ACL'],2,'CLOUDFRONT scope ka web ACL us-east-1 mein banta hai. DistributionConfig ke WebACLId mein WAF v2 ka poora ARN do. Regional ALB ka ACL alag hai.','secure'),
    q('Brazil ke UDP players ko do global IPv4 aur healthy endpoints chahiye. Kya chuno?', ['CloudFront aur S3 origin','ALB aur HTTP listener','HTTP API aur authorizer','GA aur regional NLB'],3,'IPv4 standard accelerator do static anycast addresses deta hai. UDP listener ke peeche supported regional NLB endpoints rakho aur endpoint health check karo.'),
    q('Private subnet se S3 traffic NAT ke bill mein aa raha hai. Pehla check?', ['S3 gateway endpoint ka route','GA endpoint group ka weight','CloudFront cache key ka size','API Gateway stage ka naam'],0,'Isi Region ke S3 ke liye gateway endpoint ko sahi route tables se jodo. Endpoint ki apni hourly ya per-GB fee nahi hai. Bucket aur endpoint policies bhi dekho.','cost'),
    q('API par cache band hai par ALB ko login header nahi mil raha. Kya dekho?', ['Object ki cache age','Origin request policy','Image ki content type','GA ka endpoint weight'],1,'CachingDisabled teenon TTL zero karta hai. Origin request policy alag tay karti hai kaunse viewer headers backend ko milenge. Authorization aur Host ka readback dekho.')]};
  const interview={title:'Design review · Photo aur personal feed ek hostname par',instructions:'Chaar sawaal ke baad image aur API behaviors ki release theek karo.',
    questions:[
      q('Origin tak internet se seedha raasta band rakhna hai. ALB kaise jodo?', ['ALB ko S3 OAC dekar','GA par S3 endpoint se','CloudFront VPC origin se','S3 website endpoint se'],2,'VPC origin internal ALB tak private connectivity deta hai. Pehle supported Region, VPC aur security group ki settings dekho. Bucket ke liye S3 OAC alag hota hai.'),
      q('Photo ki pehli read slow aur doosri tez hai. Kaunsa saboot cache hit dikhayega?', ['ALB ke do subnet IDs','GA ka static IP pair','WAF ka enabled rule status','Hit aur ek hi origin read'],3,'Doosri read ka cache result aur dono reads ke origin logs milao. Sirf total time se pata nahi chalega ki origin bach gaya ya network us waqt tez tha.'),
      q('Do global fixed IPv4 maange gaye. Partner HTTPS use karta hai. Pehle kya saaf karo?', ['IP ki ginti aur cache ki need','Sirf origin ke AZ ka naam','Sirf photo ke pixels gino','Sirf viewer ka DNS TTL dekho'],0,'CloudFront par optional Anycast Static IP lists milti hain. Partner ki allowlist capacity, caching aur cost milao. Standard IPv4 accelerator ka address pair alag design hai.'),
      q('Image bucket ki policy ka access kis tak rakho?', ['Saare S3 buckets ke ARN','Isi distribution aur images/','Poore account ke users','Har global accelerator IP'],1,'CloudFront service principal ko images prefix par GetObject do. Condition mein isi distribution ka SourceArn rakho aur S3 Block Public Access chalu rakho.','secure'),
      {terminal:mission(true)}]};
  const step=(q,analogy,body,points,asli)=>({q,analogy,body:'<p>'+body+'</p>',points,asli});
  AG.registerLevels('architect',[{id:'edge',icon:'🌍',title:'São Paulo se PixShare photo kaun dega?',badge:'Edge Emissary',
    objectives:['Protocol aur cache ki zaroorat se entry point chuno.','Photo aur login API ko ek distribution par alag routes do.','Viewer ka result, origin calls aur monthly bill milao.'],
    hook:{when:'PixShare story · Brazil launch',title:'Network ka bill badha. Wahi photo ab bhi Virginia se aa rahi hai.',
      text:'Asha ne p7 photo teen baar kholi. Backend ne teen baar bytes bheje. Usi app mein Asha ka personal feed bhi hai. Support chahta hai ki photo paas se mile aur feed har baar app se aaye.',
      mission:'Public photo ke liye edge cache chuno. Personal feed ko private ALB par bhejo. WAF aur dono routes ko viewer ki request se check karo.'},
    steps:[
      step('Request mein URL padhna hai ya sirf connection bhejna hai?', 'Reception par room ka naam padhkar bhej sakte ho. Ek doosra counter sirf numbered line jodta hai.',
        'Application Load Balancer (ALB) HTTP ya HTTPS par host aur path dekh kar target chunta hai. Network Load Balancer (NLB) TCP ya UDP jaise transport protocols sambhaalta hai.',
        ['Ek Region mein /api aur /checkout ke alag HTTP targets chahiye toh ALB dekho. PixShare game ke raw UDP packets ke liye NLB listener dekho.',
         'Internet-facing NLB par har enabled AZ ko Elastic IP de sakte ho. Do global anycast IPs ki shart alag hai.'], 'ALB rule mein /api aur /api/* dono check karo. Sirf slash ke baad ka wildcard bare /api ko nahi leta.'),
      step('São Paulo ki doosri photo ko Virginia jaana padega?', 'Paas ki library mein same edition bachi hai toh kitab dobara doosre shehar se nahi mangaate.',
        'CloudFront versioned public photo ki fresh copy edge se de sakta hai. Miss par origin se bytes aati hain. Cache key badalne par wahi path alag copy mangwa sakta hai.',
        ['Mission mein /images/* S3 REST origin ko jaata hai. CachingOptimized ka minimum TTL zero se bada hai. Personal feed ke liye CachingDisabled rakho.',
         'Global Accelerator (GA) standard IPv4 par do static anycast IPs deta hai. Listener traffic ko healthy endpoints tak le jaata hai. GA photo ki copy nahi rakhta.'],
        'Story ka warm hit 20 ms hai. GA origin call 140 ms aur direct origin 175 ms hai. Real result viewer location, cache aur app ke kaam se badlega.'),
      step('Ek distribution mein do routes kaise rakhein?', 'Photo counter ko sirf images do. Baaki requests app desk tak jaayen, jahan login check hota hai.',
        'CloudFront pehla matching ordered behavior chunta hai. /images/* ka target private S3 hai. Default behavior private ALB hai. Isliye /api aur /api/me dono zero-TTL route par aate hain.',
        ['CachingDisabled ke minimum, default aur maximum TTL zero hain. AllViewer origin request policy se demo ka Authorization aur viewer Host ALB ko milte hain. App login check karti hai.',
         'Fixture ke ALB listener ka certificate viewer hostname ko cover karta hai. API ke allowed methods mein POST bhi rakho. Unknown path par app ka 404 padho.'],
        'Policy update mein poora config aur current ETag do. Deployment ke baad pehle se cached public image ki expiry aur invalidation alag se samjho.'),
      step('Bucket aur private ALB tak CloudFront kaise jaayega?', 'Photo store aur app ke server room ki chaabi alag hoti hai.',
        'S3 Origin Access Control (OAC) hamesha SigV4 sign karta hai jab SigningBehavior always ho. Bucket par public access block rakho. CloudFront service principal ko images/* par GetObject aur distribution ka SourceArn do.',
        ['ALB ke liye VPC origin ko internal load balancer ke ARN se jodo. IPv4 setup mein private subnet mein free address chahiye. VPC mein internet gateway attached chahiye. Private origin subnet ko public default route dena zaroori nahi hai.',
         'Origin security group par CloudFront ki allowed traffic ke liye port kholo. VPC origin deploy hone par service-managed security group se inbound allow kar sakte ho.'],
        'S3 website endpoint custom origin hai. Private signed reads ke liye bucket ka REST endpoint chuno.'),
      step('API Gateway par HTTP API ya REST API?', 'Chhoti guest list aur har client ka alag quota do alag desk ke kaam hain.',
        'HTTP API par native JWT authorizer issuer aur audience dekh sakta hai. REST API tab dekho jab client API keys, usage plans, request validation ya stage par direct WAF chahiye.',
        ['Usage plan ka quota best effort hota hai. Key customer ko pehchaane mein madad karti hai. User ke access ke liye alag authorization chahiye.',
         'CloudFront ke liye CLOUDFRONT scope ka WAF us-east-1 mein banao. Regional ALB aur API Gateway REST stage ke liye usi Region ka REGIONAL ACL chuno.'],
        'Mission mein WAF v2 ka poora ARN distribution ke WebACLId mein hai. Safe /release-check path ko block karke viewer ko 403 dikhaya hai.'),
      step('Do global IPs, users aur kharcha kaise milao?', 'Tez express lane par bhi parcel origin se hi aata hai. Paas ka stock origin trips ghata sakta hai.',
        'Standard accelerator TCP ya UDP ko endpoints tak le jaata hai. Health aur traffic dials route par asar daalte hain. Regional NLB ka per-AZ IP aur global anycast pair alag contracts hain.',
        ['HTTPS aur IP allowlist ke liye CloudFront ki optional Anycast Static IP lists bhi dekho. Address count, price aur caching ko client ki shart se milao.',
         'Model mein 75% cacheable aur unmein 80% warm hone par kul requests ki 60% edge hits hain. Doosre 40% requests origin tak jaate hain.'],
        'Measured p95 aur mean alag rakho. Calculator ka average p95 ya AWS ka promise nahi hai. Har path ke origin calls aur client times saath dekho.'),
      step('Private subnet ka NAT bill bhi edge bill hai?', 'Public customer ka darwaaza aur staff ka store tak jaane ka raasta alag hain.',
        'Private workloads ko isi Region ke S3 ya DynamoDB tak jaana hai toh gateway endpoint aur subnet ki route table dekho. Gateway endpoint par hourly ya data processing fee nahi hai.',
        ['Doosri supported services ke liye interface endpoint private IP deta hai. Endpoint hours, data processing aur AZ traffic ka bill gino.',
         'Viewer ki photo ki cache hit CloudFront sambhaalta hai. VPC endpoint app se S3 ke raaste ka kaam karta hai.'], 'S3 ke liye NAT bill dekhte waqt source subnet ka actual route aur destination Region padho.')],
    myth:[{myth:'GA doosri photo edge se dega.',sach:'GA network route sambhaalta hai. Public photo ke fresh cache hit ke liye CloudFront dekho.'},
      {myth:'CachingDisabled se login header bhi forward ho gaya.',sach:'Cache policy TTL tay karti hai. Origin request policy aur backend login alag check karo.'},
      {myth:'CloudFront ke peeche ALB internet-facing hona chahiye.',sach:'Supported VPC origin se internal ALB tak private raasta banta hai.'},
      {myth:'Har API Gateway stage ko seedha WAF laga sakte hain.',sach:'Direct WAF association REST API stage ke liye hai. HTTP API ki feature list alag hai.'}],
    playbook:{title:'Ek slow request ki jaanch',use:['Repeat public photos ke liye CloudFront.','Fixed global pair aur TCP/UDP routing ke liye GA.'],
      avoid:['Personal feed par public image policy.','Sirf global naam dekh kar accelerator lagaana.'],
      how:['Request ka path, protocol aur login dekho.','Viewer locations ke times aur hit/miss gino.','Origin access aur WAF ka scope milao.','Deployment ke baad image do baar aur dono demo logins test karo.'],
      redflags:['GA bill badha aur origin count wahi hai','Login header origin tak nahi mila','Image path default API par gaya'],
      rule:'Cache se kitne origin calls bachenge aur routing se kitna network time bachega, dono alag naapo.'},
    exam:[{cue:'Host ya path se HTTP route',pick:'ALB'},{cue:'Regional TCP/UDP aur per-AZ IP',pick:'NLB'},{cue:'Repeated public media',pick:'CloudFront'},
      {cue:'Do fixed global IPv4 aur UDP',pick:'Standard Global Accelerator'},{cue:'Native JWT wali simple API',pick:'API Gateway HTTP API'},
      {cue:'Client keys aur usage plans',pick:'API Gateway REST API'},{cue:'Private ALB ko CDN se jodo',pick:'CloudFront VPC origin'},
      {cue:'Isi Region mein S3 par NAT bachao',pick:'S3 gateway endpoint'}],
    stages:[dry,flow,decide,triage,mission(false),lab,quiz],interview,
    success:['Main request ke protocol aur cache ki need se service chun sakta hoon.','Main private S3 aur internal ALB ke routes alag check kar sakta hoon.','Main edge bill aur request time ki assumptions bata sakta hoon.'],
    homework:'<p>Lab 38 mein /images/p7.jpg, /api aur /api/me ka origin likho. Calculator mein 25% aur 75% Brazil users ka bill milao. Optional AWS sandbox mein apne test resources par viewer headers aur origin counts dekho. WAF, ALB, accelerator, IPv4, transfers aur requests ka bill aa sakta hai. Test distribution disable karke deploy hone do aur delete karo. Phir apna VPC origin, OAC, web ACL, ALB, accelerator aur bucket saaf karo.</p>',
    cards:[{front:'Fresh cache hit mein origin calls?',back:'Us request ke liye zero. Miss ya revalidation par origin call ho sakta hai.'},
      {front:'Bare /api ko kaunsa behavior mila?',back:'Images ka path match nahi hua. Default CachingDisabled behavior private ALB ko bhejta hai.'},
      {front:'S3 OAC ke saath kaunsi policy?',back:'CloudFront service principal, images prefix par GetObject aur isi distribution ka SourceArn.'},
      {front:'GA aur regional NLB ka fixed IP?',back:'Standard IPv4 accelerator do global anycast IPs deta hai. NLB ka address per AZ hota hai.'},
      {front:'WAF ko distribution par kaise jodo?',back:'CloudFront scope ka WAF v2 ACL us-east-1 mein banao. Distribution config mein poora ARN do.'},
      {front:'HTTP API aur REST API ke do cues?',back:'Native JWT ke liye HTTP API dekho. Usage plans aur API keys ke liye REST API dekho.'},
      {front:'CloudFront edge se private ALB ka route?',back:'Deployed VPC origin, sahi subnet, security group, listener aur certificate milao.'}]
  }]);
})();
