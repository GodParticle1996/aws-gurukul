/* 🎲 Chaos deck 'route53' — Intermediate level route53. Engine: chaos.js. DNS ka jawab AG.dnsAnswer (awscli.js) se.
   Kahani: Mumbai origin (203.0.113.10) down hai, Hyderabad DR (203.0.113.20) taiyaar. Sahi failover ko DR dena chahiye.
   Swasth base: failover pair app.shopkaro.in — PRIMARY par health check, SECONDARY = DR, dono TTL 60; health check
   (HTTPS /healthz) Mumbai ko down dekhta hai. Probe (base par): test-dns-answer → 203.0.113.20 · health status Failure ·
   records sahi.
   Har card EK badlaav (simulator par chala ke dekha, 2026-11-27):
     hc-disabled       test-dns-answer → 203.0.113.10 (down IP) · health status "Success" · get-health-check: Disabled true
     hc-inverted       test-dns-answer → 203.0.113.10 · status "Success" · Inverted true
     no-health-check   test-dns-answer → 203.0.113.10 · status Failure · PRIMARY record par HealthCheckId hi nahi
     secondary-copy    test-dns-answer → 203.0.113.10 · status Failure · SECONDARY ka value bhi 203.0.113.10
     ttl-long          test-dns-answer → 203.0.113.20 (sahi) · par dono records ka TTL 3600 */
(function () {
  const ZONE = 'Z08316722SHOPKARO', HC = '9c2b7e41-5d3a-4f8e-b1c6-2a7d9e0f4b13', NAME = 'app.shopkaro.in.';
  const MUM = '203.0.113.10', HYD = '203.0.113.20', CHANGE = '/change/C000000001';
  const primary = () => ({ Name: NAME, Type: 'A', SetIdentifier: 'mumbai', Failover: 'PRIMARY', TTL: 60, HealthCheckId: HC, ResourceRecords: [{ Value: MUM }] });
  const secondary = () => ({ Name: NAME, Type: 'A', SetIdentifier: 'hyderabad', Failover: 'SECONDARY', TTL: 60, ResourceRecords: [{ Value: HYD }] });
  const base = () => [{ Name: 'shopkaro.in.', Type: 'NS', TTL: 172800, ResourceRecords: [{ Value: 'ns-1.sim.invalid.' }, { Value: 'ns-2.sim.invalid.' }] },
    { Name: 'shopkaro.in.', Type: 'SOA', TTL: 900, ResourceRecords: [{ Value: 'ns-1.sim.invalid. hostmaster.sim.invalid. 1 7200 900 1209600 86400' }] },
    primary(), secondary()];
  const zone = a => a.hostedZones.find(z => z.id === ZONE);
  const check = a => a.healthChecks.find(h => h.id === HC);
  const served = (a, id) => (zone(a).servedRecords || []).find(r => r.Name === NAME && r.SetIdentifier === id) || {};
  // dono jagah ek saath badlo: desired (records) aur abhi serve ho raha (servedRecords)
  const both = (a, id, f) => [zone(a).records, zone(a).servedRecords].forEach(list => list.filter(r => r.Name === NAME && r.SetIdentifier === id).forEach(f));
  const answerDR = a => JSON.stringify(AG.dnsAnswer(a, zone(a), NAME, 'A')) === JSON.stringify([HYD]);
  const hcOk = a => !check(a).config.Disabled && !check(a).config.Inverted;
  const recordsOk = a => served(a, 'mumbai').HealthCheckId === HC && JSON.stringify(served(a, 'hyderabad').ResourceRecords) === JSON.stringify([{ Value: HYD }]) &&
    [served(a, 'mumbai'), served(a, 'hyderabad')].every(r => r.TTL <= 60);
  const H1 = 'Runbook ke teeno probe chalao: test-dns-answer, health check (status aur config), list-resource-record-sets. Kaunsa jawab runbook se alag hai?';
  const dns = `aws route53 test-dns-answer --hosted-zone-id ${ZONE} --record-name app.shopkaro.in --record-type A`;
  const status = `aws route53 get-health-check-status --health-check-id ${HC}`;
  const getHc = `aws route53 get-health-check --health-check-id ${HC}`;
  const list = `aws route53 list-resource-record-sets --hosted-zone-id ${ZONE}`;
  const upsert = `aws route53 change-resource-record-sets --hosted-zone-id ${ZONE} --change-batch file://app-failover-reviewed.json`;
  const wait = `aws route53 wait resource-record-sets-changed --id ${CHANGE}`;
  const records = base();

  AG.chaos.addDeck({
    id: 'route53', title: 'DNS failover deck',
    account: {
      region: 'ap-south-1', callerIdentity: { Account: '123456789012', UserId: 'AIDASHOPKARODNS', Arn: 'arn:aws:iam::123456789012:user/ops' },
      hostedZones: [{ id: ZONE, name: 'shopkaro.in.', callerReference: 'shopkaro-public', records, servedRecords: JSON.parse(JSON.stringify(records)) }],
      healthChecks: [{ id: HC, callerReference: 'app-mumbai-https', version: 3, observedHealthy: false,
        config: { Type: 'HTTPS', IPAddress: MUM, Port: 443, ResourcePath: '/healthz', RequestInterval: 30, FailureThreshold: 3, Inverted: false, Disabled: false } }],
      dnsChanges: [], dnsHealthFixtures: { [MUM]: false, [HYD]: true },
    },
    files: {
      'app-failover-reviewed.json': { desc: 'Review kiya hua failover pair (platform team)', content: JSON.stringify({ Comment: 'Reviewed app failover pair',
        Changes: [{ Action: 'UPSERT', ResourceRecordSet: primary() }, { Action: 'UPSERT', ResourceRecordSet: secondary() }] }, null, 2) },
    },
    alert: '<b>📟 14:05 — ShopKaro.</b> Mumbai origin 14:00 se down hai; Hyderabad DR taiyaar hai. Kal raat DNS ki config ek naye template se lagi. <b>Ek</b> setting failover ko kharab kar rahi hai. Shuru: <code>cat runbook.md</code>.',
    placeholder: 'cat runbook.md   (phir: test-dns-answer)',
    runbook: `# ShopKaro DNS — Mumbai down, failover review
1. Users ko kya mil raha:  ${dns}
                           → abhi ${HYD} (Hyderabad DR) aana chahiye
2. Health check:           ${status}
                           → Mumbai down hai, toh "Failure" aana chahiye
                           ${getHc}   (Disabled? Inverted?)
3. Records:                ${list}
                           → PRIMARY par HealthCheckId, SECONDARY = ${HYD}, dono ka TTL 60
Badlaav:  aws route53 update-health-check --health-check-id ${HC} --no-disabled | --no-inverted
          ${upsert}
          aws route53 wait resource-record-sets-changed --id <ChangeInfo ka Id>   (tab tak naya record serve nahi hota)
Niyam:    ek baar mein EK badlaav, phir probe dobara.`,
    cards: [
      { id: 'hc-disabled', title: 'Mumbai ka health check Disabled ho gaya',
        break: a => { check(a).config.Disabled = true; },
        fixed: a => hcOk(a) && answerDR(a),
        verify: /^aws route53 (test-dns-answer|get-health-check-status)\b/, verifyText: 'DNS jawab ya health status dobara dekho',
        hints: [H1, 'Mumbai down hai, phir bhi health status "Success"? get-health-check mein config padho — checker sach mein jaanch raha hai?',
          `aws route53 update-health-check --health-check-id ${HC} --no-disabled, phir test-dns-answer`],
        solution: ['cat runbook.md', dns, status, getHc, `aws route53 update-health-check --health-check-id ${HC} --no-disabled`, dns],
        why: '<b>Disabled</b> health check ko Route 53 hamesha <b>healthy</b> maanta hai — Mumbai down hone par bhi PRIMARY milta raha. Maintenance ke baad check dobara enable karna runbook ka hissa ho.' },
      { id: 'hc-inverted', title: 'Mumbai ka health check Inverted ho gaya',
        break: a => { check(a).config.Inverted = true; },
        fixed: a => hcOk(a) && answerDR(a),
        verify: /^aws route53 (test-dns-answer|get-health-check-status)\b/, verifyText: 'DNS jawab ya health status dobara dekho',
        hints: [H1, 'Status "Success" par origin down. get-health-check mein koi aisi setting hai jo jawab ulta kar de?',
          `aws route53 update-health-check --health-check-id ${HC} --no-inverted, phir test-dns-answer`],
        solution: ['cat runbook.md', dns, status, getHc, `aws route53 update-health-check --health-check-id ${HC} --no-inverted`, dns],
        why: '<b>Inverted</b> check ulta jawab deta hai: endpoint down = healthy. Isliye failover ne PRIMARY (down) hi diya. Inverted sirf khaas jagah (jaise maintenance page) ke liye hai.' },
      { id: 'no-health-check', title: 'PRIMARY record se HealthCheckId hat gaya',
        break: a => { both(a, 'mumbai', r => { delete r.HealthCheckId; }); },
        fixed: a => recordsOk(a) && answerDR(a),
        verify: /^aws route53 test-dns-answer\b/, verifyText: 'DNS jawab dobara dekho (test-dns-answer)',
        hints: [H1, 'Health check toh sahi "Failure" bata raha, phir bhi DNS Mumbai deta hai. Record ko us health check ka pata bhi hai? list-resource-record-sets dekho.',
          `${upsert}, phir ${wait}, phir test-dns-answer`],
        solution: ['cat runbook.md', dns, status, list, upsert, wait, dns],
        why: 'Bina <b>HealthCheckId</b> ka PRIMARY record hamesha healthy maana jaata hai — failover kabhi hoga hi nahi. Health check alag se "Failure" dikhaata raha, par record use dekh hi nahi raha tha.' },
      { id: 'secondary-copy', title: 'SECONDARY record mein bhi Mumbai ka IP chala gaya',
        break: a => { both(a, 'hyderabad', r => { r.ResourceRecords = [{ Value: MUM }]; }); },
        fixed: a => recordsOk(a) && answerDR(a),
        verify: /^aws route53 test-dns-answer\b/, verifyText: 'DNS jawab dobara dekho (test-dns-answer)',
        hints: [H1, 'Health check "Failure" aur PRIMARY par HealthCheckId bhi hai — failover ho raha hai. Toh SECONDARY kis IP par bhej raha hai?',
          `${upsert}, phir ${wait}, phir test-dns-answer`],
        solution: ['cat runbook.md', dns, status, list, upsert, wait, dns],
        why: 'Failover <b>sahi chala</b> — par SECONDARY ka value bhi Mumbai tha (template copy-paste). Isliye jawab wahi down IP. DR record ka value DR ka hi hona chahiye; drill mein DNS jawab zaroor dekho.' },
      { id: 'ttl-long', title: 'Failover records ka TTL 60 se 3600 ho gaya',
        break: a => { ['mumbai', 'hyderabad'].forEach(id => both(a, id, r => { r.TTL = 3600; })); },
        fixed: a => recordsOk(a) && answerDR(a),
        verify: /^aws route53 (list-resource-record-sets|test-dns-answer)\b/, verifyText: 'records ya DNS jawab dobara dekho',
        hints: [H1, 'DNS sahi DR deta hai aur health check bhi theek. Records ki list mein ek number runbook se bahut bada hai — users ke resolvers kitni der purana jawab rakhenge?',
          `${upsert}, phir ${wait}, phir list-resource-record-sets`],
        solution: ['cat runbook.md', dns, status, list, upsert, wait, list],
        why: 'Failover ka faisla sahi tha, par <b>TTL 3600</b> par users ke resolvers purana Mumbai jawab ek ghante tak rakhte. Failover records ka TTL chhota (60) rakho, taaki naya jawab jaldi pahunche.' },
    ],
  });

  AG.addLab('route53', {
    type: 'chaos', id: 'chaos-route53', deck: 'route53', title: '🎲 Chaos round: DNS failover ka naya template',
    intro: 'Mumbai down, DR taiyaar — par failover mein ek galti. Teen probe, <b>EK badlaav</b>, phir batao kya toota tha.',
  });
})();
