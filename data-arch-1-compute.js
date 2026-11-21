/* Architect D1. PixShare's upload router already supports both video backends. */
(() => {
  const region = 'us-east-1', acct = '123456789012', family = 'pix-video', cluster = 'pix-media';
  const role = name => 'arn:aws:iam::' + acct + ':role/' + name;
  const image = acct + '.dkr.ecr.' + region + '.amazonaws.com/pix-video:v1';
  const digest = 'sha256:' + 'a'.repeat(64), subnet = 'subnet-03300001', sg = 'sg-03300001';
  const td = { family, requiresCompatibilities: ['FARGATE'], networkMode: 'awsvpc', cpu: '1024', memory: '2048',
    executionRoleArn: role('pix-pull'), taskRoleArn: role('pix-worker'), containerDefinitions: [{ name: 'video', image, essential: true }] };
  const net = { awsvpcConfiguration: { subnets: [subnet], securityGroups: [sg], assignPublicIp: 'DISABLED' } };
  const route = { Variables: { PHOTOS: 'pix-photos', VIDEO_BACKEND: 'ecs', VIDEO_TASK: 'pix-video:1' } };
  const file = o => ({ content: JSON.stringify(o, null, 2) });
  const files = { 'video.json': file(td), 'private-net.json': file(net), 'route.json': file(route),
    'release.txt': { content: 'Upload router ka code pehle se Lambda ya ECS chala sakta hai. VIDEO_BACKEND aur VIDEO_TASK route chunte hain. PHOTOS ko rakho. Router ki role ko RunTask aur PassRole ka access pehle se hai. Test job ke liye pix-media cluster mein pix-video:1 par client token TEST-video-33 do. Agar galat revision ban gayi toh sahi recipe register karo. Nayi revision 2 ke liye pix-video:2 aur TEST-video-33-r2 lo. Router ko bhi usi revision par set karo. Thumbnail ka tested profile 512 MB aur 15 second hai.' } };
  const fn = (name, memory, timeout) => ({ name, runtime: 'python3.12', handler: 'app.handler', memory, timeout, state: 'Active' });
  function seed() {
    return { region, containerMode: true, pixCompute: true, callerIdentity: { Account: acct, Arn: role('pix-release') },
      lambdas: [fn('pix-thumb',256,3), fn('old-video',1024,900), { ...fn('pix-router',256,5),
        environment: { Variables: { PHOTOS: 'pix-photos', VIDEO_BACKEND: 'lambda', VIDEO_TASK: 'old-video' } } }],
      iamRoles: [{ name: 'pix-pull', arn: role('pix-pull'), trust: 'ecs-tasks.amazonaws.com', grants: ['ecr-pull'] },
        { name: 'pix-worker', arn: role('pix-worker'), trust: 'ecs-tasks.amazonaws.com', grants: ['pix-media-rw'] }],
      ecrRepositories: [{ name: family, images: [{ digest, tags: ['v1'], arch: ['amd64'] }] }],
      ecsClusters: [{ name: cluster, arn: 'arn:aws:ecs:' + region + ':' + acct + ':cluster/' + cluster, capacityProviders: ['FARGATE'] }],
      taskDefinitions: [], containerTasks: [], subnets: [{ id: subnet, vpcId: 'vpc-pix', az: region + 'a' }],
      securityGroups: [{ id: sg, name: 'pix-worker', vpcId: 'vpc-pix', ingress: [] }],
      routeTables: [{ vpcId: 'vpc-pix', main: true, routes: [{ destination: '0.0.0.0/0', target: 'nat-pix' }] }],
      natGateways: [{ id: 'nat-pix', state: 'available' }] };
  }
  const lambda = (s, name) => s.account.lambdas.find(f => f.name === name);
  const refOf = d => family + ':' + d.revision;
  const arnOf = d => 'arn:aws:ecs:' + region + ':' + acct + ':task-definition/' + refOf(d);
  function workers(s) {
    return s.account.taskDefinitions.filter(d => {
      const c = d.containerDefinitions[0];
      return d.family === family && d.status === 'ACTIVE' && d.cpu === td.cpu && d.memory === td.memory &&
        d.taskRoleArn === td.taskRoleArn && d.executionRoleArn === td.executionRoleArn &&
        d.runtimePlatform?.cpuArchitecture !== 'ARM64' && c?.image === image && c.name === 'video';
    });
  }
  function tested(s, d) {
    // An unrelated task can run in this cluster. Count only this release's test job.
    const token = d.revision === 1 ? 'TEST-video-33' : 'TEST-video-33-r' + d.revision;
    const jobs = s.account.containerTasks.filter(t => t.cluster === cluster && t.clientToken === token);
    const t = jobs[0];
    return jobs.length === 1 && t.taskDefinition === arnOf(d) && t.imageDigest === digest && t.lastStatus === 'RUNNING' &&
      t.network.assignPublicIp === 'DISABLED' && t.subnet === subnet && t.network.securityGroups.includes(sg);
  }
  const thumbReady = s => {
    const f = lambda(s, 'pix-thumb');
    return f?.memory === 512 && f.timeout === 15 && !f.pendingConfig && f.handler === 'app.handler';
  };
  const tasks = [
    { text: 'Video worker ki active revision mein sahi image, CPU, memory aur dono roles hain', check: s => workers(s).length > 0 },
    { text: 'Test video ki ek Fargate task sahi subnet aur role ke saath chal rahi hai', check: s => workers(s).some(d => tested(s, d)) },
    { text: 'Naye videos tested ECS revision par jaayenge. Photo bucket ka naam bacha hai', check: s => {
      const f = lambda(s, 'pix-router'), v = f?.environment?.Variables;
      return !f?.pendingConfig && v?.PHOTOS === 'pix-photos' && v.VIDEO_BACKEND === 'ecs' &&
        workers(s).some(d => v.VIDEO_TASK === refOf(d) && tested(s, d));
    } },
    { text: 'Thumbnail Lambda ki 512 MB aur 15 second wali setting lag gayi hai', check: thumbReady }
  ];
  const tune = 'aws lambda update-function-configuration --function-name pix-thumb --memory-size 512 --timeout 15';
  const waitThumb = 'aws lambda wait function-updated-v2 --function-name pix-thumb';
  const commands = ['aws ecs register-task-definition --cli-input-json file://video.json',
    'aws ecs run-task --cluster pix-media --launch-type FARGATE --task-definition pix-video:1 --network-configuration file://private-net.json --client-token TEST-video-33',
    'aws lambda update-function-configuration --function-name pix-router --environment file://route.json',
    'aws lambda wait function-updated-v2 --function-name pix-router', tune, waitThumb];
  const terminal = { type: 'terminal', title: 'Video ka worker badlo. Photos ka raasta bachao.',
    instructions: 'cat release.txt se shuru karo. Teen JSON files mein worker, network aur naya route hai. Browser ka simulator settings aur task startup check karta hai.',
    goal: 'pix-video:1 register karo. pix-media mein private network par pehli test task chalao. Token TEST-video-33 se retry mein wahi task milegi. Phir pix-router ko route.json do aur pix-thumb ko 512 MB, 15 second par lao. Dono Lambda updates settle hone do.',
    files, account: seed(), tasks, solution: commands, hints: ['ls aur cat video.json se worker ki recipe dekho.', ...commands],
    success: AG.allOf(tasks), successText: 'Router ab nayi videos ke liye ECS chunta hai. Photos ab bhi Lambda par hain. Asli release mein output file aur failed jobs bhi check karo.' };
  const interviewSeed = seed();
  interviewSeed.lambdas[0].reservedConcurrency = 0;
  const ivTasks = [tasks[3], { text: 'Thumbnail workers ke liye 8 concurrent calls ka hissa rakha hai', check: s => lambda(s, 'pix-thumb')?.reservedConcurrency === 8 }];
  const ivCommands = [tune, waitThumb, 'aws lambda put-function-concurrency --function-name pix-thumb --reserved-concurrent-executions 8'];
  const ivTerm = { title: 'Photos ruk gayin, videos chal rahi hain', instructions: 'Incident ke baad thumbnail function par reserved concurrency 0 chhoot gayi. Thumbnail ka profile bhi purana hai.',
    goal: 'pix-thumb ko release profile do: 512 MB, 15 second. Update settle karo. Photo DB ke budget ke hisaab se 8 concurrent calls reserve karo.',
    account: interviewSeed, tasks: ivTasks, hints: ivCommands, solution: ivCommands, success: AG.allOf(ivTasks),
    successText: 'Ab 8 calls tak chal sakti hain. Reserved concurrency capacity ki limit rakhti hai. Pehli request ko warm rakhna alag setting hai.' };

  function costs(k) {
    const perRequest = .20 / 1e6 + (k.ms / 1000) * (k.mb / 1024) * .0000166667;
    const perRps = 30 * k.hours * 3600 * perRequest;
    const fargate = 720 * 3600 * (2 * .000011244 + 4 * .000001235);
    const ec2 = 720 * .096 * .70;
    return { lambda: k.rps * perRps, fargate, ec2, crossF: fargate / perRps, crossE: ec2 / perRps };
  }
  const fits = k => k.rps === 20 && k.ms === 200 && k.mb === 512 && costs(k).lambda > costs(k).fargate;
  const knob = (id, label, min, max, step, value, unit) => ({ id, label, min, max, step, value, unit });
  const flow = { type: 'flowlab', title: 'Lambda ka bill kab dono servers se aage niklega?',
    goal: 'Sale ke profile par 20 req/s, 200 ms aur 512 MB rakho. Traffic ke ghante badhao jab tak Lambda ka bill dono always-on options se zyada ho.',
    scenario: '30 din ka US East (N. Virginia) model hai. Chhoti request par ek x86 Lambda call hai. Duration mein billed startup bhi gino. Ek Linux Fargate task (2 vCPU, 4 GB) ya ek m5.large EC2 poore 720 ghante chalta hai. Dono ko 20 req/s tak ka load uthane layak maana hai. EC2 ke liye course ki quote list rate se 30% kam hai. Poora commitment use hota hai. Free tier, storage, network, load balancer, logs aur tax alag hain.',
    knobs: [knob('rps','Active waqt mein requests',1,20,1,1,' req/s'), knob('ms','Ek call ka billed time',100,400,100,100,' ms'),
      knob('mb','Lambda memory',256,1024,256,256,' MB'), knob('hours','Traffic roz kitni der?',6,24,6,6,' ghante')],
    check: fits, model(k) {
      const c = costs(k), usd = n => '≈ $' + n.toFixed(2);
      const cross = n => n.toFixed(2) + ' req/s' + (n > 20 ? ' (model ke 20 se upar)' : '');
      return { readouts: [{ label: 'Lambda / 30 din', value: usd(c.lambda) }, { label: 'Fargate / 30 din', value: usd(c.fargate) },
        { label: 'EC2 + plan / 30 din', value: usd(c.ec2) }, { label: 'Lambda = Fargate', value: cross(c.crossF) },
        { label: 'Lambda = EC2 + plan', value: cross(c.crossE) }],
        verdict: { ok: fits(k), text: fits(k) ? 'Dono baselines se Lambda mehengi hai. Ab barabar latency aur load par test karna hoga.' :
          'Sale ka profile set karo. Phir ghante badha kar dekho ki kaunsa bill badalta hai.' } };
    }, lesson: 'Per-request bill ko mahine ki requests se guna karo. Always-on bill ko ek active req/s ke mahine bhar ke bill se bhaag do. Jis rate par dono barabar hain, wahi crossover hai.' };
  const q = (q, choices, answer, explain, domain = 'performance') => ({ q, choices, answer, explain, domain });

  const nodes = [{ id: 'api', label: 'Upload API', icon: '📷', x: 125, y: 245 },
    { id: 'fn', label: 'Lambda', icon: '⚡', x: 680, y: 78 }, { id: 'task', label: 'Fargate', icon: '📦', x: 680, y: 245 },
    { id: 'vm', label: 'EC2', icon: '🖥️', x: 680, y: 410 }];
  const edges = ['fn','task','vm'].map(to => ({ from: 'api', to }));
  const dry = { type: 'dryrun', title: 'Ek upload API, teen raaste', goal: 'Ek hi chhoti request ka pehla jawaab, peak aur khaali waqt dekho.',
    intro: 'Teen alag test deployments hain. Har ek ko wahi traffic milta hai. Fargate ki ek healthy task aur EC2 ka ek healthy server pehle se chal raha hai. Lambda standard on-demand hai.',
    nodes, edges, panels: [{ id: 'fn', title: 'Lambda' }, { id: 'task', title: 'Fargate' }, { id: 'vm', title: 'EC2' }],
    steps: [
      { say: 'Subah ki pehli photo aayi. Lambda ke liye naya environment banana pada. Doosre dono par app pehle se ready thi.', flows: edges,
        panels: { fn: ['INIT + handler'], task: ['Ready task ne request li'], vm: ['Ready process ne request li'] },
        ask: q('Pehli request ka wait kaise jaanoge?', ['Cold aur warm calls alag naapo', 'Sirf image ka compressed size dekho', 'Poore din ki average latency hi dekho', 'Server ke uptime se latency nikaalo'],0,
          'Naya Lambda environment banne par setup ka waqt lag sakta hai. Cold aur warm requests alag naapne se pehli photo ka wait dikhta hai.') },
      { say: 'Sale shuru hui. Ek saath itne uploads aaye ki pehle se ready capacity bhar gayi.', flows: edges,
        panels: { fn: ['Naye environments, concurrency quota tak'], task: ['Scaling rule → image pull → ready'], vm: ['Scaling rule → instance boot → app ready'] },
        ask: q('Peak ke test mein kya dekho?', ['Har worker ki image ka download size dekho', 'Queue, throttles aur ready workers dekho', 'Pehli request ke status par test roko', 'Har option ka list price hi dekho'],1,
          'Ready worker aane se pehle requests ruk ya fail ho sakti hain. Queue ka wait, throttles aur DB ka load peak par saath mein naapo.','resilient') },
      { say: 'Raat mein traffic zero hua. Fargate service ek task rakhti hai. EC2 ka server bhi chalta hai.', flows: [],
        panels: { fn: ['Zero calls → request aur duration charge zero'], task: ['Running task ke CPU aur GB ka bill'], vm: ['Running instance ke ghanton ka bill'] },
        ask: q('Is raat ka compute bill kis par chalta rahega?', ['Sirf Lambda ki khaali capacity par', 'Teeno ke request count par hi', 'Running task aur EC2 server par', 'Sirf API ke upload count par'],2,
          'Is setup mein on-demand Lambda ko koi call nahi mili. Service ne ek task rakhi aur EC2 chalta raha, isliye dono ka time bill mein aaya.','cost') }
    ], lesson: 'Ek hi traffic trace chalao. Pehle jawaab ka wait, peak par fail requests aur khaali ghanton ka kharcha saath dekho.' };
  const decide = { type: 'decide', title: 'Decision Dojo · Kaam kahan chale?', tree: 'compute', scenarios: 4 };
  const triage = { type: 'triage', title: 'Video har baar ek hi jagah rukti hai', symptom: 'PixShare story · Rohit ki poori video local worker par 22 minute leti hai. Wahi input old-video par kai baar adhura chhoota. Photos ab bhi ban rahi hain.',
    goal: 'Do clues mila kar video ka fix chuno.',
    commands: [
      { cmd: 'aws lambda get-function-configuration --function-name old-video', out: 'Timeout: 900, MemorySize: 1024, State: Active', clue: true, note: 'old-video standard on-demand function hai. Poore 900 second pehle se mile hain.' },
      { cmd: 'aws logs filter-log-events --log-group-name /aws/lambda/old-video', out: 'job=clip-17 frame=8100/11880\nTask timed out after 900.00 seconds', clue: true, note: 'Video ka kuch kaam bacha tha jab function ki ghadi khatam hui.' },
      { cmd: 'aws lambda get-function-configuration --function-name pix-thumb', out: 'Timeout: 3, MemorySize: 256, State: Active', clue: false, note: 'pix-thumb photos banaati hai. Video doosri function par gayi thi.' }
    ], questions: [
      q('Video beech mein kyun ruki?', ['Photo worker ki memory bhar gayi', 'Image pull karte hi role fail hua', 'Upload ke waqt poori disk bhar gayi', 'Video call ke 900 second poore hue'],3,
        'Video function pehle hi 900 second par set hai. Log ne wahi timeout dikhaya aur bache frames bataye. Photo worker ki setting alag hai.'),
      q('Isi codec ke saath ek hi pass mein video poori karni hai. Kya badlo?', ['Job ID dekar Fargate task chalao', 'Isi call ka timeout 1320 second karo', 'Photo worker ki RAM dugni karo', 'Isi video ko har baar shuru se bhejo'],0,
        'Test mein isi input ne 22 minute liye. Ek standard on-demand Lambda call 15 minute tak chalti hai. Ek Fargate task poora pass le sakti hai.','resilient')
    ] };
  const lab = { type: 'docker', project: '33-compute-breakeven', title: 'Lab 33 · Ek photo, do workers',
    goal: 'Wahi handler Lambda ZIP aur ECS task ki recipe mein rakho. Dono se mili chhoti photo ke pixels milao.',
    why: 'Recipe save hona aur handler ka sahi pixels dena alag checks hain. Moto ki settings aur laptop ka output dono dekho.',
    steps: [{ text: 'Project root se Lab 33 chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/33-compute-breakeven/lab.py', expect: 'Moto ka apna port khulega. ZIP hash aur task revision milenge.' },
      { text: 'HOST CHECK mein chaar pixels aur cost table dekho.', expect: 'Dono handler forms ka output [[20, 100], [8, 5]] milega.' },
      { text: 'Aakhri do lines padho.', expect: 'Cleanup ki lists khaali hongi. Moto ka port band milega.' }],
    observe: q('Lab ke kis result se photo ka output pata chala?', ['Moto ne task ki revision dikhayi', 'Laptop par dono handlers ke pixels mile', 'Moto ne function ki memory lautayi', 'Calculator ne dono rate barabar kiye'],1,
      'Moto ne settings rakhi. Laptop ne ZIP wala code aur task mein save command ek hi photo par chalaye. Output milne ka saboot chaar pixels hain.') };
  const quiz = { type: 'quiz', bonus: true, title: 'PixShare ke aath compute faisle', questions: [
    q('Chhoti API ko roz sirf ek ghanta traffic milta hai. Bill ke hisaab mein kya badlo?', ['EC2 ka bill sirf ek ghanta rakho', 'Fargate ki capacity zero maan lo', 'Active waqt ko ek ghanta gino', 'Har call ko poore din mein failao'],2,
      'Requests active waqt mein aati hain. Ek ghante ka traffic maan kar Lambda ka bill niklega. Always-on options ke ghante phir bhi poore gino.','cost'),
    q('Video ke 600 jobs queue mein hain. Dependencies aur retry policy chahiye. Pehle kya dekho?', ['Lambda ka concurrency graph dekho', 'ECS service ka min count badhao', 'EC2 par sirf ek cron job rakho', 'AWS Batch ki job queue dekho'],3,
      'Batch queue se jobs uthata hai aur dependencies aur retries sambhal sakta hai. Spot chunne se pehle dekho adhura job kahan se phir chalega.','resilient'),
    q('GPU wala encoder ECS par chalana hai. Kaunsi capacity le sakte ho?', ['GPU wala EC2 instance group', 'Badi memory wali Fargate task', 'Lambda ki provisioned capacity', 'Fargate Spot ka doosra subnet'],0,
      'ECS task ko GPU dene ke liye supported GPU instance aur sahi driver chahiye. Fargate task ki memory badhaane se GPU nahi milta.'),
    q('App team code upload karegi. AWS web environment banaaye, team EC2 settings bhi dekh sake. Kya chune?', ['Amazon Lightsail instance', 'Elastic Beanstalk environment', 'AWS Batch job environment', 'Amazon EKS managed node group'],1,
      'Elastic Beanstalk app version deploy karta hai aur environment ke resources banata hai. Team zaroorat par EC2 aur scaling settings badal sakti hai.'),
    q('Ek chhota blog hai. Team ko VM, SSD aur transfer allowance ka monthly bundle chahiye. Kya chune?', ['Elastic Beanstalk web tier', 'ECS Fargate web service', 'Amazon Lightsail instance', 'AWS Batch compute queue'],2,
      'Lightsail instance plan mein machine, disk aur transfer allowance milte hain. Plan ki limit aur extra transfer ka kharcha phir bhi dekho.','cost'),
    q('Naya AWS customer App Runner jaisa managed web service setup chahta hai. AWS kis raaste ki taraf bhejta hai?', ['ECS Anywhere ka cluster', 'AWS Batch ka job group', 'Lambda ka extension layer', 'Amazon ECS Express Mode'],3,
      '30 April 2026 se App Runner naye customers ke liye band hai. AWS naye web services ke liye ECS Express Mode dekhne ko kehta hai.'),
    q('arm64 worker par kaunsa test pehle karo?', ['arm64 image aur codec se wahi video chalao', 'Bas task ki memory aur timeout dugne karo', 'Sirf x86 image ka compressed size dekho', 'Traffic ko doosri AZ mein bhej kar dekho'],0,
      'Graviton Arm CPU use karta hai. Image, codec aur libraries ko arm64 par chala kar dekho. Wahi output aur load par speed aur bill milao.'),
    q('Task image pull kar leti hai. Worker ko S3 output likhne par AccessDenied mila. Kahan dekho?', ['Image pull karne wali role par', 'App ki task role aur bucket policy par', 'Task ke CPU aur memory size par', 'Cluster ke min aur max task count par'],1,
      'ECS execution role image pull jaise startup kaam karti hai. Worker ke AWS calls task role se jaate hain. Bucket policy bhi write rok sakti hai.','secure')
  ] };
  const interview = { title: 'PixShare ka design review', instructions: 'Chaar choices ki wajah socho. Phir photo worker dobara chalao.',
    questions: [
      q('Billed time 400 se 200 ms hua. Memory 256 se 512 MB hui. Wahi request count hai. Is model mein kya badla?', ['Duration charge kareeb aadha hua', 'Duration charge kareeb dugna hua', 'GB-seconds kareeb utne hi rahe', 'Request charge kareeb dugna hua'],2,
        'Memory dugni aur billed time aadha hai. Dono ka product wahi hai. Isi rate aur request count par duration aur request charge barabar rahenge.','cost'),
      q('Spot worker beech mein ruk sakta hai. Mehengi video ka kaam kaise bachega?', ['Har retry par ek naya job ID banao', 'Notice par poori video phir se padho', 'Worker ki local disk par hi rakho', 'Poore chunks S3 par save karo'],3,
        'Poore chunks aur job ID worker se bahar save karo. Agla worker bache chunks se chale aur retry ek hi output dobara publish na kare.','resilient'),
      q('Poore saal ka plan kharidne se pehle kaunse ghante dekho?', ['Kam traffic mein bhi laga base load', 'Sale ke sabse mehenge do ghante', 'Sirf launch wale din ka bill dekho', 'Peak ke waqt ka ek hi CPU graph'],0,
        'Savings Plan mein har ghante ka kharcha commit karte hain. Kam traffic par bhi kitna kaam chalta hai, usse bache hue commitment ka risk dikhta hai.','cost'),
      q('Fargate task ka ARN mil gaya. User ko video ready kab dikhao?', ['Task ARN ko status table mein likhte hi', 'Final file jaanch kar job poori karo', 'Worker ki image pull hote hi', 'RunTask request accept hote hi'],1,
        'Task ARN startup ka record hai. Worker fail bhi ho sakta hai. Final object aur job status check karo, phir user ko ready link do.','resilient'), { terminal: ivTerm }
    ] };

  const card = (q, analogy, body, points, asli) => ({ q, analogy, body: '<p>' + body + '</p>', points, asli });
  AG.registerLevels('architect', [{
    id: 'compute', icon: '🖥️', title: 'PixShare ka code kahan chalega?', badge: 'Compute Chintak',
    objectives: ['Photo aur video ke liye alag worker chuno.', 'Traffic badal kar teen monthly bills aur unka crossover nikalo.', 'Video ka route badlo aur photo Lambda ko tune karo.'],
    hook: { when: 'PixShare story · Pehli creator sale', title: 'Photo aa gayi. Rohit ki video ab tak kahan hai?',
      text: 'Asha ek photo upload karti hai. Thumbnail pal bhar mein milta hai. Rohit ki video bhi upload ho jaati hai, par player khaali rehta hai. Log mein har koshish theek 900 second par rukti hai.',
      mission: 'Chhoti photo aur lambi video ko apna worker do. Sale ka load aur raat ke khaali ghante gin kar faisle ka bill dikhao.' },
    steps: [
      card('Service chunne se pehle kya poochein?', 'Photo booth mein ek print turant milta hai. Poora album baad mein lene aate hain.',
        'Upload ka jawaab aur media banaane ka kaam alag rakho. PixShare pehle file save karta hai aur job ID deta hai. Worker baad mein output likhta hai. Phone us ID se haal dekhta hai.',
        ['Ek photo aur sabse lambi video ka waqt alag naapo.', 'Peak req/s, roz ke active ghante aur user kitni der ruk sakta hai, likho.'], 'Ek hi upload button ke peeche do alag compute choices ho sakti hain.'),
      card('Thumbnail Lambda par kyun chale?', 'Chhoti ticket aaye tab counter khule. Pehli baar samaan lagaane mein thoda waqt lagta hai.',
        'S3 upload jaise event par chhota handler chal sakta hai. Standard on-demand Lambda mein ek call 900 second tak chalti hai. Naya environment banne par runtime aur app ko taiyaar karna padta hai. Agli call ko pehle se ready environment mil sakta hai.',
        ['Memory se CPU ka hissa bhi badhta hai. Wahi photo alag memory par chala kar billed time aur pixels dekho.', 'Reserved concurrency ek function ke liye calls ka hissa aur cap rakhti hai. Provisioned concurrency pehle se environments taiyaar rakhti hai aur uska alag charge hai.'], 'Average ke saath dheemi calls bhi dekho. Reserved concurrency 0 ho toh calls throttle hoti hain.'),
      card('Video ke 22 minute kaun lega?', 'Ek video editor ko ek project do. Kaam khatam ho toh uski shift bhi khatam.',
        'ECS ki task definition mein image, CPU, memory aur roles likho. RunTask ek alag task shuru karta hai. Fargate par AWS host sambhalta hai. Video bane toh worker band ho. Hamesha chalne wali API ke liye ECS service ready tasks ki ginti sambhaal sakti hai.',
        ['Private subnet se image registry tak raasta chahiye. Execution role image pull karti hai. Task role app ko output likhne ka access deti hai.', 'Retry mein wahi client token aur wahi settings bhejo. Ek hi job ka output do baar publish hone se app ko bhi bachana hai.'], 'RunTask ka jawaab milna aur playable video milna do alag pal hain.'),
      card('EC2, ECS on EC2 ya Batch kab?', 'Ek studio apni editing machine rakh sakta hai. Queue tay karti hai ki agla project kaun lega.',
        'GPU ya OS driver chahiye toh sahi EC2 machine dekho. Apne EC2 group par containers chalaane ke liye ECS lo. Hazaaron jobs ki queue, order aur retry sambhaalne ke liye AWS Batch ka scheduler dekho. Batch supported EC2 ya Fargate capacity par jobs chala sakta hai.',
        ['Kubernetes API aur Helm pehle se zaroori hain toh EKS dekho. ECS aur EKS ka chunav host ke chunav se alag hai.', 'Spot capacity wapas ja sakti hai. Job ID aur poore chunks bahar save karo. Arm/Graviton par image aur codec dobara test karo.'], 'Sasti machine par baar-baar shuru se video banaani pade toh poore job ka bill badh sakta hai.'),
      card('Do bills kis traffic par barabar honge?', 'Roz ki ticket aur mahine ka pass, dono ka hisaab kaam ke dinon par hai.',
        '30 din ke calculator mein requests = active req/s × 3600 × ghante/roz × 30. Approx rates lo. Har chhoti x86 call ke liye $0.20 per million ka request hissa aur $0.0000166667 per GB-second ka duration hissa lo. Memory MB ko 1024 se bhaag do. Billed ms ko 1000 se bhaag do.',
        ['US East ke model mein ek always-on Fargate task (2 vCPU, 4 GB) lagbhag $71.09 hai. Poora use hue plan ki example quote par m5.large lagbhag $48.38 hai.', '512 MB, 200 ms aur 24 ghante/roz par Lambda lagbhag 14.69 req/s par Fargate jitni, 10 req/s par EC2 jitni hai. Kam active ghanton par dono rate badhenge.'], 'Barabar latency aur capacity pehle test karo. DB, network, spare capacity aur team ka waqt alag se jodo.'),
      card('Chhoti web app ke exam clues kya hain?', 'Kisi ko sirf apni dukaan kholni hai. Kisi ko andar ki machine bhi apne hisaab se chahiye.',
        'Lightsail chhote blog ya site ke liye VM aur monthly bundle deta hai. Elastic Beanstalk app version se web environment banata hai. Team neeche ke EC2 resources bhi dekh sakti hai.',
        ['30 April 2026 se AWS App Runner naye customers ke liye band hai. Purane customers service use kar sakte hain.', 'Naye container web service ke liye AWS ECS Express Mode ki taraf bhejta hai. Region, access aur apne app ki needs jaancho.'], 'Question mein bundle, app deploy ya host control dekho. Teenon ke liye ek hi answer nahi hai.'),
      card('PixShare release ko pass kab bolo?', 'Naye editor ko pehle ek clip do. Studio ka board tabhi badlo jab clip chalti dikhe.',
        'Pehle worker ki revision aur test task dekho. Phir router ka video target badlo. Lambda ki environment settings poora map badalti hain. Photo bucket ki purani setting saath bhejo. Configuration update poora hone ke baad hi nayi settings padho.',
        ['Test photo ka thumbnail aur test video ka final object padho. Job ID aur retry ka result milao.', 'PixShare story ka trap: route badalte waqt photo bucket bhool gaye toh video ka fix photo uploads bhi tod dega.'], 'Galti par pehle se jaani hui worker revision ka route wapas lagao aur ek upload check karo.')
    ],
    myth: [
      { myth: 'Serverless hai toh poore mahine sabse sasta hoga.', sach: 'Bill requests, billed time aur memory se banta hai. Bahut khaali ghante aur lagataar traffic ke hisaab alag nikalte hain.' },
      { myth: 'Timeout 25 minute karne se Rohit ki video ban jaayegi.', sach: 'Standard on-demand Lambda par ek call ki limit 15 minute hai. Ek hi pass mein 22 minute lene wali video ko lamba worker do.' },
      { myth: 'Task ARN mil gaya toh video ready hai.', sach: 'Image pull ya worker baad mein fail ho sakta hai. Job status aur final output jaancho.' },
      { myth: 'Har image Graviton par seedhi chalegi.', sach: 'Arm64 build aur codec chahiye. Wahi input chala kar speed, bill aur output milao.' }
    ],
    playbook: { title: 'PixShare ke liye worker chuno', use: ['Chhota event aur khaali ghante hon toh Lambda naapo.', 'Lamba container job aur host sambhaalne ka waqt kam ho toh Fargate task dekho.'],
      avoid: ['GPU ko Fargate par rakhna.', 'Sirf container count dekh kar saal bhar ka plan lena.'],
      how: ['Do asli input sizes se time aur memory naapo.', 'Wahi load aur ready capacity rakh kar bills milao.', 'Test job aur retry chalao. Output milne par router badlo.'],
      redflags: ['900 second par adhura output', 'Task RUNNING par final file gayab', 'Raat mein bhi poora peak commitment'],
      rule: 'Worker chunne se pehle ek job ka waqt, user ka wait aur mahine ke khaali ghante likho.' },
    exam: [
      { cue: 'Chhota event aur beech mein khaali waqt', pick: 'Standard on-demand Lambda' },
      { cue: 'Ek lambi container job, host patch nahi karna', pick: 'ECS RunTask on Fargate' },
      { cue: 'GPU ya apna OS driver', pick: 'Sahi EC2 instance aur driver' },
      { cue: 'Job queue, dependencies aur retry', pick: 'AWS Batch' },
      { cue: 'Kubernetes API aur Helm zaroori', pick: 'Amazon EKS' },
      { cue: 'App version deploy, neeche EC2 settings ka access', pick: 'Elastic Beanstalk' },
      { cue: 'Chhoti site, monthly VM bundle', pick: 'Lightsail' },
      { cue: 'Naya customer App Runner par web app chahta hai', pick: 'ECS Express Mode dekho' }
    ],
    stages: [dry, flow, decide, triage, terminal, lab, quiz], interview,
    success: ['Main workload ka waqt aur traffic dekh kar worker chun sakta hoon.', 'Main 30 din ka crossover aur uski assumptions samjha sakta hoon.', 'Main test task, video route aur photo profile alag check kar sakta hoon.'],
    homework: '<p>Lab 33 ka table lo. Pehle 6, phir 24 ghante/roz par 20 req/s ka bill likho. Dono baar ek hi 512 MB aur 200 ms ka profile rakho. Ek line mein likho kab worker badloge aur faisle se pehle kaunsa load test chahiye.</p><p>Optional AWS sandbox mein apni test Lambda par wahi photo do memory sizes par chalao. Billed time aur pixels likho. Calls aur logs ka bill aa sakta hai. Kaam ke baad test function, uski role aur test logs hatao.</p>',
    cards: [
      { front: 'PixShare ka 22-minute single-pass video job?', back: 'Job ID lautaao. Fargate RunTask ko input do. Queue aur job dependencies bhi chahiye toh Batch dekho.' },
      { front: 'Cold start kab dikh sakta hai?', back: 'Call ko naya environment chahiye aur runtime ya app setup mein waqt lagta hai.' },
      { front: 'Monthly Lambda model ke teen hisse?', back: 'Request count, GB memory aur har request ka billed time.' },
      { front: 'Crossover req/s kaise niklega?', back: 'Always-on monthly bill ko usi profile par ek active req/s ke monthly bill se bhaag do.' },
      { front: 'Task role aur execution role ka farak?', back: 'Task role app ke AWS calls ke liye hai. Execution role image pull aur logs jaise startup kaam ke liye hai.' },
      { front: 'GPU container aur chhota monthly VM bundle?', back: 'GPU container ke liye GPU wala EC2 dekho. Chhoti bundled VM ke liye Lightsail dekho.' },
      { front: 'Reserved concurrency 0 ka asar?', back: 'Function ki calls throttle hongi. Cap badlo aur downstream DB ki capacity bhi jaancho.' }
    ]
  }]);
})();
