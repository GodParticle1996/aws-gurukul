/* AWS Gurukul — catalog import ki taiyari.
   Catalog import abhi shuru nahi hua. Prod DB ki preflight jaanch mein ek setting galat mili.
   describe → prod-db available, MultiAZ true, BackupRetentionPeriod 7, DeletionProtection true, PubliclyAccessible false, StorageEncrypted true. PendingModifiedValues khaali.
   snapshots → catalog-before-import ka Status available, source prod-db aur Encrypted true.
   single-az → MultiAZ false
   backup-off → BackupRetentionPeriod 0
   delete-guard → DeletionProtection false
   public-db → PubliclyAccessible true
   snapshot-missing → DBSnapshots khaali
*/
(function () {
  const mission = AG.findLevel('rds').stages.find(s => s.type === 'terminal');
  const account = JSON.parse(JSON.stringify(mission.account));
  const db = a => a.rds.find(r => r.id === 'prod-db');
  Object.assign(db(account), { multiAZ: true, backupRetention: 7, deletionProtection: true });
  const snapshot = 'catalog-before-import';
  account.dbSnapshots = [{ id: snapshot, source: 'prod-db', state: 'available', db: { ...db(account) } }];
  const describe = "aws rds describe-db-instances --db-instance-identifier prod-db";
  const snapshots = "aws rds describe-db-snapshots --db-instance-identifier prod-db";
  const cards = [
    { id: "single-az", title: "Standby band hai",
      break: a => { db(a).multiAZ = false; },
      probe: describe, clue: "MultiAZ true hone par doosri AZ mein standby milta hai.",
      repair: ["aws rds modify-db-instance --db-instance-identifier prod-db --multi-az --apply-immediately", "aws rds wait db-instance-available --db-instance-identifier prod-db"],
      why: "<b>Multi-AZ</b> standby AZ failure ke baad failover mein madad karta hai." },
    { id: "backup-off", title: "Automated backups band hain",
      break: a => { db(a).backupRetention = 0; },
      probe: describe, clue: "Retention 0 par naye automated backups band hain. Saat din wapas set karo.",
      repair: ["aws rds modify-db-instance --db-instance-identifier prod-db --backup-retention-period 7 --apply-immediately", "aws rds wait db-instance-available --db-instance-identifier prod-db"],
      why: "<b>BackupRetentionPeriod</b> naye automated backups ki window set karta hai. Purane saat din turant wapas nahi milte. 0 se badalne par chhota outage ho sakta hai — isliye approved window mein." },
    { id: "delete-guard", title: "DB delete karne ka guard band hai",
      break: a => { db(a).deletionProtection = false; },
      probe: describe, clue: "Instance delete karne se pehle guard hatana padna chahiye.",
      repair: ["aws rds modify-db-instance --db-instance-identifier prod-db --deletion-protection --apply-immediately", "aws rds wait db-instance-available --db-instance-identifier prod-db"],
      why: "<b>Deletion protection</b> DB instance ko delete hone se bachati hai. SQL DELETE phir bhi chal sakta hai." },
    { id: "public-db", title: "Public endpoint setting chalu hai",
      break: a => { db(a).publicAccess = true; },
      probe: describe, clue: "Catalog ki policy private DB maangti hai. PubliclyAccessible flag dekho.",
      repair: ["aws rds modify-db-instance --db-instance-identifier prod-db --no-publicly-accessible --apply-immediately", "aws rds wait db-instance-available --db-instance-identifier prod-db"],
      why: "<b>PubliclyAccessible</b> ko false karne se DB private rehta hai. Actual connectivity routes aur security groups par bhi depend karti hai." },
    { id: "snapshot-missing", title: "Import ka snapshot gayab hai",
      break: a => { a.dbSnapshots = []; },
      probe: snapshots, clue: "Import abhi shuru nahi hua. Isi waqt prod-db ka manual snapshot lo.",
      repair: ["aws rds create-db-snapshot --db-instance-identifier prod-db --db-snapshot-identifier catalog-before-import", "aws rds wait db-snapshot-available --db-snapshot-identifier catalog-before-import"],
      why: "<b>Manual snapshot</b> import se pehle ka recovery point rakhta hai. Snapshot available hone ke baad hi import karo." },
  ];
  function healthy(a) {
    const r = db(a);
    return r?.state === 'available' && r.multiAZ && r.backupRetention === 7 && r.deletionProtection
      && r.encrypted && !r.publicAccess && !Object.keys(r.pending || {}).length
      && a.dbSnapshots?.some(s => s.id === snapshot && s.source === r.id && s.state === 'available' && s.db.encrypted);
  }
  AG.chaos.addDeck({
    id: "rds", title: "catalog import ki taiyari", account,
    alert: "Catalog import abhi shuru nahi hua. Prod DB ki preflight jaanch mein ek setting galat mili. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# catalog import ki taiyari
Har jawab ko sahi haal se milao.

1. prod-db available, MultiAZ true, BackupRetentionPeriod 7, DeletionProtection true, PubliclyAccessible false, StorageEncrypted true. PendingModifiedValues khaali.
   ${describe}
2. catalog-before-import ka Status available, source prod-db aur Encrypted true.
   ${snapshots}

Sirf EK cheez galat hai. Usi ko theek karo, phir dobara jaancho.
Badlaav isi approved maintenance window mein lagao. Available hone ka wait karo.`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join('\\s+') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke sab probe chalao. Kaunsa jawab sahi haal se alag hai?', c.clue, c.repair.join(' phir ')],
      solution: ['cat runbook.md', c.probe, ...c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab("rds", {
    type: "chaos", id: "chaos-rds", deck: "rds", title: "🎲 Chaos round: catalog import ki taiyari",
    intro: "DB aur snapshot ke jawab padho. Import se pehle galat setting theek karo.",
  });
})();
