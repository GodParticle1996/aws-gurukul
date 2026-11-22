/* PixShare D4. The archive stores source envelopes. Rules shape target input on each delivery. */
(() => {
  const region='us-east-1', account='123456789012', bus='pix-uploads', archive='pix-history';
  const base='arn:aws:events:'+region+':'+account+':', busArn=base+'event-bus/'+bus;
  const ruleArn=base+'rule/'+bus+'/premium', archiveArn=base+'archive/'+archive;
  const queueArn=n=>'arn:aws:sqs:'+region+':'+account+':'+n;
  const roleArn='arn:aws:iam::'+account+':role/pix-pipe-role';
  const machineArn='arn:aws:states:'+region+':'+account+':stateMachine:pix-review-flow';
  const allUploads={source:['pixshare.app'],'detail-type':['PhotoUploaded']};
  const premium={...allUploads,detail:{tier:['premium']}};
  const transform={InputPathsMap:{upload:'$.detail.uploadId',tier:'$.detail.tier'}, InputTemplate:'{"uploadId":"<upload>","tier":"<tier>"}'};
  const dest={Arn:busArn,FilterArns:[ruleArn]}, targets=[{Id:'review',Arn:queueArn('pix-review'),InputTransformer:transform}];
  const params=field=>({SqsQueueParameters:{BatchSize:1}, FilterCriteria:{Filters:[{Pattern:JSON.stringify({[field]:{tier:['premium']}})}]}});
  const targetParams={StepFunctionStateMachineParameters:{InvocationType:'FIRE_AND_FORGET'}};
  const file=o=>({content:JSON.stringify(o,null,2)});
  const stamp=t=>'2026-11-22T12:'+t+':00Z';
  const rows=[['p7','premium','01'],['p8','basic','02'],['p9','premium','15']];
  const entries=rows.map(([uploadId,tier,t])=>({Source:'pixshare.app',DetailType:'PhotoUploaded',EventBusName:bus,Time:stamp(t),Detail:JSON.stringify({uploadId,tier})}));
  const files={'uploads.json':file(entries),'all.json':file(allUploads),'premium.json':file(premium),'target.json':file(targets),
    'source.json':file(params('body')),'workflow.json':file(targetParams),'replay.json':file(dest)};
  const makeQueue=name=>({name,arn:queueArn(name),url:'https://sqs.'+region+'.amazonaws.com/'+account+'/'+name,messages:[],
    policy:{Statement:[{Effect:'Allow',Principal:{Service:'events.amazonaws.com'},Action:'sqs:SendMessage',Resource:queueArn(name),Condition:{ArnEquals:{'aws:SourceArn':ruleArn}}}]}});
  function seed(){
    return {pixBridge:true,region,now:stamp('30'),callerIdentity:{Account:account},eventBuses:[],eventRules:[],archives:[],replays:[],pipes:[],
      stateMachines:[{name:'pix-review-flow',arn:machineArn,type:'STANDARD'}], queues:[makeQueue('pix-review'),makeQueue('pix-inbox')],
      roles:[{name:'pix-pipe-role',arn:roleArn,trustPolicy:{Statement:[{Effect:'Allow',Principal:{Service:'pipes.amazonaws.com'},Action:'sts:AssumeRole'}]},
        inline:{route:{Statement:[{Effect:'Allow',Action:['sqs:ReceiveMessage','sqs:DeleteMessage','sqs:GetQueueAttributes'],Resource:queueArn('pix-inbox')},
          {Effect:'Allow',Action:'states:StartExecution',Resource:machineArn}]}}}]};
  }
  const newBus='aws events create-event-bus --name '+bus;
  const newArchive='aws events create-archive --archive-name '+archive+' --event-source-arn '+busArn+' --event-pattern file://all.json --retention-days 7';
  const rule='aws events put-rule --name premium --event-bus-name '+bus+' --event-pattern file://premium.json';
  const attach='aws events put-targets --rule premium --event-bus-name '+bus+' --targets file://target.json';
  const pipeArgs=' --role-arn '+roleArn+' --source-parameters file://source.json --target-parameters file://workflow.json';
  const createPipe='aws pipes create-pipe --name pix-check --source '+queueArn('pix-inbox')+' --target '+machineArn+pipeArgs;
  const publish='aws events put-events --entries file://uploads.json';
  const replay='aws events start-replay --replay-name fix-review --event-source-arn '+archiveArn+' --event-start-time '+stamp('00')+' --event-end-time '+stamp('04')+' --destination file://replay.json';
  const describe='aws events describe-replay --replay-name fix-review';
  const solution=[newBus,newArchive,rule,attach,createPipe,publish,replay,describe];
  const findRule=s=>s.account.eventRules.find(r=>r.arn===ruleArn);
  const match=(pattern,tier,source='pixshare.app',type='PhotoUploaded')=>AG.eventPatternMatch(pattern,{source,'detail-type':type,detail:{tier}});
  function archiveReady(s){
    const b=s.account.eventBuses.find(x=>x.arn===busArn), a=s.account.archives.find(x=>x.arn===archiveArn);
    return !!(a?.pattern && b && a.busId===b.busId && a.days===7 && match(a.pattern,'basic') && match(a.pattern,'premium') &&
      !match(a.pattern,'premium','other') && !match(a.pattern,'basic','pixshare.app','PhotoDeleted') &&
      rows.every(([id,tier])=>a.records.some(row=>row.event.detail.uploadId===id && row.event.detail.tier===tier)));
  }
  function pipeReady(s){
    const p=s.account.pipes.find(p=>p.Name==='pix-check'), filters=p?.SourceParameters?.FilterCriteria?.Filters;
    if (!filters?.length || p.Source!==queueArn('pix-inbox') || p.Target!==machineArn || p.RoleArn!==roleArn || p.CurrentState!=='RUNNING' ||
        p.TargetParameters.StepFunctionStateMachineParameters.InvocationType!=='FIRE_AND_FORGET') return false;
    const accepts=e=>filters.some(f=>AG.eventPatternMatch(JSON.parse(f.Pattern),e));
    return accepts({body:{tier:'premium',uploadId:'future'}}) && !accepts({body:{tier:'basic'}}) && !accepts({detail:{tier:'premium'}});
  }
  function routeReady(s){
    const r=findRule(s), t=r?.targets.find(t=>t.Id==='review' && t.Arn===queueArn('pix-review'));
    if (r?.state!=='ENABLED' || !r.pattern || !t?.InputTransformer || !match(r.pattern,'premium') || match(r.pattern,'basic') ||
        match(r.pattern,'premium','other') || match(r.pattern,'premium','pixshare.app','PhotoDeleted')) return false;
    const out=AG.bridgeTemplate(t.InputTransformer,{detail:{uploadId:'a-fresh-upload',tier:'premium'}});
    return Object.keys(out).length===2 && out.uploadId==='a-fresh-upload' && out.tier==='premium';
  }
  function receipts(s,replayName){
    const r=findRule(s);
    if (!r) return [];
    return s.account.queues.find(q=>q.arn===queueArn('pix-review'))?.messages.filter(m=>
      m.provenance?.ruleId===r.ruleId && m.provenance.ruleRevision===r.revision && m.provenance.targetId==='review' &&
      m.provenance.replayName===replayName).map(m=>JSON.parse(m.body)) || [];
  }
  function liveReady(s){
    const deliveries=receipts(s,undefined);
    return routeReady(s) && ['p7','p9'].every(id=>deliveries.some(m=>m.uploadId===id && m.tier==='premium')) &&
      deliveries.every(m=>m.tier==='premium' && ['p7','p9'].includes(m.uploadId));
  }
  function replayReady(s){
    return s.account.replays.some(r=>{
      const msgs=receipts(s,r.ReplayName);
      return s.account.lastReplayRead===r.ReplayArn && s.account.archives.some(a=>a.id===r.archiveId && a.arn===archiveArn) && r.State==='COMPLETED' && r.EventSourceArn===archiveArn && r.Destination.Arn===busArn &&
        r.Destination.FilterArns?.length===1 && r.Destination.FilterArns[0]===ruleArn && Date.parse(r.EventStartTime)===Date.parse(stamp('00')) &&
        Date.parse(r.EventEndTime)===Date.parse(stamp('04')) && msgs.length>0 && msgs.every(m=>m.uploadId==='p7' && m.tier==='premium');
    });
  }
  const task=(text,check)=>({text,check});
  const tasks=[task('Saat din ke archive mein teen asli uploads hain',archiveReady),task('Premium rule se p7 aur p9 ke chhote JSON mile',liveReady),
    task('Inbox Pipe body.tier padhkar Standard workflow ko bhejne ke liye taiyaar hai',pipeReady),
    task('Replay ka COMPLETED status padha aur 12:00–12:04 UTC se sirf p7 phir mila',replayReady)];
  const terminal={type:'terminal',title:'Upload ka route banao aur p7 phir bhejo',
    instructions:'ls se files dekho. cat release.txt mein names aur time hain. JSON files ko file:// ke saath flags mein do.',
    goal:'Classic bus, saat din ka archive aur premium rule banao. Queue target par transformer lagao. Alag inbox se workflow ka Pipe jodo. Teen uploads bhejo. Chuni window se sirf premium rule ko replay karo. Phir replay ka status padho.',
    account:seed(),files:{...files,'release.txt':{content:'Bus pix-uploads, archive pix-history aur rule premium chahiye. Archive all.json se banao. Review queue ke liye target.json lagao. pix-check ka source pix-inbox aur target pix-review-flow hai. Pipe ko pix-pipe-role do. Replay 22 Nov 2026 ko 12:00–12:04 UTC tak premium rule ko chahiye. Queue aur role pehle se bane hain. Route theek karne ke baad naya replay naam le sakte ho.'}},
    tasks,solution,hints:['cat release.txt aur cat uploads.json padho.',...solution],success:AG.allOf(tasks),successText:'Live queue ko p7 aur p9 mile. Replay mein p7 phir mila. Inbox Pipe ki settings bhi ready hain. Dono raaston ke effects ko uploadId se sambhaalo.'};
  const broken=seed();
  broken.eventBuses.push({name:bus,arn:busArn,busId:'old-bus'});
  broken.eventRules.push({name:'premium',arn:ruleArn,bus,ruleId:'old-rule',state:'ENABLED',pattern:premium,targets:[],revision:1});
  broken.pipes.push({Name:'pix-check',Arn:'arn:aws:pipes:'+region+':'+account+':pipe/pix-check',CurrentState:'RUNNING',DesiredState:'RUNNING',
    Source:queueArn('pix-inbox'),Target:machineArn,RoleArn:roleArn,SourceParameters:params('detail'),TargetParameters:targetParams});
  const repair=[attach,'aws pipes update-pipe --name pix-check'+pipeArgs,publish];
  const ivTasks=[task('Purane premium rule par queue aur transformer sahi hain',s=>findRule(s)?.ruleId==='old-rule' && routeReady(s)),
    task('Purana inbox Pipe premium SQS body ko match karta hai',pipeReady),task('Naye test mein review queue ko p7 aur p9 mile',liveReady)];
  const ivTerm={title:'Premium review band hai. Dono routes theek karo.',goal:'Purane premium rule par review target lagao. Usi pix-check Pipe ka filter theek karo. Teen test uploads bhejo aur review delivery dekho.',
    instructions:'Bus pix-uploads hai. list-targets-by-rule aur describe-pipe se shuru karo. source.json mein SQS filter hai. workflow.json Standard workflow ki settings deta hai.',
    account:broken,files,tasks:ivTasks,solution:repair,hints:repair,success:AG.allOf(ivTasks),successText:'Premium rule se do uploads gaye. Pipe ne sahi body filter liya.'};

  const q=(q,choices,answer,explain,domain='resilient')=>({q,choices,answer,explain,domain});
  const dry={type:'dryrun',title:'Ek premium upload kahan jaata hai?',goal:'Pehle live copies gino. Phir sirf review rule ko replay karo.',
    intro:'PixShare story · Audit ko har upload chahiye. Review sirf premium photos dekhta hai. Asha ka p7 premium hai. Dev ka p8 basic hai.',
    nodes:[{id:'bus',label:'Classic bus',x:120,y:190},{id:'audit',label:'Audit rule',x:640,y:60},{id:'review',label:'Review rule',x:640,y:205},{id:'archive',label:'Archive',x:420,y:355}],
    edges:[{from:'bus',to:'audit'},{from:'bus',to:'review'},{from:'bus',to:'archive'},{from:'archive',to:'bus'}],
    panels:[{id:'route',title:'Kaunsa event gaya?'},{id:'worker',title:'Worker ka hisaab'}],steps:[
      {say:'Do uploads aaye. Audit rule dono leta hai. Review rule tier premium dekhta hai. Archive dono envelopes ki copy rakhta hai.',
        flows:[{from:'bus',to:'audit'},{from:'bus',to:'review'},{from:'bus',to:'archive'}],panels:{route:['Audit: p7, p8','Review: p7'],worker:['Archive: p7, p8']},
        ask:q('p8 basic hai. Kaun p8 ki copy lega?', ['Audit rule aur upload archive','Review rule aur upload archive','Audit rule aur review worker','Review worker aur uski queue'],0,'Audit aur archive ka pattern har PhotoUploaded event leta hai. Review ke pattern mein premium bhi chahiye. Basic p8 review queue tak nahi jaata.')},
      {say:'Review worker ne p7 ka galat preview banaaya. Team ne code theek kiya. Audit worker pehle hi p7 aur p8 save kar chuka hai.',
        flows:[{from:'archive',to:'bus'},{from:'bus',to:'review'}],panels:{route:['Replay → original bus → chuna review rule'],worker:['Review ko p7 phir mila. Audit ka count wahi hai.']},
        ask:q('Sirf review ko p7 phir chahiye. Replay kahan bhejo?', ['Seedha review target ki queue ke ARN par','Usi bus par sirf review rule ko','Doosre bus ke audit rule par','Archive ke naye copy bus par'],1,'Classic archive ka replay apne source bus par jaata hai. Destination ke FilterArns mein review rule do. Rule apna pattern ab bhi jaanchta hai.')},
      {say:'Preview worker ko p7 dobara mila. Worker har call par ek credit kaat de toh Asha ka doosra credit bhi kat jaayega.',
        flows:[{from:'bus',to:'review'}],panels:{route:['Envelope mein replay-name hai'],worker:['Business key: uploadId=p7','Preview dobara banao. Pehle liya credit phir mat kaato.']},
        ask:q('Replay mein dobaara charge kaise roko?', ['Har replay ko naya payment maano','Delivery time se nayi key banao','Upload aur charge ek saath likho','Har rule ka retry band kar do'],2,'Stable uploadId se charge ko pehchaano. Ek transaction mein key pehli baar mile tabhi charge lagao. Preview phir ban sakta hai aur charge ek baar reh sakta hai.')}
    ],lesson:'Replay ki window, rule aur app ki business key teen alag faisle hain.'};
  const knob=(id,label,min,max,step,value,unit)=>({id,label,min,max,step,value,unit});
  const fits=k=>k.path===2 && k.replay===0 && k.enrich===1 && k.batch===5;
  const flow={type:'flowlab',title:'Das lakh events ka route aur kharcha chuno',
    goal:'Ek SQS inbox hai. 25% uploads ko lookup ke baad ek workflow tak bhejna hai. Replay nahi chahiye. Routing budget lagbhag $0.02 aur example time 35 ms tak hai.',
    scenario:'Route mein 0 SNS Standard, 1 Classic bus aur 2 Pipes hai. Har upload 2 KiB ka hai. SNS mein tier attribute par filter free hai. Bus par custom app events aate hain. Pipes ke matched batches poore bharte hain. Example time ek matched event ka hai. Laptop ya AWS ka measured time nahi hai.',
    knobs:[knob('path','Route · SNS / bus / Pipe',0,2,1,0,''),knob('replay','Archive aur ek full replay',0,1,1,0,''),
      knob('enrich','Customer lookup',0,1,1,0,''),knob('batch','Pipe batch mein matched events',1,5,1,1,'')],
    check:fits,model(k){
      const names=['SNS Standard','EventBridge Classic','SQS → Pipe'], price=[.50,1,.40*.25/k.batch];
      // One million 2 KiB events, budget 1 KiB stored per event for one month.
      const archiveCost=k.replay ? 1e6/1048576*(2*.10+.023)+1 : 0;
      const baseMs=[6,12,8], latency=baseMs[k.path]+(k.enrich?6:0)+(k.path===2?(k.batch-1)*5:0);
      const available=!k.replay || k.path===1, money=n=>'≈ $'+n.toFixed(2);
      return {readouts:[{label:'Chuna route',value:names[k.path]},{label:'SNS publish / 10 lakh',value:money(price[0])},
        {label:'Classic bus / 10 lakh',value:money(price[1]+archiveCost)},{label:'Pipe requests / 10 lakh',value:money(price[2])},
        {label:'Chune route ka model time',value:latency+' ms/event'},{label:'Chune route par archive',value:k.replay?(available?'Archive aur replay ka bill juda':'Classic archive alag chahiye'):'Archive band'}],
        verdict:{ok:fits(k),text:fits(k)?'2.5 lakh matches ÷ 5 = 50,000 requests. Pipe lagbhag $0.02 hai. Example time 34 ms/event hai.':
        !available?'SNS Standard aur is Pipe mein Classic archive nahi hai. Archive chahiye toh bus ka raasta dekho.':'Inbox, lookup, batch aur budget milao. SNS aur bus ko SQS padhne ke liye alag consumer chahiye.'}};
    },lesson:'US East ke paid example rates, ek account aur ek Region hain. Free tier, SQS, lookup, target, retries aur tax alag hain. Model mein matched events 10 ms ke gap par aate hain. Batch ki average extra wait aadhe batch ke gap jitni hai. Asli p95 waqt trace se naapo.'};
  const decide={type:'decide',title:'Decision Dojo · Bus, Pipe, topic ya Scheduler?',tree:'pixroutes',scenarios:4};
  const triage={type:'triage',title:'Pipe RUNNING hai. Premium job kahan gayi?',goal:'Pipe ka filter, incoming body aur workflow trace milao.',
    symptom:'PixShare story · Inbox mein p7 gaya. Pipe RUNNING hai. Queue phir khaali hai aur workflow ko p7 nahi mila.',
    commands:[{cmd:'aws pipes describe-pipe --name pix-check',out:'CurrentState=RUNNING\nSource=pix-inbox\nFilterCriteria pattern={"detail":{"tier":["premium"]}}\nTarget=pix-review-flow',
      clue:true,note:'Filter top-level detail dhoond raha hai. SQS message ke sample se path milao.'},
      {cmd:'cat captured-inbox.json',out:'{"messageId":"m7","body":"{\\"uploadId\\":\\"p7\\",\\"tier\\":\\"premium\\"}"}',clue:true,note:'SQS record ka payload body mein JSON hai. Pipe body ke andar tier match kar sakta hai.'},
      {cmd:'cat execution-report.txt',out:'Workflow starts for p7 = 0. Previous p6 completed.',clue:false,note:'Target ko p7 nahi mila. Sirf execution count se permission aur filter mein farak pata nahi chalta.'}],
    questions:[q('Premium upload match kyun nahi hua?', ['Pipe ka target ARN naya tha','Workflow ko batch bada chahiye','Inbox mein tier basic likha tha','Filter ne galat field padhi thi'],3,'Captured record mein premium tier SQS body ke andar hai. Pipe ka filter upar detail dhoondta hai. Pattern match na hone par Pipe SQS message hata deta hai.'),
      q('Filter theek hua. Purane p7 ko kaise test karo?', ['Bachi copy se naya test bhejo','Purani receipt se use phir lo','Pipe ki state phir RUNNING karo','Batch ki wait window badhao'],0,'Unmatched SQS message hat chuka hai. Producer ki bachi copy se wahi business ID lekar phir bhejo. Pehle se lage effects ko dobara lagne se bachao.')]};
  const lab={type:'docker',project:'36-event-bus-replay',title:'Lab 36 · Queue ki body aur replay khud padho',
    goal:'Premium aur audit rules ka output milao. Replay ki window aur Pipe ki settings padho.',
    why:'Saved resource aur actual delivery alag saboot hain. Moto ke live route aur replay ko ek hi sample par milao.',
    steps:[{text:'Repo root mein lab chalao.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/36-event-bus-replay/lab.py',expect:'Owned Moto loopback par khulta hai.'},
      {text:'Teen uploads ke baad review aur audit queue padho.',expect:'Review mein do chhote JSON aur audit mein teen events hain.'},
      {text:'Replay aur Pipe ka readback dekho.',expect:'Moto ke alag behavior ke saamne GAP aayega. Aakhir mein resources hatenge aur port band hoga.'}],
    observe:q('Kaunsa result live transformer ko check karta hai?', ['Pipe ki saved state RUNNING hai','Review queue ki chhoti JSON body','Bus ne event ID lauta di hai','Archive mein EventCount do dikhata hai'],1,'put-targets sirf settings rakhta hai. Queue se p7 aur p9 ke chhote JSON padhne par pata chalta hai ki live rule ne matching events ko badal kar bheja.')};
  const quiz={type:'quiz',bonus:true,title:'PixShare ke aath routing faisle',questions:[
    q('Premium aur basic dono audit mein jaayen. Sirf premium review mein jaaye. Kya lagao?', ['Ek queue par do polling workers','Ek Pipe par do alag targets','Ek bus par do matching rules','Ek workflow par do schedules'],2,'Har rule apna pattern dekhta hai. Premium dono rules ko match kar sakta hai. Basic sirf audit rule lega. Har rule par target bhi jodna padta hai.'),
    q('Pattern test true hai. list-targets-by-rule khaali hai. Agla kadam?', ['Archive ki retention badhao','Source event mein detail-type badlo','Rule par zyada retry rakho','Rule par target aur access do'],3,'Pattern match ka matlab event rule se guzra. put-targets se destination jodo aur uske access ko check karo. Phir test event bhej kar delivery dekho.'),
    q('Roz subah 3 baje Toronto time par safai chahiye. Kya chuno?', ['Scheduler par cron aur timezone','Pipe ke batch ka wait time','Bus rule par upload ka time','SNS filter mein ghante ka naam'],0,'Scheduler mein cron aur America/Toronto do. Local clock aur daylight saving ko Scheduler sambhaalta hai. Target ko invoke karne ka role bhi chahiye.'),
    q('Ek subscription sirf premium SNS messages chahti hai. Pehle kya dekho?', ['Bus par naya schema version','SNS ki subscription filter policy','Pipe ke source ka batch size','Rule ke target ka transformer'],1,'SNS subscription attributes ya JSON body par filter laga sakti hai. Tier ko attribute ya body mein kahan bheja hai, FilterPolicyScope se milao.'),
    q('Replay ko original upload order mein dekhna zaroori hai. Worker kya jaanche?', ['Queue ka display name dekhe','ARN se bhejne ka order gino','Upload ki saved revision dekhe','Event aane ka timestamp order maane'],2,'Classic replay exact order ki guarantee nahi deta. Worker business key aur version dekhe taaki purani revision nayi photo ko overwrite na kare.'),
    q('Lookup ke liye customer DB se fresh data chahiye. Pipe par kya jodein?', ['Archive retention badhaayein','Target par ARN filter lagaayein','Schedule ka timezone badlein','Enrichment ke liye Lambda jodein'],3,'Pipe ka filter record ko chunta hai. Customer DB padhe bina naya data nahi milega. Enrichment ka output target ke input se milao aur uska kharcha gino.'),
    q('Schema registry mein PhotoUploaded ka schema mila. Producer ki jaanch kaun kare?', ['Producer apna payload check kare','Registry har put ko rok degi','Archive JSON ko theek karega','Pipe standard tier jod dega'],0,'Registry schema dhoondne aur code bindings ke kaam aati hai. Producer apne contract ka test kare. Naye field par purane consumer ka behavior bhi dekho.'),
    q('Standard workflow ko Pipe se shuru karna hai. Kaunsa mode chuno?', ['Workflow ka sync request mode','Async FIRE_AND_FORGET mode','Archive ka filtered replay mode','Source ka long-poll wait mode'],1,'Standard workflow Pipe ka async target hai. Start ki acceptance milne ke baad final execution status aur business result alag se dekhna padta hai.')]};
  const interview={title:'Design review · Replay ke baad kis par kya asar pada?',instructions:'Chaar sawaal ke baad do kharaab routes theek karo.',questions:[
    q('Replay ne queue ko p7 phir diya. Stable key kaunsi rakho?', ['Replay ke request ka time','Har receipt ka naya handle','Upload ka business ID p7','Har delivery ka naya count'],2,'Replay aur redelivery mein transport ki details badal sakti hain. Stable uploadId ko charge ke saath save karke ek hi upload ka dohra charge roko.'),
    q('Pipe ko SQS padhne ka access hai, par Standard workflow start fail hai. Kya jaancho?', ['Bus ki policy par PutEvents dekho','Topic par Publish ka access dekho','Queue ki policy mein purge dekho','Pipe role par StartExecution dekho'],3,'Pipe ke role ko Pipes par trust aur target workflow ARN par states:StartExecution chahiye. Inbox se read ka access alag permission hai.','secure'),
    q('Archive ab chalu kiya. Kal ka upload phir chahiye. Kahan dekho?', ['Kal ki bachi producer copy mein','Archive ki aaj ki count list mein','Pipe ki nayi polling window mein','Target ki nayi queue policy mein'],0,'Archive active hone ke baad matching events ki copy rakhta hai. Kal ka event tab save nahi hua tha toh producer ki durable copy ya doosra backup dhoondo.'),
    q('SQS filter ke baad sirf 25% records bache. Pipe ka bill kaise gino?', ['Saare source polls ko jod kar','Matched batches aur unka size','Har rule ke targets gin kar','Workflow ki kul states gin kar'],1,'Pipe requests filtering ke baad count hoti hain. Matched records ka batch aur 64 KB chunks gino. Source, enrichment aur workflow ki fees alag hain.','cost'),{terminal:ivTerm}]};

  const step=(q,analogy,body,points,asli)=>({q,analogy,body:'<p>'+body+'</p>',points,asli});
  AG.registerLevels('architect',[{
    id:'eventbridge',icon:'🔔',title:'PixShare ka upload kis rule se kahan gaya?',badge:'Event Backbone Banane Wala',
    objectives:['Premium aur basic uploads ke routes alag banao.','Rule ka transformer aur SQS Pipe ka filter sahi jagah lagao.','Archive se sirf theek kiye worker ko replay do.'],
    hook:{when:'PixShare story · Sale ke baad photo review',title:'Audit ko teen uploads mile. Premium review ki queue khaali hai.',
      text:'Asha ka p7 premium hai. Audit mein p7 dikh raha hai. Review team ne naya rule bhi bana diya tha. Phir bhi kisi reviewer ko kaam nahi mila.',
      mission:'Ek upload ko rule se queue tak trace karo. Galat route theek karo. Phir purane uploads mein se sirf zaroori review dobara chalao.'},
    steps:[
      step('Upload kaun sunega?', 'Daak ghar har chitthi ki ek copy har counter par nahi bhejta. Chitthi ke kaam se counter chunta hai.',
        'PixShare ke app events Classic custom bus par aate hain. Audit rule source aur detail-type dekhta hai. Review rule detail.tier bhi dekhta hai. p7 premium hai toh dono rules match karte hain. p8 basic hai toh sirf audit.',
        ['AWS service events aam taur par default bus par aate hain. Supported SaaS integration ke liye partner event source aur partner bus dekho.', 'Lesson mein Classic bus aur uski rules API hai. Naya Custom Event Bus subscriptions, storage aur alag rates deta hai. AWS naye apps ke liye naya Custom Event Bus pehle dekhne ko kehta hai. PixShare ki purani rules Classic par hain.'],
        'Producer ne teen events bheje. PutEvents ke har entry ka result padho. Event ID milne ke baad target ki delivery bhi dekho.'),
      step('Rule match hai. Queue khaali kyun hai?', 'Address book mein Asha ka naam hai. Parcel bhejne ke liye delivery address bhi chahiye.',
        'put-rule pattern save karta hai. put-targets se queue aur transformer jodo. list-targets-by-rule ko sahi bus aur rule do. Queue ki policy mein events.amazonaws.com ko us rule ARN se SendMessage ka access chahiye.',
        ['Event bus par rule detail.tier padhta hai. InputPathsMap original event se uploadId aur tier leta hai. InputTemplate review queue ke liye chhota JSON banaata hai.','Positive sample ke saath ek basic upload bhi bhejo. Review queue mein do premium IDs aur audit mein teenon IDs milni chahiye.'],
        'Schema registry event ki shape aur code bindings dhoondne mein madad karti hai. Producer aur consumer ke tests mein purana aur naya payload bhi chalao.'),
      step('Doosri team ko sirf notification chahiye?', 'Ek hi khabar kai logon ko bhejni hai. Har team apni pasand ki khabar chun sakti hai.',
        'SNS Standard topic matching subscriptions ko push kar sakta hai. Subscription ka filter message attributes ya JSON body par lag sakta hai. PixShare agar sirf tier ke hisaab se alert bhej raha hai toh SNS bhi fit hai.',
        ['Kaafi alag producers, AWS ya partner events, kai rules aur chuni rule ko replay chahiye toh Classic bus ka route dekho.', 'Classic archive aur SNS FIFO topic ki opt-in archive/replay alag features hain. SNS Standard ka bill lagaakar FIFO replay ka vaada mat karo.'],
        'Ek hi account mein 10 lakh chhoti paid publishes ka SNS Standard API example lagbhag $0.50 hai. Subscription type aur payload filtering ko bill mein alag dekho.'),
      step('Ek inbox se ek workflow kaise jodein?', 'Queue mein order slips hain. Pehle sahi slip chuno, phir customer ka pata jodo, phir packing ko do.',
        'Pipe SQS ko poll karta hai. Filter source record padhta hai. JSON body mein tier ho toh body.tier match karo. Zaroorat ho toh enrichment Lambda se customer data jodo. Standard Step Functions workflow par FIRE_AND_FORGET rakho.',
        ['Pipe ka role pipes.amazonaws.com ko trust kare. Source par receive, delete aur queue attributes ka access do. Target par states:StartExecution do.','SQS se filter mein fail hua message hata diya jaata hai. Do teams ko alag copies chahiye toh ek hi queue par do competing Pipes lagaane se copies nahi milengi.'],
        'RUNNING Pipe dekh kar p7 poora hua mat maano. Captured body, filter, execution input aur final business result milao.'),
      step('Review code theek hua. Kya replay karein?', 'Camera roll mein original photo hai. Sirf kharaab preview dobara banao. Customer ko phir se invoice bhejne ki zaroorat nahi hai.',
        'Classic archive ko source bus aur pattern do. Saat din ka archive matching original events rakhta hai. Replay mein time window aur original bus do. FilterArns mein sirf review rule ka ARN rakho. Rule aaj ke pattern aur target se chalta hai.',
        ['EventBridge replay par replay-name jodta hai. Managed archive rule replay ki copy phir archive mein jaane se rokta hai. Exact event order ka vaada nahi hai.', 'AWS archive tak data pahunchne ke liye replay se pehle das minute rukne ko kehta hai. Archive count ko update hone mein 24 ghante tak lag sakte hain.'],
        'p7 ka preview dobara banao. Charge ya notification ko dobara lagne se rokne ke liye stable uploadId aur effect ek saath save karo.'),
      step('Das lakh uploads par route kitna mehenga aur kitna tez hai?', 'Sirf ek ticket ka rate kaafi nahi hai. Gino kitni tickets lagi aur har passenger kitni der ruka.',
        'US East example mein 2 KiB ke das lakh custom events Classic bus mein lagbhag $1 hain. Pipes par 25% pass aur batch size 5 par 50,000 requests hain. $0.40 per million par routing lagbhag $0.02 hai. Har batch 64 KB ke andar maana hai.',
        ['Calculator mein archive on ho toh poore das lakh events save hote hain aur ek full replay hota hai. Processing lagbhag $0.10/GB, storage $0.023/GB-month aur replay custom event rate par hai. Stored size ko example mein 1 KiB/event maana hai.', 'Trace model mein SNS 6 ms, Classic delivery 12 ms aur Pipe 8 ms se shuru hote hain. Lookup 6 ms jodta hai. Full batch 5 par average extra wait 20 ms hai. Kam traffic mein SQS batching window ke saath Pipe ko 20 seconds tak bhi lag sakte hain.'],
        'Latency ek event ka waqt hai. Das lakh se ms ko guna karke user ka wait mat batao. Publish, queue aur actual worker ke timestamps se p50 aur p95 naapo.'),
      step('Raat 3 baje safai kaun chalaaye?', 'Upload ke liye darwaaze ki ghanti suno. Raat ki safai ke liye alarm lagao.',
        'EventBridge Scheduler mein roz ka cron aur timezone do. Ek baar ke reminder ke liye at schedule hai. Flexible time window se kaam baant sakte ho. Exact minute ki zaroorat ho toh flexible window OFF rakho.',
        ['Scheduler ka apna execution role target ko invoke karta hai. Retry aur dead-letter queue se failed calls dekho.', 'Classic bus mein purane scheduled rules default bus par mil sakte hain. Naye schedule ke liye Scheduler chuno.'],
        'Toronto ke subah 3 baje ka kaam America/Toronto ke saath set karo. Scheduler ki precision ek minute hai. Target ki completion uske baad aati hai.')
    ],
    myth:[{myth:'Pattern true hai toh review ho gaya.',sach:'Target, access aur queue ka actual message dekho. Worker ka save uske baad hai.'},
      {myth:'Replay sab events ko usi order mein wapas dega.',sach:'Classic replay ki window aur rule chuno. Worker upload ki revision aur business ID dekhe.'},
      {myth:'SQS filter fail ho toh message inbox mein rahega.',sach:'Pipe unmatched SQS message hata deta hai. Repair ke baad bachi copy se dobara bhejo.'},
      {myth:'JSON body par filter ke liye hamesha bus chahiye.',sach:'SNS subscription bhi JSON body par filter kar sakti hai. Baaki routing aur replay ki zaroorat milao.'}],
    playbook:{title:'Missing upload ka raasta padho',use:['Kai independent rules aur archive ke liye Classic bus.','Ek queue se ek filtered workflow ke liye Pipe.'],
      avoid:['Time-based job ke liye upload event ka wait.','Replay par ek hi upload se do payments.'],
      how:['Producer ki ID aur event time lo.','Sahi bus, pattern aur target ka access dekho.','Queue ki actual body aur workflow execution padho.','Repair ke baad chhoti window aur sirf zaroori rule replay karo.'],
      redflags:['Pattern true par zero targets','SQS khaali par workflow starts zero','p7 par do charges'],
      rule:'Rule ko event ka sample do. Target ko pahunchi body dekho. Replay se pehle tay karo kaunsa effect phir chal sakta hai.'},
    exam:[{cue:'Ek queue se ek filtered workflow',pick:'EventBridge Pipe'},{cue:'AWS ya partner events ke kai routes',pick:'Event bus aur matching rules'},
      {cue:'SQS message mein JSON payload',pick:'Pipe filter mein body ke fields'},{cue:'Queue ke liye chhota naya JSON',pick:'Rule target ka InputTransformer'},
      {cue:'Bug fix ke baad ek hi consumer ko purane events',pick:'Classic archive aur replay par FilterArns'},
      {cue:'Ek baar ki date ya timezone wala cron',pick:'EventBridge Scheduler'},{cue:'Tier se notification chuno',pick:'SNS subscription filter bhi dekho'},
      {cue:'Event ki shape aur code bindings',pick:'Schema registry'}],
    stages:[dry,flow,decide,triage,terminal,lab,quiz],interview,
    success:['Main pattern aur target ko alag check kar sakta hoon.','Main SQS body se Pipe ka filter milaa sakta hoon.','Main replay ki window aur duplicate effect ko sambhaal sakta hoon.'],
    homework:'<p>Lab 36 mein p7, p8 aur p9 ke liye live delivery aur replay ki chaar columns banao. Har upload ke saamne audit aur review ki copies gino. Optional AWS sandbox mein apna Classic test bus, queue, rule aur saat din ka archive banao. Archive processing, storage, replay aur requests ka bill aa sakta hai. Apne target ko hatao, phir rule, archive, queue aur bus delete karo.</p>',
    cards:[{front:'Bus rule aur Pipe ka tier path?',back:'Bus envelope mein detail.tier hai. Is SQS message ka JSON body.tier deta hai.'},
      {front:'put-rule ke baad queue khaali hai. Pehla check?',back:'Sahi bus par list-targets-by-rule aur queue ki rule-scoped policy dekho.'},
      {front:'FilterArns mein kis type ka ARN hai?',back:'Original bus ke chune rule ka ARN. Queue aur archive ka ARN is list mein nahi aata.'},
      {front:'Ek failed worker ko hi replay kyun?',back:'Doosre workers pehle hi kaam kar chuke ho sakte hain. Unke side effects phir chal sakte hain.'},
      {front:'Unmatched SQS message ka kya hota hai?',back:'Pipe message hata deta hai. Doosri team ko apni copy chahiye toh alag queue rakho.'},
      {front:'2.5 lakh matches aur paanch records per batch?',back:'Poore chhote batches hon toh 50,000 Pipe requests. Target aur source ka bill alag hai.'},
      {front:'Roz Toronto time par safai?',back:'Scheduler par cron, timezone aur execution role do. Run ke baad target ka result padho.'}]
  }]);
})();
