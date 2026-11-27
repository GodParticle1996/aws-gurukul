/* 🎲 Chaos deck 's3' — Beginner level s3. Engine: chaos.js. Fixture: s3 level ke terminal mission ka clone (Codex, 2026-11-27).
   Product photos ki jaanch.
   ShopKaro ke catalog audit mein ek check fail hua.
   Swasth base aur probes:
   block → Chaaron switches true.
   version → Status Enabled.
   life → Purane versions ki safai 30 din baad.
   kurta → Kurta ka current version v-kr-001.
   banner → Banner ka current version v-bn-001.
   policy-guard → BlockPublicPolicy false hai. Nayi public policy ko bucket par rokna hai.
   suspended → Suspended mein purane versions bachte hain. Naye uploads ke liye versioning chalu karo.
   early-expiry → NoncurrentDays 1 hai. Runbook 30 din ka recovery time maangta hai.
   delete-marker → DeleteMarkers mein IsLatest true hai. Sirf us marker ki ID hatao.
   draft-banner → 912-byte draft v-bn-002 latest hai. Is draft ko hatane ki approval hai.
*/
(function () {
  const account = JSON.parse(JSON.stringify(AG.findLevel('s3').stages.find(s => s.type === 'terminal').account));
  const bucket = a => a.buckets.find(b => b.name === 'shopkaro-product-images');
  const b = bucket(account);
  const switches = ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'];
  b.bpa = Object.fromEntries(switches.map(k => [k, true]));
  delete b.policy;
  b.public = false;
  const lifecycle = { Rules: [{ ID: 'old-photos', Filter: { Prefix: 'images/' }, Status: 'Enabled', NoncurrentVersionExpiration: { NoncurrentDays: 30 } }] };
  b.lifecycle = lifecycle;
  const red = 'images/kurta-red.jpg', hero = 'images/banner.jpg';
  const marker = b.versions[red].shift(), preview = b.versions[hero].shift();
  const block = "aws s3api get-public-access-block --bucket shopkaro-product-images";
  const version = "aws s3api get-bucket-versioning --bucket shopkaro-product-images";
  const life = "aws s3api get-bucket-lifecycle-configuration --bucket shopkaro-product-images";
  const kurta = "aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/kurta-red.jpg";
  const banner = "aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/banner.jpg";
  const cards = [
    { id: "policy-guard", title: "Public policy lagane ka guard band hai",
      break: a => { bucket(a).bpa.BlockPublicPolicy = false; },
      probe: block, clue: "BlockPublicPolicy false hai. Nayi public policy ko bucket par rokna hai.",
      repair: "aws s3api put-public-access-block --bucket shopkaro-product-images --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
      why: "<b>BlockPublicPolicy</b> nayi public policy ko rokta hai. Switch band hone se akela bucket public nahi hota." },
    { id: "suspended", title: "Naye uploads ki versioning ruk gayi",
      break: a => { bucket(a).versioning = false; },
      probe: version, clue: "Suspended mein purane versions bachte hain. Naye uploads ke liye versioning chalu karo.",
      repair: "aws s3api put-bucket-versioning --bucket shopkaro-product-images --versioning-configuration Status=Enabled",
      why: "<b>Enabled</b> hone par har naye upload ko apna version milta hai." },
    { id: "early-expiry", title: "Purane versions jaldi expire ho rahe hain",
      break: a => { bucket(a).lifecycle.Rules[0].NoncurrentVersionExpiration.NoncurrentDays = 1; },
      probe: life, clue: "NoncurrentDays 1 hai. Runbook 30 din ka recovery time maangta hai.",
      repair: "aws s3api put-bucket-lifecycle-configuration --bucket shopkaro-product-images --lifecycle-configuration file://cleanup.json",
      why: "<b>NoncurrentDays</b> purani copy ki recovery window tay karta hai." },
    { id: "delete-marker", title: "Kurta photo par delete marker hai",
      break: a => { bucket(a).versions[red].unshift({ ...marker }); },
      probe: kurta, clue: "DeleteMarkers mein IsLatest true hai. Sirf us marker ki ID hatao.",
      repair: "aws s3api delete-object --bucket shopkaro-product-images --key images/kurta-red.jpg --version-id dm-kr-002",
      why: "<b>Delete marker</b> hatne par neeche ki photo phir current ban jaati hai." },
    { id: "draft-banner", title: "Draft banner live ho gaya",
      break: a => { bucket(a).versions[hero].unshift({ ...preview }); },
      probe: banner, clue: "912-byte draft v-bn-002 latest hai. Is draft ko hatane ki approval hai.",
      repair: "aws s3api delete-object --bucket shopkaro-product-images --key images/banner.jpg --version-id v-bn-002",
      why: "<b>Version ID</b> se delete karne par sirf chuna hua draft permanently hatta hai. Purana banner phir current hai." },
  ];
  function healthy(a) {
    const b = bucket(a);
    return !!b && !b.public && !b.policy && switches.every(k => b.bpa?.[k] === true)
      && b.versioning === true && JSON.stringify(b.lifecycle) === JSON.stringify(lifecycle)
      && b.versions?.[red]?.[0]?.versionId === 'v-kr-001' && b.versions?.[hero]?.[0]?.versionId === 'v-bn-001';
  }
  AG.chaos.addDeck({
    id: "s3", title: "Product photos ki jaanch", account,
    files: { 'cleanup.json': { content: JSON.stringify(lifecycle) } },
    alert: "ShopKaro ke catalog audit mein ek check fail hua. Ek galti dhoondho. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# Product photos ki bucket — jaanch (shopkaro-product-images)
Har probe chalao. Jawab ko neeche likhe "sahi haal" se milao.

1. Block Public Access — chaaron switch true:
   ${block}
2. Versioning — Status: Enabled:
   ${version}
3. Lifecycle — purane (noncurrent) versions 30 din baad hi expire hon:
   ${life}
4. Kurta photo — latest version v-kr-001, koi delete marker nahi:
   ${kurta}
5. Banner — latest version v-bn-001:
   ${banner}

Sirf EK cheez galat hai. Usi ko theek karo, phir wahi probe dobara chalao.
Review hua lifecycle: cleanup.json`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join(' ') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke paanchon probe chalao. Har jawab runbook ke "sahi haal" se milao — kaunsa mel nahi khaata?', c.clue, c.repair],
      solution: ['cat runbook.md', c.probe, c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab('s3', {
    type: 'chaos', id: 'chaos-s3', deck: 's3', title: '🎲 Chaos round: product photos ki bucket',
    intro: 'Paanch probe, ek galat setting. Block Public Access, versioning, lifecycle aur photos ke versions padho — <b>EK badlaav</b> se theek karo.',
  });
})();
