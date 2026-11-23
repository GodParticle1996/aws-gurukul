/* PixShare D7. Trace billed bytes before buying a discount. */
(() => {
  const B=AG.pixBill, file=x=>({content:JSON.stringify(x,null,2)});
  const make='aws ec2 create-vpc-endpoint --vpc-id '+B.vpc+' --vpc-endpoint-type Gateway --service-name '+B.service+' --route-table-ids rtb-a rtb-b --client-token pix-s3';
  const join='aws ec2 modify-vpc-endpoint --vpc-endpoint-id vpce-pix --add-route-table-ids rtb-b';
  const add='aws elasticache create-cache-cluster --cache-cluster-id '+B.local+' --replication-group-id '+B.group+' --preferred-availability-zone us-east-1a';
  const wait='aws elasticache wait replication-group-available --replication-group-id '+B.group;
  const point='aws ssm put-parameter --name '+B.parameter+' --type String --value '+B.address(B.local)+' --overwrite';
  const tag='aws ec2 create-tags --resources '+B.assets.join(' ')+' --tags Key=Team,Value=feed';
  const bud='aws budgets create-budget --account-id '+B.account+' --budget file://budget.json --notifications-with-subscribers file://alerts.json';
  const notify='aws budgets create-notification --account-id '+B.account+' --budget-name pix-month --notification file://notice.json --subscribers file://team.json';
  const ce='aws ce get-cost-and-usage --time-period Start=2026-10-01,End=2026-11-01 --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=USAGE_TYPE';
  const sample='cat canary.txt';
  const files={'budget.json':file(B.budget),'notice.json':file(B.notice),'team.json':file(B.subscribers),
    'alerts.json':file([{Notification:B.notice,Subscribers:B.subscribers}]),'bill-command.txt':{content:ce},
    'release.txt':{content:'VPC vpc-pix ki private tables rtb-a aur rtb-b hain. S3 service com.amazonaws.us-east-1.s3 hai. Doosre IPv4 traffic ko apne NAT par rakho. pix-feed ka naya replica pix-reader-a us-east-1a mein chahiye. Group available hone do. describe-replication-groups mein node ka ReadEndpoint padho. SSM setting /pix/feed/az-a/reader mein wahi hostname do. Feed app har test par setting phir padhti hai. Writer C aur fallback B rehne do. EC2 i-feed aur EBS vol-idle par Team=feed tag chahiye. Account 123456789012 ka monthly budget pix-month hai.'},
    'canary.txt':{content:'Is file ko padhne par local app aur route check chalega.',onRead(s){
      const p=B.pathState(s.account);s.account.billSample=p;
      s.files['canary.txt'].content='Fixture · S3 A/B: '+p.s3.join(', ')+'\nBaaki IPv4 A/B: '+p.other.join(', ')+
        '\nFeed app: '+p.appAZ+' · chuna reader: '+p.reader+' · '+(p.az||'unavailable')+'\nWriter: '+p.writer+' · remote fallback ready: '+p.fallback;
    }}};
  const task=(text,check)=>({text,check:s=>check(s.account)});
  const {routes,cache}=B;
  function guard(a){
    const i=a.instances.find(i=>i.id===B.assets[0]),v=a.volumes.find(v=>v.id===B.assets[1]);
    const b=a.budgets.find(b=>b.definition.BudgetName==='pix-month'),d=b?.definition;
    return i?.tags.Team==='feed' && i.state==='running' && v?.tags.Team==='feed' && v.state==='available' &&
      d?.BudgetType==='COST' && d.TimeUnit==='MONTHLY' && d.BudgetLimit.Unit==='USD' && Number(d.BudgetLimit.Amount)===12000 &&
      b.notifications.some(n=>n.Notification.NotificationType==='ACTUAL' && n.Notification.ComparisonOperator==='GREATER_THAN' &&
        n.Notification.ThresholdType==='PERCENTAGE' && n.Notification.Threshold===80 && n.Subscribers.some(s=>s.SubscriptionType==='EMAIL' && s.Address==='finops@example.test'));
  }
  const tasks=[task('Dono private tables mein S3 endpoint hai. Doosre IP ka raasta NAT hai.',routes),
    task('Feed A ka read reader A par hai. Writer C aur fallback B available hain.',cache),
    task('App aur idle volume tagged hain. $12,000 budget par 80% actual-cost alert laga hai.',guard),
    task('Current routes aur reader ka naya canary result padha',a=>routes(a) && cache(a) && JSON.stringify(a.billSample)===JSON.stringify(B.pathState(a)))];
  function mission(repair){
    const solution=repair?[join,point,notify,sample]:[make,add,wait,point,tag,bud,sample];
    return {type:'terminal',title:repair?'Adhoori release mein teen cheezein theek karo':'S3 route, local reader aur alert lagao',
      goal:repair?'Endpoint vpce-pix sirf A par laga hai. Usi endpoint par B jodo. Local reader ready hai par app purane B reader ko padhti hai. Setting badlo. Pehle se bane pix-month budget par alert jodo. Dono routes aur app reader ka canary padho.':
        'Dono private tables ko S3 gateway endpoint do. App A ke liye reader A jodo aur setting badlo. Remote fallback aur internet NAT bachao. Team tags aur monthly alert lagao. Aakhir mein canary.txt padho.',
      instructions:'ls aur cat release.txt se shuru karo. cat bill-command.txt October ki billing query deta hai. Budget aur alert ke JSON files flags ko file:// se do. Repair mein notice.json aur team.json alag milte hain.',
      account:B.seed(repair),files,tasks,solution,hints:['Pehle release.txt padho. Budget aur subscriber ki JSON files ls mein hain.',...solution],
      success:AG.allOf(tasks),successText:'Dono private tables par S3 ka route badla. Feed A ne local reader chuna. Remote fallback aur dono NAT defaults bache. Team ka budget alert configure hua.'};
  }
  const q=(q,choices,answer,explain,domain='cost')=>({q,choices,answer,explain,domain});
  const decide={type:'decide',tree:'ec2buy',scenarios:4,title:'Decision Dojo · Kis usage par commitment loge?'};
  const dry={type:'dryrun',title:'$28,000 ke bill mein paisa kahan gaya?',goal:'Har charge ko traffic ya resource se milao. Ek hi bachat do baar mat gino.',
    intro:'PixShare story · Teen mahine mein monthly bill $4,000 se $28,000 hua. Users teen guna hue. CFO poochti hai ki kaunsi line architecture badalne par ghategi.',
    nodes:[{id:'bill',icon:'$',label:'Bill $28k',x:145,y:230},{id:'nat',icon:'N',label:'NAT bytes',x:505,y:75},{id:'az',icon:'A',label:'Cross-AZ',x:505,y:250},{id:'rest',icon:'R',label:'Baaki usage',x:505,y:420}],
    edges:[{from:'bill',to:'nat'},{from:'bill',to:'az'},{from:'bill',to:'rest'}],panels:[{id:'usd',title:'Bill ki line'},{id:'why',title:'Kya badlega?'}],
    steps:[{say:'NAT se 200,000 GB guzre. $0.045/GB par $9,000 processing hui. Traffic sample mein 198,000 GB isi Region ke S3 ke hain. Baaki 2,000 GB doosri services ke hain.',
      flows:[{from:'bill',to:'nat'}],panels:{usd:['NAT bytes · $9,000'],why:['Baaki 2,000 GB ki NAT processing ke liye $90 dene honge.','October mein dono NAT aur unke IPv4 ke 720 billed hours har ek ke liye the.']},
      ask:q('S3 endpoint ke baad kis line mein sabse bada farak aayega?', ['NAT ke processed bytes','NAT ke provisioned hours','S3 ke stored object bytes','App ke running node hours'],0,'Endpoint matching S3 traffic ka raasta badalta hai. Do NAT gateways doosri destinations ke liye ab bhi chahiye. Unke hours aur IP ka charge jaari hai.')},
      {say:'EC2 app A mein hai. Node-based cache reader B mein hai. Request aur response milaakar 600,000 GB AZ boundary paar gaye. App side par ≈ $0.01/GB se $6,000 hue.',
       flows:[{from:'bill',to:'az'}],panels:{usd:['Cross-AZ · $6,000'],why:['Reader A ke local reads par charge bach sakta hai.','Naya reader ≈ $180/month maana hai.']},
       ask:q('Isi traffic ka ElastiCache transfer kaise gino?', ['Har byte par do fees jodo','App ke in/out GB jodo','Har read ko ek GB maano','Dono nodes ke hours gino'],1,'Node-based ElastiCache ke isi Region wale example mein node ki taraf alag transfer fee nahi hai. EC2 app ke in aur out GB ek baar gino. Naye replica ki fee alag hai.')},
      {say:'Baaki $13,000 mein compute $8,000, EBS $4,500 aur other $500 hain. Owner review mein $1,500 ka idle compute aur $500 ki unused disk mili. Ye $2,000 pehle se in lines mein hain.',
       flows:[{from:'bill',to:'rest'}],panels:{usd:['$9,000 + $6,000 + $13,000 = $28,000'],why:['Owner aur restore check ke baad hi safai.','Poore local reads aur naya replica ho toh estimate $11,270.']},
       ask:q('Idle $2,000 ko total mein kaise dikhao?', ['Bill par alag se jod do','NAT charges se ghata do','Usi bill ka hissa maano','Naye replica mein jod do'],2,'Idle instances aur disk pehle hi compute aur EBS mein billed hain. Unko phir se jodne par total galat hoga. Recovery aur owner approval ke baad hi likely bachat gino.')}
    ],lesson:'Story ka naya estimate $28,000 − $8,910 − $6,000 − $2,000 + $180 = $11,270 hai. Actual bill agle usage aur prices se banega.'};
  const knob=(id,label,min,max,step,value,unit)=>({id,label,min,max,step,value,unit});
  const fit=k=>k.gateway===1 && k.local===100 && k.hours===600 && k.plan===2;
  const flow={type:'flowlab',title:'Ek board par route, reader aur hourly commitment',goal:'S3 endpoint lagao. Cache reads 100% local rakho. 600 active hours aur $1.50/hour commitment par On-Demand se farak dekho.',
    scenario:'30 din = 720 ghante. Dono zonal NAT aur do IPv4 rehte hain. S3 traffic 198,000 GB aur baaki NAT traffic 2,000 GB hai. Cache ka app-side traffic 600,000 GB hai. Local share zero se upar ho toh ek extra reader poora mahina ≈ $180 ka hai.',
    knobs:[knob('gateway','S3 route · 0 NAT / 1 endpoint',0,1,1,0,''),knob('local','Cache reads local',0,100,50,0,'%'),
      knob('hours','Compute ke active hours',0,720,60,360,' h'),knob('plan','Commitment · 0 / 0.75 / 1.50 USD per hour',0,2,1,0,'')],
    check:fit,model(k){
      const nat=(2000+(k.gateway?0:198000))*.045+720*2*(.045+.005);
      const cross=600000*(1-k.local/100)*.01,reader=k.local?180:0;
      const commit=k.plan*.75, onDemand=2*k.hours;
      const compute=720*commit+k.hours*Math.max(0,2-commit/.75);
      const money=x=>'≈ $'+x.toFixed(2),delta=onDemand-compute;
      return {readouts:[{label:'NAT bytes + hours + IPv4',value:money(nat)},{label:'Cross-AZ + extra reader',value:money(cross)+' + '+money(reader)},
        {label:'Compute · sirf On-Demand',value:money(onDemand)},{label:'Compute · chune plan ke saath',value:money(compute)},
        {label:'Plan lene par bachat',value:money(delta)},{label:'In teen hisson ka monthly total',value:money(nat+cross+reader+compute)}],
        verdict:{ok:fit(k),text:!commit?'Commitment zero hai. Eligible compute ko On-Demand rate par dekho.':delta===0?'540 active hours par dono compute bills barabar hain.':delta>0?'Paid hours mein plan ke discount ka fayda mila. Bache commitment ka credit agle ghante nahi jaata.':'Active hours kam hain. Khaali hours ka commitment bhi pay karna padta hai.'}};
    },lesson:'US East (N. Virginia) mein example NAT ≈ $0.045/hour aur ≈ $0.045/GB, IPv4 ≈ $0.005/hour hai. Har active ghante mein compute ≈ $2 On-Demand hai. Plan ka example rate 25% kam hai. Inactive ghante mein doosra eligible usage zero maana hai. $1.50/hour plan ka bill $1,080 hai. Break-even $1,080 ÷ $2/hour = 540 active hours. Real commitment ek ya teen saal ka hota hai. Board ke 30 din rate aur usage samajhne ke liye hain. S3 storage, egress, tax aur baaki bill alag hain.'};
  const triage={type:'triage',title:'S3 endpoint bana tha. NAT bytes phir bhi kyun badhe?',goal:'Usage type, destination aur app subnet ki actual table milao.',
    symptom:'PixShare story · Private A aur B thumbnails banaate hain. A par route badla tha. B ki release ke baad NAT data processing phir badhi.',
    commands:[{cmd:ce,out:'October · NatGateway-Bytes $9,000 · NatGateway-Hours $64.80 · DataTransfer-Regional-Bytes $6,000',clue:true,note:'Bytes aur hours alag hain. Usage type se NAT pata chala. Destination ke liye traffic sample bhi chahiye.'},
      {cmd:'cat thumbnail-trace.txt',out:'Sample: subnet-b → isi Region ke S3 IPv4 ranges. 198,000 GB/month S3 ka estimate A aur B ko milaakar hai.',clue:true,note:'Source subnet aur destination ka pata mila. Ab B ki associated route table dekho.'},
      {cmd:'aws ec2 describe-route-tables --route-table-ids rtb-a rtb-b',out:'A: S3 prefix → vpce-pix, default → nat-a. B: default → nat-b. B mein S3 prefix nahi mila.',clue:true,note:'Ek endpoint ka VPC mein hona kaafi nahi hai. B ka S3 traffic abhi default par jaata hai.'}],
    questions:[q('B ke S3 traffic par NAT bytes kyun lage?', ['Cache replica C mein tha','S3 object purana ho gaya','NAT gateway ki hourly fee badhi','B ki table par prefix nahi tha'],3,'Cost Explorer ne charge ka type dikhaaya. Trace ne S3 aur subnet B dikhaya. B ki table mein service prefix nahi tha, isliye destination default NAT par gaya.'),
      q('B ko fix karne ke baad sabse pehle kya milao?', ['B ka prefix aur default route','NAT ka sirf monthly budget','S3 ka sirf storage graph','Cache ke writer ka version'],0,'B ke S3 prefix ka target endpoint hona chahiye. Doosre IPv4 traffic ko apna NAT milna chahiye. Dono check ke baad agle usage data mein NAT bytes milao.')]};
  const lab={type:'docker',project:'39-nat-vs-endpoint-bill',title:'Lab 39 · Do routes ka bill khud nikalo',
    goal:'Moto ki private route tables aur S3 prefix list padho. Same traffic ko dono raaston par price karo.',
    why:'Endpoint ID milne ke baad har app table ka route padho. Sirf association ki list dekhkar traffic ke baare mein faisla adhura hai.',
    steps:[{text:'Repo root mein command chalao.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/39-nat-vs-endpoint-bill/lab.py',expect:'Apna local Moto server khulega.'},
      {text:'Pehle NAT, phir sirf A aur phir dono tables ka target padho.',expect:'A aur B saath jodne par dono mein S3 prefix endpoint ke liye mila. External IPv4 ka target NAT raha.'},
      {text:'Host ka bill aur cleanup dekho.',expect:'Diye gaye traffic par $9,072 aur $162 mile. Live resources zero hue aur port band hua.'}],
    observe:q('Lab ke $8,910 ka saboot kya hai?', ['AWS ka final paid invoice','Route aur input GB ka hisaab','Moto ka monthly bill export','NAT par capture hua traffic'],1,'Moto ne route aur prefix ka readback diya. Python ne diye hue GB ko rate se guna kiya. Real packets, real AWS meter aur final invoice is test mein nahi aaye.')};
  const quiz={type:'quiz',bonus:true,title:'Bill review ke aath faisle',questions:[
    q('Usage type NatGateway-Bytes badha. Agla check?', ['Instance ka monthly average dekho','Sirf NAT ke hours gino','Source aur destination milao','Saare NAT gateways hatao'],2,'NAT charge se destination ka naam nahi milta. Subnet, S3 prefix aur flow sample milao. Matching traffic ho tabhi S3 gateway endpoint us hissa ko badlega.'),
    q('App ko external payment service bhi chahiye. S3 endpoint laga diya. Ab kya rakho?', ['S3 par public ACL rakho','Cache par naya port rakho','Album par naya tag rakho','Baaki traffic ka NAT rakho'],3,'Gateway endpoint sirf matching service traffic ka raasta chunta hai. External payment endpoint ke liye alag egress chahiye. Default route hataane se payment call ruk sakti hai.'),
    q('Feed A ki read local chahiye. Cluster-mode disabled cache mein kaise chuno?', ['A ke replica ka node endpoint','Group ka common reader endpoint','C ke writer ka primary endpoint','B ke replica ka node endpoint'],0,'Common reader DNS connections ko replicas mein baant sakta hai. Locality chahiye toh available replica ki AZ aur uska node read endpoint milao. Remote fallback rakho.'),
    q('Chuni AZ ka reader fail hai. App ko feed dena hai. Kya karo?', ['Writer ke saare backups hatao','Healthy remote reader par jao','Sab subnet ka NAT badlo','Gire reader ko primary banao'],1,'Doosri AZ mein healthy reader par fallback rakho. Failover ke baad role aur endpoint dobara padho. Kuch der transfer ka bill badh sakta hai par feed chal sakti hai.','resilient'),
    q('Savings Plan mein ek khaali ghante ka unused commitment kahan jaata hai?', ['Agli subah ke credit mein','NAT ke data discount mein','Us ghante ka bill rehta hai','Agli AZ ke storage bill mein'],2,'Commitment har ghante ka hai. Us ghante ke eligible use par hi discount lagta hai. Bacha commitment agle busy ghante mein le jaakar spend nahi kar sakte.'),
    q('Team ne EC2 par Team=feed lagaya. Billing report mein tag kaise laaye?', ['S3 endpoint ko phir banao','NAT gateway ko restart karo','Budget ka period ghatao','Billing mein tag activate karo'],3,'User-defined tag ko cost allocation ke liye Billing mein activate karo. Report update mein waqt lag sakta hai. Resource par tag lagte hi purana bill nahi badalta.'),
    q('Available EBS volume dikha. Pehla kaam?', ['Owner aur restore need dekho','Volume ko turant hata do','Us par naya plan kharido','Volume ke sab snapshots hata do'],0,'Available ka matlab disk abhi attach nahi hai. Owner, data aur retention ki zaroorat pataa karo. Manzoori aur zaroori backup ke baad hi delete karna theek hai.'),
    q('Monthly cost budget ka email threshold paar hua. Ab kya hoga?', ['Account ka spend band hoga','Alert billing data par aayega','Har NAT apne aap rokega','Cache ka bill maaf hoga'],1,'Is budget mein email notification configure hui hai. Billing update ke baad alert aa sakta hai. Spend limit laagu karne ya resource badalne ke liye alag action chahiye.')]};
  const interview={title:'Design review · Bachat kaise prove karoge?',instructions:'Chaar faisle lo. Phir aadhi release poori karo.',
    questions:[q('20,000 GB monthly reads local karne se ≈ $200 bachte hain. Replica ≈ $180 hai. Net?', ['Lagbhag $200 ki bachat','Lagbhag $380 ki bachat','Lagbhag $20 ki bachat','Lagbhag $180 ki bachat'],2,'App side ka transfer $200 ghata. Naya node $180 ka hai. Sirf in do charges ka net fayda $20 hai. Replication, read lag aur failover ko bhi check karo.'),
      q('Thumbnail worker job ko checkpoint se phir chala sakta hai. Capacity choice?', ['Har job par Dedicated Host','Har job par zonal capacity','Har job par poora RI lo','Spot ke saath retry rakho'],3,'Fault-tolerant batch mein Spot ka fayda ho sakta hai. Interruption notice best effort hai. Job ko checkpoint se resume aur duplicate output se bachne ke liye taiyaar rakho.'),
      q('App right-size hone ke baad baseline abhi badal raha hai. Commitment kab lo?', ['Usage stable hone par','Peak ka ek graph milte hi','NAT ka naya route bante hi','Owner ka ek tag milte hi'],0,'Savings Plan saalon ka hourly commitment hai. Right-size aur traffic fix ke baad bachi eligible demand ka hourly pattern dekho. Peak ko baseline maankar mat kharido.'),
      q('October ke route November mein theek hue. October ka CE total kya dikhaayega?', ['Aaj ka naya projected bill','October ka recorded usage','Agla budget threshold hi','Agle mahine ka plan rate'],1,'Purane month ka recorded usage route update se dobara price nahi hota. Naye time window mein traffic, route aur comparable usage dekhkar actual bachat naapni hai.'),
      {terminal:mission(true)}]};
  const step=(q,analogy,body,points,asli)=>({q,analogy,body:'<p>'+body+'</p>',points,asli});
  AG.registerLevels('architect',[{id:'costdec',icon:'💰',title:'PixShare ka $28,000 bill kis raaste se bana?',badge:'Bill Bachane Wala',
    objectives:['Usage type se NAT bytes aur hours alag padho.','S3 route aur local cache reader ka bill milao.','Savings Plan ka break-even aur budget alert samjho.'],
    hook:{when:'PixShare story · CFO ka October review',title:'Users teen guna hue. Monthly bill $4,000 se $28,000 ho gaya.',
      text:'Feed app ka size lagbhag wahi tha. Thumbnails ne zyada photos padhi. Ek cache call doosri AZ tak gayi aur ek purani disk ka owner nahi mila. CFO ko har fix ki alag bachat chahiye.',
      mission:'NAT, cross-AZ aur idle charges ki ginti karo. Dono private tables aur cache reader ka target badlo. Phir dekho kitne compute hours par commitment sasta hai.'},
    steps:[
      step('Bill ko pehli baar kis tarah todo?', 'Taxi receipt mein gaadi ka wait time aur chale hue kilometre alag lines hain.',
        'Cost Explorer mein October ki monthly UnblendedCost ko USAGE_TYPE se group karo. NatGateway-Bytes data processing ka paisa hai. NatGateway-Hours provisioned time ka paisa hai. End date exclusive hai.',
        ['PixShare ke story bill mein NAT bytes $9,000 aur regional transfer $6,000 hain. Ek usage type kai resources ki activity jod sakta hai. Source subnet aur destination ke saath line milao.',
         'Idle compute aur EBS ka hissa pehle se billed total mein hai. Owner ka naam, attachment aur recent demand dekho.'], 'October query ke Start mein 1 October aur End mein 1 November do. November ke fix se October ka total phir se mat likho.'),
      step('S3 traffic ko NAT se kaise hataoge?', 'Har truck ke liye main toll road hai. S3 ka address mile toh uske liye chhota alag raasta hai.',
        'Private subnet ki actual route table padho. Isi Region ke S3 gateway endpoint ko A aur B dono private tables se associate karo. AWS managed S3 prefix list ki matching route default 0.0.0.0/0 se zyada specific hai.',
        ['S3 gateway endpoint ki apni hourly ya per-GB processing fee nahi hai. Bucket permissions aur S3 ke requests aur storage ka kharcha alag hai.',
         'External payment calls ko ab bhi NAT chahiye. Dono zonal public NAT aur public IPv4 ka fixed bill bacha rahega.'], 'Service name aur traffic ka Region milao. Ek table mein S3 route dikhne se doosre subnet ka route prove nahi hota.'),
      step('Cache ke kaunse bytes AZ paar gaye?', 'Do counters par same file milti hai. Roz door ke counter tak jaane mein extra kiraya lagta hai.',
        'Node-based ElastiCache aur EC2 app alag AZ mein hon toh app ki taraf ke in aur out GB gino. Is same-Region example mein ≈ $0.01/GB hai. ElastiCache node ki taraf se wahi transfer phir bill nahi hota.',
        ['600,000 GB/month ko full local karne par is line mein ≈ $6,000 bachte hain. Ek extra reader ka planning input ≈ $180/month hai. Transfer break-even 18,000 local GB/month hai.',
         'B mein existing replica aur C mein writer rakho. A mein naya read replica banao. Group available ho tab app A ko node ke ReadEndpoint par bhejo.'], 'Common reader endpoint round-robin DNS deta hai. App ka local endpoint aur healthy fallback dono dekho. Replica par recent write kuch der baad dikh sakti hai.'),
      step('Har idle resource turant hata dena chahiye?', 'Khaali locker dikha toh pehle poochho. Andar ki file kal audit mein chahiye ho sakti hai.',
        'Unattached EBS volume ke liye owner, snapshot aur restore ki zaroorat padho. Idle EC2 ke liye CPU ke saath memory, jobs aur time window bhi dekho. Stop ke baad attached storage ka bill reh sakta hai.',
        ['Story mein $1,500 compute aur $500 disk ko owner review ke liye chuna hai. Estimate tabhi bachat hai jab approved cleanup poori ho.',
         'S3 lifecycle mein transition, retrieval aur minimum duration ki cost milao. Graviton par apne dependencies aur price/performance test karo.'], 'Terminal mein idle disk par Team tag lagta hai. Disk aur data tab tak bache hain jab tak owner faisla kare.'),
      step('Savings Plan kis baseline par kharidoge?', 'Roz ka pass har ghante ka paisa leta hai. Kal ki khaali seat aaj ki extra ride par nahi lagti.',
        'Compute Savings Plans eligible EC2, Fargate aur Lambda compute usage par lag sakte hain. Commitment dollar per hour hai aur term ek ya teen saal hoti hai. Batch ka peak dekhkar poora commitment mat lo.',
        ['Board mein active hour ka On-Demand $2 hai. Discounted usage $1.50/hour maana hai. Har mahine 720 × $1.50 = $1,080 doge. 540 active hours par On-Demand bhi $1,080 hai.',
         'Right-size pehle karo. Retry waale thumbnail jobs par Spot evaluate karo. Steady API ke liye bacha hourly usage dekho. Discount compute ke eligible use par hai, NAT bytes par nahi.'], 'Real decision ke liye term ke dauran hourly distribution, plan rates, existing commitments aur growth dekho.'),
      step('Kisko alert mile aur kis kharche ka owner kaun hai?', 'Receipt par team ka naam aur manager ka reminder alag kaam karte hain.',
        'App aur volume par Team=feed tag lagao. Billing mein user-defined allocation tag activate karo. Phir billing data update hone par team ke hisaab se spend padho.',
        ['Mission ka $12,000 monthly COST budget poore account ke liye hai. Actual cost 80% yani $9,600 se upar jaane par FinOps ko email alert chahiye.',
         'Budget mein actual aur forecast alag notification types hain. Update mein der ho sakti hai. Email configure hone se app apne aap band nahi hoti.'], 'Budget name, amount, time unit, threshold aur subscriber sab padho. Tag lagne se account-wide budget apne aap team tak filter nahi hota.'),
      step('Release ke baad bachat kaise naapoge?', 'Naya raasta khula hai. Kitni gaadi us par gayi, gino. Sirf board lagaane se toll bill nahi badalta.',
        'App ki AZ, chuna reader, writer aur fallback ka sample lo. A aur B se ek S3 destination aur ek external IPv4 ka route milao. Phir comparable traffic par NAT bytes aur cross-AZ usage dobara dekho.',
        ['S3 upload volume bhi badh sakta hai. Per processed photo ka cost aur total cost dono rakho.','Board ke NAT, cache aur compute ka subtotal alag hai. Story bill mein storage aur doosre charges bhi hain.'],
        'Canary yahan local model hai. Moto route table ki entry deta hai. Actual AWS invoice ko billing window ke baad hi verify kar sakte ho.')],
    myth:[{myth:'Gateway endpoint laga toh NAT ka poora bill zero.',sach:'Matching S3 bytes hate. Doosre destinations, NAT hours aur IPv4 ab bhi billed hain.'},
      {myth:'Har cross-AZ GB ko dono services par do baar gino.',sach:'Service pair ka rate dekho. Node-based ElastiCache ke is example mein app side ke in aur out GB ginte hain.'},
      {myth:'Reader endpoint hamesha paas ka replica dega.',sach:'Node ka role aur AZ dekho. Local read ke liye app ko sahi endpoint chahiye.'},
      {myth:'Budget email spend ko rok dega.',sach:'Notification owner ko khabar deti hai. Spend rokne ke liye alag action chahiye.'}],
    playbook:{title:'Pehle bytes, phir commitment',use:['Regional S3 ke liye gateway endpoint.','Local reads tab jab transfer bachat reader cost se upar ho.'],
      avoid:['Peak usage par lamba commitment.','Idle dikhi disk bina owner aur recovery check ke hataana.'],
      how:['Usage type aur month se shuru karo.','Route table, destination aur AZ milao.','Naya replica ready hone par app ka reader badlo.','Owner tag, budget alert aur naye usage ka readback lo.'],
      redflags:['Bytes badhe par hours wahi hain','Reader app ki AZ mein hai par app ab bhi B ko padhti hai','Commitment har ghante use nahi hua'],
      rule:'Jis line ko badalna hai, us line ki unit pehchaano. Extra resource ka kharcha ghataakar hi net bachat batao.'},
    exam:[{cue:'Regional S3 ko private subnet se bhaari traffic',pick:'Gateway endpoint aur app ki route table'},{cue:'NAT bytes badhe',pick:'Usage type ke baad source aur destination padho'},
      {cue:'Cache reads AZ paar ja rahe hain',pick:'Local replica, app routing aur remote fallback'},{cue:'Steady hourly baseline',pick:'Right-size ke baad Savings Plan'},
      {cue:'Interruptible thumbnail batch',pick:'Checkpoint aur retry ke saath Spot'},{cue:'EBS volume available',pick:'Owner aur recovery need dekho'},
      {cue:'Team ka spend report',pick:'Cost allocation tag activate karo'},{cue:'Threshold par email',pick:'AWS Budget notification aur subscriber'}],
    stages:[dry,flow,decide,triage,mission(false),lab,quiz],interview,
    success:['Main NAT bytes aur fixed hours alag ginta hoon.','Main local read aur remote fallback dono check kar sakta hoon.','Main hourly commitment ka break-even nikaal sakta hoon.'],
    homework:'<p>Lab 39 mein A aur B ki route tables endpoint se pehle aur baad mein milao. Board par 480, 540 aur 600 active hours ka compute bill likho. Optional apne AWS sandbox mein chhota S3 endpoint test karo. NAT hours, public IPv4, requests aur transfer ka bill aa sakta hai. Apne test routes aur endpoint hatao, NAT delete karke uski Elastic IP release karo aur lab network saaf karo. Savings Plan kharidne ki zaroorat nahi hai.</p>',
    cards:[{front:'NatGateway-Bytes ki unit?',back:'UsageQuantity mein NAT ka processed traffic GB mein milta hai. UnblendedCost mein usi usage ka paisa milta hai.'},
      {front:'Do private subnet tables mein se ek par endpoint hai?',back:'Sirf us table ka matching S3 traffic prefix route lega. Doosre subnet ka route alag padho.'},
      {front:'Model mein extra reader ka break-even?',back:'$180/month ÷ $0.01/GB = 18,000 local GB/month. Usse zyada local GB par is line mein net bachat hai.'},
      {front:'Common reader DNS ya node ReadEndpoint?',back:'Locality ke liye AZ aur role dekhkar available node ka endpoint chuno. Remote healthy reader bhi rakho.'},
      {front:'540 active hours par $1.50/hour plan?',back:'720 × $1.50 aur 540 × $2 dono $1,080 hain. Isse kam active hours par poora plan mehenga hai.'},
      {front:'Team tag aur budget scope?',back:'Allocation tag billing mein activate karo. Account-wide budget tab tak account-wide hai jab tak us par filter na lage.'},
      {front:'Route fix ka final proof kab?',back:'Pehle current routes aur app sample padho. Phir naye billing window mein comparable usage aur cost milao.'}]
  }]);
})();
