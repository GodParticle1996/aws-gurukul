/* Final Architect review. All six release checks read the current PixShare fixture. */
(() => {
  const A=AG.pixBoss,B=AG.pixBill,R=AG.pixResilience,L=AG.pixLogLab;
  const file=x=>({content:JSON.stringify(x,null,2)});
  const q=(q,choices,answer,explain,domain='resilient')=>({q,choices,answer,explain,domain});
  function mission(interview){
    const version=interview?'v2':'v1';
    const join='aws ec2 modify-vpc-endpoint --vpc-endpoint-id vpce-pix --add-route-table-ids rtb-b';
    const reader='aws ssm put-parameter --name '+B.parameter+' --type String --value '+B.address(B.local)+' --overwrite';
    const dlq='aws sqs set-queue-attributes --queue-url '+R.url(R.source)+' --attributes RedrivePolicy@=file://redrive.json';
    const cap='aws lambda put-function-concurrency --function-name pix-worker --reserved-concurrent-executions 4';
    const fix='aws lambda update-function-configuration --function-name pix-worker --handler worker.safe';
    const wait='aws lambda wait function-updated-v2 --function-name pix-worker';
    const audit='aws logs put-subscription-filter --log-group-name '+L.group+' --filter-name raw --filter-pattern "" --destination-arn '+L.raw+' --role-arn '+L.role;
    const sendLogs='aws logs put-log-events --log-group-name '+L.group+' --log-stream-name release --log-events file://review-logs.json';
    const invoke=n=>'aws lambda invoke --function-name pix-worker --payload fileb://receipt-'+n+'.json result-'+n+'.json';
    const solution=interview?[reader,fix,wait,invoke(1),invoke(2)]:[join,reader,dlq,cap,audit,sendLogs,fix,wait,invoke(1),invoke(2)];
    const task=(text,fn)=>({text,check:s=>fn(s.account)});
    const tasks=[task('A aur B se S3 endpoint par jaata hai. Baaki IPv4 apne NAT par hai.',B.routes),
      task('Feed A ne local replica A chuna. Writer C aur fallback B bache hain.',B.cache),
      task('Source queue par 5 receives ki DLQ policy hai.',R.queueOK),
      task('Worker ki limit 4 hai. Feed ke 8 slots aur source mapping bache hain.',R.capOK),
      task(interview?'Raw aur hot ki sahi settings bachi hain.':'Raw mein INFO aur WARN mile. Hot mein sirf usi WARN ki ID mili.',interview?A.auditOK:A.auditSample),
      task('Ready worker.safe ne p7/'+version+' do receipts par ek baar gina. Dono purane totals bache hain.',a=>A.replayOK(a,version))];
    const record=n=>({Records:[{eventSource:'aws:sqs',eventSourceARN:'arn:aws:sqs:us-east-1:123456789012:pix-thumbs',
      messageId:'test-message-'+version,receiptHandle:'receipt-'+n,body:JSON.stringify({tenant:A.tenant,operationId:'p7/'+version,photo:'p7'})}]});
    return {type:'terminal',title:interview?'Release ke baad do regressions pakdo':'Global design review · chhah repairs',
      goal:interview?'Network, cap, DLQ aur audit sahi hain. Feed reader aur billing handler ki regression theek karo. Nayi edit p7/v2 ko do receipts par ek baar gino.':
        'Missing S3 route, remote feed reader, missing DLQ, worker ki zyada limit, missing raw audit aur double count theek karo.',
      instructions:'Pehle cat review.txt aur cat status.txt chalao. Handler package mein worker.unsafe aur worker.safe dono hain. Update ke baad waiter chalao. Do alag receipt files se test karo.',
      account:A.seed(interview),files:{'review.txt':{content:'Feed A ki setting '+B.parameter+' hai. describe-replication-groups mein pix-feed ka node endpoint padho. S3 endpoint vpce-pix ko rtb-b bhi chahiye. Source URL '+R.url(R.source)+' hai. redrive.json policy ko RedrivePolicy@=file:// se padho. pix-worker ki cap 4 chahiye. '+L.group+' ko raw subscription '+L.raw+' par role '+L.role+' se bhejo. Hot subscription bachao. release stream par review-logs.json bhejo. cat delivery.txt mein raw aur hot IDs milao. Worker ka handler worker.safe karo. Update ready hone par receipt-1.json aur receipt-2.json se lambda invoke karo. Har baar output filename do. Purana test dohrane ke liye cat reset-test.txt sirf test tenant 41 ki rows hataata hai.'},
        'status.txt':{content:'Raasta aur worker padho.',onRead(s){
          const a=s.account,p=B.pathState(a),f=a.lambdas.find(f=>f.name===R.worker);
          s.files['status.txt'].content='S3 A/B '+p.s3.join(' / ')+' · baaki IPv4 '+p.other.join(' / ')+'\nFeed '+p.appAZ+' → '+p.reader+' '+p.az+
            '\nWorker '+f?.handler+' · cap '+f?.reservedConcurrency+' · redrive ready '+R.queueOK(a)+' · raw aur hot ready '+A.auditOK(a);
        }},
        'reset-test.txt':{content:'Sirf test-review ka sample saaf hua. Ab dono receipts phir chalao.',onRead:s=>A.resetSample(s.account)},
        'delivery.txt':{content:'Abhi koi test batch nahi mila.'},
        'review-logs.json':file(['INFO','WARN'].map((level,i)=>({timestamp:Date.parse('2026-11-22T12:30:00Z')+i,
          message:JSON.stringify({requestId:i?'p7-retry':'p7-read',level})}))),
        'redrive.json':file(R.policy),'receipt-1.json':file(record(1)),'receipt-2.json':file(record(2))},
      tasks,solution,hints:['cat status.txt mein reader aur handler dekho. cat review.txt mein service aur files ke naam hain.',...solution],
      success:AG.allOf(tasks),successText:'Chhah release checks pass hue. Same thumbnail ki doosri delivery par usage 1 raha.'};
  }
  const dry={type:'dryrun',title:'Ek upload, do reads aur saat failure points',goal:'Har step par ek failure dekho. Kisko jawab milta hai aur kaunsa kaam rukta hai?',
    nodes:[{id:'viewer',icon:'U',label:'Viewer',x:125,y:75},{id:'edge',icon:'E',label:'Edge / S3',x:500,y:75},{id:'api',icon:'A',label:'Upload API',x:150,y:252},
      {id:'feed',icon:'F',label:'Feed / cache',x:150,y:432},{id:'bus',icon:'Q',label:'Jobs / events',x:505,y:252},{id:'worker',icon:'W',label:'Worker / DB',x:850,y:252},
      {id:'logs',icon:'L',label:'Raw / hot',x:540,y:432},{id:'sql',icon:'S',label:'Athena',x:850,y:432}],
    edges:[['viewer','edge'],['viewer','api'],['api','feed'],['api','bus'],['bus','worker'],['worker','logs'],['worker','sql']].map(([from,to])=>({from,to})),
    panels:[{id:'signal',title:'Failure ka saboot'},{id:'response',title:'Kiska kaam chalta hai?'}],
    steps:[
      {clock:'Media read',say:'PixShare story · S3 origin kuch der jawab nahi deta. Fresh p7 edge par hai. Nayi version p8 abhi cache mein nahi hai.',flows:[{from:'viewer',to:'edge'}],
        panels:{signal:['p7 fresh hit · p8 miss aur origin timeout'],response:['Public p7 mil sakti hai. p8 ke liye origin chahiye.']},
        ask:q('Origin band hai. Kaunsi photo ki read abhi chal sakti hai?', ['Edge par fresh p7 ki read','Origin par nayi p8 ki read','Uncached private feed read','Nayi p8 ki pehli download'],0,'Fresh cached copy edge se mil sakti hai. Miss ko origin chahiye. Personal feed aur purani photo ki availability ko nayi upload ki availability se alag gino.')},
      {clock:'Upload ACK',say:'Primary Region ka API band hua. Client ko sirf tab accepted bolo jab upload ka durable record bach gaya ho. Standby ki health aur data lag padhkar traffic badlo.',
        flows:[{from:'viewer',to:'api',tone:'bad'}],panels:{signal:['Primary health fail · standby receipt probe dekho'],response:['DNS badalne se pehle write authority aur capacity milao.']}},
      {clock:'Feed read',say:'Feed app A mein hai. Local reader ready hai par app B ka node padhti hai. Feed sahi aaya, cross-AZ GB badhe.',flows:[{from:'api',to:'feed',tone:'slow'}],
        panels:{signal:['app AZ A → reader B'],response:['A ke healthy node par point karo. B fallback rakho.']}},
      {clock:'Event route',say:'Uploader ki SNS job worker queue mein hai. Review ke EventBridge rule mein detail-type galat hai. Moderation ki copy nahi aayi.',
        flows:[{from:'api',to:'bus',tone:'bad'}],panels:{signal:['Job accepted · review target par matching event 0'],response:['Source, detail-type aur rule pattern milao. Dono publishes ke beech ka gap bhi dekho.']}},
      {clock:'Worker replay',say:'Worker ne usage likha par queue delete se pehle ruk gaya. Agle receive par seedha +1 phir chala.',flows:[{from:'bus',to:'worker',tone:'bad'}],
        panels:{signal:['p7/v1 do receipts · ek upload par do units'],response:['Conditional marker aur usage ek transaction mein likho.']},
        ask:q('Kaunsi jodi ek hi transaction mein commit honi chahiye?', ['Receipt aur worker ka slot','Event marker aur usage ADD','Queue URL aur cache reader','Region aur target ka naam'],1,'Marker aur counter alag commit hue toh crash ke baad duplicate ya missing charge ho sakta hai. Ek transaction ek hi operation ki dono DB writes ko saath rakhti hai.')},
      {clock:'Audit',say:'Hot filter WARN aur ERROR bhejta raha. Raw audit ki subscription gayab hui. Ab INFO events hot search mein dhoondhne se puri history nahi milegi.',
        flows:[{from:'worker',to:'logs',tone:'bad'}],panels:{signal:['Hot WARN mila · raw INFO missing'],response:['Raw route theek karo. Gap ka time note karo. Backfill ke liye retained source dekho.']}},
      {clock:'Country report',say:'DynamoDB ka naya feed export S3 mein aa gaya. Report ki date partition abhi catalog mein nahi hai. Feed table ko scan karne ke bajaye report ka input theek karo.',
        flows:[{from:'worker',to:'sql',tone:'slow'}],panels:{signal:['S3 export mila · aaj ke creators report mein missing'],response:['Partition aur file schema milao. Phir query ki date range dekho.']},
        ask:q('Feed chal rahi hai par country report adhuri hai. Pehle kya milao?', ['Worker ki reserved limit','Media ka distribution ID','Export aur partition','Cache ka writer address'],2,'Report apne analytics data par chalti hai. Naye export ke objects, partition aur query range milane se missing rows ka pata chalta hai. Live feed ka scan extra load badhaayega.')}
    ],lesson:'Ek layer ke healthy hone se doosri layer ka success prove nahi hota. Upload receipt, feed read, worker total aur report ki date alag check karo.'};
  const knob=(id,label,min,max,value,labels)=>({id,label,min,max,step:1,value,labels});
  const flow={type:'flowlab',title:'Global budget aur upload SLO',goal:'Upload ka monthly availability target kam se kam 99.95% rakho. Incident ke lost minutes allowance mein aur model subtotal $1,670/month tak rakho.',
    scenario:'30 din mein 43,200 min hain. Primary outage 60 min aur alag worker outage 30 min hai. Ready standby par switch 5 min leta hai. Async mein durable queue receipt ke baad ACK milta hai. Har minute upload demand barabar hai.',
    knobs:[knob('slo','Upload target',0,2,0,{0:'99.9%',1:'99.95%',2:'99.99%'}),knob('regions','Ready Regions',1,2,1),
      knob('cache','Public photos ka hit share',0,2,0,{0:'0%',1:'50%',2:'80%'}),knob('async','Thumbnail path',0,1,0,{0:'Sync',1:'Async'}),
      knob('plan','Hourly compute commitment',0,2,0,{0:'$0/h',1:'$0.75/h',2:'$1.50/h'})],
    model(k){const m=A.budget(k);return {readouts:[{label:'Allowed downtime',value:m.allowance.toFixed(2)+' min'},
      {label:'Upload ACK nahi mila',value:m.lost+' min'},{label:'Model availability',value:m.availability.toFixed(4)+'%'},
      {label:'Origin reads / month',value:m.origins+' million'},{label:'Eligible compute / month',value:'≈ $'+m.compute},
      {label:'Chune charges / month',value:'≈ $'+m.cost}],verdict:{ok:m.ok,text:m.target<99.95?'Board ka minimum target 99.95% hai.':
      m.lost>m.allowance?'Upload downtime target se zyada hai. Standby aur sync wait dekho.':m.cost>1670?'Time target mila. Ab origin reads aur unused commitment ka kharcha dekho.':'Upload target aur monthly budget dono mile.'}};},
    check:k=>A.budget(k).ok,lesson:'Story rates hain. Har Region ≈ $200/month. Edge ≈ $100/month. 100 million reads mein 80 million public hain. Har million origin reads ≈ $5. Async ka extra ≈ $70/month. Eligible API compute primary mein 600 h active hai. Standby ke 360 h usi waqt active hain. Har unit ≈ $1/h On-Demand. Plan unit ≈ $0.75/h sabhi 720 h ke liye hai. Real plan ki term aur rates alag dekho. Ye subtotal tax, storage growth aur replication transfer ko chhodta hai.'};
  const decide={type:'decide',tree:'pixreview',scenarios:4,title:'Design council · Evidence se raasta chuno'};
  const triage={type:'triage',title:'Feed ka bill badha aur usage bhi galat hai',goal:'Dono problems ke liye alag signal aur alag fix chuno.',
    symptom:'PixShare story · Wahi 100 uploads aur milta-julta feed traffic tha. App-side regional GB badhe. Usage ledger ne 130 units dikhaayi.',
    commands:[{cmd:'cat feed-sample.txt',out:'Feed app A mein hai. Ready reader A aur B hain. 100 mein se sabhi reads B ke node par gayin. Writer C healthy hai.',clue:true,note:'Common reader DNS se locality ki guarantee nahi milti. App ne kaunsa node chuna, uski AZ padho.'},
      {cmd:'cat worker-sample.txt',out:'100 alag operation IDs par 130 increments hue. p7/v1 pehli receipt par likha gaya. Delete se pehle worker ruka. Doosri receipt par wahi increment phir hua.',clue:true,note:'Transport receipt badli par business operation wahi tha. Har delivery ko nayi billable edit maan liya gaya.'},
      {cmd:'cat media-sample.txt',out:'Versioned photos ka edge hit share dono windows mein 80% raha. Upload size bhi lagbhag wahi hai.',clue:false,note:'Photo cache aur feed cache alag paths hain. Stable edge hit share billing worker ke duplicate ka jawab nahi deta.'}],
    questions:[q('Regional GB ke liye pehla fix kya hai?', ['Worker ko ek slot do','Upload ka topic badlo','Usage ki table badlo','App A ko reader A do'],3,'Feed read A se B tak ja rahi hai. App ke paas ready local replica hai. Us node par read bhejo aur fallback sambhaalo. Worker ka cap AZ route nahi badalta.','cost'),
      q('130 units wale bug ka proof kaise loge?', ['Ek job do baar chalao','Raw log ki age padho','Doosri AZ ko hatao','Naya bucket banaao'],0,'Same operation aur do alag receipts bhejo. Marker, payload aur total milao. Do deliveries par ek unit rehna chahiye. Nayi edit ki apni key aur apni unit hogi.')]};
  const lab={type:'docker',project:'41-pixshare-terraform',title:'Lab 41 · PixShare core ko apply aur review karo',
    goal:'Terraform se local core banao. Photo, worker ki do deliveries aur review rule ko alag jaancho.',
    why:'Terraform state resource ka naam deti hai. Galat route, duplicate charge ya emulator ki kami pakadne ke liye input bhejo aur result padho.',
    steps:[{text:'Repo root se runner chalao. Terraform aur provider ki setup lab README mein hai.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/41-pixshare-terraform/lab.py',expect:'Owned Moto par Terraform apply hoga.'},
      {text:'p7 object, SNS job aur EventBridge ke do events dekho.',expect:'Host worker ki do deliveries par usage 1 raha. Review queue mein sirf p7 mila.'},
      {text:'Destroy ke baad state aur service lists dekho.',expect:'Terraform state aur lab resources zero honge. Owned listener band hoga.'}],
    observe:q('Disabled mapping ke saath worker ki 1 unit kis run se mili?', ['Live edge ki cache hit se','Host par packaged handler se','Lambda ke live poller se','Browser ke budget board se'],1,'Python ne wahi packaged handler host par chalaaya. Handler ne Moto DynamoDB ko call kiya. SQS mapping disabled thi taaki review khud dono deliveries padh sake.')};
  const quiz={type:'quiz',bonus:true,title:'Final review · aath architecture choices',questions:[
    q('Public photo aur personal feed ek domain par hain. Kis response ko shared cache do?', ['Login waali feed ko rakho','Har API response ko rakho','Versioned photo ko rakho','Har user token ko rakho'],2,'Public immutable photo kai users ko wahi bytes de sakti hai. Personal feed ko shared cache mein rakhne se ek user ko doosre ka response mil sakta hai.','secure'),
    q('Thumbnail ke baad video encode 25 minute leta hai. Kaunsa route fit hai?', ['Ek Lambda ko lamba chalao','Ek feed query chalao','Ek edge rule banaao','Batch job ko queue do'],3,'Lambda ki ek invocation zyada se zyada 15 minute chalti hai. Lambi encode job ko Batch par bhejo. Spot use karne se pehle retry aur checkpoint ka design karo.','performance'),
    q('Ledger ke alag rows par marker aur increment hain. Kaunsi write chuno?', ['Dono ki ek transaction','Pehle counter phir tag','Pehle read phir cache','Dono ke alag timers'],0,'Pehle write aur doosre write ke beech crash ho sakta hai. Atomic transaction dono ko saath commit karti hai. Pehle se saved operation par marker ki condition dobara increment rok sakti hai.'),
    q('Feed key se milti hai. Quarter ka report country par group hota hai. Report kahan chale?', ['Live feed ki scan par','S3 export par Athena','Cache writer ki RAM par','Queue ki body ke andar'],1,'Country report kai rows padhti hai. Date partitions waale analytics data par Athena chalao. Online feed par user key ki Query ki capacity aur latency bachi rahegi.','performance'),
    q('Raw INFO chahiye aur hot search mein sirf WARN aur ERROR. Kya rakho?', ['Sirf ek hot filter rakho','Raw mein sirf WARN rakho','Raw aur hot alag bhejo','Sab logs SQS mein rakho'],2,'Audit path mein har event rakho. Hot path mein matching individual records bhejo. Search cost ghataane ke liye raw audit ke events khona zaroori nahi hai.','cost'),
    q('Region failover ka drill 5 minute leta hai. 30 din ka 99.99% target?', ['5 min kaafi kam hain','4 Regions zaroori hain','100% hit kaafi hai','4.32 min se zyada hai'],3,'30 din ke 43,200 minutes ka 0.01% sirf 4.32 minute hai. Agar poore 5 minute upload ACK fail hua toh is sample mein sabse sakht target miss hua.'),
    q('Doosri AZ mein cache replica hai. App ko kab remote par bhejo?', ['Local reader gire toh','Har read hit hone par','Har upload ACK ke baad','Har naye log group par'],0,'Local healthy reader transfer ghata sakta hai. Fail hone par healthy remote replica se read lo. Role aur endpoint refresh karo. Outage mein kuch cross-AZ cost manzoor ho sakti hai.'),
    q('Compute commitment kharidne se pehle kya naapna hai?', ['S3 file ke naam dekho','Har ghante ka eligible use','Har queue ki body padho','Sirf peak ka bill dekho'],1,'Savings Plan ka commitment har ghante ke liye hai. Idle ghante ka baaki hissa agle peak ko nahi milta. Right-size karke bache eligible baseline ko naapna chahiye.','cost')]};
  const interview={title:'Final interview · Global PixShare',instructions:'Har choice ki wajah dekho. Phir release mein lauti do galtiyan theek karo.',questions:[
    q('API ne upload accepted bola. Worker abhi busy hai. ACK se pehle kya chahiye?', ['Thumbnail ka final URL','Hot search ka naya index','Durable job ka record','Monthly bill ka total'],2,'User ko accepted bolne se pehle kaam ka durable record hona chahiye. Worker baad mein thumbnail bana sakta hai. Pending aur complete ka status alag dikhao.'),
    q('Ek event do jagah publish karna hai. Pehla send hua, doosra fail. Kya bachaata hai?', ['Lamba cache timer rakho','Source queue delete karo','Do alag random keys do','Outbox se pending send karo'],3,'Business update aur outbox record saath commit karo. Publisher pending send dobara kare. Destination stable operation key se duplicate sambhaale. Do sends ko automatic atomic mat maano.'),
    q('Region switch ke waqt stale copy par write khul gayi. Pehle kya check karoge?', ['Writer aur replica lag','Photo ki filename length','Log group ka naya tag','NAT gateway ka budget'],0,'Traffic badalne se data apne aap current nahi hota. Writer ka owner, replication lag aur recovery point jaancho. Do active writers ke conflict ka rule pehle tay karo.'),
    q('Available 800 GiB volume par koi owner tag nahi hai. Kya karoge?', ['Disk turant hata do','Owner aur restore need dekho','Disk ko turant attach karo','Usko writer bana do'],1,'Available disk abhi attach nahi hai. Pehle owner, retention aur recovery need milao. Manzoor backup aur restore ki zaroorat clear hone par hi cleanup se bachat gino.','cost'),
    {terminal:mission(true)}]};
  const step=(q,analogy,body,points,asli)=>({q,analogy,body:'<p>'+body+'</p>',points,asli});
  AG.registerLevels('architect',[{id:'archboss',icon:'👑',title:'Final Boss · PixShare ka global design review',badge:'Decision Architect',
    objectives:['Photo, feed, upload aur worker ke alag success signals padho.','Upload target ko failure drill aur bill se milao.','Chhah seeded galtiyan theek karke p7 ki redelivery jaancho.'],
    hook:{when:'PixShare story · 50 lakh users ka design review',title:'Photo khul rahi hai. Phir upload ka target aur bill kyun bigde?',
      text:'Board ko teen jawaab chahiye. Region jaaye toh kitni der uploads rukengi? Worker ko wahi job phir mile toh kitni units lagengi? Mahine ka kharcha budget mein rahega?',
      mission:'Ek upload ko edge se worker aur audit tak trace karo. Phir chhah settings theek karke same operation do baar chalao.'},
    steps:[
      step('Ek global app ke liye success ka matlab kya hai?', 'Dukaan ka poster dikhna, order book hona aur parcel milna teen alag baatein hain.',
        'Photo read, personal feed, upload ACK aur thumbnail ready hone ke liye alag signal rakho. Board par 30 din mein har minute barabar upload demand maani hai.',
        ['99.95% upload availability ke liye 21.6 minute ki monthly allowance milti hai.','SLO team ka service target hai. Fresh cached read se nayi upload ka success prove nahi hota.'], 'Time window, denominator aur accepted ki shart likho. RPO mein manzoor data loss aur RTO mein recovery ka waqt maapo.'),
      step('Media aur app ko ek hi cache rule kyun nahi?', 'Public poster sabke liye ek hai. Account statement har customer ki apni hai.',
        'Public versioned images ko CloudFront se private S3 REST origin par bhejo. Origin access control SigV4 se sign kare. Bucket policy mein distribution ARN aur images prefix dono milao.',
        ['Personal API ke liye caching band aur zaroori auth headers forward karo.','Steady API ko ALB aur Fargate par rakh sakte ho. Chhote upload jobs Lambda par aur lambe encode jobs Batch par chalao.'], 'User-visible content aur origin permission dono dekho. Sirf OAC banana ya global IP dena cache hit ka saboot nahi hai.'),
      step('Feed, joins aur analytics ko kahan rakhen?', 'Contact book mein naam jaldi milta hai. Saal ka hisaab doosre register mein hota hai.',
        'Known user key par DynamoDB Query rakho. Hot read ke liye ElastiCache ka healthy node app ki AZ mein chuno. SQL joins aur transactions ke liye Aurora ka writer aur failover path dekho.',
        ['Reader A fail ho toh B fallback hai. C ka writer sirf locality ke liye mat hatao.','Country report ke liye export ko S3 mein date se baanto. Athena ko nayi partition aur sahi schema milna chahiye.'], 'Deep graph traversal aur simple relational joins ek jaise access patterns nahi hain. Query, index aur data ki freshness pehle likho.'),
      step('Upload accepted ke baad thumbnail kaise banegi?', 'Token lekar counter chhodo. Token ka number wahi rahe chahe slip do baar scan ho.',
        'Durable job record ke baad upload ACK do. SNS se subscriber queue ko job milti hai. Standard SQS delivery phir aa sakti hai. EventBridge review flag dekhkar doosri queue ko event de sakta hai.',
        ['Operation ID same rakho. Marker aur total ek DynamoDB transaction mein likho.','Worker cap 4 aur har invocation mein ek downstream call hai. Paanch receives ki redrive policy source queue par hai.'], 'Business update aur kai destinations ko publish karne ke beech crash ka gap ho toh durable outbox aur retry chahiye. Lab mein dono sends alag probes hain.'),
      step('Region aur worker dono fail hon toh budget board kya ginta hai?', 'Backup counter ready hai. Ek helper band hai par order ki receipt phir bhi di ja sakti hai.',
        'Story mein primary outage 60 min hai. Ready second Region, write authority aur current data ke saath tested switch 5 min maana hai. Doosri window mein worker 30 min band hai.',
        ['Sync par worker ki poori 30 min outage upload ACK mein judti hai. Async par processing late hoti hai.','Board mein R2 aur async se 5 min loss hai. Ye model input hai. Asli health detection, routing, lag aur capacity ka drill chahiye.'], 'Healthy Region ka naam bhar dena kaafi nahi hai. Standby par queue, config, permissions aur write probe tayyar chahiye.'),
      step('Kam bill waala design kaise chuno?', 'Pass tabhi sasta hai jab unhi ghanton mein sawari ho.',
        'Story mein 100 million monthly reads mein 80 million public photos hain. Unmein 80% hits hon toh 36 million reads ab bhi origin tak jaati hain.',
        ['Planning rates mein har Region ≈ $200/month, edge ≈ $100/month, origin ≈ $5/million reads aur async extra ≈ $70/month hai.','Primary 600 h aur standby 360 overlapping hours active hain. Ek unit ka plan ≈ $0.75/h sabhi 720 h lagta hai. Bachi demand ≈ $1/h hai.'], 'Ek plan unit par compute ≈ $900 aur chune charges ≈ $1,650/month hain. Real rate, replication, storage, tax aur committed term ke liye alag bill banao.'),
      step('Audit mein kis proof par sign karoge?', 'Stock register mein do entries milne par sirf shelf ko dekhkar hisaab approve nahi karte.',
        'Raw audit mein INFO bhi rakho. WARN aur ERROR ko hot search ke liye alag bhejo. Checkout jaise critical group ki subscription missing ho toh retained logs aur gap ki window milao.',
        ['S3 endpoint ke dono private routes padho. External calls ke NAT defaults bachne chahiye.','Idle disk par pehle owner aur recovery need dekho. Live repair ke baad nayi receipt aur usage read karo.'], 'Architecture choice mein requirement, traffic, cost, ops aur failure ka asar saath rakho. Terraform apply aur live delivery ka proof alag likho.')],
    myth:[{myth:'Photos khul rahi hain toh global upload bhi healthy hai.',sach:'Fresh hits origin ke bina bhi mil sakte hain. Upload ka write probe chalao.'},
      {myth:'Do Regions chunne se data loss zero ho gaya.',sach:'Replication lag, write authority aur failover drill se recovery point milta hai.'},
      {myth:'Queue ke baad duplicate billing khatam.',sach:'Redelivery par stable key aur atomic marker counter ko bachaate hain.'}],
    playbook:{title:'Board ke paanch sawal',use:['Requirement aur traffic shape saaf ho.','Har layer ki failure aur owner likhe hon.'],
      avoid:['Shared cache mein personal feed.','Usage ke peak par saalon ka commitment.'],how:['Request map par durable ACK mark karo.','AZ aur Region failure alag chalao.','Time aur cost ka budget nikalo.','Repair se pehle aur baad same job bhejo.'],
      redflags:['Same key par do increments','Feed A se remote read chalti rahe','Raw audit mein date ka gap'],rule:'Har choice ke liye batao kab kaam karti hai, kab fail hogi aur kaunsa signal pakdega.'},
    exam:[{cue:'Public versioned media',pick:'S3 + CloudFront aur scoped OAC'},{cue:'Steady API aur lamba encode',pick:'Fargate aur Batch ko alag size karo'},
      {cue:'Hot feed aur quarterly report',pick:'DynamoDB/reader aur S3/Athena'},{cue:'Kai subscribers aur matching events',pick:'SNS/SQS fan-out aur EventBridge rule'},
      {cue:'Charge dobara mila',pick:'Stable key, conditional Put aur atomic increment'},{cue:'Cost line aur service target',pick:'Hourly eligible use aur measured recovery'},
      {cue:'Audit aur search alag',pick:'Raw batch bachao aur hot records chuno'}],
    stages:[dry,flow,decide,triage,mission(false),lab,quiz],interview,
    success:['Main chhah repairs ko current state se prove kar sakta hoon.','Main upload allowance aur monthly subtotal nikaal sakta hoon.','Main same job ko do baar chalaakar count mila sakta hoon.'],
    homework:'<p>Lab 41 mein apply, receipt aur destroy ka output milao. Optional apne AWS sandbox mein chhote test prefix par ek S3 read karo. Requests aur storage ka bill aa sakta hai. Sirf apne test objects aur bucket saaf karo.</p>',
    cards:[{front:'99.95% aur 30 din?',back:'43,200 min × 0.0005 = 21.6 min allowance.'},{front:'Fresh photo hit ka proof?',back:'Edge se wahi version mila. Upload API ka write alag padho.'},
      {front:'80 million public reads ka 80% hit?',back:'64 million hits. 100 million total mein 36 million origin tak jaate hain.'},
      {front:'Same p7/v1 ki do receipts?',back:'Ek committed marker aur ek hi usage increment chahiye.'},{front:'Raw INFO gayab, hot WARN mila?',back:'Raw subscription, retained source aur gap ki dates dekho.'},
      {front:'Worker ki cap 4 ka matlab?',back:'Chaar invocations tak. Downstream calls ka hisaab har invocation ke parallel kaam par hai.'},
      {front:'Live Lambda ka saboot?',back:'Mapping, runtime aur delivery chalaakar dekho. Lab 41 mein host packaged handler chalaata hai.'}]
  }]);
})();
