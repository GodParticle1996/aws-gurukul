/* AWS Gurukul — catalog CDN ki jaanch.
   Catalog release se pehle private images aur login API ki CDN settings review ho rahi hain.
   config → images origin shop-images.s3.ap-south-1.amazonaws.com par OAC000001. Default viewer policy redirect-to-https. /api/* ka origin api aur CachePolicyId 4135ea2d-6df8-44a3-9df3-4b5a84be39ad (CachingDisabled). ETag yahin padho.
   control → S3 OAC mein SigningBehavior always aur SigningProtocol sigv4. OAC ka apna ETag padho.
   policy → Sirf cloudfront.amazonaws.com ko shop-images/* par s3:GetObject allow. SourceArn arn:aws:cloudfront::123456789012:distribution/ESHOP.
   block → Chaaron Block Public Access settings true.
   state → Distribution Enabled true aur Status Deployed.
   detached-oac → images origin ka OriginAccessControlId gayab
   api-cache → /api/* ka CachePolicyId CachingOptimized
   http-viewers → DefaultCacheBehavior.ViewerProtocolPolicy allow-all
   old-source → AWS:SourceArn ka distribution EOLD
   unsigned → SigningBehavior never
*/
(function () {
  const mission = AG.findLevel('cloudfront').stages.find(s => s.type === 'terminal');
  const account = JSON.parse(JSON.stringify(mission.account));
  const files = mission.files;
  const reviewed = name => JSON.parse(files[name].content);
  const dist = a => a.cloudfront.find(d => d.id === 'ESHOP');
  const bucket = a => a.buckets.find(b => b.name === 'shop-images');
  const oac = a => a.originAccessControls.find(o => o.id === 'OAC000001');
  dist(account).config = reviewed('distribution-fixed.json');
  dist(account).edgeCache = [];
  account.originAccessControls = [{ id: 'OAC000001', etag: 'O1', config: reviewed('oac.json') }];
  account.cdnOacCounter = 1;
  bucket(account).policy = reviewed('origin-policy.json');
  const cacheOff = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
  const api = c => c.CacheBehaviors?.Items?.find(b => b.PathPattern === '/api/*');
  const images = c => c.Origins?.Items?.find(o => o.Id === 'images');
  const config = "aws cloudfront get-distribution-config --id ESHOP";
  const control = "aws cloudfront get-origin-access-control --id OAC000001";
  const policy = "aws s3api get-bucket-policy --bucket shop-images";
  const block = "aws s3api get-public-access-block --bucket shop-images";
  const state = "aws cloudfront get-distribution --id ESHOP";
  const cards = [
    { id: "detached-oac", title: "Image origin se OAC hat gaya",
      break: a => { delete images(dist(a).config).OriginAccessControlId; },
      probe: config, clue: "OAC bana hua hai. Images origin par uski ID bhi judi honi chahiye.",
      repair: ["aws cloudfront update-distribution --id ESHOP --if-match E1 --distribution-config file://distribution-fixed.json", "aws cloudfront wait distribution-deployed --id ESHOP"],
      why: "<b>OriginAccessControlId</b> S3 origin ko signing control se jodta hai." },
    { id: "api-cache", title: "API par shared caching chalu hai",
      break: a => { api(dist(a).config).CachePolicyId = '658327ea-f89d-4fab-a63d-7e88639e58f6'; },
      probe: config, clue: "Private API ke jawab ko shared cache se bahar rakho. /api/* ki managed cache policy dekho.",
      repair: ["aws cloudfront update-distribution --id ESHOP --if-match E1 --distribution-config file://distribution-fixed.json", "aws cloudfront wait distribution-deployed --id ESHOP"],
      why: "<b>CachingDisabled</b> private API ke jawab ko edge cache mein rakhne se rokta hai." },
    { id: "http-viewers", title: "HTTP viewers ko redirect nahi milta",
      break: a => { dist(a).config.DefaultCacheBehavior.ViewerProtocolPolicy = 'allow-all'; },
      probe: config, clue: "Default behavior mein HTTP viewer ko HTTPS par bhejna hai.",
      repair: ["aws cloudfront update-distribution --id ESHOP --if-match E1 --distribution-config file://distribution-fixed.json", "aws cloudfront wait distribution-deployed --id ESHOP"],
      why: "<b>ViewerProtocolPolicy</b> viewer se edge tak ka protocol tay karti hai." },
    { id: "old-source", title: "Policy purane distribution ko allow karti hai",
      break: a => { bucket(a).policy.Statement[0].Condition.StringEquals['AWS:SourceArn'] = 'arn:aws:cloudfront::123456789012:distribution/EOLD'; },
      probe: policy, clue: "Service principal sahi hai. SourceArn ka distribution ID ESHOP se milao.",
      repair: ["aws s3api put-bucket-policy --bucket shop-images --policy file://origin-policy.json"],
      why: "<b>SourceArn</b> permission ko ek distribution tak rakhta hai. Bucket private reh sakti hai." },
    { id: "unsigned", title: "OAC requests sign nahi kar raha",
      break: a => { oac(a).config.SigningBehavior = 'never'; },
      probe: control, clue: "ID judi hai par S3 fetch sign nahi ho raha. OAC ka current ETag use karo.",
      repair: ["aws cloudfront update-origin-access-control --id OAC000001 --if-match O1 --origin-access-control-config file://oac.json"],
      why: "<b>SigningBehavior always</b> par CloudFront origin request ko SigV4 se sign karta hai." },
  ];
  function healthy(a) {
    const d = dist(a), c = d?.config, b = bucket(a), rules = b?.policy?.Statement;
    const s = rules?.[0], origin = c && images(c), behavior = c && api(c);
    return d?.status === 'Deployed' && c?.Enabled && origin?.DomainName === 'shop-images.s3.ap-south-1.amazonaws.com'
      && origin.OriginAccessControlId === 'OAC000001' && behavior?.TargetOriginId === 'api' && behavior.CachePolicyId === cacheOff
      && c.DefaultCacheBehavior?.ViewerProtocolPolicy === 'redirect-to-https' && oac(a)?.config.SigningBehavior === 'always'
      && oac(a).config.SigningProtocol === 'sigv4' && rules?.length === 1 && s.Effect === 'Allow'
      && s.Principal?.Service === 'cloudfront.amazonaws.com' && Object.keys(s.Principal).length === 1
      && s.Action === 's3:GetObject' && s.Resource === 'arn:aws:s3:::shop-images/*'
      && s.Condition?.StringEquals?.['AWS:SourceArn'] === 'arn:aws:cloudfront::123456789012:distribution/ESHOP'
      && ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(k => b.bpa?.[k] === true);
  }
  AG.chaos.addDeck({
    id: "cloudfront", title: "catalog CDN ki jaanch", account,
    files: files,
    alert: "Catalog release se pehle private images aur login API ki CDN settings review ho rahi hain. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# catalog CDN ki jaanch
Har jawab ko sahi haal se milao.

1. images origin shop-images.s3.ap-south-1.amazonaws.com par OAC000001. Default viewer policy redirect-to-https. /api/* ka origin api aur CachePolicyId 4135ea2d-6df8-44a3-9df3-4b5a84be39ad (CachingDisabled). ETag yahin padho.
   ${config}
2. S3 OAC mein SigningBehavior always aur SigningProtocol sigv4. OAC ka apna ETag padho.
   ${control}
3. Sirf cloudfront.amazonaws.com ko shop-images/* par s3:GetObject allow. SourceArn arn:aws:cloudfront::123456789012:distribution/ESHOP.
   ${policy}
4. Chaaron Block Public Access settings true.
   ${block}
5. Distribution Enabled true aur Status Deployed.
   ${state}

Sirf EK cheez galat hai. Usi ko theek karo, phir dobara jaancho.
Review hui files: distribution-fixed.json, oac.json, origin-policy.json. Update se pehle current config se file milao. If-Match mein us resource ka abhi padha ETag do. Distribution update ke baad deployed hone ka wait karo.`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join('\\s+') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke sab probe chalao. Kaunsa jawab sahi haal se alag hai?', c.clue, c.repair.join(' phir ')],
      solution: ['cat runbook.md', c.probe, ...c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab("cloudfront", {
    type: "chaos", id: "chaos-cloudfront", deck: "cloudfront", title: "🎲 Chaos round: catalog CDN ki jaanch",
    intro: "Distribution, OAC aur bucket ke jawab milao. Badlaav ke baad deployment jaancho.",
  });
})();
