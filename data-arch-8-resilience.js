/* Architect D8: replay a thumbnail operation without billing twice. */
(() => {
  const R=AG.pixResilience;
  const q=(q,choices,answer,explain)=>({q,choices,answer,explain,domain:'resilient'});
  const file=value=>({content:JSON.stringify(value,null,2)});
  function mission(repair) {
    const version=repair?'v2':'v1';
    const create='aws dynamodb create-table --table-name pix-events --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST';
    const wait='aws dynamodb wait table-exists --table-name pix-events';
    const send='aws dynamodb transact-write-items --transact-items file://charge-'+version+'.json';
    const policy='aws sqs set-queue-attributes --queue-url '+R.url(R.source)+' --attributes RedrivePolicy@=file://redrive.json';
    const cap='aws lambda put-function-concurrency --function-name pix-worker --reserved-concurrent-executions 4';
    const read='aws dynamodb get-item --table-name pix-usage --key file://counter-key.json --consistent-read';
    const solution=[...(repair?[]:[create,wait]),policy,cap,send,send,read];
    const tasks=[
      {text:'Source queue se paanch receives ke baad pix-failed DLQ ka raasta hai.',check:s=>R.queueOK(s.account)},
      {text:'Worker ki limit 4 hai. Feed ki 8 aur worker ki mapping bachi hain.',check:s=>R.capOK(s.account)},
      {text:'Ek transaction mein sahi event marker aur usage 10 se 11 hue. Replay par marker ki condition fail hui.',check:s=>R.replayed(s,repair)},
      {text:'Replay ke baad current total 11 ki strong read li.',check:s=>{
        const table=s.account.tables.find(t=>t.name===R.usage), proof=table?.lastRead;
        return R.replayed(s,repair) && proof?.consistent && proof.revision===table.revision &&
          proof.key.pk==='TOTAL#demo' && proof.items[0]?.units===11 && /(?:^|[\s"])11(?:$|[\s"])/.test(proof.output) && s.d8ReadAfterReplay===s.ddbLastFailedTransaction;
      }}];
    return {type:'terminal',title:repair?'Purani key bachao, naya version gino':'Worker ko cap do aur same write do baar chalao',
      goal:repair?'v1 ka marker rakho. Ab p7 ka v2 bill karo. Source policy abhi ek receive par DLQ bhejti hai. Worker ki limit 16 se 4 karo. v2 dobara bhejkar total padho.':
        'pix-events on-demand table banao. Worker ki limit 4 aur source ka maxReceiveCount 5 karo. p7 ka v1 do baar bhejo. Usage 10 se 11 hona chahiye.',
      instructions:'cat release.txt padho. Transaction ki JSON file kholkar dono writes dekho. Doosri call par TransactionCanceledException expected hai. Uske baad counter ki strong read lo.',
      account:R.seed(repair),files:{'release.txt':{content:'Demo tenant ka photo p7 hai. Operation demo/p7/'+version+' hai. Ledger pix-events ka string partition key pk hai. Source URL '+R.url(R.source)+' hai. pix-worker har invocation mein ek call karta hai. Downstream mein chaar slots hain. pix-feed ki limit 8 rakho. charge-'+version+'.json ke saath DynamoDB transact-write-items do baar chalao. Counter pix-usage mein hai. Aakhir mein counter-key.json ke saath get-item --consistent-read chalao.'},
        ['charge-'+version+'.json']:file(R.transaction(version)),
        'redrive.json':file(R.policy),'counter-key.json':file({pk:{S:'TOTAL#demo'}})},
      tasks,solution,solutionErrors:{[solution.lastIndexOf(send)]:'TransactionCanceledException'},hints:['ls se files dekho. Redrive policy source queue par lagti hai.',...solution],
      success:AG.allOf(tasks),successText:'Marker aur counter saath likhe gaye. Replay ki marker condition fail hui. Doosre tenant ki ginti 4 rahi.'};
  }
  const scenario={clients:12,base:4,retries:4,jitter:0,outage:2};
  function chart(jitter){
    const {wave}=R.simulate({...scenario,jitter});
    const bars=wave.map((n,t)=>n?'<rect x="'+(5+t*9.5)+'" y="'+(55-3.6*n)+'" width="7" height="'+(3.6*n)+'" fill="'+(t===0?'#9eaac3':n>4?'#ff987c':'#62d9be')+'"><title>'+t+' s par '+n+' calls aayi.</title></rect>':'').join('');
    return '<svg viewBox="0 0 285 76" width="100%" role="img" aria-label="Calls per second. '+wave.map((n,t)=>n?t+' s: '+n:'').filter(Boolean).join(', ')+'">'+bars+
      '<path d="M3 55H278 M3 40.6H278" stroke="#76839b" stroke-width="1" stroke-dasharray="3 3"/><g font-size="11" fill="#ccd4e6"><text x="4" y="71">0 s</text><text x="108" y="71">12 s</text><text x="250" y="71">28 s</text></g></svg>';
  }
  const dry={type:'dryrun',title:'Ek saath retry ya alag seconds mein?',goal:'Dono timelines par recovery ki load dekho. Phir p7 ki ek delivery repeat karo.',
    nodes:[{id:'app',icon:'12',label:'Clients',x:150,y:120},{id:'api',icon:'4',label:'4 slots/s',x:510,y:120},
      {id:'queue',icon:'Q',label:'SQS',x:150,y:380},{id:'db',icon:'D',label:'Usage',x:510,y:380}],
    edges:[{from:'app',to:'api'},{from:'queue',to:'db'}],panels:[{id:'wave',title:'Har bar ek second ki calls hai'},{id:'usage',title:'Worker ka record'}],
    steps:[
      {clock:'0–28 s',say:'12 clients t=0 par fail hue. Service t=2 s par lauti. Sabne 4 s rukkar retry ki. t=4 par 12 calls aayi. Chaar slots mile. Baaki ko phir rukna pada. Dashed line 4 calls/s ki capacity hai.',
        flows:[{from:'app',to:'api',label:'12 calls',tone:'bad'}],panels:{wave:[chart(0)],usage:['Bina jitter · t=4 par peak 12 calls/s.','Aakhri jawab t=28 s par.']},
        ask:q('Service laut aayi thi. t=4 par 8 calls kyun ruki?', ['Chaar slots par 12 calls aayi','Teen events queue mein ruke','Ek marker ka naam badla tha','Baarah files ka size badha'],0,'Sab clients ka timer saath khatam hua. Ek second mein chaar calls hi chal sakti thi. Recovery ke baad bhi nayi retry wave ban gayi.')},
      {clock:'0–9 s',say:'Ab delay har retry ki window mein alag chuna. Pehli window 1 se 4 s hai. Wahi service aur wahi 12 clients hain. Is sample mein recovery ke baad peak 4 calls/s aur aakhri jawab t=9 s par mila.',
        flows:[{from:'app',to:'api',label:'alag timers',tone:'ok'}],panels:{wave:[chart(1)],usage:['Dono charts mein scale ek hai.','Har chauthe client ki pehli successful write ka jawab kho jaata hai.']},
        ask:q('Jitter ne timeline mein kya badla?', ['Worker ke slots badh gaye','Retry ke waqt phail gaye','Event ke bytes ghat gaye','Queue ke rules badal gaye'],1,'Jitter har client ka wait alag chunta hai. Is sample mein calls kai seconds mein phailin. Service ke chaar slots aur operation ki key dono wahi rahe.')},
      {clock:'Write → ack se pehle crash',say:'Thumbnail worker ne p7 ka usage likha. SQS delete se pehle worker band hua. Message phir mila. Seedhe +1 par zero se total 2 hota. Stable key aur atomic write par total 1 rehta hai.',
        flows:[{from:'queue',to:'db',label:'p7/v1 phir mila',tone:'slow'}],panels:{usage:['Pehli delivery · marker aur +1 saath commit.','Doosri delivery · wahi marker mila, total wahi.']},
        ask:q('Ek hi upload ki retry aayi. Kya saath commit karoge?', ['Receipt aur queue ka naam','Timer aur retry ki list','Event marker aur counter','Photo aur worker ka naam'],2,'Marker aur counter do alag writes mein rakhne par beech ka crash ginti kho sakta hai ya do baar jod sakta hai. Ek transaction dono ko saath rakhti hai.')}
    ],lesson:'Retry ka waqt load badalta hai. Ek hi kaam ko do baar bill hone se bachaane ke liye stable key aur atomic write chahiye.'};
  const knob=(id,label,min,max,step,value,unit)=>({id,label,min,max,step,value,unit});
  const flow={type:'flowlab',title:'Retry ka traffic phailaao',goal:'12 clients aur 2 s outage rakho. Sabko 18 s ke andar jawab do. Recovery ke baad peak 4 calls/s se upar na jaaye.',
    scenario:'Har tick 1 s hai. t=0 par sab clients aate hain. Service ek tick mein 4 calls leti hai. Pehli successful write par har chauthe client ka jawab kho jaata hai. Duplicate safe hai. Jitter ki chits har run mein wahi hain.',
    knobs:[knob('clients','Clients',4,16,4,8,''),knob('base','Pehli retry window',1,4,1,1,' s'),knob('retries','Pehli call ke baad max retries',0,5,1,1,''),
      {...knob('jitter','Jitter',0,1,1,0,''),labels:{0:'Band',1:'Chalu'}},knob('outage','Service kitni der down hai',1,4,1,2,' s')],
    model(k){const m=R.simulate(k);return {readouts:[{label:'Recovery ke baad peak',value:m.peak+' calls/s'},
      {label:'Jawab mila',value:m.acks+'/'+k.clients+' · '+Math.round(100*m.acks/k.clients)+'%'},
      {label:'Kul attempts',value:String(m.attempts)},{label:'Aakhri attempt',value:m.lastAttempt+' s'},
      {label:'Alag usage writes',value:String(m.writes)},{label:'Duplicate writes roki',value:String(m.duplicates)}],
      verdict:{ok:R.fits(k,m),text:m.acks<k.clients?'Kuch clients ko jawab nahi mila. Attempts aur window badalkar dekho.':m.peak>4?'Sabko jawab mila par recovery mein ek second par chaar se zyada calls aayi.':
        'Ab client count, outage aur aakhri attempt ka waqt goal se milao.'}};},
    check:k=>R.fits(k,R.simulate(k)),lesson:'Window har retry par double hoti hai, zyada se zyada 8 s. Jitter on ho toh 1 s se window tak ka wait chunta hai. Ye fixed sample hai. Production mein latency, retry budget aur downstream load naapna hoga.'};
  const decide={type:'decide',tree:'workerretry',scenarios:4,title:'Decision Dojo · Retry, ack ya DLQ?'};
  const triage={type:'triage',title:'100 uploads ka bill 130 units kyun?',goal:'Delivery, business key aur DB ki dono writes ka order milao.',
    symptom:'PixShare story · 100 alag thumbnail jobs poore hue. Usage report mein 130 units dikhe. Feed ka uptime theek raha.',
    commands:[{cmd:'cat worker.log',out:'demo/p7/v1 · receive 1 par usage +1 hua. Delete se pehle timeout.\ndemo/p7/v1 · receive 2 par usage phir +1 hua. Delete OK.',clue:true,note:'Wahi operation do deliveries mein aaya. Dono attempts par counter badha.'},
      {cmd:'cat publisher.log',out:'demo/p7/v1 · send A\ndemo/p7/v1 · producer retry send B\ndemo/p7/v2 · new edit send C',clue:true,note:'Nayi send ka MessageId badal sakta hai. p7/v2 sach mein naya kaam hai.'},
      {cmd:'cat ledger-audit.txt',out:'100 alag operationId par 130 ADD hue. Marker 0 the. 30 extra units bill mein aayi.',clue:true,note:'Kis operation ka pehle hisaab hua, ye DB mein store nahi tha.'}],
    questions:[q('Counter 30 units zyada hone ka saboot kya hai?', ['Queue ki age badh rahi thi','Photo ki size badh rahi thi','Worker ki limit wahi thi','Wahi key par do ADD hue'],3,'Worker log mein pehli write commit hui. Delete se pehle timeout hua. Redelivery par wahi operation phir ADD hua. Audit mein 100 alag jobs ke liye 130 writes milin.'),
      q('Send A aur send B ek hi kaam hain. Kis key se milao?', ['Tenant aur version waali job ID','Naye receive ki receipt handle','Queue ki current visible count','Worker ki current request ID'],0,'Producer ko ek kaam ke har send par wahi operation ID deni chahiye. Tenant aur version se p7 ki doosri edit alag reh sakti hai. Receipt har receive par badalti hai.')]};
  const lab={type:'docker',project:'40-idempotent-consumer',title:'Lab 40 · Wahi job do baar padho',goal:'Moto SQS se redelivery karao. DynamoDB mein seedhe ADD aur safe write ka total padho.',
    why:'Worker writing ke baad aur ack se pehle ruk sakta hai. Message ko phir padhkar DB ka total dekho.',
    steps:[{text:'Repo root par Python lab chalao.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/40-idempotent-consumer/lab.py',expect:'Apna loopback Moto server khulega.'},
      {text:'Do deliveries ke MessageId aur receive counts milao.',expect:'Seedhe ADD par 2. Conditional Put aur ADD ek transaction mein hone par 1.'},
      {text:'Naya version aur key conflict dekho. Cleanup ki lists padho.',expect:'Naya version gina. Doosri photo ke saath wahi key DLQ mein gayi. Tables aur queues zero.'}],
    observe:q('Marker wali write hui par counter ki condition fail hai. Lab mein kya mila?', ['Counter phir bhi badha','Naya marker nahi mila','Queue ka ARN badal gaya','Purana marker mit gaya'],1,'DynamoDB transaction ne dono writes saath cancel ki. Strong read mein naya marker nahi tha. Isliye asli kaam baad mein theek counter ke saath phir chal sakta hai.')};
  const quiz={type:'quiz',bonus:true,title:'Worker review ke aath faisle',questions:[
    q('Pehli call ka jawab timeout hua. Counter par agla kadam?', ['Nayi random key bhejo','Kisi doosre counter par likho','Wahi operation key bhejo','Naya receive ID bhejo'],2,'Timeout se client ko write ka result pata nahi chalta. Wahi operation key phir bhejo. Worker committed marker se pehchaan sakta hai ki kaam pehle ho chuka hai.'),
    q('Worker marker pehle likhta hai. Counter se pehle crash hua. Kya hoga?', ['Queue ka ARN mit jaayega','Counter do baar badhega','Worker ka slot badhega','Usage chhoot sakta hai'],3,'Agle worker ko marker mil jaayega aur woh kaam poora maan sakta hai. Marker aur counter ko ek transaction mein likho taaki dono ka result saath rahe.'),
    q('Worker har invocation mein teen parallel DB calls karta hai. Reserved limit 4 hai. Kitni calls ek saath ho sakti hain?', ['Baarah tak DB calls','Chaar tak DB calls','Teen tak DB calls','Ek hi DB call'],0,'Reserved concurrency Lambda invocations ko cap karti hai. Har invocation ke andar teen parallel calls hon toh chaar invocations milkar baarah calls bhej sakti hain.'),
    q('Queue se sirf ek kharaab job baar-baar mili. Agla raasta?', ['Queue ko khaali karo','Us job ko DLQ bhejo','Feed ki limit badhao','DB ka marker hatao'],1,'Source queue ki redrive policy receive count dekhti hai. Bar-bar fail hone wala message DLQ mein rakhkar payload aur error dekho. Baaki jobs aage chal sakti hain.'),
    q('Operation key sahi hai par saved photo aur aaya payload alag hain. Kya karo?', ['Success bolkar ack do','Counter dobara badhao','Key conflict alag rakho','Marker ko overwrite karo'],2,'Same key aur alag data ko successful duplicate bolne par naya kaam kho sakta hai. Conflict ka record rakho aur bounded retry ya review queue ka raasta lo.'),
    q('Page ki sirf recommendations service down hai. Kya dikhao?', ['Sab feeds par error do','Har request ko roko','Har page par retry karo','Default feed dikhao'],3,'Optional recommendations par chhota timeout rakho. Pehle se bana feed dikh sakta hai. Isse ek dependency ki dikkat poore homepage ko block nahi karti.'),
    q('Marker ko chaar ghante baad hata diya. Do din baad manual replay hua. Kya risk hai?', ['Wahi usage phir ginega','Queue khud band hogi','Naya slot mil jaayega','Region badal jaayega'],0,'Marker mitne ke baad purana kaam naya lag sakta hai. Key ko poore replay window ke hisaab se rakho. DLQ mein rukne aur manual replay ka waqt bhi gino.'),
    q('Transient error par poori call chain mein retry kahan rakho?', ['Har layer par paanch','Ek chuni layer par','Har thread mein do','Har query par teen'],1,'Har layer apne retries chalaaye toh downstream attempts guna ho sakte hain. Ek jagah bounded retry, backoff aur deadline milkar load control karte hain.')]};
  const interview={title:'Design review · Kaam dobara mile toh?',instructions:'Chaar faisle lo. Phir v1 ka record bachakar v2 process karo.',questions:[
    q('Visibility timeout poora hua, pehla worker abhi chal raha hai. Kya ho sakta hai?', ['Message khud mit gaya','Table lock ho jaayegi','Do workers kaam lenge','Wahi worker hi milega'],2,'Visibility kisi write ka lock nahi hai. Message doosre worker ko mil sakta hai. Zaroorat par visibility badhao aur business write ko duplicate-safe rakho.'),
    q('Transaction ke cancel hone par marker ki condition ka result saaf nahi hai. Kya karo?', ['Har cancel ko ack do','Counter khud badhao','Purana marker mita do','Failure ki wajah padho'],3,'Har cancellation duplicate nahi hai. Marker ki condition aur saved payload milao. Counter failure ya conflict ko sirf duplicate maankar ack karne se kaam kho sakta hai.'),
    q('Doosre Region ki recovery drill mein kitna data kho sakte hain, kis target se milao?', ['RPO se data gap milao','RTO se data gap milao','TTL se data gap milao','DLQ se data gap milao'],0,'RPO data loss ki manzoor window hai. RTO service wapas laane ka time target hai. Drill mein dono ko alag naapna chahiye. Active-active design bhi guarantee nahi deta.'),
    q('DLQ ka bug fix ho gaya. Purani jobs phir bhejne par kya bachao?', ['Har job ka naya ID','Purani operation key','Purana receipt handle','Worker ka purana ARN'],1,'Replay par original business operation ID chahiye taaki committed writes do baar na gin jaayen. Chhote batch se shuru karo aur downstream ke slots dekho.'),
    {terminal:mission(true)}]};
  const step=(q,analogy,body,points,asli)=>({q,analogy,body:'<p>'+body+'</p>',points,asli});
  AG.registerLevels('architect',[{id:'resilience',icon:'🛡️',title:'PixShare ne 100 jobs ko 130 baar kyun gina?',badge:'Blast Radius Rakshak',
    objectives:['Retry waves ko timeline par padho.','Same operation ko redelivery aur producer resend par ek baar gino.','Worker ki limit aur DLQ se doosre kaam ko bachao.'],
    hook:{when:'PixShare story · Mahine ka usage review',title:'100 thumbnail jobs poore hue. Report mein 130 units hain.',
      text:'Photo p7 ban gayi thi. Worker ne usage likha par SQS ko delete bhejne se pehle ruk gaya. Doosre worker ko wahi photo mili. User ko ek thumbnail mila, bill mein do units jud gayin.',
      mission:'Retry ka waqt phailaao. Marker aur usage ko saath likho. Phir wahi write dobara karke dekho ki counter kitna hai.'},
    steps:[
      step('Timeout ke baad kya pata chalta hai?', 'Dukaan par receipt nahi mili. Payment ho bhi sakta hai.',
        'Timeout par caller ne intezaar chhoda. Pehli write phir bhi commit hui ho sakti hai. Standard SQS se message ek se zyada baar mil sakta hai.',
        ['Receipt handle har receive par milta hai. Delete latest handle se karo.','Producer same kaam dobara send kare toh naya MessageId bhi mil sakta hai.'], 'Tenant, photo aur version se business operation ko pehchaano. p7/v1 ki retry aur p7/v2 ki nayi edit alag hain.'),
      step('Sab retries ek saath kyun aati hain?', 'Stadium se sab gaadiyan ek hi gate par ek saath pahunchin.',
        'Ek hi timer ke baad retry karne par service lautte hi load ki wave aati hai. Backoff wait ki window badhaata hai. Jitter har client ke liye us window ke andar waqt chunta hai.',
        ['Board mein pehli window 4 s aur agli zyada se zyada 8 s hai.','Bina jitter t=4 par 12 calls ek saath aayi. Capacity 4 calls/s thi.'], 'Retry count aur poori request ki deadline dono rakho. Har layer alag retry kare toh total calls badh jaati hain.'),
      step('Do workers ek hi kaam utha lein toh?', 'Do cashiers ke paas ek hi coupon aaya. Register mein coupon aur discount saath likhe jaate hain.',
        'DynamoDB transaction mein pehle event item par conditional Put hai. Shart hai attribute_not_exists(pk). Doosra action alag total item par ADD karta hai. Dono commit hote hain ya koi nahi.',
        ['Sirf pehle GetItem karke phir +1 likhne mein do workers beech se nikal sakte hain.','Marker aur total alag writes mein bhi crash ka gap bachta hai.'], 'Duplicate tab maano jab marker ki condition hi fail hui aur saved input match karta hai. External payment ya email ko DynamoDB transaction apne andar nahi leti.'),
      step('Ack kab bhejna hai?', 'Parcel sign karne se pehle carton kholo. Galat carton alag rakho.',
        'Manual consumer durable write ke baad SQS message delete karta hai. Same payload pehle commit ho chuka ho toh bhi ack kar sakta hai. Permission error ya galat payload par success mat bhejo.',
        ['Lambda ki SQS mapping successful batch ke messages khud delete karti hai.','Batch mein ek record fail ho toh partial batch response configure karke sirf failed IDs lautaa sakte ho.'], 'Is worker mein batch size 1 aur timeout 10 s hai. Source visibility 60 s hai. AWS Lambda ke liye kam se kam chhah guna timeout aur batching window ka waqt plan karo.'),
      step('Worker fail ho toh baaki users ko kaise bachao?', 'Workshop mein chaar benches hain. Saari benches ek customer ko dene se doosre orders rukte hain.',
        'Reserved concurrency function ke liye slots alag rakhti hai aur uska maximum bhi tay karti hai. PixShare worker ki 4 invocations aur har invocation mein ek downstream call hai.',
        ['Source ki redrive policy maxReceiveCount 5 ke baad fail hua message DLQ bhej sakti hai.','DLQ retention source se lambi rakho. Standard queue mein original enqueue time expiry ke liye maayne rakhta hai.'], 'Worker timeout, queue age, DLQ aur healthy feed ki latency saath dekho. Limit ghatane se downstream bachta hai par backlog badh sakta hai.'),
      step('Ek feature ya ek AZ jaaye toh kitna asar pade?', 'Lift band hai. Seedhi khuli hai toh baaki building chal sakti hai.',
        'Blast radius matlab failure kitne users ya features tak pahuncha. Optional recommendations par timeout aur default feed rakho. AZ failure ke liye doosri AZ mein kaafi healthy capacity chahiye.',
        ['Multi-AZ failover aur poore Region ka recovery plan alag drills hain.','RTO downtime ka target hai. RPO data loss ki time window hai.'], 'Backup restore, pilot light, warm standby aur active-active mein se drill ke natije aur budget ke hisaab se chuno. Har design ka recovery time test karo.'),
      step('Kitni der tak purani job ko yaad rakhna hai?', 'Refund ka record tab tak sambhaalo jab tak customer claim lekar wapas aa sakta hai.',
        'Key ko queue retry, DLQ retention aur manual replay ki sabse lambi allowed window tak rakho. DynamoDB TTL expired row ko baad mein hataata hai. Exact deletion ka timer mat maano.',
        ['Business key ke saath input ya uska hash rakho. Same key par badle input ka alert alag do.','10 minute ka DynamoDB transaction request token lambi business dedup window ki jagah nahi leta.'], 'Backlog kholne se pehle marker retention, downstream capacity aur replay rate check karo.')],
    myth:[{myth:'Jitter laga toh duplicate write ruk gayi.',sach:'Jitter retry ka waqt badalta hai. Business key aur atomic write counter bachaate hain.'},
      {myth:'Visibility timeout ek lock hai.',sach:'Do workers same message paa sakte hain. Handler ko dono attempts sambhaalne hain.'},
      {myth:'Har TransactionCanceledException successful duplicate hai.',sach:'Marker, payload aur cancel reason milao. Baaki failures ko dobara try karo ya review ke liye rakho.'}],
    playbook:{title:'Retry se pehle write ka result dekho',use:['Temporary timeout aur busy downstream par bounded retry.','Repeat ho sakti write par stable key.'],
      avoid:['Har layer mein kai retries.','Marker aur usage ki alag writes.'],how:['Source aur operation ID trace karo.','Marker aur total saath commit karo.','Success ke baad ack do.','Worker cap aur DLQ lagao.'],
      redflags:['Wahi ID par do increments','Recovery ke pehle second mein load spike','DLQ age badh rahi hai'],rule:'Duplicate ko pehchaano. Alag kaam, kharaab payload aur dependency failure ko alag sambhaalo.'},
    exam:[{cue:'Write ke baad response timeout',pick:'Stable operation key par retry'},{cue:'Sab clients ek saath retry',pick:'Capped backoff aur jitter'},
      {cue:'Marker aur total do alag items',pick:'DynamoDB transaction'},{cue:'Downstream par chaar slots',pick:'Worker cap aur har invocation ka parallel kaam'},
      {cue:'Repeated bad message',pick:'Source redrive aur DLQ'},{cue:'Optional service down',pick:'Default feed'},{cue:'Region recovery chahiye',pick:'RTO, RPO aur tested drill'}],
    stages:[dry,flow,decide,triage,mission(false),lab,quiz],interview,
    success:['Main retry wave mein peak dekh sakta hoon.','Main redelivery par ek hi usage write prove kar sakta hoon.','Main worker ki limit ko downstream slots se mila sakta hoon.'],
    homework:'<p>Lab 40 ke do totals aur cancel reasons milao. Optional apne AWS sandbox mein sirf test queue, DLQ aur on-demand table lo. Requests aur storage ka bill aa sakta hai. Test ke baad dono queues aur table hatao.</p>',
    cards:[{front:'Timeout ka matlab write fail?',back:'Caller ko jawab nahi mila. Write commit ho chuki ho sakti hai.'},
      {front:'Receipt handle ya operation ID?',back:'Delete ke liye latest receipt handle. Usage ke liye stable operation ID.'},
      {front:'Marker likha par ADD fail?',back:'Ek transaction ho toh dono cancel. Alag writes par marker akela bach sakta hai.'},
      {front:'Jitter ka kaam?',back:'Retry ke waqt phailaana. Duplicate safety ke liye alag key chahiye.'},
      {front:'Reserved concurrency 4, har worker do calls?',back:'Chaar invocations ke andar aath downstream calls tak ho sakti hain.'},
      {front:'DLQ se purani job wapas aaye?',back:'Original operation key bachao aur marker ki retention milao.'},
      {front:'RTO aur RPO?',back:'Service wapas aane ka waqt aur manzoor data loss ki time window.'}]
  }]);
})();
