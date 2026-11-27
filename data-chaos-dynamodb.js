/* 🎲 Chaos deck 'dynamodb' — Intermediate level dynamodb. Engine: chaos.js. Fixture: dynamodb mission ke pehle 10 commands se bana (Codex, 2026-11-27).
   Cart migration ki jaanch.
   ShopKaro ne cart writers rok rakhe hain. Migration ke baad ek check fail hua.
   Swasth base aur probes:
   backup → PointInTimeRecoveryStatus ENABLED aur RecoveryPeriodInDays 35.
   ttl → TimeToLiveStatus ENABLED aur AttributeName expiresAt.
   schema → GlobalSecondaryIndexes mein bySeller ACTIVE. ProjectionType ALL.
   item → cart-104 ka total 499 aur version 1.
   pitr-off → PointInTimeRecoveryStatus DISABLED hai. PITR wapas chalu karo.
   short-window → PITR chalu hai par RecoveryPeriodInDays 1 hai. Team ko 35 din chahiye.
   ttl-off → TimeToLiveStatus DISABLED hai. Cart ki expiry expiresAt mein likhi hai.
   missing-index → GlobalSecondaryIndexes mein bySeller gayab hai. Seller lookup ka reviewed index wapas banao.
   missing-cart → GetItem mein Item gayab hai. Reviewed cart ko condition ke saath daalo, taaki retry existing cart overwrite na kare.
*/
(function () {
  const mission = AG.findLevel('dynamodb').stages.find(s => s.type === 'terminal');
  const account = JSON.parse(JSON.stringify(mission.account));
  // Migration ke pehle das commands ke baad carts-v2 ka snapshot.
  account.tables.push({
    "name": "carts-v2",
    "tableId": "00000000-0000-4000-8000-000000000001",
    "partitionKey": "cartId",
    "sortKey": null,
    "billing": "PAY_PER_REQUEST",
    "attributeTypes": {
      "cartId": "S",
      "sellerId": "S",
      "updatedAt": "N"
    },
    "status": "ACTIVE",
    "items": [
      {
        "cartId": "cart-101",
        "status": "active",
        "sellerId": "seller-1",
        "updatedAt": 1800000000,
        "expiresAt": 1900000000,
        "total": 499,
        "version": 1
      },
      {
        "cartId": "cart-102",
        "status": "active",
        "sellerId": "seller-2",
        "updatedAt": 1800000001,
        "expiresAt": 1900000001,
        "total": 499,
        "version": 1
      },
      {
        "cartId": "cart-103",
        "status": "active",
        "sellerId": "seller-1",
        "updatedAt": 1800000002,
        "expiresAt": 1900000002,
        "total": 499,
        "version": 1
      },
      {
        "cartId": "cart-104",
        "status": "active",
        "sellerId": "seller-1",
        "updatedAt": 1800000004,
        "expiresAt": 1900000004,
        "total": 499,
        "version": 1
      }
    ],
    "revision": 12,
    "gsis": [
      {
        "name": "bySeller",
        "partitionKey": "sellerId",
        "sortKey": "updatedAt",
        "projection": {
          "ProjectionType": "ALL"
        },
        "status": "ACTIVE"
      }
    ],
    "lsis": [],
    "pitr": {
      "enabled": true,
      "days": 35
    },
    "ttl": {
      "attribute": "expiresAt",
      "status": "ENABLED"
    }
  });
  const table = a => a.tables.find(t => t.name === 'carts-v2');
  const expected = table(account);
  const newCart = expected.items.find(row => row.cartId === 'cart-104');
  const sameRow = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(y).every(k => x[k] === y[k]);
  const backup = "aws dynamodb describe-continuous-backups --table-name carts-v2";
  const ttl = "aws dynamodb describe-time-to-live --table-name carts-v2";
  const schema = "aws dynamodb describe-table --table-name carts-v2";
  const item = "aws dynamodb get-item --table-name carts-v2 --consistent-read --key '{\"cartId\":{\"S\":\"cart-104\"}}'";
  const cards = [
    { id: "pitr-off", title: "PITR band hai",
      break: a => { table(a).pitr.enabled = false; },
      probe: backup, clue: "PointInTimeRecoveryStatus DISABLED hai. PITR wapas chalu karo.",
      repair: "aws dynamodb update-continuous-backups --table-name carts-v2 --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35",
      why: "<b>PITR</b> chalu hone ke baad recovery history phir se banne lagti hai." },
    { id: "short-window", title: "Recovery window chhoti hai",
      break: a => { table(a).pitr.days = 1; },
      probe: backup, clue: "PITR chalu hai par RecoveryPeriodInDays 1 hai. Team ko 35 din chahiye.",
      repair: "aws dynamodb update-continuous-backups --table-name carts-v2 --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35",
      why: "<b>RecoveryPeriodInDays</b> batata hai ki kitni history rakhi jayegi. Window badhane se purani kho chuki history wapas nahi aati." },
    { id: "ttl-off", title: "Expiry rule band hai",
      break: a => { table(a).ttl = null; },
      probe: ttl, clue: "TimeToLiveStatus DISABLED hai. Cart ki expiry expiresAt mein likhi hai.",
      repair: "aws dynamodb update-time-to-live --table-name carts-v2 --time-to-live-specification Enabled=true,AttributeName=expiresAt",
      why: "<b>TTL</b> expiresAt mein likhe epoch seconds padhta hai. Expired cart background mein delete hota hai." },
    { id: "missing-index", title: "Seller ka index gayab hai",
      break: a => { const t = table(a); t.gsis = []; t.attributeTypes = { cartId: 'S' }; },
      probe: schema, clue: "GlobalSecondaryIndexes mein bySeller gayab hai. Seller lookup ka reviewed index wapas banao.",
      repair: "aws dynamodb update-table --table-name carts-v2 --attribute-definitions AttributeName=sellerId,AttributeType=S AttributeName=updatedAt,AttributeType=N --global-secondary-index-updates file://seller-index.json",
      why: "<b>bySeller</b> index sellerId par query aur updatedAt par sorting deta hai. Index ACTIVE hone par use karo." },
    { id: "missing-cart", title: "Naya cart load nahi hua",
      break: a => { const t = table(a); t.items = t.items.filter(x => x.cartId !== 'cart-104'); },
      probe: item, clue: "GetItem mein Item hi nahi hai. Reviewed cart new-cart.json se daalo — attribute_not_exists(cartId) condition ke saath, taaki galti se dobara chala retry kisi maujood cart ko overwrite na kare.",
      repair: "aws dynamodb put-item --table-name carts-v2 --item file://new-cart.json --condition-expression 'attribute_not_exists(cartId)'",
      why: "<b>Conditional put</b> cart tabhi banata hai jab key khaali ho. Isse retry existing cart ka total nahi badalta." },
  ];
  function healthy(a, card) {
    const t = table(a), idx = t?.gsis?.[0];
    return !!t && t.tableId === expected.tableId && t.partitionKey === 'cartId' && !t.sortKey
      && t.status === 'ACTIVE' && t.billing === 'PAY_PER_REQUEST' && t.gsis?.length === 1
      && idx.name === 'bySeller' && idx.partitionKey === 'sellerId' && idx.sortKey === 'updatedAt'
      && idx.projection?.ProjectionType === 'ALL' && idx.status === 'ACTIVE'
      && t.pitr?.enabled === true && t.pitr.days === 35 && t.ttl?.attribute === 'expiresAt' && t.ttl.status === 'ENABLED'
      && t.items.length === expected.items.length && expected.items.every(row => t.items.some(x => sameRow(x, row)));
  }
  AG.chaos.addDeck({
    id: "dynamodb", title: "Cart migration ki jaanch", account,
    files: { 'seller-index.json': mission.files['seller-index.json'], 'new-cart.json': mission.files['new-cart.json'] },
    alert: "ShopKaro ne cart writers rok rakhe hain. Migration ke baad ek check fail hua. Ek galti dhoondho. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# carts-v2 migration — jaanch
Cart writers ruke hue hain. Har probe chalao. Jawab ko neeche likhe "sahi haal" se milao.

1. Backups — PointInTimeRecoveryStatus ENABLED, RecoveryPeriodInDays 35:
   ${backup}
2. Expiry — TimeToLiveStatus ENABLED, AttributeName expiresAt:
   ${ttl}
3. Index — GlobalSecondaryIndexes mein bySeller ACTIVE, ProjectionType ALL:
   ${schema}
4. Naya cart — cart-104 maujood, total 499, version 1:
   ${item}

Sirf EK cheez galat hai. Usi ko theek karo, phir wahi probe dobara chalao.
Index banane ke baad: aws dynamodb wait table-exists --table-name carts-v2, phir describe-table mein IndexStatus.
Review hui files: seller-index.json, new-cart.json`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: a => healthy(a, c.id),
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join(' ') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke chaaron probe chalao. Har jawab runbook ke "sahi haal" se milao — kaunsa mel nahi khaata?', c.clue, c.repair],
      solution: ['cat runbook.md', c.probe, c.repair,
        ...(c.id === 'missing-index' ? ['aws dynamodb wait table-exists --table-name carts-v2', schema] : []),
        ...(c.id === 'ttl-off' ? [ttl] : []), c.probe], why: c.why,
    })),
  });
  AG.addLab('dynamodb', {
    type: 'chaos', id: 'chaos-dynamodb', deck: 'dynamodb', title: '🎲 Chaos round: carts-v2 migration',
    intro: 'Chaar probe, ek galat cheez. Backups, TTL, index aur naya cart padho — <b>EK badlaav</b> se theek karo.',
  });
})();
