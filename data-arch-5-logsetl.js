/* PixShare D5. Search reads individual documents. Audit keeps the whole batch. */
(() => {
  const {group,raw,split,role,hotPattern,seed}=AG.pixLogLab;
  const base=' --log-group-name '+group, put='aws logs put-subscription-filter'+base;
  const rawCmd=put+' --filter-name raw --filter-pattern "" --destination-arn '+raw+' --role-arn '+role;
  const hotCmd=put+' --filter-name hot --filter-pattern file://hot.pattern --destination-arn '+split;
  const read='aws logs describe-subscription-filters'+base;
  const publish='aws logs put-log-events'+base+' --log-stream-name release --log-events file://sample.json';
  const describe=name=>'aws firehose describe-delivery-stream --delivery-stream-name '+name;
  const receiptRead='cat delivery.txt';
  const solution=['aws logs describe-log-groups',describe('pix-raw'),describe('pix-search'),'aws opensearch describe-domain --domain-name pix-logs',rawCmd,hotCmd,read,publish,receiptRead];
  const levels=['INFO','WARN','ERROR'];
  const rows=levels.map((level,i)=>({timestamp:Date.parse('2026-11-22T12:00:00Z')+i,message:JSON.stringify({level,requestId:'p'+(i+7)})}));
  const files={'hot.pattern':{content:hotPattern},'sample.json':{content:JSON.stringify(rows,null,2)},
    'release.txt':{content:'Group /pixshare/feed aur stream release dekho. pix-raw ka raw/ prefix har batch ke liye hai. Raw subscription ka naam raw hai. Usko pix-log-forward role do. Hot subscription ka naam hot hai. hot.pattern se pix-split Lambda ko bhejo. Lambda par group ki invoke permission pehle se hai. pix-search ka domain pix-logs aur backup matched/ hai. Raw ka ARN '+raw+' hai. Hot Lambda ka ARN '+split+' hai. Raw role ka ARN '+role+' hai.'},
    'delivery.txt':{content:'Test ke baad yahan dono routes ki IDs milengi.',onRead:s=>{s.account.pixLog.lastReceiptRead=s.account.pixLog.receipts.length;}}};
  const task=(text,check)=>({text,check:s=>check(s.account.pixLog)});
  function routes(p){
    const r=p.subscriptions.find(f=>f.filterName==='raw'), h=p.subscriptions.find(f=>f.filterName==='hot');
    if(r?.destinationArn!==raw || r.roleArn!==role || r.filterPattern!=='' || h?.destinationArn!==split)return false;
    const pass=AG.obsPattern(h.filterPattern);
    return ['ERROR','WARN','INFO','DEBUG','FATAL','OTHER'].every(level=>pass(JSON.stringify({level,requestId:'next'}))===['ERROR','WARN'].includes(level)) &&
      !pass('{"message":"ERROR"}');
  }
  function delivered(p){
    const r=p.receipts.at(-1);
    if(!routes(p) || !r || p.lastReceiptRead!==p.receipts.length || r.version!==p.version ||
       r.raw.length!==3 || r.hot.length!==2 || r.backup.length!==2)return false;
    return rows.every((row,i)=>{
      const expected=JSON.parse(row.message);
      const event=r.raw.find(x=>{
        try{
          const fields=JSON.parse(x.message);
          return fields.level===expected.level && fields.requestId===expected.requestId;
        }catch{return false;}
      });
      if(!event)return false;
      const has=list=>list.some(d=>d.eventId===event.id && d.requestId===expected.requestId && d.level===expected.level);
      return has(r.hot)===(i>0) && has(r.backup)===(i>0);
    });
  }
  const routeTask=task('Raw aur hot ke sahi filters ka naya readback mila',p=>routes(p) && p.readVersion===p.version);
  const sendTask=task('p7 sirf raw mein hai. p8 aur p9 ki IDs search aur backup mein bhi mili.',delivered);
  const tasks=[task('Standard group aur encrypted multi-AZ domain ki settings padhi',p=>p.reads.group===p.group && p.logClass==='STANDARD' &&
    p.reads.domain===p.domain.ARN && p.domain.ClusterConfig.ZoneAwarenessEnabled && p.domain.EncryptionAtRestOptions.Enabled),
    task('Dono active Firehose streams ka destination padha',p=>{
      const a=p.streams['pix-raw'],b=p.streams['pix-search'],d=b.Destinations[0].AmazonopensearchserviceDestinationDescription;
      return [a,b].every(x=>x.DeliveryStreamStatus==='ACTIVE' && p.reads[x.DeliveryStreamName]===x.DeliveryStreamARN) &&
        a.Destinations[0].S3DestinationDescription.Prefix==='raw/' && d.DomainARN===p.domain.ARN && d.S3BackupMode==='AllDocuments' && d.S3DestinationDescription.Prefix==='matched/';
    }),routeTask,sendTask];
  const terminal={type:'terminal',title:'Teen test lines se dono raaste jodo',goal:'Group, domain aur dono Firehose destinations padho. Raw mein sab lines rakho. Hot mein sirf WARN aur ERROR bhejo. Dono filters padho aur teen lines bhejkar IDs milao.',
    instructions:'ls aur cat release.txt se shuru karo. hot.pattern aur sample.json flags ko file:// ke saath do. Test ki copies cat delivery.txt mein milengi.',
    account:seed(),files,tasks,solution,hints:['Pehle group, do streams aur domain ki settings padho.',...solution],success:AG.allOf(tasks),successText:'Raw mein teen lines mili. Search aur matched backup ne wahi do IDs li jinka level WARN ya ERROR tha.'};
  const repair=[hotCmd,read,publish,receiptRead], ivTasks=[routeTask,sendTask];
  const ivTerm={title:'Hot index mein INFO aa raha hai',goal:'Raw ki copy bachaao. Usi hot subscription ka khaali pattern theek karo. Filters phir padho. Naya batch bhejkar raw aur hot ki IDs milao.',
    instructions:'Group /pixshare/feed mein raw aur hot dono pehle se hain. describe-subscription-filters se pattern dekho. ls aur cat release.txt mein names hain.',
    account:seed(true),files,tasks:ivTasks,solution:repair,hints:repair,success:AG.allOf(ivTasks),successText:'Raw audit poora hai. Naye hot batch mein sirf p8 aur p9 ke documents hain.'};
  const q=(q,choices,answer,explain,domain='performance')=>({q,choices,answer,explain,domain});
  const decide={type:'decide',title:'Decision Dojo · Log ka sawaal kya hai?',tree:'pixlogtools',scenarios:4};
  const dry={type:'dryrun',title:'p9 ka timeout search mein kab dikhega?',goal:'Raw batch aur hot document ka alag raasta dekho.',
    intro:'PixShare story · Feed par p7 INFO, p8 WARN aur p9 ERROR saath aaye. Audit ko teenon chahiye. On-call ko p9 ka timeout dhoondhna hai.',
    nodes:[{id:'logs',icon:'≡',label:'Feed logs',x:160,y:185},{id:'split',icon:'λ',label:'Hot → Lambda',x:495,y:105},{id:'fire',icon:'≋',label:'Firehose buffer',x:840,y:105},
      {id:'index',icon:'⌕',label:'Search index',x:840,y:380},{id:'backup',icon:'▤',label:'S3 matched/',x:495,y:380},{id:'raw',icon:'▤',label:'Firehose → S3 raw/',x:162,y:380}],
    edges:[{from:'logs',to:'raw'},{from:'logs',to:'split'},{from:'split',to:'fire'},{from:'fire',to:'index'},{from:'fire',to:'backup'}],
    panels:[{id:'bytes',title:'Kis roop mein?'},{id:'proof',title:'Kahan dikhega?'}],steps:[
      {say:'Raw subscription teenon lines ka gzip batch rakhti hai. Hot subscription p8 aur p9 chunti hai. Lambda batch khol kar dono lines ko alag Firehose records banaati hai.',
       flows:[{from:'logs',to:'raw'},{from:'logs',to:'split'},{from:'split',to:'fire'}],panels:{bytes:['Raw: ek envelope','Hot: do JSON documents'],proof:['p7 raw/ mein bhi hai.']},
       ask:q('INFO p7 ki original line kahan dhoondho?', ['S3 ke raw/ prefix mein','S3 ke matched/ prefix mein','Hot index ke shard mein','Lambda ke hot record mein'],0,'Raw subscription ka pattern khaali hai. P7 INFO hai aur hot filter se bahar hai. Hot backup sirf search stream ko mile records rakh sakta hai.')},
      {say:'Firehose ke hints 5 MiB aur 60 seconds hain. Raat ko sirf p9 aaya. Buffer mein 5 MiB jama nahi hue.',
       flows:[{from:'split',to:'fire'}],panels:{bytes:['Size hint abhi nahi aaya'],proof:['Time hint bhi delivery shuru kara sakta hai.']},
       ask:q('Kam traffic mein p9 aage kaise badhega?', ['Index ka shard bharne par','Buffer ka time aane par','Poora log group bharne par','Raw bucket ka din badalne par'],1,'Size ya time ka hint pehle aaye toh Firehose batch bhej sakta hai. Search refresh, retry aur load ke chalte screen par dikhne mein aur waqt lag sakta hai.')},
      {say:'Buffer se do documents nikle. Firehose index ko bhejta hai. AllDocuments ke saath S3 par matched records ki copy bhi jaati hai.',
       flows:[{from:'fire',to:'index'},{from:'fire',to:'backup'}],panels:{bytes:['p8 WARN · p9 ERROR'],proof:['Search mein p9 ka requestId','matched/ mein p8 aur p9']},
       ask:q('Search ko p9 mila. Raw audit kaise check karo?', ['Sirf hot index ka count lo','Sirf backup ki size dekho','Raw batch kholkar IDs milao','Search domain ka ARN padho'],2,'Search ko do matching lines mili hain. Raw audit mein INFO bhi chahiye. Gzip envelope ke logEvents kholkar teenon request IDs aur levels milao.')}
    ],lesson:'Raw audit, search document aur matched backup ko unki apni IDs se check karo.'};
  const knob=(id,label,min,max,step,value,unit)=>({id,label,min,max,step,value,unit});
  const fits=k=>k.daily===20 && k.out===75 && k.hot===7 && k.raw===90;
  const flow={type:'flowlab',title:'Ek mahine ke log ka bill banao',
    goal:'20 GB roz aata hai. 75% INFO hot se hatao. Search ko saat din aur audit ko 90 din chahiye. Chaar sliders milao.',
    scenario:'US East (N. Virginia) ka 30 din ka model hai. Raw gzip ka size input ka 25% hai. Hot record 5 KiB ka hai. Raw batches bhi 5 KiB ke poore multiples hain. Search mein ek replica aur disk par 20% khaali jagah rakho. Matched backup saat din S3 Standard mein hai.',
    knobs:[knob('daily','Roz ka raw input',10,40,10,10,' GB'),knob('out','Hot se kitna hataana hai',0,75,25,0,'%'),
      knob('hot','Search mein kitne din',7,28,7,28,' din'),knob('raw','S3 raw/ expiry',30,90,30,30,' din')],
    check:fits,model(k){
      const selected=k.daily*(1-k.out/100), compressed=k.daily*.25;
      const ebs=3*Math.max(10,Math.ceil(selected*k.hot*2/.8/3));
      const ingest=30*k.daily*.50, fire=30*(selected+compressed)*.029, nodes=720*3*(.335+.113), disk=ebs*.122;
      const storage=(compressed*k.raw+selected*7)*.023, money=n=>'$'+n.toFixed(2);
      return {readouts:[{label:'CloudWatch ingest',value:money(ingest)},{label:'Dono Firehose streams',value:money(fire)},
        {label:'OpenSearch nodes',value:money(nodes)},{label:'Teen nodes ki gp3 disk',value:ebs+' GB · '+money(disk)},
        {label:'S3 raw/ aur matched/',value:money(storage)},{label:'Model ka maheene ka bill',value:money(ingest+fire+nodes+disk+storage)}],
        verdict:{ok:fits(k),text:fits(k)?'Raw mein roz 5 GB gzip hai. Hot mein roz 5 GB docs hain. Saat din ke search ke liye model mein 90 GB gp3 hai.':'Daily input, search ka hissa aur dono retention windows ko team ki zaroorat se milao.'}};
    },lesson:'Paid example rates mein ingest $0.50/GB aur Direct PUT $0.029/GB hai. Search mein teen data nodes $0.335/hour aur teen master nodes $0.113/hour hain. gp3 $0.122 aur S3 Standard $0.023 per GB-month hain. Ek selected GB ka primary index 1 GB maana hai. Har node ki disk poore GB mein li hai. S3 ka bill tab ka hai jab poori window bhar chuki hai. Lambda, requests, Logs storage, query, transfer aur tax alag hain. Index delete karne se jagah milti hai. Disk ka bill badalne ke liye provisioned size bhi badalna hoga.'};
  const triage={type:'triage',title:'PixShare story · Search ki disk bhar gayi',goal:'Disk ka trend, hot filter aur index ki age milao.',
    symptom:'Feed search par nayi lines ruk rahi hain. Pichhle saat din mein requests lagbhag wahi hain. Raw audit ko 90 din rakhna hai.',
    commands:[{cmd:'aws logs describe-subscription-filters --log-group-name /pixshare/feed',out:'raw → pix-raw · pattern=""\nhot → pix-split · pattern=""',clue:true,note:'Hot route bhi INFO le raha hai. Sample mein 75% lines INFO hain.'},
      {cmd:'cat index-age.txt',out:'pix-feed ke daily indices: 90 din purane tak. ISM delete action: day 90. Search team ki zaroorat: day 7.',clue:true,note:'Index State Management (ISM) purane index ko hot disk par 90 din rakhta hai.'},
      {cmd:'cat disk-trend.txt',out:'FreeStorageSpace (Minimum): 18 → 7 → 2 GiB. Raw bucket ki expiry: 90 din.',clue:true,note:'Kam se kam free jagah wala data node dekho. S3 expiry se search disk khaali nahi hoti.'}],
    questions:[q('Search disk itni jaldi kyun bhari?', ['Raw ki expiry aur S3 ka size','Kam retries aur chhota batch','Zyada alarms aur chhota shard','Khaali filter aur purane indices'],3,'Hot subscription ne INFO bhi bheja. Search ko sirf saat din chahiye the, par 90 din ke indices disk par hain. Dono ka asar hot storage par padta hai.'),
      q('Raw audit bachaakar disk kaise sambhaalo?', ['Hot filter aur index age sudhaaro','Raw bucket ke objects hataao','Firehose ka time hint ghataao','Domain ki error logs band karo'],0,'Writes ke liye turant jagah dekho. Raw copy aur recovery check karo. Phir hot filter aur ISM policy theek karo. Purane indices par policy ka asar alag se dekho.')]};
  const lab={type:'docker',project:'37-log-pipeline-firehose',title:'Lab 37 · S3 par asli gzip batch kholo',
    goal:'Moto mein raw delivery aur saved filter dekho. Host par do search documents banaao. Domain ki settings padho.',
    why:'Sirf stream ka ACTIVE hona kaafi nahi hai. Bucket se bytes padhkar pata chalega ki p7, p8 aur p9 kahan gaye.',
    steps:[{text:'Repo root mein lab chalao.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/37-log-pipeline-firehose/lab.py',expect:'Apna local Moto port khulega.'},
      {text:'Raw aur hot probe ka output milao.',expect:'Raw gzip mein teen IDs hain. Moto ke filtered probe mein INFO bhi aaya.'},
      {text:'Host check aur cleanup padho.',expect:'Do alag JSON records S3 mein milenge. Domain metadata milega. Aakhir mein resources aur listener band honge.'}],
    observe:q('Kaunsa saboot raw delivery dikhata hai?', ['Stream ka ACTIVE status mila','Raw gzip mein teen IDs mili','Hot filter ka ARN save hua','Domain ke teen nodes mile'],1,'Log event bhejne ke baad bucket se gzip object padha aur uske logEvents mein IDs mili. Active status aur saved ARN sirf settings ke baare mein bataate hain.')};
  const quiz={type:'quiz',bonus:true,title:'PixShare ke aath log faisle',questions:[
    q('On-call ko teen groups mein das minute ke logs dekhne hain. Pehla tool?', ['Naya domain aur naya index','Har group ka apna dashboard','Logs Insights ki ek query','S3 mein har group ka export'],2,'Logs Insights mein kai groups aur chhoti time window chun sakte ho. Request ID se filter karo. Chune hue data ke scan ka kharcha bhi dekho.'),
    q('Paanch minute mein 100 ERROR aaye toh page chahiye. Kya jodo?', ['Raw prefix par expiry lagao','Hot stream ka buffer bharo','Search index ki age ghatao','Metric filter aur alarm lagao'],3,'Standard group ke JSON level par metric filter har ERROR ka 1 bheje. Alarm ko Sum, paanch minute aur sahi threshold do. Alarm ka action team ko page karega.'),
    q('Kal ke INFO chahiye. Hot backup mein sirf WARN aur ERROR hain. Kahan dekho?', ['Raw prefix ke gzip batch mein','Matched prefix ke backup mein','Search ke naye shard mein','Hot filter ke output mein'],0,'AllDocuments ka scope us Firehose stream ka input hai. Raw subscription ne khaali pattern ke saath sab levels liye the. Uski alag bucket prefix mein pichhla batch milega.'),
    q('Naye group ko aage Lambda subscription bhi chahiye. Kaunsi class chuno?', ['Essentials class ka group','Standard class ka group','Delivery class ka group','Archive tier ka group'],1,'Standard group subscriptions chala sakta hai. Essentials ka purana naam Infrequent Access tha. Group banaate waqt class chuno. Baad mein usi group ki class badal nahi sakte.'),
    q('Do readers ko apni position se stream phir padhni hai. Kya chuno?', ['Firehose ka time buffer','CloudWatch ka metric filter','Kinesis Data Streams','Firehose ka S3 backup mode'],2,'Kinesis Data Streams retention window mein har reader ko apna checkpoint rakhne deta hai. Firehose ka kaam records ko delivery destination tak bhejna hai.'),
    q('Purane logs S3 mein hain. Mahine mein ek SQL report chahiye. Pehla raasta?', ['Har mahine naya hot shard','Har ghante group par alarm','Har bucket ka search domain','Athena se chuni dates padho'],3,'S3 data ka format table se milaao. Query ke liye date partitions chuno. Baar baar bade scans hon toh Parquet ka size aur query mein padhe bytes milao.'),
    q('Hot retention ghati. Provisioned gp3 ka bill ab bhi wahi kyun?', ['Disk ka size ab bhi wahi hai','Raw ka size ab bhi wahi hai','Batch ka time ab bhi wahi hai','Metric ka naam ab bhi wahi hai'],0,'Index hatne se free disk badhti hai. Provisioned gp3 par bill us size ka hai jo domain ko diya hai. Size ya domain badalne se pehle capacity aur migration ka plan dekho.','cost'),
    q('Batch API success hai par do records fail hain. Agla kadam?', ['Saara raw prefix phir bhejo','Failed entries hi phir bhejo','Search domain delete karo','Buffer size double karo'],1,'PutRecordBatch ke har entry ka result padho. Jinki delivery accept nahi hui unko backoff ke saath retry karo. Redelivery ke liye source event ID bhi saath rakho.')]};
  const interview={title:'Design review · Kaunsi copy par bharosa karoge?',instructions:'Chaar faisle lo. Phir galat hot filter theek karo.',questions:[
    q('Ek gzip batch mein teen events hain. Search stream ko kya do?', ['Ek hi batch ko text banaao','Har batch ko ek key banaao','Har line ka alag JSON do','Har line ka alag shard do'],2,'CloudWatch ke batch mein kai logEvents hote hain. Lambda pehle batch kholti hai. Phir har matching event ka ek record Direct PUT wale Firehose ko deti hai.'),
    q('Retry mein wahi event do baar mila. Kaunsa ID source event pehchaanta hai?', ['Naye batch ka request ID','Firehose ka delivery time','Index ka aaj ka shard ID','Log event ka original ID'],3,'Source envelope ka logEvents[].id document mein rakhne se copies mila sakte ho. Firehose ka banaya document ID alag hai. Apne aap duplicate hatne ki guarantee nahi hai.'),
    q('S3 mein naye files aate hain. Managed parse aur search indexing chahiye. Kya dekho?', ['OpenSearch Ingestion pipeline','CloudWatch group ka retention','Firehose ka failed-only backup','CloudWatch alarm ka period'],0,'OpenSearch Ingestion mein S3 source aur SQS notifications ka raasta hai. Codec ko file ke format se milao. Pipeline role ko S3 read aur sink par write access do.'),
    q('Firehose stream ka backup FailedDocumentsOnly hai. S3 mein kya milega?', ['Saare raw logs ki copy','Index na hue documents','Saare matched docs ki copy','Sirf INFO wale documents'],1,'FailedDocumentsOnly mein Firehose index na kar paaye documents backup mein jaate hain. Sab matched documents ki copy chahiye toh AllDocuments set karo.'),{terminal:ivTerm}]};
  const step=(q,analogy,body,points,asli)=>({q,analogy,body:'<p>'+body+'</p>',points,asli});
  AG.registerLevels('architect',[{id:'logsetl',icon:'🔍',title:'Feed ka timeout kahan dhoondhoge?',badge:'Log Pipeline Lohar',
    objectives:['Request ID se teen services ke logs padho.','Raw audit aur hot search ke liye sahi data bhejo.','Filter aur retention se disk aur bill ka hisaab lagao.'],
    hook:{when:'PixShare story · Friday ki release',title:'p9 ka feed timeout hua. Search ki disk bhi bhar rahi hai.',
      text:'Support ko p9 ka error abhi chahiye. Finance ko 90 din baad har request ka hisaab chahiye. Pichhli release ne INFO bhi hot index mein bhej diya.',
      mission:'Pehle sawaal ke hisaab se tool chuno. Phir p9 ko batch se search tak trace karo aur p7 ki raw copy bachao.'},
    steps:[
      step('Ek request teen services se guzri. Kahan dekho?', 'Ek parcel ka tracking number teen counters ki entries jodta hai.',
        'Feed, thumbnail aur web ke log groups ko ek Logs Insights query mein chuno. Incident ki time window chhoti rakho. JSON requestId par filter karo aur timestamp se sort karo.',
        ['p9 ki pehli ERROR se pehle ka WARN bhi padho. Sirf ERROR dikhane se slow dependency chhoot sakti hai.','Baar baar full-text search aur shared dashboards chahiye toh OpenSearch ka index aur uska bill dekho.'], 'Pehle se CloudWatch mein pade data par ek incident dhoondhne ke liye naya cluster kholna zaroori nahi hai.'),
      step('Ek hi log se alarm aur audit kaise nikalte hain?', 'Smoke alarm sirf ginti se baj sakta hai. Audit ko har entry ki copy chahiye.',
        'Standard group par metric filter ERROR ko 1 ginta hai. CloudWatch alarm Sum ko paanch minute mein dekhta hai. Subscription filter matching log events ko aage bhejta hai.',
        ['Ek log group par do subscription filters tak rakh sakte ho. PixShare mein raw sab leta hai aur hot JSON level par WARN ya ERROR leta hai.',
         'Essentials class ka purana naam Infrequent Access hai. Ingest sasta pad sakta hai. Kai Logs Insights queries chalti hain, par subscription aur metric filters ke liye Standard chahiye.'],
        'Raw Firehose tak bhejne ke liye Logs ka delivery role chahiye. Lambda subscription par function ki permission ko source account aur log group ke ARN tak rakho.'),
      step('Ek gzip packet se do search documents kaise bane?', 'Lifaafe mein kai slips hain. Har slip ko uske apne number se file karo.',
        'CloudWatch Logs ka Lambda payload base64 mein gzip batch deta hai. pix-split pehle decode aur unzip karti hai. DATA_MESSAGE ke logEvents kholo. Har message ka level, requestId aur original event ID lekar ek JSON record banao.',
        ['CONTROL_MESSAGE delivery ki jaanch hai. Usko app ki log line ki tarah index mat karo.','Lambda apne role se pix-search par PutRecordBatch karti hai. Response mein FailedPutCount aur har entry dekho. Sirf failed records ko retry karo.'],
        'Seedha CloudWatch batch Firehose ke OpenSearch destination ko dena supported nahi hai. Splitter ko subscription aur search stream ke beech rakho.'),
      step('Firehose mein buffer se kya badalta hai?', 'Van bhar jaaye toh jaldi nikle. Kam parcels hon toh driver time dekh kar nikle.',
        'Amazon Data Firehose managed delivery karta hai. PixShare search stream ka size hint 5 MiB aur time hint 60 seconds hai. Aam taur par jo pehle aaye us par buffer aage jaata hai. Retry aur index refresh bhi search ke waqt mein judte hain.',
        ['AllDocuments search stream ke sab input docs ka S3 backup rakhta hai. FailedDocumentsOnly indexing failures ke liye hai. Dono ko alag raw archive se pehchaano.',
         'Apna consumer, apni read position aur retention window mein replay chahiye toh Kinesis Data Streams dekho.'], 'Search ki freshness naapne ke liye event ka timestamp aur pehli baar result dikhne ka waqt milao.'),
      step('Hot search saat din aur raw audit 90 din kaise rakhein?', 'Aaj ki slips counter par hain. Pichhle mahine ki file store mein hai.',
        'Hot index par OpenSearch Index State Management (ISM) lagao. Daily index ko saat din ke baad delete karne ki policy dekho. Raw bucket par sirf raw/ prefix ki expiry 90 din rakho. Matched backup ki apni saat din ki expiry hai.',
        ['Naye index ka template aur pehle se bane index ki policy dono padho. Minimum FreeStorageSpace neeche jaaye toh sabse bhare node ko dekho.',
         'S3 par date ke hisaab se data rakho. Raw gzip ke andar logEvents ki list hai. Athena ke liye table aur JSON shape milaao ya pehle ek line per event aur date partitions banao.'],
        'Glacier Flexible Retrieval ya Deep Archive mein object gaya ho toh query se pehle restore ka time aur kharcha dekho.'),
      step('Do alag pipelines ka bill kaise padhein?', 'Original parcel aur chhoti search slip ka wazan alag hai. Dono ke liye wahi wazan mat gino.',
        'Roz 20 GB app logs ingest hote hain. Model mein gzip ke baad raw stream mein 5 GB bachte hain. Hot se 75% chhaantne par doosri stream ko bhi 5 GB milte hain. Dono streams ka total roz 10 GB hai.',
        ['CloudWatch ingestion pehle hi ho chuka hai. Hot filter us bill ko kam nahi karta. Direct PUT mein har record 5 KB ke agle hisse tak bill hota hai. Batch API kai chhote records ko billing ke liye ek record nahi banaati.',
         'Saat din ke primary docs 35 GB hain. Ek replica ke saath 70 GB hue. 20% spare aur teen barabar disks ke liye model 30 GB per node leta hai.'], 'OpenSearch ki disk provisioned hai. Purane indices hataane se write ke liye jagah milti hai. Monthly model mein size ko naye design ke hisaab se chunte hain.'),
      step('Files S3 mein pehle se hain. Search index kaun bharega?', 'Purani slips store se bhi aa sakti hain. Har slip ko phir se counter par likhwaana zaroori nahi hai.',
        'OpenSearch Ingestion managed pipeline S3 se data le sakti hai. Nayi files ke liye S3 notifications ko SQS tak bhejo. Pipeline objects padhe, format ke hisaab se parse kare aur index ko docs de.',
        ['Role ko bucket aur queue padhne aur search sink par likhne ka access do. Parse error aur failed writes ka raasta dekho.',
         'Sirf mahine ki ek SQL report chahiye toh Athena chuno. Koi hamesha chalne wala hot index rakhne se pehle query pattern aur scan ka bill dekho.'],
        'Incident mein p9 ki dono copies milao. Ek ID ka milna search ki freshness, audit ki poori coverage aur billing teenon ko ek saath prove nahi karta.')],
    myth:[{myth:'Logs Insights ek hi group dekh sakta hai.',sach:'Ek query mein kai groups aur chhoti time window chun sakte ho.'},
      {myth:'AllDocuments ka matlab poore app ke logs hain.',sach:'Backup us stream ko mile docs rakhta hai. Raw branch INFO ki copy alag bachaati hai.'},
      {myth:'60 seconds ke baad p9 zaroor search mein hai.',sach:'Buffer time ek hint hai. Delivery, retry aur search refresh ka waqt bhi jodo.'},
      {myth:'Gzip batch hi ek search document hai.',sach:'Ek batch mein kai events hote hain. Har matching line ko apna JSON record do.'}],
    playbook:{title:'Missing request ID ka raasta padho',use:['Ek incident ke liye Logs Insights.','Baar baar full-text search ke liye chhota hot index.'],
      avoid:['Raw copy ko hot filter ke baad banana.','Sirf ACTIVE status ko delivery ka saboot maanna.'],
      how:['Source par time aur request ID dekho.','Filter ke liye ek match aur ek non-match bhejo.','Raw gzip, hot document aur matched backup mein IDs milao.','Disk aur index ki age dekho.'],
      redflags:['INFO hot index mein hai','Raw mein INFO gaayab hai','Sabse bhare node par disk kam hai'],rule:'Audit mein kaunsi lines aur search mein kitne din chahiye, pehle tay karo.'},
    exam:[{cue:'Kai groups mein ek incident',pick:'CloudWatch Logs Insights'},{cue:'ERROR count par page',pick:'Metric filter aur alarm'},
      {cue:'SQL se purane S3 logs padho',pick:'Athena aur sahi table format'},{cue:'Hot full-text dashboard',pick:'OpenSearch aur chhoti retention'},
      {cue:'Apne readers aur dobara read',pick:'Kinesis Data Streams'},{cue:'S3 files parse karke managed indexing',pick:'OpenSearch Ingestion'},
      {cue:'Kam ingest cost, subscriptions bhi chahiye',pick:'Class ki features dekho. Subscription ke liye Standard chuno.'}],
    stages:[dry,flow,decide,triage,terminal,lab,quiz],interview,
    success:['Main ek request ko teen groups mein dhoondh sakta hoon.','Main raw batch aur hot docs ki IDs mila sakta hoon.','Main search aur S3 ki retention alag rakh sakta hoon.'],
    homework:'<p>Lab 37 mein p7, p8 aur p9 ke liye raw aur hot ki do columns banao. Calculator mein 90 din raw rakhkar hot ka bill do settings par milao. Optional apne AWS sandbox mein sirf chhota test chalao. Domain ke node-hours, disk, Logs ingest, Lambda aur S3 ka bill aa sakta hai. Apne filters hatao. Test streams, domain, Lambda, roles aur log group delete karo. Test bucket ke objects aur versions saaf karke bucket hatao.</p>',
    cards:[{front:'p9 teen services se guzra. Kahan dekho?',back:'Logs Insights mein groups aur time window chuno. Phir requestId par filter karo.'},
      {front:'Hot subscription ka pattern khaali hai?',back:'INFO bhi aage jaata hai. WARN aur ERROR ka JSON pattern do. Naye batch se check karo.'},
      {front:'Batch aur search record mein farak?',back:'Gzip envelope mein kai logEvents hain. Har matching event ka apna JSON record banao.'},
      {front:'AllDocuments mein p7 INFO kyun nahi hai?',back:'p7 ko hot filter ne hata diya. P7 raw/ ke gzip batch mein milega.'},
      {front:'CloudWatch group class kab chuno?',back:'Group banaate waqt. Subscription aur metric filter ke liye Standard chuno.'},
      {front:'ISM aur S3 expiry kaun sa data hataate hain?',back:'ISM domain ke indices sambhaalta hai. S3 lifecycle chune prefix ke objects sambhaalta hai.'},
      {front:'60 seconds search ka pakka time hai?',back:'Buffer time hint hai. Retry aur index refresh ka waqt bhi lagta hai.'}]
  }]);
})();
