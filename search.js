AG.search = (() => {
  const terms = [
    ['Availability Zone (AZ)', 'Ek Region ke andar alag jagah hai jahan ek ya zyada data centers hote hain.', 'cloud101'],
    ['Region', 'AWS ki ek geographic jagah hai jismein kai Availability Zones hain.', 'cloud101'],
    ['IAM role', 'Role assume karne par kuch der ke liye uski permissions ke saath credentials milte hain.', 'iam'],
    ['Least privilege', 'Kisi user ya app ko sirf apne kaam ke liye zaroori access do.', 'iam'],
    ['EC2 instance', 'AWS par chalne waali virtual machine hai.', 'ec2'],
    ['AMI', 'Amazon Machine Image mein woh software aur settings hoti hain jinse naya EC2 instance shuru hota hai.', 'ec2'],
    ['S3 bucket', 'Objects ko unki keys ke saath rakhne ki jagah hai.', 's3'],
    ['Versioning', 'Ek object key ki purani copies bhi alag version IDs par rakh sakte ho.', 's3'],
    ['VPC', 'AWS mein apna alag virtual network hai.', 'vpcbasics'],
    ['Subnet', 'Ek AZ mein VPC ke IP addresses ka ek hissa hai.', 'vpcbasics'],
    ['Security group', 'Resource ke network interface par kaunsa traffic aane aur jaane dena hai, uske rules hain.', 'vpcbasics'],
    ['NAT gateway', 'Private subnet ke resources ko bahar connection shuru karne ka raasta deta hai.', 'vpcdeep'],
    ['Gateway endpoint', 'VPC ki route table se same Region ke S3 ya DynamoDB tak seedha raasta deta hai.', 'vpcdeep'],
    ['Read replica', 'Database ki ek aur copy jo reads ka kuch kaam sambhaalti hai.', 'rds'],
    ['Multi-AZ', 'App ya database ke resources ek Region ki alag AZs mein rakhe jaate hain.', 'rds'],
    ['Load balancer', 'Aane waale traffic ko taiyaar targets ke beech baantta hai.', 'elbasg'],
    ['Auto Scaling group', 'EC2 instances ki ginti ko chuni hui range aur policies ke hisaab se sambhaalta hai.', 'elbasg'],
    ['DNS', 'Naam ke liye DNS record dhoondhta hai, jaise app ke naam se IP address.', 'route53'],
    ['TTL', 'Time to live bataata hai cached DNS record kitni der tak rakha ja sakta hai.', 'route53'],
    ['Cache key', 'Cache mein kaunsi requests ek hi saved response le sakti hain, yeh key tay karti hai.', 'cloudfront'],
    ['Partition key', 'DynamoDB is key ki value se tay karta hai ki item kahan rakha jaaye.', 'dynamodb'],
    ['FIFO', 'First in, first out. SQS FIFO queue mein ek message group ke messages apne order mein milte hain.', 'messaging'],
    ['Dead-letter queue (DLQ)', 'Jin messages ko baar-baar process nahi kar paaye, unhe alag queue mein dekh sakte hain.', 'sqssns'],
    ['Idempotency', 'Ek hi kaam dobara bhejne par uska asar dobara nahi hota.', 'resilience'],
    ['Fan-out', 'Ek message se kai consumers ko apni copy milti hai.', 'messaging'],
    ['RTO', 'Recovery time objective bataata hai outage ke baad service kitni der mein waapas chahiye.', 'dr'],
    ['RPO', 'Recovery point objective bataata hai ki waqt mein kitna data gap seh sakte hain.', 'dr'],
    ['Snapshot', 'Disk ya database ka ek waqt ka saved roop jisse restore kar sakte hain.', 'rds'],
    ['Container image', 'App aur use chalaane ke liye zaroori files ka package hai.', 'containers'],
    ['Infrastructure as code (IaC)', 'Network, servers aur doosre resources ka setup files mein likhte hain.', 'iac'],
    ['CloudWatch alarm', 'Metric ki values aur apne rules se alarm ki state badalti hai.', 'observability'],
    ['Savings Plans', 'Har ghante ke kharche ka commitment dene par eligible usage ki rate kam ho sakti hai.', 'cost'],
    ['Athena', 'SQL se S3 mein rakhe data par sawaal chala sakte ho.', 'analytics'],
    ['KMS key', 'AWS Key Management Service mein encryption jaise kaam ke liye key rakhi aur sambhaali jaati hai.', 'security'],
  ];
  const kinds = ['Glossary', 'Level', 'Lesson card', 'Flashcard', 'Decision Dojo'];
  const plain = s => String(s || '').replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
  const fold = s => plain(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let catalog;
  function index() {
    if (catalog) return catalog;
    catalog = [];
    function add(kind, title, lines, source, level, tree, leaf) {
      const detail = lines.flat().filter(Boolean).map(plain);
      catalog.push({ kind, title: plain(title), detail, source: plain(source), level, tree, leaf,
        key: fold([title, ...detail, source].join(' ')) });
    }
    for (const [term, line, id] of terms) add('Glossary', term, [line], AG.findLevel(id).title, id);
    for (const t of AG.tracks) for (const l of AG.levelsOf(t)) {
      add('Level', l.title, [l.objectives || []], t.name, l.id);
      for (const s of l.steps || []) add('Lesson card', s.q, [s.analogy, s.body, s.points || [], s.asli], l.title, l.id);
      for (const c of l.cards || []) add('Flashcard', c.front, [c.back], l.title, l.id);
    }
    for (const t of AG.decisions) for (const id of AG.leavesOf(t)) {
      const n = t.nodes[id];
      add('Decision Dojo', n.pick, [n.one,n.why,n.when || [],n.avoid || [],n.gotchas || [],n.cost,n.exam,n.iac,n.example], t.title, n.level, t, id);
    }
    return catalog;
  }
  function find(query, kind = '') {
    const words = fold(query).split(' ').filter(Boolean);
    return index().filter(r => (!kind || r.kind === kind) && (!words.length && !kind ? r.kind === 'Glossary' : words.every(w => r.key.includes(w))))
      .sort((a,b) => Number(words.every(w => fold(b.title).includes(w))) - Number(words.every(w => fold(a.title).includes(w))) || a.title.localeCompare(b.title));
  }
  function show() {
    AG.session = null; AG.nav.set('search'); appEl.innerHTML = '';
    const p = AG.el('section','panel search-panel');
    const home = AG.el('button','btn ghost small','← Home'); home.onclick = () => showHome();
    const input = AG.el('input'); input.type = 'search'; input.placeholder = 'Jaise RPO, FIFO ya cache key';
    const label = AG.el('label', '', 'Kya dhoondhna hai?'); label.appendChild(input);
    const filter = AG.el('select'); filter.setAttribute('aria-label','Kahan dhoondhna hai?');
    for (const k of ['',...kinds]) { const opt = AG.el('option','',k || 'Sab jagah'); opt.value = k; filter.appendChild(opt); }
    const info = AG.el('p'); info.setAttribute('role','status');
    const results = AG.el('div','search-results');
    p.append(home, AG.el('h2','','Glossary aur search'),label,filter,info,results); appEl.appendChild(p);
    let limit = 25;
    function render() {
      const found = find(input.value, filter.value);
      info.textContent = found.length ? found.length + ' results · ' + Math.min(limit, found.length) + ' dikh rahe hain' : 'Koi match nahi mila. Chhota shabd ya doosra filter chuno.';
      results.innerHTML = '';
      for (const r of found.slice(0,limit)) {
        const d = AG.el('details','search-hit'), head = AG.el('summary');
        const name = AG.el('b'); name.textContent = r.title;
        const source = AG.el('span','strip-sub'); source.textContent = r.kind + ' · ' + r.source;
        head.append(name,source); d.appendChild(head);
        if (r.tree) {
          d.ontoggle = () => { if (d.open && !d.querySelector('.dd-leaf')) d.appendChild(AG.decisionLeafCard(r.tree,r.leaf)); };
        } else {
          for (const text of r.detail) { const line = AG.el('p'); line.textContent = text; d.appendChild(line); }
          const go = AG.el('a','','Lesson padho'); go.href = '#study/' + r.level; d.appendChild(go);
        }
        results.appendChild(d);
      }
      if (found.length > limit) {
        const more = AG.el('button','btn small ghost','Aur results dikhao');
        more.onclick = () => { limit += 25; render(); }; results.appendChild(more);
      }
    }
    input.oninput = filter.onchange = () => { limit = 25; render(); };
    render(); window.scrollTo(0,0);
  }
  return { index, find, show, terms };
})();
