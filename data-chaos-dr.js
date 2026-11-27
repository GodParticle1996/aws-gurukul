/* AWS Gurukul — Mumbai se Hyderabad ki DR taiyari.
   Pehli scheduled backup copy se pehle DR team Hyderabad ki taiyari jaanch rahi hai.
   plan → Mumbai mein ek rule: continuous backup true, source vault shopkaro-prod-vault, 35 din. Roz 20:00 UTC par Hyderabad ke shopkaro-dr-vault mein copy, uski retention bhi 35 din.
   vaults → Hyderabad mein shopkaro-dr-vault ka EncryptionKeyArn arn:aws:kms:ap-south-2:123456789012:key/7a1c0000-0000-4000-8000-00000000b002.
   replicas → orders-dr available. Source Mumbai orders ka ARN. StorageEncrypted true, wahi Hyderabad key, PubliclyAccessible false, dr-private subnet group aur sirf sg-0afd0db00000000a1.
   pitr-off → EnableContinuousBackup false
   copy-missing → CopyActions khaali
   copy-retention → CopyActions Lifecycle.DeleteAfterDays 1
   vault-missing → BackupVaultList mein shopkaro-dr-vault gayab
   replica-missing → DBInstances mein orders-dr gayab
*/
(function () {
  const level = AG.findLevel('dr');
  const drill = level.interview.questions.find(q => q.terminal).terminal;
  const mission = level.stages.find(s => s.type === 'terminal');
  // Ready DR drill ko lab account mein clone karo. ARN references saath badalte hain.
  const local = x => JSON.parse(JSON.stringify(x).replaceAll('333333333333', '123456789012')
    .replaceAll('sg-0hyd0db00000000a1', 'sg-0afd0db00000000a1'));
  const account = local(drill.account);
  const files = { 'plan.json': local(mission.files['plan.json']) };
  const planId = '00000000-0000-4000-8000-000000000001';
  const rule = a => a.backupPlans.find(p => p.id === planId && p.region === 'ap-south-1')?.document.Rules[0];
  const vaultArn = 'arn:aws:backup:ap-south-2:123456789012:backup-vault:shopkaro-dr-vault';
  const drKey = 'arn:aws:kms:ap-south-2:123456789012:key/7a1c0000-0000-4000-8000-00000000b002';
  const source = 'arn:aws:rds:ap-south-1:123456789012:db:orders';
  const plan = "aws backup get-backup-plan --backup-plan-id 00000000-0000-4000-8000-000000000001 --region ap-south-1";
  const vaults = "aws backup list-backup-vaults --region ap-south-2";
  const replicas = "aws rds describe-db-instances --region ap-south-2";
  const cards = [
    { id: "pitr-off", title: "Mumbai ka continuous backup band hai",
      break: a => { rule(a).EnableContinuousBackup = false; },
      probe: plan, clue: "Daily snapshots ke beech ka recovery point chahiye. Mumbai ke rule mein continuous backup dekho.",
      repair: ["aws backup update-backup-plan --backup-plan-id 00000000-0000-4000-8000-000000000001 --backup-plan file://plan.json --region ap-south-1"],
      why: "<b>Continuous backup</b> source par point-in-time recovery ke liye hai. Hyderabad ki scheduled copy ek alag recovery point hai." },
    { id: "copy-missing", title: "Hyderabad copy ka action gayab hai",
      break: a => { rule(a).CopyActions = []; },
      probe: plan, clue: "Source vault theek hai. Rule mein doosre Region ka destination ARN bhi chahiye.",
      repair: ["aws backup update-backup-plan --backup-plan-id 00000000-0000-4000-8000-000000000001 --backup-plan file://plan.json --region ap-south-1"],
      why: "<b>CopyActions</b> rule ko destination vault deta hai. Sirf vault banane se copy schedule nahi hoti." },
    { id: "copy-retention", title: "Hyderabad copy ek din mein expire hoti hai",
      break: a => { rule(a).CopyActions[0].Lifecycle.DeleteAfterDays = 1; },
      probe: plan, clue: "Destination copy ki apni lifecycle hai. Team dono Regions mein 35 din maangti hai.",
      repair: ["aws backup update-backup-plan --backup-plan-id 00000000-0000-4000-8000-000000000001 --backup-plan file://plan.json --region ap-south-1"],
      why: "<b>Copy lifecycle</b> destination par retention set karti hai. Source retention badalne se copy ki setting nahi badalti." },
    { id: "vault-missing", title: "Hyderabad mein destination vault gayab hai",
      break: a => { a.backupVaults = a.backupVaults.filter(v => v.arn !== vaultArn); },
      probe: vaults, clue: "Plan mein ARN hai, par destination Region mein vault bhi hona chahiye. Approved Hyderabad key lagao.",
      repair: ["aws backup create-backup-vault --backup-vault-name shopkaro-dr-vault --encryption-key-arn arn:aws:kms:ap-south-2:123456789012:key/7a1c0000-0000-4000-8000-00000000b002 --region ap-south-2"],
      why: "<b>Destination vault</b> banne se nayi copies ke liye jagah milti hai. Purane recovery points isse wapas nahi aate." },
    { id: "replica-missing", title: "Hyderabad ka orders replica gayab hai",
      break: a => { a.rds = a.rds.filter(d => d.region !== 'ap-south-2'); },
      probe: replicas, clue: "Private encrypted read replica Hyderabad mein banao. Source ke liye Mumbai ka poora ARN do.",
      repair: ["aws rds create-db-instance-read-replica --db-instance-identifier orders-dr --source-db-instance-identifier arn:aws:rds:ap-south-1:123456789012:db:orders --source-region ap-south-1 --db-instance-class db.r6g.large --db-subnet-group-name dr-private --vpc-security-group-ids sg-0afd0db00000000a1 --kms-key-id alias/shop-dr --no-publicly-accessible --region ap-south-2", "aws rds wait db-instance-available --db-instance-identifier orders-dr --region ap-south-2"],
      why: "<b>Read replica</b> source se async updates leti hai. Available status se replication lag ka number nahi milta." },
  ];
  function healthy(a) {
    const r = rule(a), c = r?.CopyActions?.[0], d = a.rds.find(x => x.id === 'orders-dr' && x.region === 'ap-south-2');
    return r?.EnableContinuousBackup === true && r.TargetBackupVaultName === 'shopkaro-prod-vault'
      && r.ScheduleExpression === 'cron(0 20 * * ? *)' && r.Lifecycle?.DeleteAfterDays === 35
      && r.CopyActions?.length === 1 && c.DestinationBackupVaultArn === vaultArn && c.Lifecycle?.DeleteAfterDays === 35
      && a.backupVaults.some(v => v.arn === vaultArn && v.encryptionKeyArn === drKey)
      && d?.state === 'available' && d.source === source && d.encrypted && d.kmsKey === drKey
      && !d.publicAccess && d.subnetGroup === 'dr-private' && d.sgIds?.length === 1 && d.sgIds[0] === 'sg-0afd0db00000000a1';
  }
  AG.chaos.addDeck({
    id: "dr", title: "Mumbai se Hyderabad ki DR taiyari", account,
    files: files,
    alert: "Pehli scheduled backup copy se pehle DR team Hyderabad ki taiyari jaanch rahi hai. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# Mumbai se Hyderabad ki DR taiyari
Har jawab ko sahi haal se milao.

1. Mumbai mein ek rule: continuous backup true, source vault shopkaro-prod-vault, 35 din. Roz 20:00 UTC par Hyderabad ke shopkaro-dr-vault mein copy, uski retention bhi 35 din.
   ${plan}
2. Hyderabad mein shopkaro-dr-vault ka EncryptionKeyArn arn:aws:kms:ap-south-2:123456789012:key/7a1c0000-0000-4000-8000-00000000b002.
   ${vaults}
3. orders-dr available. Source Mumbai orders ka ARN. StorageEncrypted true, wahi Hyderabad key, PubliclyAccessible false, dr-private subnet group aur sirf sg-0afd0db00000000a1.
   ${replicas}

Sirf EK cheez galat hai. Usi ko theek karo, phir dobara jaancho.
Review hui file: plan.json. Ye taiyari ki jaanch hai. Restore karke data padhne ka drill alag hai.`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join('\\s+') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke sab probe chalao. Kaunsa jawab sahi haal se alag hai?', c.clue, c.repair.join(' phir ')],
      solution: ['cat runbook.md', c.probe, ...c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab("dr", {
    type: "chaos", id: "chaos-dr", deck: "dr", title: "🎲 Chaos round: Mumbai se Hyderabad ki DR taiyari",
    intro: "Plan, destination vault aur replica ke jawab milao. Ek galti theek karo.",
  });
})();
