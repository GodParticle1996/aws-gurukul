/* PixShare D3. Each edit has a stable identity and belongs to one photo. */
(() => {
  const region = 'us-east-1', acct = '123456789012';
  const topicName = 'pix-edits.fifo', topicArn = 'arn:aws:sns:' + region + ':' + acct + ':' + topicName;
  const names = ['pix-render.fifo','pix-feed.fifo'];
  const arn = n => 'arn:aws:sqs:' + region + ':' + acct + ':' + n;
  const url = n => 'https://sqs.' + region + '.amazonaws.com/' + acct + '/' + n;
  const policy = n => ({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' },
    Action: 'sqs:SendMessage', Resource: arn(n), Condition: { ArnEquals: { 'aws:SourceArn': topicArn } } }] });
  const edits = [['p7',1],['p8',1],['p7',2]].map(([photo,rev]) => ({ photo, rev, editId: photo + '-v' + rev }));
  const file = value => ({ content: JSON.stringify(value,null,2) });
  const files = { 'release.txt': { content: 'Topic pix-edits.fifo se pix-render.fifo aur pix-feed.fifo ko raw JSON chahiye. Dono queue files mein FIFO aur source topic ki policy hai. Har publish par photo ko group aur editId ko dedup ID do. p7-v1 ko p7-v2 se pehle bhejo. p8 alag photo hai. Analytics ke liye pix-activity stream ON_DEMAND mein ready honi chahiye.' },
    ...Object.fromEntries(names.map(n => [n + '.json', file({ FifoQueue: 'true', Policy: JSON.stringify(policy(n)) })])),
    ...Object.fromEntries(edits.map(e => [e.editId + '.json', file(e)])) };
  const seed = () => ({ pixMessaging: true, region, now: '2026-11-21T12:00:00Z', callerIdentity: { Account: acct },
    queues: [], topics: [], kinesisStreams: [] });
  const publish = e => 'aws sns publish --topic-arn ' + topicArn + ' --message file://' + e.editId +
    '.json --message-group-id ' + e.photo + ' --message-deduplication-id ' + e.editId;
  const commands = [
    'aws sns create-topic --name ' + topicName + ' --attributes FifoTopic=true',
    ...names.map(n => 'aws sqs create-queue --queue-name ' + n + ' --attributes file://' + n + '.json'),
    ...names.map(n => 'aws sns subscribe --topic-arn ' + topicArn + ' --protocol sqs --notification-endpoint ' +
      arn(n) + ' --attributes RawMessageDelivery=true'),
    ...edits.map(publish),
    'aws kinesis create-stream --stream-name pix-activity --stream-mode-details StreamMode=ON_DEMAND',
    'aws kinesis wait stream-exists --stream-name pix-activity'
  ];
  const queue = (s,n) => s.account.queues.find(q => q.arn === arn(n));
  const topic = s => s.account.topics.find(t => t.arn === topicArn);
  function scoped(s,n) {
    const q = queue(s,n), statements = q?.policy?.Statement || [], st = statements[0];
    return q?.isFifo === true && statements.length === 1 && st.Effect === 'Allow' &&
      st.Principal?.Service === 'sns.amazonaws.com' && Object.keys(st.Principal).length === 1 &&
      st.Action === 'sqs:SendMessage' && st.Resource === arn(n) && st.Condition?.ArnEquals?.['aws:SourceArn'] === topicArn;
  }
  function route(s,n) {
    const t = topic(s);
    return t?.attributes?.FifoTopic === 'true' && t.subscriptions.find(sub => sub.confirmed && sub.protocol === 'sqs' &&
      sub.endpoint === arn(n) && sub.attributes?.RawMessageDelivery === 'true' && !sub.attributes.FilterPolicy);
  }
  function delivered(s,n,wanted) {
    const sub = route(s,n), q = queue(s,n);
    if (!sub || !q || q.messages.length !== wanted.length || !scoped(s,n)) return false;
    // Only compare order inside each photo. SNS and SQS don't order different groups together.
    return [...new Set(wanted.map(e => e.photo))].every(photo => {
      const expected = wanted.filter(e => e.photo === photo);
      const rows = q.messages.filter(m => m.groupId === photo);
      return rows.length === expected.length && expected.every((e,i) => {
        const m = rows[i];
        let body;
        try { body = JSON.parse(m.body); } catch { return false; }
        return body?.photo === photo && body.rev === e.rev && body.editId === e.editId && m.deduplicationId === e.editId &&
          m.provenance?.topicId === topic(s).topicId && m.provenance.subscriptionArn === sub.subscriptionArn &&
          s.account.snsDeliveries?.some(d => d.status === 'delivered' && d.queueId === q.queueId &&
            d.publicationId === m.provenance.publicationId && d.messageId === m.messageId);
      });
    });
  }
  const tasks = [{ text: 'Dono FIFO queues sirf PixShare topic se SNS delivery leti hain', check: s => names.every(n => scoped(s,n)) },
    { text: 'FIFO topic ki dono queues par raw subscriptions hain', check: s => names.every(n => route(s,n)) },
    { text: 'Render aur feed mein p7 ki v1, v2 aur p8 ki v1 sahi photo groups mein mili', check: s => names.every(n => delivered(s,n,edits)) },
    { text: 'pix-activity stream ON_DEMAND aur ACTIVE hai', check: s => s.account.kinesisStreams.some(k => k.name === 'pix-activity' && k.mode === 'ON_DEMAND' && k.status === 'ACTIVE') }];
  const terminal = { type:'terminal', title:'Photo edits ke do raaste banao', instructions:'cat release.txt padho. Har queue ki JSON file mein policy hai. Teen edit files mein photo aur editId dekho.',
    goal:'FIFO topic aur do FIFO queues banao. Raw subscriptions jodo. Dono photo groups ki teen edits publish karo. Analytics ke liye on-demand stream banao aur ready hone tak ruko.',
    account:seed(), files, tasks, hints:['ls aur cat p7-v1.json se IDs padho.', ...commands], solution:commands, success:AG.allOf(tasks),
    successText:'Dono queues mein apni copies hain. p7 ka order bacha hai. Analytics stream ready hai. Alag readers se asli put aur replay Lab 35 mein dekho.' };

  const iv = seed(), feed = names[1], subArn = topicArn + ':11111111-1111-4111-8111-111111111135';
  iv.queues.push({ name:feed, arn:arn(feed), url:url(feed), isFifo:true, queueId:'existing-feed', attributes:{FifoQueue:'true'}, messages:[] });
  iv.topics.push({ name:topicName, arn:topicArn, topicId:'existing-edits', attributes:{FifoTopic:'true'}, subscriptions:[
    { subscriptionArn:subArn, endpoint:arn(feed), protocol:'sqs', confirmed:true, attributes:{RawMessageDelivery:'false'} }] });
  const ivEdits = [edits[0],edits[2]];
  const receive = 'aws sqs receive-message --queue-url ' + url(feed) + ' --max-number-of-messages 2 --message-system-attribute-names All';
  const ivCommands = ['aws sqs set-queue-attributes --queue-url ' + url(feed) + ' --attributes file://policy.json',
    'aws sns set-subscription-attributes --subscription-arn ' + subArn + ' --attribute-name RawMessageDelivery --attribute-value true',
    ...ivEdits.map(publish), receive];
  const ivTasks = [{ text:'Purani feed queue par sirf pix-edits.fifo ko bhejne ka access hai', check:s => queue(s,feed)?.queueId === 'existing-feed' && scoped(s,feed) },
    { text:'Purani subscription raw edit bhejti hai', check:s => route(s,feed)?.subscriptionArn === subArn },
    { text:'Worker ne p7 ki dono revisions sahi group aur raw body ke saath padhi hain', check:s => {
      const q = queue(s,feed);
      if (!delivered(s,feed,ivEdits)) return false;
      const read = s.account.messagingReads?.find(r => r.queueId === q.queueId && r.revision === q.revision);
      return read?.messages.length === 2 && read.messages.every((row,i) => row.Attributes?.MessageGroupId === 'p7' &&
        row.MessageId === q.messages[i].messageId && row.ReceiptHandle === q.messages[i].receiptHandle && row.Body === q.messages[i].body);
    } }];
  const ivTerm = { title:'Feed worker ko pehli edit dene se pehle route theek karo',
    instructions:'Feed queue ki policy khaali hai. Purani subscription envelope bhejti hai. Worker seedha edit JSON padhta hai.',
    goal:'cat incident.txt se subscription ARN dekho. Usi queue ki policy aur usi subscription ka raw mode theek karo. p7-v1 aur p7-v2 publish karo. Dono edits ek receive mein group IDs ke saath dekho.',
    account:iv, files:{'p7-v1.json':files['p7-v1.json'], 'p7-v2.json':files['p7-v2.json'],
      'policy.json':file({Policy:JSON.stringify(policy(feed))}), 'incident.txt':{content:'Feed ke liye subscription ARN hai ' + subArn + '\nWorker ki queue ka URL hai ' + url(feed)}},
    tasks:ivTasks, hints:ivCommands, solution:ivCommands, success:AG.allOf(ivTasks), successText:'Feed worker ko p7 ki do raw edits order mein mili. Save safal ho tabhi receipt se delete karo.' };

  const knob = (id,label,min,max,step,value,unit) => ({id,label,min,max,step,value,unit});
  const fits = k => k.groups === 8 && k.edits === 80 && k.records === 1500 && k.kib === 2;
  const flow = { type:'flowlab', title:'Edit workers aur analytics ka load naapo',
    goal:'80 edits/s aur analytics ke 1,500 records/s rakho. Har record 2 KiB ka hai. Itne hi active photo groups lo ki backlog badhna band ho.',
    scenario:'Model mein 16 workers hain. Ek edit 100 ms leti hai. Har active group ko barabar kaam milta hai. Analytics ka traffic alag hai. Provisioned Kinesis ka write budget 30 din ke liye hai. Keys shards mein barabar banti hain. Storage ke extra din, enhanced fan-out, transfer aur SQS/SNS alag hain.',
    knobs:[knob('groups','Alag active photos',1,16,1,1,' groups'),knob('edits','Aane wali edits',20,160,20,20,' edits/s'),
      knob('records','Analytics ki records',500,2000,500,500,'/s'),knob('kib','Ek poora record',1,4,1,1,' KiB')],
    check:fits, model(k) {
      const capacity = Math.min(k.groups,16) * 10, lag = Math.max(0,k.edits-capacity);
      const shards = Math.max(Math.ceil(k.records/1000),Math.ceil(k.records*k.kib/1024));
      const shardCost = shards * 720 * .015, puts = k.records * 30 * 86400 / 1e6 * .014;
      return {readouts:[{label:'FIFO worker capacity',value:capacity+' edits/s'}, {label:'Backlog badhega',value:lag+' edits/s'},
        {label:'Kam se kam write shards',value:String(shards)}, {label:'Shard-hours / 30 din',value:'≈ $'+shardCost.toFixed(2)},
        {label:'PUT units / 30 din',value:'≈ $'+puts.toFixed(2)}, {label:'Stream ka kul model',value:'≈ $'+(shardCost+puts).toFixed(2)}],
        verdict:{ok:fits(k),text:fits(k)?'8 photos × 10 edits/s = 80 edits/s. Analytics ke liye 3 write shards aur lagbhag $86.83 per 30 din.':'Sale ka rate aur record size rakho. Phir photo groups badha kar backlog dekho.'} };
    }, lesson:'Worker capacity ki limit par spare jagah zero hai. Production mein burst aur retry ke liye jagah rakho. Ek hot photo ko random groups mein baantne se order toot sakta hai.' };
  const q = (q,choices,answer,explain,domain='resilient') => ({q,choices,answer,explain,domain});

  const dry = { type:'dryrun', title:'Ek photo edit se render, feed aur report tak',
    goal:'Pehle copies gino. Phir p7 ka order aur analytics ka replay samjho.',
    intro:'PixShare story · Crop aur caption edits SNS par jaati hain. Render aur feed ke apne workers hain. Analytics publisher alag se views ko Kinesis mein likhta hai.',
    nodes:[{id:'sns',label:'SNS FIFO',icon:'📣',x:160,y:125},{id:'render',label:'Render FIFO',icon:'🎨',x:630,y:65},
      {id:'feed',label:'Feed FIFO',icon:'📰',x:630,y:200},{id:'stream',label:'Kinesis',icon:'🌊',x:160,y:365},{id:'reader',label:'Analytics',icon:'📊',x:630,y:365}],
    edges:[{from:'sns',to:'render'},{from:'sns',to:'feed'},{from:'stream',to:'reader'}],
    panels:[{id:'log',title:'Edit ya view ka raasta'},{id:'state',title:'Kya bacha hai?'}],
    steps:[
      {say:'Asha ne p7 par crop save kiya. Topic ne p7-v1 accept ki. Dono queue policies sahi hain. Render chal raha hai aur feed worker band hai.',
        flows:[{from:'sns',to:'render'},{from:'sns',to:'feed'}],panels:{log:['p7-v1 → render aur feed'],state:['Render ki copy process hui. Feed ki copy apni queue mein hai.']},
        ask:q('Feed worker wapas aaya. p7-v1 kahan se padhe?', ['Apni feed queue ki bachi copy se','Render queue ki delete receipt se','SNS topic ko poll karke padhe','Render worker ki memory se padhe'],0,
          'Dono subscriptions ko apni copy mili. Render ka delete sirf render queue par laga. Feed worker apni queue ki retention ke andar edit utha sakta hai.')},
      {say:'p7-v1 ka publish response kho gaya. Producer ne wahi dedup ID do minute baad bheji. Phir p8-v1 aur p7-v2 aayin. Har photo ka apna group hai.',
        flows:[{from:'sns',to:'render'},{from:'sns',to:'feed'}],panels:{log:['p7-v1 retry → pehchaani gayi','p7-v2 → p7 group'],state:['p7: v1 → v2','p8: v1 alag chal sakti hai']},
        ask:q('Kaunsa order worker ko rakhna hai?', ['p8 ka v1 sab edits ke baad ho','p7 ka v1 uske v2 se pehle ho','Har photo p7 ka wait kare','p7 ka v2 hamesha pehle chale'],1,
          'FIFO ek MessageGroupId ke andar order rakhti hai. Producer p7 revisions ko sahi order mein bheje aur worker same group ke batch ko usi order mein lagaaye.')},
      {say:'Dashboard ke code mein bug tha. Do ghante pehle ke view records ab bhi stream mein hain. Naya reader usi shard ka purana saved sequence jaanta hai.',
        flows:[{from:'stream',to:'reader',label:'Checkpoint se replay'}],panels:{log:['v1 ka sequence pehle poora hua'],state:['Records retained hain. Doosre reader ki progress alag hai.']},
        ask:q('Saved record ke turant baad se kaise padho?', ['LATEST se purane records padho','SQS par receipt ka waqt badhao','AFTER_SEQUENCE_NUMBER se padho','Topic ki subscription hata do'],2,
          'Usi shard ka aakhri saved sequence lekar AFTER_SEQUENCE_NUMBER chuno. Agla page NextShardIterator se milta hai. Record retention ke andar hona chahiye.')}
    ], lesson:'Fan-out ne har worker ko alag backlog diya. FIFO ne ek photo ka order rakha. Stream par doosra reader apni jagah se shuru hua.' };
  const decide = {type:'decide', title:'Decision Dojo · Queue, topic ya stream?', tree:'messaging', scenarios:4};
  const triage = {type:'triage', title:'Naya crop laga. Purana crop baad mein wapas aa gaya.',
    symptom:'PixShare story · Producer ne p7-v1 phir p7-v2 bheji. Worker log mein p7-v2 pehle save hui. Dono messages direct SQS par gaye.',
    goal:'Queue type aur worker trace se galti pakdo. Photo ka order bachane wala raasta chuno.',
    commands:[{cmd:'aws sqs get-queue-attributes --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/pix-edits --attribute-names All',
      out:'QueueArn = arn:aws:sqs:us-east-1:123456789012:pix-edits\nVisibilityTimeout = 30\nFifoQueue attribute absent',
      clue:true,note:'Naam par .fifo nahi hai. Standard queue mein delivery ka order badal sakta hai.'},
      {cmd:'cat edit-worker.log',out:'producer accepted: p7-v1 then p7-v2\nworker-2 saved p7-v2\nworker-1 saved p7-v1',
        clue:true,note:'Producer ne sahi order bheja tha. Do workers ka save order palat gaya.'},
      {cmd:'cat upload-probe.log',out:'S3 PutObject 200; photo p7 stored',clue:false,note:'Photo bytes save hue. Crop ka order message path par badla.'}],
    questions:[q('Trace mein p7 ka purana crop aakhir mein kyun laga?', ['Topic ki retry window band thi','Kinesis ka checkpoint kho gaya','S3 ne photo ki key badal di','Standard workers ne ulta save kiya'],3,
      'Queue standard hai aur do workers ne v2 phir v1 save ki. S3 upload safal tha. Producer ne v1 pehle bheji thi, par worker path ne order nahi bachaya.'),
      q('Agli release mein p7 ka order kaise bachao?', ['FIFO lo, photo ID ko group banao','Wahi queue ka polling time badhao','Har edit ko naya group ID de do','Render workers ki ginti dugni karo'],0,
        'Nayi FIFO queue banao. Producer ek photo ki revisions sahi order mein bheje. Worker same group ko serially save kare aur purani revision ko dobara na lagaaye.')]};
  const lab = {type:'docker',project:'35-fifo-ordering-fanout',title:'Lab 35 · Edit order aur replay apne laptop par dekho',
    goal:'Do FIFO queues ke paas apni copies dekho. Do Kinesis readers ko wahi records alag se padhao.',
    why:'Publish ka response delivery ka saboot nahi hai. Har queue mein body, group aur edit ID milao. Phir saved sequence se stream dobara padho.',
    steps:[{text:'Project root se Lab 35 chalao.',cmd:'./docker-labs/.venv/bin/python -I docker-labs/35-fifo-ordering-fanout/lab.py',expect:'Moto ka apna localhost port khulega.'},
      {text:'Dono FIFO queues ka output milao.',expect:'Chaar publish calls. Har queue mein p7 ki do aur p8 ki ek edit milegi.'},
      {text:'Stream ke do readers, checkpoint aur cleanup dekho.',expect:'Dono readers v1 aur v2 padhenge. v1 ke baad se shuru karne par v2 milegi. Port band hoga.'}],
    observe:q('Dono readers ko wahi v1 aur v2 kaise mili?', ['Pehle reader ne copy queue mein daali','Stream read se record delete nahi hua','Moto ne photo ka group ID hata diya','Worker ne v2 phir se publish kar di'],1,
      'Dono readers ne usi shard mein apna TRIM_HORIZON iterator liya. Pehle reader ki read ne record nahi mitaaya. Record abhi retention window mein tha.')};
  const quiz = {type:'quiz',bonus:true,title:'PixShare ke aath messaging faisle',questions:[
    q('Topic ki delivery SQS policy par fail hui. Aise failed sends ki copy kahan rakhein?', ['Feed worker ki local disk par','Source queue ki receive DLQ mein','SNS subscription ki DLQ mein','Kinesis ke reader checkpoint par'],2,
      'Subscription par redrive policy aur SQS DLQ laga sakte ho. SNS ko DLQ par send ka access bhi chahiye. Worker ki DLQ tab kaam aati hai jab source queue se receive ho.'),
    q('Worker ne DB mein edit save ki. Delete se pehle crash hua. Redelivery par kya kare?', ['Har retry ko nayi edit ID de','Receipt ID ko edit ID maane','Pehle message delete kar de','Saved edit ID ko pehle jaanche'],3,
      'Worker save ke baad crash ho sakta hai. Edit ID aur applied version ko business update ke saath atomic tareeke se rakhne par dobara aayi edit pehchaan sakte ho.'),
    q('SNS FIFO topic se standard SQS queue judi hai. Order ki shart ho toh kya karo?', ['Target par bhi FIFO queue chuno','Sirf topic par dedup chalu karo','Queue ka poll thoda lamba karo','Har retry par group ID badal do'],0,
      'SNS FIFO topic standard queue ko bhej sakta hai. Standard queue sakht order nahi deti. End-to-end order ke liye FIFO queue aur serial per-group worker chahiye.'),
    q('Worker ko sirf ek image resize job chahiye. Replay aur fan-out ki shart nahi. Kya chune?', ['Har image ki Kinesis stream','Workers ki ek SQS queue','Har image ka SNS FIFO topic','Step Functions ka lamba wait'],1,
      'Ek queue competing workers ko jobs deti hai aur spike ko buffer karti hai. Resize ko idempotent rakho taaki repeated delivery par extra output na bane.'),
    q('Ek photo ke 100 edits/s hain. Serial worker sirf 10/s leta hai. Kya pehle naapo?', ['Sab queues ka mila hua backlog','Topic mein subscribers kitne hain','Us photo ka serial save time','Sabhi photos ka average wait time'],2,
      'Alag photos parallel chal sakti hain. Ek hot photo ka serial kaam phir bhi ek group mein hai. Worker ka kaam kam karna ya edit contract badalna padega.','performance'),
    q('Photo approve, payment hold, phir publish. Failure par hold chhodne ka step chahiye. Kya lo?', ['SQS queue ka lamba poll','SNS ke do body filters','Stream ki zyada retention','Step Functions ka workflow'],3,
      'Step Functions mein steps, retry aur Catch ka raasta likh sakte ho. Payment hold chhodne ka action app ko banana hai. Rollback apne aap nahi hota.'),
    q('Naya Kinesis reader sirf ab se aane wale views chahta hai. Kaunsi shuruaat hai?', ['LATEST se naya iterator lo','TRIM_HORIZON se shuru karo','Pehli receipt se shuru karo','Purana sequence phir se do'],0,
      'LATEST stream ke naye sire se shuru karta hai. Purane retained views ke liye TRIM_HORIZON, time ya sequence ke hisaab se iterator chuno.'),
    q('Team ka ActiveMQ app JMS client use karta hai. Kam badlaav ke saath AWS par kya dekho?', ['Kinesis ka shard iterator','Amazon MQ ka ActiveMQ broker','SNS ka HTTP subscription','SQS ka standard queue API'],1,
      'Amazon MQ ka ActiveMQ engine purane broker clients ke liye fit ho sakta hai. Client version, protocol aur failover ko migration test mein milao.')
  ]};
  const interview = {title:'Design review · Edit kho gayi ya worker ruka?',instructions:'Chaar sawaal ke baad feed queue ka access theek karo.',
    questions:[
      q('SNS publish safal hai. Feed queue khaali hai. Pehla delivery check kya hai?', ['Render queue ki sabse purani job dekho','Topic par publish count dekho','Subscription aur queue policy dekho','Feed worker ki polling badhao'],2,
        'Publish response topic ki acceptance dikhata hai. Feed subscription ka endpoint, filter aur queue ki SourceArn policy dekho. Delivery failure ka metric aur log milao.','secure'),
      q('Analytics ko saat din purane views phir chahiye. Abhi sirf 24 ghante retention hai. Kya kaam karega?', ['Ab TRIM_HORIZON se phir padho','Ab saat din pehle ka iterator lo','Ab stream ki retention saat din karo','Pehle se bachi archive copy padho'],3,
        'Retention badhaane se pehle expire ho chuke records wapas nahi aate. Bachi archive copy use karo aur aage ke replay ke liye retention pehle set karo.'),
      q('Ek shard par hot key hai. Doosre shards khaali hain. Kya jaancho?', ['Har partition key ka write rate','Poore stream ka average load','Reader ke batch ka record count','Retained records ki kul ginti'],0,
        'Kinesis user partition key wale stream mein key shard tak le jaati hai. Kul capacity kaafi hone par bhi ek hot shard throttle kar sakta hai.','performance'),
      q('Retry ne wahi crop do minute baad bheja. Producer kaunsi IDs phir bheje?', ['Har retry ka naya dedup number','Photo group aur wahi edit dedup ID','Har attempt ka naya group number','Poore topic ka ek hi edit number'],1,
        'Wahi logical edit ho toh usi photo group aur dedup ID se retry karo. Paanch minute ki window ke baad consumer ko apni saved edit ID se bhi duplicate rokna hai.'),{terminal:ivTerm}]};

  const card = (q, analogy, body, points, asli) => ({q, analogy, body:'<p>' + body + '</p>', points, asli});
  AG.registerLevels('architect', [{
    id:'messaging', icon:'📨', title:'PixShare ki edits kaun padhega, kis order mein?', badge:'Decoupling Darvesh',
    objectives:['Ek job aur do alag copies ke liye sahi queue chuno.', 'Har photo ka edit order aur retry sambhaalo.', 'Analytics ka purana data padho aur stream ka kharcha gino.'],
    hook:{when:'PixShare story · Asha ne apni photo crop ki', title:'Naya crop laga. Phir purana crop wapas aa gaya.',
      text:'Photo upload ke waqt notification provider dheema tha. Asha ko aath second rukna pada. Team ne kaam background mein bheja. Ab feed aur thumbnail kabhi alag crop dikhaate hain.',
      mission:'Upload ko jaldi jawaab do. Render aur feed dono ko har edit pahunchao. Dono workers ko ek photo ki revisions sahi order mein milni chahiye.'},
    steps:[
      card('Upload API kab jawaab de?', 'Restaurant ka counter order likh kar slip deta hai. Har dish banne tak line nahi rokta.',
        'Photo save karo. Edit aur use bhejne ka kaam ek hi DB transaction mein likho. Is pending list ko outbox kehte hain. Publisher baad mein edit uthakar bhejta hai. Tab upload API bata sakti hai ki kaam accept ho gaya.',
        ['Ek thumbnail job ko koi bhi ek worker utha sakta hai. SQS Standard us spike ko queue mein rakh sakti hai.', 'Ek hi queue ko render aur feed dono poll karenge toh koi ek worker message utha lega. Dono ko har edit chahiye toh do queues rakho.'],
        'Notification provider aath second le toh user ko upload ka jawaab phir bhi mil sakta hai. Queue ki sabse purani job ki umr dekho.'),
      card('Ek publish se do copies kaise jaayengi?', 'Asha ka ek edit hai. Render ko pixels badalne hain. Feed ko nayi revision dikhani hai.',
        'SNS FIFO topic par publish karo. Render aur feed ki apni SQS FIFO queue subscribe karo. Dono par SNS ko SendMessage ka access do. Policy ko usi queue ARN aur source topic ARN tak rakho.',
        ['Default SNS body mein envelope hota hai. RawMessageDelivery on karne se worker ko seedha edit JSON milta hai.', 'SNS ka publish response aane par endpoint par delivery abhi baaki ho sakti hai. Subscription, filter, queue policy aur delivery metrics dekho.'],
        'Render queue se message delete hone par feed queue ki copy bachi rehti hai. Har worker apni speed se chal sakta hai.'),
      card('Har photo ka order kaise bachega?', 'p7 par pehle crop hua aur phir caption badla. p8 ki edit alag chal sakti hai.',
        'Producer p7-v1 ke baad p7-v2 bheje. Dono ka MessageGroupId p7 hai. Har nayi edit ka alag dedup ID hai. Usi edit ka publish retry ho toh usi ID aur group ko phir bhejo. FIFO ki dedup window paanch minute hai.',
        ['Ek hi group ki do edits ek batch mein mil sakti hain. Worker unhe usi order mein save kare. Doosra group saath chal sakta hai.', 'Sab photos ko ek group doge toh ek dheemi photo baaki sabko rokegi. Har edit ko random group doge toh ek photo ka order tootega.'],
        'FIFO p7 ki revisions ko khud sort nahi karti. Do writers hon toh app pehle revision number aur bhejne ka order tay kare.'),
      card('SNS aur worker ki failures kahan dekhein?', 'Ek envelope queue tak nahi pahuncha. Doosra queue mein hai par worker use padh nahi pa raha.',
        'SNS delivery fail ho toh retry endpoint aur error par depend karta hai. HTTP 429 aur 5xx par retry ho sakti hai. Galat queue policy ko theek karna padta hai. Subscription ki dead-letter queue (DLQ) undelivered messages rakh sakti hai. SNS ko us DLQ par bhi send access chahiye.',
        ['SQS worker message le toh visibility timeout ke dauran message doosre receive se chhipta hai. Save safal hone par receipt handle se delete karo. Lamba kaam ho toh visibility badhao.', 'Worker baar-baar receive karke fail ho toh source queue ki redrive policy us job ko worker DLQ tak le ja sakti hai. FIFO group se ek revision hataane par baad ki revisions aage chal sakti hain.'],
        'Save ke baad delete se pehle worker crash kare toh wohi edit dobara aa sakti hai. Edit ID aur version ko DB update ke saath ek hi transaction mein rakho.'),
      card('Kal ke views aaj phir kaise padhein?', 'Dashboard ka bug theek hua. Report ko subah ke views phir se ginne hain.',
        'Views Kinesis Data Streams mein likho. Reader har shard ka aakhri poora hua sequence save kare. Doosra reader apni jagah se padhta hai. Pehle reader ke padhne se record delete nahi hota. Default retention 24 ghante hai. Use pehle se 365 din tak badha sakte ho.',
        ['TRIM_HORIZON shard ka sabse purana bacha record deta hai. AFTER_SEQUENCE_NUMBER saved record ke baad shuru karta hai. Agle page ke liye NextShardIterator lo.', 'SNS FIFO par alag se archive chalu kar sakte ho. Uski retention 365 din tak hai. Replay subscription par hota hai. SQS se delete hui job worker wapas poll nahi kar sakta.'],
        'View ki partition key shard chunti hai. Ek hot key ek shard par load jama kar sakti hai. Poore stream mein sab photos ka ek order maan kar report mat likho.'),
      card('Groups aur shards ka hisaab kaise lagaayein?', 'Edit workers aur view analytics ke traffic alag gino. Ek group mein ek waqt par ek edit save hoti hai.',
        'Flowlab mein 16 workers hain. Ek worker ko ek edit par 100 ms lagte hain. Barabar load par aath groups lagbhag 80 edits/s lete hain. Analytics mein 1,500 records/s × 2 KiB lagbhag 2.93 MiB/s hai. Provisioned mode mein sustained writes ke liye har shard par 1,000 records/s aur 1 MiB/s dono limits dekho. Teen write shards lagenge.',
        ['US East (N. Virginia) ke example rates mein 720 ghante × 3 shards × $0.015 = $32.40. Har chhota record ek 25 KiB PUT unit leta hai. 30 din ke PUT units ka $0.014 per million par lagbhag $54.43 hai.', 'Lagbhag $86.83 ka model pehle 24 ghante ki retention aur barabar keys par hai. Read traffic bhi check karo. Zyada retention aur enhanced fan-out ka kharcha alag hai. Terminal mein on-demand mode hai. Uske rates alag hain.'],
        'Peak ke liye spare capacity rakho. On-demand mein bhi ek bahut busy key ya achaanak jump par throttles dekhna zaroori hai.'),
      card('Kai steps mein ek kaam fail ho toh kaun sambhaale?', 'Photo approve karo, payment hold karo, phir print bhejo. Print fail ho toh hold chhodna hai.',
        'Step Functions mein steps ka order, Retry aur Catch likho. Hold chhodne ke liye app ka apna action jodo. Sirf upload par alag reactions chahiye hon toh har subscriber apna kaam kar sakta hai.',
        ['EventBridge ki rule event ke fields dekh kar target chunti hai. Ek waqt ya schedule par job chahiye toh EventBridge Scheduler dekho.', 'Purani ActiveMQ ya RabbitMQ app shift karni hai toh Amazon MQ ka engine aur client protocol milao.'],
        'User ko har step ka status chahiye toh workflow dekho. Independent reactions ke logs mein ek hi edit ID rakho taaki route trace kar sako.')
    ],
    myth:[
      {myth:'Publish safal hai toh feed ne crop laga diya.',sach:'Topic ne edit accept ki hai. Subscription delivery aur worker ka DB save do alag checks hain.'},
      {myth:'FIFO ke baad worker ka save sirf ek baar hoga.',sach:'Paanch minute ki producer dedup aur worker ka DB save alag hain. Crash ke baad wahi edit phir mil sakti hai.'},
      {myth:'Har edit ko naya group dene se order aur speed dono milenge.',sach:'Ek photo ka group wahi rakho. Alag photo groups saath chal sakte hain.'},
      {myth:'Ek reader ke baad purane views khatam ho gaye.',sach:'Kinesis record retention tak bachta hai. Har reader ka apna checkpoint ho sakta hai.'}],
    playbook:{title:'Ek edit ki poori delivery dekho',use:['Ek job ko kisi ek worker se karaane ke liye SQS.', 'Har service ko copy dene ke liye SNS aur uski apni queue.'],
      avoid:['Payment ya crop ko har retry par dobara lagaana.', 'Ek shard ya photo group ko poore system ka order samajhna.'],
      how:['Photo aur edit ID likho.', 'Publish ke baad dono queues ki policy aur subscriptions dekho.', 'Worker ka save aur delete alag trace karo.', 'Replay ki umr aur har shard ka checkpoint padho.'],
      redflags:['Publish safal par feed queue khaali', 'Ek photo ka backlog badhta raha', 'Doosri baar payment ya purana crop laga'],
      rule:'Pehle tay karo ki ek job kaun karega, kis-kis ko copy chahiye aur kitni der baad replay karna hai.'},
    exam:[
      {cue:'Ek resize job, worker pool aur spike',pick:'SQS Standard'},
      {cue:'Render aur feed ko har edit ki copy',pick:'SNS topic aur har service ki SQS queue'},
      {cue:'Har photo ki revisions ka order',pick:'SNS FIFO se SQS FIFO, group mein photo ID'},
      {cue:'SNS endpoint delivery fail',pick:'Subscription DLQ aur delivery logs'},
      {cue:'Worker job baar-baar fail kare',pick:'Source queue ki redrive policy aur worker DLQ'},
      {cue:'Do readers ko purane views bhi chahiye',pick:'Kinesis Data Streams aur per-shard checkpoints'},
      {cue:'Fail hone par payment hold chhodna hai',pick:'Step Functions Catch aur app ka action'},
      {cue:'Purana JMS client aur ActiveMQ broker',pick:'Amazon MQ par protocol test karo'}],
    stages:[dry,flow,decide,triage,terminal,lab,quiz], interview,
    success:['Main ek job aur do independent copies ka farak dikha sakta hoon.', 'Main p7 ki do edits ko sahi order mein bhej sakta hoon.', 'Main saved sequence ke baad analytics phir chala sakta hoon.'],
    homework:'<p>Lab 35 mein p8 ki edit ko p7 ki dono edits ke baad bhej kar phir chalao. Dono queues mein har photo ka apna order milao. Optional AWS sandbox mein do chhoti FIFO queues aur ek FIFO topic se wahi test kar sakte ho. Requests aur data ka charge lag sakta hai. Kaam ke baad apni subscriptions, queues aur topic hatao.</p>',
    cards:[
      {front:'Ek queue par do workers ko har edit ki copy milegi?',back:'Dono workers jobs baantte hain. Har service ko copy chahiye toh uski apni subscribed queue do.'},
      {front:'p7 par crop aur caption ke liye kaunsi IDs?',back:'Dono ka group p7 hai. Crop aur caption ke alag edit IDs hain. Usi edit ke retry par wahi ID rakho.'},
      {front:'Publish safal par queue khaali ho toh?',back:'Endpoint, queue policy, filter, delivery logs aur subscription DLQ jaancho.'},
      {front:'Save ho gaya, receipt delete fail hui. Ab?',back:'Message phir mil sakta hai. Edit ID aur business update ek saath save karo.'},
      {front:'Ek hot photo ki queue sab workers kyun nahi baantte?',back:'Us photo ki revisions order mein lagni hain. Alag groups saath chal sakte hain.'},
      {front:'Kal ke views do readers ko kaise milenge?',back:'Retention ke andar har reader har shard ka apna iterator aur checkpoint use kare.'},
      {front:'1,500 records/s aur har record 2 KiB. Write shards kitne?',back:'Record rate ko do aur byte rate ko teen shards chahiye. Barabar keys par kam se kam teen lo.'}]
  }]);
})();
