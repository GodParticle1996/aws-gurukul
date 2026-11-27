/* 🎲 Chaos deck 'lambda' — Intermediate level lambda. Engine: chaos.js. Invoke awscli.js ka asli model chalata hai:
   AG.lambdaTiming (memory → duration), timeout → Sandbox.Timedout, reserved 0 → TooManyRequestsException,
   handler check, update ke dauraan purana config (wait function-updated-v2), logs tail mein REPORT lines.
   Base account lambda level ke terminal mission ka fixture hai (photo-resize SVG worker, buckets, role) — usi ko clone karke
   swasth kiya: memory 1024, timeout 3 s (kaam ~1.1 s), reserved 10, photo-jobs queue se ESM Enabled.
   Probe (base par): invoke → StatusCode 200, FunctionError nahi · config sahi · REPORT Duration < Timeout · ESM Enabled.
   Har card EK badlaav (simulator par chala ke dekha, 2026-11-27):
     memory-128     invoke → FunctionError, Sandbox.Timedout after 3.00 s · REPORT Duration ~3.8 s, Memory 128 MB
     timeout-1      invoke → Sandbox.Timedout after 1.00 s · config Timeout 1
     reserved-zero  invoke → TooManyRequestsException (ReservedFunctionConcurrentInvocationLimitExceeded)
     handler-typo   invoke → FunctionError, Runtime.HandlerNotFound · config Handler app.main
     esm-disabled   invoke theek · list-event-source-mappings → State Disabled (queue se jobs nahi uth rahe) */
(function () {
  const FN = 'photo-resize', UUID = '3b9e1c7a-4d2f-4e8b-9a61-0c5d7e2f1a48';
  const QUEUE = 'arn:aws:sqs:ap-south-1:123456789012:photo-jobs';
  const mission = AG.findLevel('lambda').stages.find(s => s.type === 'terminal');
  const account = JSON.parse(JSON.stringify(mission.account));
  const base = account.lambdas.find(f => f.name === FN);
  Object.assign(base, { memory: 1024, timeout: 3, reservedConcurrency: 10, busyConcurrent: 0, handler: 'app.handler' });
  account.eventSourceMappings = [{ uuid: UUID, functionName: FN, eventSourceArn: QUEUE, batchSize: 10, responseTypes: ['ReportBatchItemFailures'], state: 'Enabled', scalingConfig: {} }];
  account.logGroups = (account.logGroups || []).filter(g => g.name !== '/aws/lambda/' + FN);
  const fn = a => a.lambdas.find(f => f.name === FN);
  const esm = a => a.eventSourceMappings.find(m => m.uuid === UUID);
  const fits = a => { const f = fn(a), t = AG.lambdaTiming(f); return !f.pendingConfig && t.warmMs + t.initMs <= (f.timeout || 3) * 1000; };
  const H1 = 'Runbook ke probe chalao: invoke (StatusCode aur FunctionError), config + concurrency, logs ki REPORT line, aur event source mapping. Kaunsa jawab galat hai?';
  const invoke = `aws lambda invoke --function-name ${FN} --cli-binary-format raw-in-base64-out --payload file://event.json invoke.json`;
  const config = `aws lambda get-function-configuration --function-name ${FN}`;
  const getFn = `aws lambda get-function --function-name ${FN}`;
  const logs = `aws logs tail /aws/lambda/${FN}`;
  const maps = `aws lambda list-event-source-mappings --function-name ${FN}`;
  const wait = `aws lambda wait function-updated-v2 --function-name ${FN}`;

  AG.chaos.addDeck({
    id: 'lambda', title: 'Photo worker deck',
    account,
    files: Object.fromEntries(Object.entries(mission.files || {}).filter(([k]) => k === 'event.json').map(([k, v]) => [k, { desc: v.desc || 'S3 event fixture', content: v.content }])),
    alert: '<b>📟 16:40 — ShopKaro.</b> Kal raat photo-resize worker ki settings ek naye deploy template se lagi. Aaj nayi product photos ke thumbnails nahi ban rahe. <b>Ek</b> setting galat hai. Shuru: <code>cat runbook.md</code>.',
    placeholder: 'cat runbook.md   (phir: aws lambda invoke …)',
    runbook: `# photo-resize worker — "naye template ke baad" jaanch
1. Ek event chalao:  ${invoke}
                     → StatusCode 200 aur FunctionError NAHI; response mein written ya duplicates
2. Config:           ${config}
                     ${getFn}   (Concurrency)
3. Logs:             ${logs}
                     → REPORT line ka Duration, Timeout se kaafi neeche
4. Queue se jodna:   ${maps}
                     → photo-jobs ka mapping State Enabled
Badlaav:  aws lambda update-function-configuration --function-name ${FN} --memory-size|--timeout|--handler ...
          ${wait}   (update poora hone tak purana config chalta hai)
          aws lambda put-function-concurrency --function-name ${FN} --reserved-concurrent-executions 10
          aws lambda update-event-source-mapping --uuid <UUID> --enabled
Niyam:    kaam ~1.1 s ka hai (1024 MB par). Ek baar mein EK badlaav, phir invoke dobara.`,
    cards: [
      { id: 'memory-128', title: 'Worker ki memory 1024 MB se 128 MB ho gayi',
        break: a => { fn(a).memory = 128; },
        fixed: a => fits(a) && fn(a).memory >= 512,
        verify: /^aws lambda invoke\b/, verifyText: 'invoke dobara chalao',
        hints: [H1, 'Timeout 3 s hi hai, par kaam ab 3 s se zyada le raha. Logs ki REPORT line mein Memory Size kitni hai? Lambda mein CPU memory ke saath badhta hai.',
          `aws lambda update-function-configuration --function-name ${FN} --memory-size 1024, phir ${wait}, phir invoke`],
        solution: ['cat runbook.md', invoke, config, logs, `aws lambda update-function-configuration --function-name ${FN} --memory-size 1024`, wait, invoke],
        why: 'Lambda mein <b>CPU memory ke saath</b> milta hai: 128 MB par wahi kaam ~3.8 s, timeout 3 s → <b>Sandbox.Timedout</b>. Timeout badhaana sirf dheemapan chhupata; memory wapas 1024 karo.' },
      { id: 'timeout-1', title: 'Worker ka timeout 3 s se 1 s ho gaya',
        break: a => { fn(a).timeout = 1; },
        fixed: a => fits(a) && fn(a).timeout >= 3,
        verify: /^aws lambda invoke\b/, verifyText: 'invoke dobara chalao',
        hints: [H1, 'Error kehta hai "Task timed out after 1.00 seconds", par kaam ~1.1 s ka hai. Config mein Timeout kitna hai?',
          `aws lambda update-function-configuration --function-name ${FN} --timeout 3, phir ${wait}, phir invoke`],
        solution: ['cat runbook.md', invoke, config, `aws lambda update-function-configuration --function-name ${FN} --timeout 3`, wait, invoke],
        why: 'Error ka number hi saboot tha: "timed out after <b>1.00</b> seconds" aur kaam 1.1 s ka. Timeout ko kaam ke naape samay se upar rakho, par itna bhi nahi ki atka kaam chhup jaaye.' },
      { id: 'reserved-zero', title: 'Worker ki reserved concurrency 0 ho gayi (throttle button)',
        break: a => { fn(a).reservedConcurrency = 0; },
        fixed: a => fn(a).reservedConcurrency !== 0,
        verify: /^aws lambda invoke\b/, verifyText: 'invoke dobara chalao',
        hints: [H1, 'Invoke ka jawab TooManyRequestsException — function chala hi nahi. get-function mein Concurrency kitni hai?',
          `aws lambda put-function-concurrency --function-name ${FN} --reserved-concurrent-executions 10, phir invoke`],
        solution: ['cat runbook.md', getFn, `aws lambda put-function-concurrency --function-name ${FN} --reserved-concurrent-executions 10`, invoke],
        why: '<b>Reserved concurrency 0</b> = function poori tarah band (console ka "Throttle" yahi karta hai). Incident ke baad wapas set karna bhool gaye. 10 wapas do — limit hatao mat, woh downstream bachaati hai.' },
      { id: 'handler-typo', title: 'Worker ka handler app.handler se app.main ho gaya',
        break: a => { fn(a).handler = 'app.main'; },
        fixed: a => fn(a).handler === 'app.handler' && !fn(a).pendingConfig,
        verify: /^aws lambda invoke\b/, verifyText: 'invoke dobara chalao',
        hints: [H1, 'FunctionError ka type Runtime.HandlerNotFound — code tak pahunche hi nahi. Config mein Handler kya likha hai?',
          `aws lambda update-function-configuration --function-name ${FN} --handler app.handler, phir ${wait}, phir invoke`],
        solution: ['cat runbook.md', invoke, config, `aws lambda update-function-configuration --function-name ${FN} --handler app.handler`, wait, invoke],
        why: '<b>Runtime.HandlerNotFound</b>: Lambda ko batayi entry point (app.main) code mein hai hi nahi. Memory ya timeout yahan kuch nahi karte; handler sahi karo aur update poora hone do.' },
      { id: 'esm-disabled', title: 'photo-jobs queue ka event source mapping Disabled ho gaya',
        break: a => { esm(a).state = 'Disabled'; },
        fixed: a => esm(a).state === 'Enabled' || esm(a).pendingState === 'Enabled',
        verify: /^aws lambda list-event-source-mappings\b/, verifyText: 'mapping dobara dekho (list-event-source-mappings)',
        hints: [H1, 'Haath se invoke theek chalta hai — function sahi hai. Toh queue ke jobs worker tak kyun nahi pahunch rahe? Mapping ki State dekho.',
          `aws lambda update-event-source-mapping --uuid ${UUID} --enabled, phir ${maps}`],
        solution: ['cat runbook.md', invoke, maps, `aws lambda update-event-source-mapping --uuid ${UUID} --enabled`, maps],
        why: 'Function theek tha — <b>event source mapping</b> band thi, isliye queue se koi poll hi nahi kar raha tha. Haath ka invoke yeh raasta nahi jaanchta; mapping ki State bhi probe ka hissa ho.' },
    ],
  });

  AG.addLab('lambda', {
    type: 'chaos', id: 'chaos-lambda', deck: 'lambda', title: '🎲 Chaos round: worker ka naya deploy template',
    intro: 'Chaar probe, ek galat setting. Error ka type aur number dhyaan se padho — <b>EK badlaav</b> se theek karo.',
  });
})();
