/* AWS Gurukul — web aur DB ka network.
   ShopKaro ke network review mein ek rule ya route badla mila.
   routes → Har table mein local route active. Sirf rtb-public ka doosra route 0.0.0.0/0 → igw-shop. Web subnet rtb-public par aur DB subnet rtb-private par.
   webRules → Web inbound mein sirf TCP 443, source 0.0.0.0/0.
   dbRules → DB inbound mein sirf TCP 5432, source sg-web.
   igw-route → rtb-public mein default route gayab
   web-main → subnet-web-a ki explicit association gayab
   db-public-table → subnet-db-a ki association rtb-public par
   https-missing → sg-web mein IpPermissions khaali
   db-world → sg-db mein extra 0.0.0.0/0 rule
*/
(function () {
  const mission = AG.findLevel('vpcbasics').stages.find(s => s.type === 'terminal');
  const account = JSON.parse(JSON.stringify(mission.account));
  const rt = (a, id) => a.routeTables.find(t => t.id === 'rtb-' + id);
  const sg = (a, id) => a.securityGroups.find(g => g.id === 'sg-' + id);
  const web = rt(account, 'public'), db = rt(account, 'private');
  [web.associations, db.associations] = [db.associations, web.associations];
  sg(account, 'db').ingress = [{ protocol: 'tcp', fromPort: 5432, toPort: 5432, sourceGroup: 'sg-web' }];
  account.instances.find(i => i.id === 'i-db').publicIp = null;
  const routes = "aws ec2 describe-route-tables --filters Name=vpc-id,Values=vpc-shop";
  const webRules = "aws ec2 describe-security-groups --group-ids sg-web";
  const dbRules = "aws ec2 describe-security-groups --group-ids sg-db";
  const cards = [
    { id: "igw-route", title: "Internet gateway ka route gayab hai",
      break: a => { rt(a, 'public').routes.pop(); },
      probe: routes, clue: "Web subnet sahi table par hai. Internet ke liye default route mein attached gateway chahiye.",
      repair: ["aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0 --gateway-id igw-shop"],
      why: "<b>Default route</b> web subnet ke internet traffic ko IGW tak bhejta hai." },
    { id: "web-main", title: "Web subnet main table use kar raha hai",
      break: a => { rt(a, 'public').associations = []; },
      probe: routes, clue: "Explicit association hatne par subnet main table use karta hai. Main table ko local-only rakho.",
      repair: ["aws ec2 associate-route-table --route-table-id rtb-public --subnet-id subnet-web-a"],
      why: "<b>Association</b> se sirf web subnet ka route badalta hai. Main table par nirbhar baaki subnets private rehte hain." },
    { id: "db-public-table", title: "DB subnet public table par hai",
      break: a => { rt(a, 'public').associations.push(rt(a, 'private').associations.pop()); },
      probe: routes, clue: "DB subnet ki current association ID padho. Us association ko private table par le jao.",
      repair: ["aws ec2 replace-route-table-association --association-id rtbassoc-db-a --route-table-id rtb-private"],
      why: "DB subnet ka <b>route table</b> tay karta hai ki IGW ka raasta hai ya nahi. Public route akela DB ko internet se reachable nahi banata." },
    { id: "https-missing", title: "Web ka HTTPS rule gayab hai",
      break: a => { sg(a, 'web').ingress = []; },
      probe: webRules, clue: "Public web listener ko TCP 443 par traffic chahiye. Sirf wahi port kholo.",
      repair: ["aws ec2 authorize-security-group-ingress --group-id sg-web --protocol tcp --port 443 --cidr 0.0.0.0/0"],
      why: "<b>HTTPS ingress</b> listener tak traffic aane deta hai. Route table TCP port ki permission nahi deta." },
    { id: "db-world", title: "DB par extra internet-wide rule hai",
      break: a => { sg(a, 'db').ingress.push({ protocol: 'tcp', fromPort: 5432, toPort: 5432, cidr: '0.0.0.0/0' }); },
      probe: dbRules, clue: "Postgres ka sg-web rule pehle se hai. Extra CIDR rule hatao.",
      repair: ["aws ec2 revoke-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --cidr 0.0.0.0/0"],
      why: "<b>Source security group</b> se DB sirf web group se connections leta hai. Broad CIDR rule us rok ko kamzor karta hai." },
  ];
  function healthy(a) {
    const local = t => t?.routes.some(r => r.destination === '10.0.0.0/16' && r.target === 'local' && r.state !== 'blackhole');
    const pub = rt(a, 'public'), priv = rt(a, 'private'), main = rt(a, 'main');
    const web = sg(a, 'web')?.ingress, db = sg(a, 'db')?.ingress;
    const port = (rules, n) => rules?.length === 1 && rules[0].protocol === 'tcp' && rules[0].fromPort === n && rules[0].toPort === n;
    return [pub, priv, main].every(local) && pub.routes.length === 2 && priv.routes.length === 1 && main.routes.length === 1
      && pub.routes.some(r => r.destination === '0.0.0.0/0' && r.target === 'igw-shop' && r.state !== 'blackhole')
      && pub.associations.some(x => x.subnetId === 'subnet-web-a') && priv.associations.some(x => x.subnetId === 'subnet-db-a')
      && port(web, 443) && web[0].cidr === '0.0.0.0/0' && port(db, 5432) && db[0].sourceGroup === 'sg-web';
  }
  AG.chaos.addDeck({
    id: "vpcbasics", title: "web aur DB ka network", account,
    alert: "ShopKaro ke network review mein ek rule ya route badla mila. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# web aur DB ka network
Har jawab ko sahi haal se milao.

1. Har table mein local route active. Sirf rtb-public ka doosra route 0.0.0.0/0 → igw-shop. Web subnet rtb-public par aur DB subnet rtb-private par.
   ${routes}
2. Web inbound mein sirf TCP 443, source 0.0.0.0/0.
   ${webRules}
3. DB inbound mein sirf TCP 5432, source sg-web.
   ${dbRules}

Sirf EK cheez galat hai. Usi ko theek karo, phir dobara jaancho.
`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join('\\s+') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke sab probe chalao. Kaunsa jawab sahi haal se alag hai?', c.clue, c.repair.join(' phir ')],
      solution: ['cat runbook.md', c.probe, ...c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab("vpcbasics", {
    type: "chaos", id: "chaos-vpcbasics", deck: "vpcbasics", title: "🎲 Chaos round: web aur DB ka network",
    intro: "Web aur DB ke routes aur inbound rules padho. Ek galat entry theek karo.",
  });
})();
