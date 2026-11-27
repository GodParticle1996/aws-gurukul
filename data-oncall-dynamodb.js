/* 📟 On-call shift 'flash-sale' — dynamodb level (DynamoDB: access patterns, safe migration aur sahi data). Engine: oncall.js.
   29 Nov, 00:00 flash sale. Table stock-holds (cart mein rakhe stock ke "hold", 15 min ke liye; key holdId).
   Teen JUDE alerts:
     1 StockHoldsWriteThrottled  table PROVISIONED 100 WCU, sale ki demand 900 se shuru hokar har minute badhti → WriteThrottleEvents.
                                 Fix: on-demand (traffic ka andaza nahi). WCU badhana bhi chalta hai jab tak demand se upar ho —
                                 par demand badhti rehti hai.
     2 SellerDashboardSlow       writes chalte hi table tezi se badhi; seller dashboard Scan + FilterExpression(sellerId) chalata hai —
                                 filter padhne ke BAAD lagta hai, poori table padhi jaati hai. Fix: GSI bySeller (sellerId, createdAt);
                                 app index ACTIVE hote hi Query par chala jaata hai. Provisioned table par GSI ko apni throughput
                                 chahiye, aur GSI ki WCU kam ho toh base table ke writes bhi throttle hote hain.
     3 PitrDisabled              01:30 par stale-holds cleanup job (bulk delete) se pehle Security Hub DynamoDB.2: PITR band.
                                 Fix: PITR, 35 din. (Galat delete ka ilaaj: PITR se nayi table mein restore.)
   Model (reconcile, har minute): demand = min(2400, 900 + 60 × minute) WCU. On-demand nayi/switch hui table turant hazaaron
   units sambhalti hai (yahan demand 4000 se kam). Items: churn 100/s barabar; usse upar ke safal writes table badhate.
   Dashboard p99 = Scan mein 400 ms + items/200 ms; GSI ACTIVE ho toh Query ~80 ms. TTL delete der se hota hai — table chhoti nahi hoti. */
(function () {
  const R = 'ap-south-1', A = '123456789012', T = 'stock-holds';
  const T0 = Date.parse('2026-11-28T18:30:00Z');                     // 29 Nov 00:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const table = a => a.tables.find(t => t.name === T);
  const demand = clock => Math.min(2400, 900 + 60 * clock);
  const gsiReady = t => (t.gsis || []).some(i => i.name === 'bySeller' && i.partitionKey === 'sellerId' && i.status === 'ACTIVE');
  const writeCap = t => {
    if (t.billing === 'PAY_PER_REQUEST') return 4000;
    const idx = (t.gsis || []).filter(i => i.status === 'ACTIVE' || i.status === 'CREATING');
    return Math.min(t.wcu || 5, ...idx.map(i => i.wcu || Infinity));   // GSI ki WCU kam = base table ke writes bhi ruke
  };
  const writesOk = a => writeCap(table(a)) >= demand(a.holds.clock);

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const t = table(a), L = a.holds, d = demand(clock), cap = writeCap(t);
    L.clock = clock;
    const accepted = Math.min(d, cap), throttled = Math.max(0, d - cap) * 60;
    if (clock > 0) L.items += Math.max(0, accepted - 100) * 60;
    const p99 = gsiReady(t) ? 80 + (clock * 7) % 15 : Math.round(400 + L.items / 200);
    const values = { throttles: throttled, latency: p99, wcu: accepted * 60 };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  const IDX = keys => JSON.stringify([{ Create: { IndexName: 'bySeller', KeySchema: [{ AttributeName: 'sellerId', KeyType: 'HASH' }, { AttributeName: 'createdAt', KeyType: 'RANGE' }],
    Projection: { ProjectionType: 'ALL' }, ...keys } }], null, 2);
  const describe = `aws dynamodb describe-table --table-name ${T}`;
  const ATTRS = 'AttributeName=sellerId,AttributeType=S AttributeName=createdAt,AttributeType=N';
  const RUNBOOK = `# ShopKaro on-call — flash sale (29 Nov, 00:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Table:    ${T} (key holdId) — cart mein rakhe stock ka 15 minute ka "hold"
Alarms:   aws cloudwatch describe-alarms --state-value ALARM
          (stock-holds-write-throttles · seller-dashboard-p99)
          aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB --metric-name ConsumedWriteCapacityUnits
               --dimensions Name=TableName,Value=${T} --start-time <iso> --end-time <iso> --period 60 --statistics Sum
Table:    ${describe}      (BillingModeSummary, ProvisionedThroughput, GlobalSecondaryIndexes)
          aws dynamodb describe-continuous-backups --table-name ${T}
Badlaav:  aws dynamodb update-table --table-name ${T} --billing-mode PAY_PER_REQUEST
          aws dynamodb update-table --table-name ${T} --attribute-definitions ${ATTRS} --global-secondary-index-updates file://seller-index.json
          aws dynamodb update-continuous-backups --table-name ${T} --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35
          (badlaav ke baad describe-table se Status / IndexStatus ACTIVE hone tak dekho)

Jaankari:
- Sale ka traffic pehli baar itna hai — andaza nahi. Writes har minute badhenge.
- Seller dashboard abhi Scan + FilterExpression (sellerId = :s) chalata hai. App ka v7: GSI "bySeller" ACTIVE hote hi Query.
- Index files: seller-index.json (on-demand table ke liye), seller-index-provisioned.json (provisioned table ke liye, GSI throughput ke saath).
- 01:30 par stale-holds cleanup job (bulk delete). Bulk delete se pehle PITR ON, 35 din — warna galti ka ilaaj nahi.
- Kabhi nahi: table delete, PITR band, sale ke beech table wapas PROVISIONED.
`;

  AG.oncall.add({
    id: 'flash-sale', start: 0,
    INC: [
      { id: 'StockHoldsWriteThrottled', sev: '🔴 SEV1', text: 'stock-holds par WriteThrottleEvents — "Add to cart" fail ho raha hai. Flash sale abhi shuru hui.',
        fixed: a => writesOk(a),
        verify: /^aws cloudwatch (describe-alarms|get-metric-statistics)\b|^aws dynamodb describe-table\b/, verifyText: 'alarms, consumed WCU ya table dobara dekho',
        hints: [`cat runbook.md, phir ${describe} — BillingModeSummary aur ProvisionedThroughput kya hai? Phir ConsumedWriteCapacityUnits (runbook) dekho.`,
          'Table 100 WCU par PROVISIONED hai, sale ki demand 900 se upar aur badh rahi hai. Traffic ka andaza nahi — on-demand (PAY_PER_REQUEST) yahin ke liye hai. Badlaav ke baad Status UPDATING se ACTIVE hone tak describe-table.',
          `aws dynamodb update-table --table-name ${T} --billing-mode PAY_PER_REQUEST, phir ${describe} (Status ACTIVE), phir aws cloudwatch describe-alarms --alarm-names stock-holds-write-throttles`] },
      { id: 'SellerDashboardSlow', sev: '🟠 SEV2', text: 'Seller dashboard p99 2.5 s se upar aur har minute badh raha hai. Writes chalte hi table tezi se badi ho rahi hai.',
        fixed: a => gsiReady(table(a)),
        verify: /^aws cloudwatch describe-alarms\b|^aws dynamodb describe-table\b/, verifyText: 'alarms ya table dobara dekho',
        hints: [`${describe} — GlobalSecondaryIndexes hai? Runbook: dashboard Scan + FilterExpression chalata hai.`,
          'FilterExpression padhne ke BAAD lagta hai — Scan poori table padhta hai aur read units bhi poore lagte hain. sellerId ke liye GSI banao; app ACTIVE index par Query karega. Table on-demand hai toh seller-index.json, provisioned hai toh seller-index-provisioned.json.',
          `aws dynamodb update-table --table-name ${T} --attribute-definitions ${ATTRS} --global-secondary-index-updates file://seller-index.json, phir ${describe} do baar (Status, phir IndexStatus ACTIVE), phir aws cloudwatch describe-alarms --alarm-names seller-dashboard-p99`] },
      { id: 'PitrDisabled', sev: '🟠 SEV2', text: 'Security Hub DynamoDB.2 FAILED: stock-holds par point-in-time recovery band. 01:30 ka stale-holds cleanup (bulk delete) isse pehle nahi chalega.',
        fixed: a => { const p = table(a).pitr || {}; return p.enabled === true && (p.days == null ? 35 : p.days) >= 35; },
        verify: /^aws dynamodb describe-continuous-backups\b/, verifyText: 'describe-continuous-backups dobara dekho',
        hints: [`aws dynamodb describe-continuous-backups --table-name ${T} — PointInTimeRecoveryStatus kya hai?`,
          'Bulk delete galat chala toh PITR hi rasta hai: chuni hui second tak ki copy nayi table mein restore. Runbook 35 din maangta hai. PITR on karna restore ka saboot nahi — par bina iske koi raasta hi nahi.',
          `aws dynamodb update-continuous-backups --table-name ${T} --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35, phir aws dynamodb describe-continuous-backups --table-name ${T}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const dims = [{ Name: 'TableName', Value: T }], dash = [{ Name: 'Service', Value: 'seller-dashboard' }];
      const series = (key, namespace, metric, unit, d) => ({ key, seriesId: 'holds-' + key, version: 1, period: 60, namespace, metric, unit, dimensions: d, points: [] });
      const alarm = (name, key, ns, metric, d, stat, threshold) => ({ name, alarmId: 'holds-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: d, Statistic: stat, Threshold: threshold, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const hold = (n, seller, sku, at) => ({ holdId: `h-${n}`, sellerId: seller, createdAt: at, sku, qty: 1, expiresAt: at + 900 });
      const t0 = Math.floor(T0 / 1000);
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        tables: [{ name: T, tableId: '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b', partitionKey: 'holdId', sortKey: null, billing: 'PROVISIONED', rcu: 200, wcu: 100,
          attributeTypes: { holdId: 'S' }, status: 'ACTIVE', revision: 1, gsis: [], lsis: [], pitr: { enabled: false }, ttl: { attribute: 'expiresAt', status: 'ENABLED' },
          items: [hold('8f21c0', 's-104', 'IPH16-128', t0 - 41), hold('8f21c7', 's-221', 'TV-55-QLED', t0 - 37), hold('8f21d3', 's-104', 'IPH16-256', t0 - 12)] }],
        capacityMetrics: [series('throttles', 'AWS/DynamoDB', 'WriteThrottleEvents', 'Count', dims), series('latency', 'ShopKaro/Dashboard', 'LatencyP99', 'Milliseconds', dash),
          series('wcu', 'AWS/DynamoDB', 'ConsumedWriteCapacityUnits', 'Count', dims)],
        alarms: [alarm('stock-holds-write-throttles', 'throttles', 'AWS/DynamoDB', 'WriteThrottleEvents', dims, 'Sum', 0),
          alarm('seller-dashboard-p99', 'latency', 'ShopKaro/Dashboard', 'LatencyP99', dash, 'Maximum', 2500)],
        holds: { items: 380000, clock: 0 },
      };
      const files = {
        'runbook.md': { desc: 'On-call runbook', content: RUNBOOK },
        'seller-index.json': { desc: 'GSI bySeller — on-demand table ke liye', content: IDX({}) },
        'seller-index-provisioned.json': { desc: 'GSI bySeller — provisioned table ke liye', content: IDX({ ProvisionedThroughput: { ReadCapacityUnits: 500, WriteCapacityUnits: 3000 } }) },
      };
      const responses = [
        risky(/^aws dynamodb delete-table\b/, 'stock-holds delete karna — sale ke saare carts ka stock hold gaya.'),
        risky(/^aws dynamodb update-continuous-backups\b(?=.*PointInTimeRecoveryEnabled=false)/, 'PITR band karna — bulk delete se pehle hi ilaaj ka raasta khatam.'),
        risky(/^aws dynamodb update-table\b(?=.*--billing-mode\s+PROVISIONED\b)/, 'sale ke beech table wapas PROVISIONED — demand abhi bhi badh rahi hai.'),
        risky(/^aws dynamodb batch-write-item\b|^aws dynamodb delete-item\b/, 'raat ko holds haath se delete karna — cleanup job ka kaam hai, aur PITR abhi band hai.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms / get-metric-statistics · aws dynamodb describe-table / update-table / describe-continuous-backups / update-continuous-backups. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, files, responses, placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Raat 00:00, flash sale. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: '<b>On-demand</b> ne andaze se bahar ka traffic sambhala, <b>GSI</b> ne Scan + filter ko Query banaya (filter capacity nahi bachata), aur bulk delete se pehle <b>PITR</b>. Sabak: capacity theek hote hi agla bottleneck dikhta hai — is baar access pattern.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', describe,
          `aws dynamodb update-table --table-name ${T} --billing-mode PAY_PER_REQUEST`, describe,
          'aws cloudwatch describe-alarms --alarm-names stock-holds-write-throttles',
          'aws cloudwatch describe-alarms --alarm-names seller-dashboard-p99',
          `aws dynamodb update-table --table-name ${T} --attribute-definitions ${ATTRS} --global-secondary-index-updates file://seller-index.json`,
          describe, describe, 'aws cloudwatch describe-alarms --alarm-names seller-dashboard-p99',
          `aws dynamodb describe-continuous-backups --table-name ${T}`,
          `aws dynamodb update-continuous-backups --table-name ${T} --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35`,
          `aws dynamodb describe-continuous-backups --table-name ${T}`],
      };
    },
  });

  AG.addLab('dynamodb', {
    type: 'oncall', id: 'oncall-flash-sale', shift: 'flash-sale', title: '📟 On-call: flash sale ki raat',
    intro: 'Raat 00:00, flash sale shuru. <b>Dekho → theek karo → pakka karo</b> — capacity, access pattern aur recovery. Har command = 1 minute.',
  });
})();
