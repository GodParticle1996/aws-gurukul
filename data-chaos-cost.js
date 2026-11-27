/* AWS Gurukul — mahine ke kharche ki jaanch.
   Warehouse import band ho chuka hai. Platform team ko approved inventory aur alert settings mein ek farq mila.
   volumes → orders vol-0c027000000000001 in-use, encrypted gp3, 1000 GiB, 3000 IOPS, 250 MiB/s. Audit volume bhi attached. Retired import disk vol-0c027000000000002 hata hua ho.
   snapshot → Import disk ka snapshot snap-0c027000000000001 completed, encrypted aur usi VolumeId se ho.
   groups → Dev logs ki retention 14 din, audit ki 90 din.
   notice → Monthly USD 1000 COST budget par ACTUAL, GREATER_THAN, 80 PERCENTAGE ka notice.
   policy → cost-alerts policy mein sirf budgets.amazonaws.com ko SNS:Publish. SourceAccount 123456789012 aur SourceArn arn:aws:budgets::123456789012:* ho.
   retired-disk → vol-0c027000000000002 available aur ApprovedDelete true
   extra-iops → orders gp3 Iops 12000
   dev-retention → /shopkaro/dev mein retentionInDays gayab
   notice-missing → Notifications khaali
   wrong-account → aws:SourceAccount 999999999999
*/
(function () {
  const level = AG.findLevel('cost');
  const review = level.interview.questions.find(q => q.terminal).terminal;
  const local = x => JSON.parse(JSON.stringify(x).replaceAll('444444444444', '123456789012').replaceAll('us-east-1', 'ap-south-1'));
  const account = local(review.account), files = local(review.files);
  const mission = level.stages.find(s => s.type === 'terminal');
  const retired = mission.account.volumes.find(v => v.name === 'retired-import');
  const topicArn = 'arn:aws:sns:ap-south-1:123456789012:cost-alerts';
  const topic = a => a.topics.find(t => t.arn === topicArn);
  const budget = a => a.budgets.find(b => b.definition.BudgetName === 'shopkaro-monthly');
  const prod = a => a.volumes.find(v => v.id === 'vol-0c027000000000001');
  const dev = a => a.logGroups.find(g => g.name === '/shopkaro/dev');
  topic(account).policy = JSON.parse(files['budget-topic-policy.json'].content);
  budget(account).notifications = JSON.parse(local(mission.files['notifications.json']).content);
  const volumes = "aws ec2 describe-volumes";
  const snapshot = "aws ec2 describe-snapshots --snapshot-ids snap-0c027000000000001";
  const groups = "aws logs describe-log-groups --log-group-name-prefix /shopkaro/";
  const notice = "aws budgets describe-notifications-for-budget --account-id 123456789012 --budget-name shopkaro-monthly";
  const policy = "aws sns get-topic-attributes --topic-arn arn:aws:sns:ap-south-1:123456789012:cost-alerts";
  const cards = [
    { id: "retired-disk", title: "Retired import disk ab bhi allocated hai",
      break: a => { a.volumes.push(JSON.parse(JSON.stringify(retired))); },
      probe: volumes, clue: "Warehouse owner ne cleanup approve kiya hai. Volume tag aur usi disk ka completed snapshot milao.",
      repair: ["aws ec2 describe-snapshots --snapshot-ids snap-0c027000000000001", "aws ec2 delete-volume --volume-id vol-0c027000000000002"],
      why: "<b>Available volume</b> ka storage bill chalta rehta hai. Is import par writes band hain aur aakhri copy owner ne verify ki hai." },
    { id: "extra-iops", title: "Orders disk par extra IOPS provision hue hain",
      break: a => { prod(a).iops = 12000; },
      probe: volumes, clue: "Peak review ne 3000 IOPS aur 250 MiB/s approve kiye hain. Usi volume par performance target lagao.",
      repair: ["aws ec2 modify-volume --volume-id vol-0c027000000000001 --volume-type gp3 --iops 3000 --throughput 250"],
      why: "<b>Provisioned IOPS</b> ka extra kharcha ho sakta hai. Approved throughput bachao aur asli workload par latency dobara naapo." },
    { id: "dev-retention", title: "Dev logs ki expiry hat gayi",
      break: a => { delete dev(a).retention; },
      probe: groups, clue: "Dev par 14 din ki policy lagao. Audit group ko 90 din chahiye.",
      repair: ["aws logs put-retention-policy --log-group-name /shopkaro/dev --retention-in-days 14"],
      why: "<b>Retention</b> ke bina dev logs jama hote rehte hain. Har group ki apni retention policy hai." },
    { id: "notice-missing", title: "Budget ka 80% alert gayab hai",
      break: a => { budget(a).notifications = []; },
      probe: notice, clue: "Budget bacha hai. Reviewed ACTUAL threshold aur SNS subscriber jodo.",
      repair: ["aws budgets create-notification --account-id 123456789012 --budget-name shopkaro-monthly --notification file://threshold80.json --subscribers file://subscribers.json"],
      why: "<b>Budget notification</b> threshold aur receiver ko jodti hai. Budget amount khud kharche ko nahi rokta." },
    { id: "wrong-account", title: "SNS policy doosre account ko allow karti hai",
      break: a => { topic(a).policy.Statement[0].Condition.StringEquals['aws:SourceAccount'] = '999999999999'; },
      probe: policy, clue: "Budget ka account aur SNS policy ka SourceAccount milao. Reviewed policy mein SourceArn ki rok bhi hai.",
      repair: ["aws sns set-topic-attributes --topic-arn arn:aws:sns:ap-south-1:123456789012:cost-alerts --attribute-name Policy --attribute-value file://budget-topic-policy.json"],
      why: "<b>SourceAccount</b> galat ho toh sahi budget ko publish ki permission nahi milti. Policy repair ke baad receiver alag se test karo." },
  ];
  function healthy(a) {
    const v = prod(a), b = budget(a);
    const snap = a.snapshots.find(s => s.id === 'snap-0c027000000000001');
    const audit = a.volumes.find(x => x.id === 'vol-0c027000000000003');
    return v?.state === 'in-use' && v.attachedTo && v.encrypted && v.type === 'gp3' && v.iops === 3000 && v.throughput === 250 && v.size === 1000
      && audit?.state === 'in-use' && audit.attachedTo && !a.volumes.some(x => x.id === retired.id)
      && snap?.volumeId === retired.id && snap.state === 'completed' && snap.encrypted
      && dev(a)?.retention === 14 && a.logGroups.find(g => g.name === '/shopkaro/audit')?.retention === 90
      && b?.definition.BudgetType === 'COST' && b.definition.TimeUnit === 'MONTHLY' && Number(b.definition.BudgetLimit.Amount) === 1000
      && b.definition.BudgetLimit.Unit === 'USD' && b.notifications.some(({ Notification: n, Subscribers: subs }) =>
        n.NotificationType === 'ACTUAL' && n.Threshold === 80 && n.ThresholdType === 'PERCENTAGE' && n.ComparisonOperator === 'GREATER_THAN'
        && subs.some(s => s.SubscriptionType === 'SNS' && s.Address === topicArn)) && AG.costTopicAllowed(a, topicArn);
  }
  AG.chaos.addDeck({
    id: "cost", title: "mahine ke kharche ki jaanch", account,
    files: files,
    alert: "Warehouse import band ho chuka hai. Platform team ko approved inventory aur alert settings mein ek farq mila. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# mahine ke kharche ki jaanch
Har jawab ko sahi haal se milao.

1. orders vol-0c027000000000001 in-use, encrypted gp3, 1000 GiB, 3000 IOPS, 250 MiB/s. Audit volume bhi attached. Retired import disk vol-0c027000000000002 hata hua ho.
   ${volumes}
2. Import disk ka snapshot snap-0c027000000000001 completed, encrypted aur usi VolumeId se ho.
   ${snapshot}
3. Dev logs ki retention 14 din, audit ki 90 din.
   ${groups}
4. Monthly USD 1000 COST budget par ACTUAL, GREATER_THAN, 80 PERCENTAGE ka notice.
   ${notice}
5. cost-alerts policy mein sirf budgets.amazonaws.com ko SNS:Publish. SourceAccount 123456789012 aur SourceArn arn:aws:budgets::123456789012:* ho.
   ${policy}
6. shopkaro-monthly ka BudgetLimit USD 1000, TimeUnit MONTHLY aur BudgetType COST.
   aws budgets describe-budget --account-id 123456789012 --budget-name shopkaro-monthly
7. Agar 80% notice maujood hai, uska subscriber SNS cost-alerts hona chahiye.
   aws budgets describe-subscribers-for-notification --account-id 123456789012 --budget-name shopkaro-monthly --notification file://threshold80.json

Sirf EK cheez galat hai. Usi ko theek karo, phir dobara jaancho.
Warehouse owner ne final snapshot verify kiya hai. Uske baad import disk par writes nahi hui. Sirf ApprovedDelete=true wali retired disk hata sakte ho.
Review hui files: threshold80.json, subscribers.json, budget-topic-policy.json.`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join('\\s+') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke sab probe chalao. Kaunsa jawab sahi haal se alag hai?', c.clue, c.repair.join(' phir ')],
      solution: ['cat runbook.md', c.probe, ...c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab("cost", {
    type: "chaos", id: "chaos-cost", deck: "cost", title: "🎲 Chaos round: mahine ke kharche ki jaanch",
    intro: "EBS, logs aur budget ke jawab dekho. Data aur approved performance bachakar galti theek karo.",
  });
})();
