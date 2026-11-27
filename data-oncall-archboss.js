/* 📟 On-call shift 'pix-upload' — archboss (Architect boss: PixShare global review). Engine: oncall.js. Terminal: awscli.js.
   PixShare ka upload pipeline: app → EventBridge (default bus, rule photo-uploaded) → SQS thumb-jobs → thumbnail worker.
   19:00 se teen JUDE hue alerts:
     1 PixThumbnailsStalled          kal raat ke template ne pattern ka detail-type "Photo Uploaded" kar diya; event "PhotoUploaded"
                                     → koi match nahi → thumbnails 0
     2 PhotoUploadedFailedInvocations pattern theek → ab match, par thumb-jobs ki policy purane rule (photo-uploaded-v1) ko allow karti
                                     → har delivery NO_PERMISSIONS (FailedInvocations)
     3 PhotoUploadedNoDlq            fail hue events kahin nahi bache — target par DeadLetterConfig hi nahi tha
   Asli simulator: put-rule / put-targets / put-events (pattern match + "delivery observation"), set-queue-attributes.
   Reconcile har minute 40 uploads ka hisaab AG.eventPatternMatch aur queue policy se karta hai (Created, FailedInvocations). */
(function () {
  const R = 'ap-south-1', A = '123456789012';
  const arn = n => `arn:aws:sqs:${R}:${A}:${n}`, url = n => `https://sqs.${R}.amazonaws.com/${A}/${n}`, ruleArn = n => `arn:aws:events:${R}:${A}:rule/${n}`;
  const RULE = 'photo-uploaded', JOBS = 'thumb-jobs', DLQ = 'thumb-events-dlq', UPLOADS = 40;
  const T0 = Date.parse('2026-11-27T13:30:00Z');                   // 19:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const PATTERN = { source: ['pixshare.uploads'], 'detail-type': ['PhotoUploaded'] };
  const policy = (q, src) => ({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'events.amazonaws.com' }, Action: 'sqs:SendMessage',
    Resource: arn(q), Condition: { ArnEquals: { 'aws:SourceArn': src } } }] });
  const SAMPLE = { version: '0', id: 'sample-1', account: A, source: 'pixshare.uploads', 'detail-type': 'PhotoUploaded', time: '2026-11-27T13:30:00Z', region: R, resources: [],
    detail: { photoId: 'p77', key: 'u/41/p77.jpg' } };
  const rule = a => a.eventRules.find(r => r.name === RULE);
  const q = (a, n) => a.queues.find(x => x.name === n);
  const matches = a => rule(a).state !== 'DISABLED' && AG.eventPatternMatch(rule(a).pattern, SAMPLE);
  const allowed = a => JSON.stringify(q(a, JOBS).policy) === JSON.stringify(policy(JOBS, ruleArn(RULE)));
  const hasDlq = a => ((rule(a).targets[0] || {}).DeadLetterConfig || {}).Arn === arn(DLQ);

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const P = a.pix, m = matches(a), ok = m && allowed(a);
    const failed = m && !ok ? UPLOADS : 0, created = ok ? UPLOADS : 0;
    if (clock > 0) { if (failed && !hasDlq(a)) P.lost += failed; P.created += created; }
    const values = { created, failed };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  const putEvents = 'aws events put-events --entries file://test-upload.json';
  const descRule = `aws events describe-rule --name ${RULE}`;
  const targets = `aws events list-targets-by-rule --rule ${RULE}`;
  const qAttrs = `aws sqs get-queue-attributes --queue-url ${url(JOBS)} --attribute-names Policy`;
  AG.oncall.add({
    id: 'pix-upload', start: 19 * 60,
    INC: [
      { id: 'PixThumbnailsStalled', sev: '🔴 SEV1', text: 'Naye uploads ke thumbnails 0/min — PixShare feed mein khaali dabbe. Kal raat event rules ek naye template se lage.',
        fixed: a => matches(a),
        verify: /^aws events (put-events|describe-rule|test-event-pattern)\b/, verifyText: 'test event dobara bhejo (put-events) ya rule dekho',
        hints: [`${putEvents} — koi "delivery observation" line aayi? Nahi aayi toh koi rule match hi nahi hua. Phir ${descRule} aur cat test-upload.json.`,
          'Rule ka EventPattern aur app ka event milao: detail-type ek-ek akshar se match hona chahiye ("Photo Uploaded" ≠ "PhotoUploaded").',
          `aws events put-rule --name ${RULE} --event-pattern file://photo-uploaded-pattern.json, phir ${putEvents}`] },
      { id: 'PhotoUploadedFailedInvocations', sev: '🔴 SEV1', text: 'Rule ab match karta hai, par photo-uploaded ki har delivery fail — FailedInvocations 40/min.',
        fixed: a => allowed(a),
        verify: /^aws events put-events\b/, verifyText: 'test event dobara bhejo (put-events)',
        hints: [`${putEvents} — delivery observation kya kehti hai? NO_PERMISSIONS ka matlab target ne mana kiya. ${qAttrs}`,
          'thumb-jobs ki Policy kis rule ka SourceArn allow karti hai? Naam ek-ek akshar se dekho (-v1?).',
          `aws sqs set-queue-attributes --queue-url ${url(JOBS)} --attributes file://thumb-jobs-policy.json, phir ${putEvents}`] },
      { id: 'PhotoUploadedNoDlq', sev: '🟠 SEV2', text: 'Pichhle minuton mein NO_PERMISSIONS wale upload events kahin nahi bache — target par DLQ hi nahi tha.',
        fixed: a => hasDlq(a),
        verify: /^aws events list-targets-by-rule\b/, verifyText: 'rule ke targets dobara dekho (list-targets-by-rule)',
        hints: [`${targets} — target par DeadLetterConfig hai? Delivery fail ho toh event kahan jaata?`,
          'EventBridge target par DLQ ho toh NO_PERMISSIONS/NO_RESOURCE wale events SQS DLQ mein bach jaate hain (thumb-events-dlq ki policy pehle se taiyaar hai). Bina DLQ ke woh gayab.',
          `aws events put-targets --rule ${RULE} --targets file://targets-with-dlq.json, phir ${targets}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const queue = (name, id, attrs, pol) => ({ name, url: url(name), arn: arn(name), queueId: id, messages: [], dedup: [], created: 1795755600000, revision: 2,
        attributes: { VisibilityTimeout: '120', ReceiveMessageWaitTimeSeconds: '0', MessageRetentionPeriod: '345600', DelaySeconds: '0', MaximumMessageSize: '1048576',
          Policy: JSON.stringify(pol), ...attrs }, visibilityTimeout: 120, isFifo: false, policy: pol });
      const series = (key, namespace, metric, dims) => ({ key, seriesId: 'pix-' + key, version: 1, period: 60, namespace, metric, unit: 'Count', dimensions: dims, points: [] });
      const thumbDims = [{ Name: 'Pipeline', Value: 'uploads' }], ruleDims = [{ Name: 'RuleName', Value: RULE }];
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDAPIXONCALL', Arn: `arn:aws:iam::${A}:user/oncall` }, messagingSeq: 10,
        queues: [queue(DLQ, 'queue-000001', { MessageRetentionPeriod: '1209600' }, policy(DLQ, ruleArn(RULE))),
          queue(JOBS, 'queue-000002', {}, policy(JOBS, ruleArn(RULE + '-v1')))],
        eventBuses: [], archives: [], replays: [],
        eventRules: [{ name: RULE, bus: 'default', arn: ruleArn(RULE), ruleId: 'rule-000001', revision: 2, state: 'ENABLED', description: 'Uploads → thumbnail jobs',
          pattern: { source: ['pixshare.uploads'], 'detail-type': ['Photo Uploaded'] }, targets: [{ Id: JOBS, Arn: arn(JOBS) }] }],
        capacityMetrics: [series('created', 'PixShare/Thumbnails', 'Created', thumbDims), series('failed', 'AWS/Events', 'FailedInvocations', ruleDims)],
        alarms: [['pix-thumbnails-stalled', 'created', 'PixShare/Thumbnails', 'Created', thumbDims, 'LessThanThreshold', 1],
          ['photo-uploaded-failed-invocations', 'failed', 'AWS/Events', 'FailedInvocations', ruleDims, 'GreaterThanThreshold', 0]].map(([name, key, ns, metric, dims, op, th]) => ({
          name, alarmId: 'pix-' + key, revision: 0, state: 'INSUFFICIENT_DATA', definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: dims, Statistic: 'Sum',
            Threshold: th, ComparisonOperator: op, Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } })),
        pix: { lost: 0, created: 0 },
      };
      const files = {
        'runbook.md': { desc: 'PixShare upload pipeline runbook', content: `# PixShare upload pipeline — on-call
Raasta: app → EventBridge default bus → rule ${RULE} → SQS ${JOBS} → thumbnail worker

Alarms:      aws cloudwatch describe-alarms --state-value ALARM
Test event:  ${putEvents}
             → har matching rule ke target ki "delivery observation" line (ACCEPTED / NO_PERMISSIONS / NO_RESOURCE)
             → koi line nahi = koi rule match hi nahi hua
Rule:        ${descRule}
             ${targets}
Queue:       ${qAttrs}
Reviewed files: photo-uploaded-pattern.json · thumb-jobs-policy.json · targets-with-dlq.json
Mat karo:    rule disable/delete, queue purge, queue policy mein Principal "*".
` },
        'test-upload.json': { desc: 'App jaisa test upload event', content: JSON.stringify([{ Source: 'pixshare.uploads', DetailType: 'PhotoUploaded',
          Detail: JSON.stringify({ photoId: 'p77', key: 'u/41/p77.jpg' }) }], null, 2) },
        'photo-uploaded-pattern.json': { desc: 'Review kiya event pattern', content: JSON.stringify(PATTERN, null, 2) },
        'thumb-jobs-policy.json': { desc: 'Review kiya thumb-jobs policy (sirf photo-uploaded rule)', content: JSON.stringify({ Policy: JSON.stringify(policy(JOBS, ruleArn(RULE))) }, null, 2) },
        'targets-with-dlq.json': { desc: 'Review kiya target + DLQ', content: JSON.stringify([{ Id: JOBS, Arn: arn(JOBS), DeadLetterConfig: { Arn: arn(DLQ) } }], null, 2) },
      };
      const responses = [
        risky(/^aws events (disable-rule|delete-rule)\b/, 'rule band ya delete karna — uploads ke saare thumbnails hamesha ke liye ruk jaate.'),
        risky(/^aws sqs purge-queue\b/, 'purge-queue — users ke upload jobs gayab ho jaate.'),
        risky(/^aws events remove-targets\b/, 'target hatana — events ka koi thikana hi nahi bachta.'),
        { re: /^help$/, out: 'On-call: cat runbook.md. aws cloudwatch describe-alarms · aws events put-events / describe-rule / list-targets-by-rule / put-rule / put-targets · aws sqs get-queue-attributes / set-queue-attributes. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, files, responses, placeholder: 'cat runbook.md   (phir: aws events put-events …)',
        goal: 'PixShare ke naye uploads ke thumbnails nahi ban rahe. Pipeline ka har hissa <b>dekho → theek karo → pakka karo</b>. Test event ki "delivery observation" line hi saboot hai.',
        successText: 'Pattern, target ki permission aur target ka DLQ — teeno <b>config</b> the. "Rule match hua" aur "event pahuncha" alag saboot hain; fail hue events bachane ka kaam DLQ ka hai.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', putEvents, descRule, 'cat test-upload.json',
          `aws events put-rule --name ${RULE} --event-pattern file://photo-uploaded-pattern.json`, putEvents,
          qAttrs, `aws sqs set-queue-attributes --queue-url ${url(JOBS)} --attributes file://thumb-jobs-policy.json`, putEvents,
          targets, `aws events put-targets --rule ${RULE} --targets file://targets-with-dlq.json`, targets],
      };
    },
  });

  AG.addLab('archboss', {
    type: 'oncall', id: 'oncall-pix-upload', shift: 'pix-upload', title: '📟 On-call: PixShare uploads ke thumbnails',
    intro: 'Naye uploads feed mein khaali dabbe dikha rahe hain. Event pipeline ka <b>har hissa alag saboot</b> maangta hai — har command = 1 minute.',
  });
})();
