/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo trees: NETWORKING
   frontdoor (ALB/NLB/GWLB/API GW) · edge (CloudFront vs Global Accelerator) ·
   r53policy (routing policy) · vpcconnect (VPCs + on-prem jodna) ·
   privateaccess (private subnet → AWS service) · firewall (kaunsi security layer)
   Prices: us-east-1 list price (2025–26), approx.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho.
   ===================================================================== */
AG.registerDecisions([

  /* ------------------------------------------------------------------ */
  {
    id: 'frontdoor',
    icon: '⚖️',
    title: 'Traffic ka darwaza — ALB, NLB, Gateway LB ya API Gateway?',
    short: 'Load balancer chuno',
    tldr: 'HTTP ka content dekhna hai (path, host, header) → ALB. TCP/UDP, static IP, millions req/s → NLB. Firewall appliances beech mein → Gateway LB. Serverless API with auth/throttling/API keys → API Gateway.',
    levels: ['elbasg', 'lambda', 'edge', 'boss1'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Traffic kis protocol par hai?',
        why: 'ALB layer 7 par HTTP request padhta hai (URL, headers). NLB layer 4 par sirf TCP/UDP packets aage bhejta hai — content nahi padhta, isliye bahut tez aur static IP de sakta hai.',
        options: [
          { t: 'HTTP / HTTPS / gRPC / WebSocket', next: 'q2' },
          { t: 'TCP / UDP / TLS (database proxy, gaming, IoT MQTT, VoIP)', next: 'nlb' },
          { t: 'Saara traffic third-party firewall/IDS appliances se guzarna chahiye', next: 'gwlb' },
        ],
      },
      q2: {
        q: 'Backend kya hai aur API features chahiye?',
        why: 'API Gateway per request bill karta hai aur API features deta hai (usage plans, API keys, request validation, throttling per client). ALB per ghanta + LCU bill karta hai — bhaari steady traffic par sasta.',
        options: [
          { t: 'Lambda functions, public API, per-client throttling / API keys / usage plans chahiye', next: 'apigw' },
          { t: 'EC2 / ECS / EKS services, path-based routing (/api, /images)', next: 'alb' },
          { t: 'Static IP chahiye (client firewall allow-list) + HTTP routing bhi', next: 'albnlb' },
        ],
      },
      alb: {
        leaf: true, icon: '⚖️', pick: 'Application Load Balancer (ALB)',
        one: 'Layer 7 LB — path/host/header ke hisaab se alag target groups.',
        when: ['Web apps/microservices: /api → orders service, /img → images service', 'ECS/EKS services, Lambda targets bhi', 'HTTPS termination (ACM certificate), WAF lagana, OIDC/Cognito login'],
        avoid: ['Static IP chahiye (ALB ka IP badalta hai — DNS name use karo)', 'UDP / non-HTTP TCP'],
        gotchas: ['Health check path sahi rakho (/health) warna saare targets unhealthy', 'Cross-zone load balancing ALB par default ON', 'Idle timeout default 60 s — lambi requests/WebSocket ke liye badhao'],
        cost: '~$0.0225/ghanta (~$16/mahina) + LCU usage.',
        exam: '"path-based routing", "host-based routing", "HTTP headers", "microservices on one LB" → ALB.',
        iac: `resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  condition { path_pattern { values = ["/api/*"] } }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.orders.arn
  }
}`,
        level: 'elbasg',
      },
      nlb: {
        leaf: true, icon: '⚡', pick: 'Network Load Balancer (NLB)',
        one: 'Layer 4 LB — TCP/UDP, millions req/s, har AZ mein static IP (Elastic IP).',
        when: ['Gaming (UDP), IoT, VoIP, database/TCP proxy', 'Client ko fixed IP allow-list karna hai', 'PrivateLink endpoint service banana (NLB ke peeche service)', 'Ultra-low latency, source IP preserve'],
        avoid: ['URL path/header routing (NLB content nahi padhta)'],
        gotchas: ['Cross-zone load balancing NLB par default OFF — uneven AZs par traffic uneven', 'NLB par ab security groups lag sakte hain — banate waqt hi attach karo'],
        cost: '~$0.0225/ghanta + NLCU usage.',
        exam: '"TCP/UDP", "static IP / Elastic IP", "millions of requests per second", "ultra-low latency", "PrivateLink" → NLB.',
        level: 'edge',
      },
      gwlb: {
        leaf: true, icon: '🧱', pick: 'Gateway Load Balancer (GWLB)',
        one: 'Third-party virtual appliances (firewall, IDS/IPS) ka fleet transparently beech mein lagata hai.',
        when: ['Palo Alto / Fortinet / Check Point firewalls ka scalable fleet', 'Central inspection VPC'],
        avoid: ['Normal app load balancing'],
        gotchas: ['GENEVE protocol (port 6081)', 'Consumer VPCs mein GWLB endpoints + route table entries chahiye'],
        cost: 'Per ghanta + GLCU.',
        exam: '"third-party virtual appliances", "inspect traffic transparently" → Gateway Load Balancer.',
        level: 'advnet',
      },
      apigw: {
        leaf: true, icon: '🚪', pick: 'Amazon API Gateway',
        one: 'Managed API front door — Lambda integration, auth, throttling, API keys, usage plans.',
        when: ['Serverless API (API Gateway → Lambda)', 'Public API product: per-customer API keys + usage plans + throttling', 'Request validation, caching (REST API), WebSocket APIs'],
        avoid: ['Bhaari steady traffic (billions/mahina) jahan per-request bill bahut badhta hai — ALB sasta', 'Lambi requests (integration timeout default 29 s)'],
        gotchas: ['HTTP API ~70% sasta + kam latency, par REST API ke features (usage plans, caching, WAF directly) kam', 'Payload max 10 MB'],
        cost: 'HTTP API ~$1 per 10 lakh requests; REST API ~$3.50 per 10 lakh.',
        exam: '"serverless REST API", "throttling", "API keys", "usage plans" → API Gateway.',
        level: 'lambda',
      },
      albnlb: {
        leaf: true, icon: '🔗', pick: 'NLB → ALB (ya Global Accelerator → ALB)',
        one: 'NLB static IP deta hai, aur NLB ke peeche baitha ALB HTTP routing karta hai.',
        when: ['Enterprise client sirf fixed IPs allow karta hai, par app ko path routing chahiye'],
        avoid: ['Static IP ki zaroorat nahi — seedha ALB'],
        gotchas: ['ALB-type target group NLB par register hota hai', 'Global users ho toh Global Accelerator (2 anycast IPs) + ALB behtar'],
        cost: 'Dono LBs ka bill.',
        exam: '"static IP" + "path-based routing" → NLB in front of ALB, ya Global Accelerator + ALB.',
        level: 'edge',
      },
    },
    compare: {
      cols: ['', 'ALB', 'NLB', 'GWLB', 'API Gateway'],
      rows: [
        ['Layer', '7 (HTTP)', '4 (TCP/UDP)', '3 (packets)', '7 (API)'],
        ['Static IP', 'nahi', 'haan (per AZ)', '—', 'nahi'],
        ['Routing', 'path/host/header', 'port', 'appliances', 'resource/method'],
        ['Bill', 'ghanta + LCU', 'ghanta + NLCU', 'ghanta + GLCU', 'per request'],
        ['Best fit', 'web/microservices', 'TCP/UDP, fixed IP', 'firewall fleet', 'serverless API'],
      ],
    },
    scenarios: [
      { s: 'Ek domain par /orders ECS service ko, /payments doosri ECS service ko jaana chahiye.', answer: 'alb', explain: 'Path-based routing → ALB.' },
      { s: 'Multiplayer game server UDP par chalta hai, lakhon players.', answer: 'nlb', explain: 'UDP + bahut zyada connections → NLB.' },
      { s: 'Bank partner apne firewall mein sirf 2 fixed IPs allow karta hai; app ko /v1 aur /v2 path routing bhi chahiye.', answer: 'albnlb', explain: 'Static IP + HTTP routing → NLB (ya Global Accelerator) ALB ke aage.' },
      { s: 'Lambda-based public API jise 3 pricing plans mein bechna hai — har customer ki API key aur monthly quota.', answer: 'apigw', explain: 'API keys + usage plans + throttling → API Gateway (REST).' },
      { s: 'Security team chahti hai saara north-south traffic Palo Alto firewall VMs se guzre, auto-scaling ke saath.', answer: 'gwlb', explain: 'Third-party appliances transparently → Gateway Load Balancer.' },
      { s: 'Ek SaaS company apni service doosre customers ke VPCs mein PrivateLink se expose karna chahti hai.', answer: 'nlb', explain: 'PrivateLink endpoint service ke peeche NLB chahiye.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'edge',
    icon: '🌍',
    title: 'Global users ke liye — CloudFront, Global Accelerator ya Route 53?',
    short: 'Edge: CloudFront vs GA',
    tldr: 'HTTP content/API edge TLS, WAF and optional cache → CloudFront. TCP/UDP or reviewed global static entry/failover → Global Accelerator candidate. DNS-only measured latency selection → Route53. CloudFront optional Anycast Static IP lists also exist; compare exact requirement.',
    levels: ['cloudfront', 'route53', 'edge'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'HTTP(S) website/API edge delivery chahiye, ya transport/static-entry priority hai?',
        why: 'CloudFront edge par response rakh leta hai — agla user origin tak gaye bina jawab paata hai. Global Accelerator kuch cache nahi karta; sirf user ko AWS ke private backbone par sabse paas wale healthy endpoint tak jaldi pahunchata hai.',
        options: [
          { t: 'HTTP website/images/video/API, cached or deliberately uncached', next: 'cfe' },
          { t: 'TCP/UDP, or global static-entry/failover priority without CDN need', next: 'q2' },
        ],
      },
      q2: {
        q: 'Client ko fixed IP chahiye ya region failover seconds mein chahiye (DNS TTL ka intezaar nahi)?',
        why: 'DNS-based failover client ke DNS cache (TTL) par atakta hai — kuch clients minutes tak purana IP use karte hain. Global Accelerator ke 2 anycast IPs kabhi nahi badalte; failover AWS edge par hota hai.',
        options: [
          { t: 'Haan — static anycast IP / fast failover / non-HTTP', next: 'ga' },
          { t: 'Nahi — bas users ko nearest region bhejna hai, DNS kaafi hai', next: 'r53lat' },
        ],
      },
      cfe: {
        leaf: true, icon: '🌍', pick: 'Amazon CloudFront',
        one: 'HTTP CDN with750+PoPs; eligible cache reuse can reduce origin load. Dynamic APIs can use reviewed no-cache/forwarding.',
        when: ['Static website (S3 + OAC)', 'Video streaming, downloads', 'Dynamic sites bhi — TLS edge par, AWS backbone se origin', 'WAF + Shield edge par lagana'],
        avoid: ['UDP/non-HTTP transport', 'Assuming ordinary distribution DNS supplies a fixed customer IP; review optional Anycast Static IP lists or GA'],
        gotchas: ['Private S3 REST origin + attached OAC + exact SourceArn policy; website origin cannot use OAC', 'Signed URLs/cookies se paid content protect', 'Functions lightweight viewer JS vs Lambda@Edge network/body/origin logic; private VPC origins now supported'],
        cost: 'Pay-as-you-go US example approx$0.085/GB DTO, $0.010/10,000 HTTPS requests; monthly1TB/10million allowance. Flat-rate plans also exist; geography/features differ.',
        exam: '"cache static content globally", "reduce latency for global users", "S3 static website with HTTPS" → CloudFront.',
        level: 'cloudfront',
      },
      ga: {
        leaf: true, icon: '🛰️', pick: 'AWS Global Accelerator',
        one: '2 static anycast IPs — user nearest AWS edge se backbone par healthy region tak.',
        when: ['Gaming/VoIP/IoT (UDP/TCP) global users', 'Client allow-list ke liye fixed IPs', 'Multi-region active-passive jahan failover seconds mein chahiye'],
        avoid: ['Cacheable HTTP content — CloudFront'],
        gotchas: ['Endpoints: ALB, NLB, EC2, Elastic IP', 'Traffic dials se region ka % control (blue/green across regions)'],
        cost: '~$0.025/ghanta per accelerator + data transfer premium.',
        exam: '"static IP addresses", "UDP", "non-HTTP", "fast regional failover", "AWS global network" → Global Accelerator.',
        level: 'edge',
      },
      r53lat: {
        leaf: true, icon: '🧭', pick: 'Route 53 latency-based routing',
        one: 'DNS user ko us region ka IP deta hai jahan latency sabse kam.',
        when: ['Multi-region app, simple setup, HTTP ya TCP', 'Cost kam rakhna — GA ka extra bill nahi'],
        avoid: ['Seconds mein failover / static IP chahiye'],
        gotchas: ['Health check jodo warna unhealthy region par bhi bhejta rahega', 'TTL chhota rakho (60 s) failover ke liye'],
        cost: '$0.50 per hosted zone/mahina + ~$0.60 per 10 lakh latency queries.',
        exam: '"route users to the region with lowest latency" → Route 53 latency routing.',
        level: 'route53',
      },
    },
    scenarios: [
      { s: 'Authenticated HTTP API needs edge TLS/WAF and deliberate no-cache behavior.', answer: 'cfe', explain: 'CloudFront supports dynamic uncached HTTP; configure auth/header/Host forwarding and verify real responses.' },
      { s: 'News website ke images aur articles duniya bhar mein tez load hone chahiye.', answer: 'cfe', explain: 'Cacheable HTTP → CloudFront.' },
      { s: 'Online game (UDP) ke players 3 continents mein; client mein IPs hardcoded hain.', answer: 'ga', explain: 'UDP + static IP → Global Accelerator.' },
      { s: 'Do regions mein same web app; bas users ko paas wale region bhejna hai, budget tight.', answer: 'r53lat', explain: 'DNS latency routing simple aur sasta.' },
      { s: 'Payment API do regions mein; primary region down ho toh 30 second ke andar traffic doosre region par — clients ke DNS cache ka intezaar nahi.', answer: 'ga', explain: 'Edge-level failover, static IPs → Global Accelerator.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'r53policy',
    icon: '🧭',
    title: 'Route 53 routing policy — simple, weighted, latency, failover, geolocation...',
    short: 'Route 53 policy',
    tldr: 'Policy ka sawal ek hai: "ek DNS naam ke kai jawab hon toh kaunsa doon?" — % split (weighted), sabse tez (latency), backup (failover), user ka desh (geolocation), distance+bias (geoproximity), kai healthy IPs (multivalue).',
    levels: ['route53'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Ek naam ke liye kitne/kaise jawab chahiye?',
        options: [
          { t: 'Sirf ek resource hai', next: 'simple' },
          { t: 'Primary down ho toh backup par jaaye (active-passive)', next: 'failover' },
          { t: 'DNS answers ka relative % split (canary90/10)', next: 'weighted' },
          { t: 'User ki location ke hisaab se', next: 'q2' },
          { t: 'Known client CIDR collections se endpoint mapping', next: 'ipbased' },
          { t: 'Kai servers ke IPs, sirf healthy wale, client khud chune', next: 'multivalue' },
        ],
      },
      q2: {
        q: 'Location kyun matter karti hai?',
        why: 'Latency routing "sabse tez region" chunta hai — user India mein ho par Singapore tez ho toh Singapore. Geolocation "user ka desh/continent" dekhta hai — content/language mapping ke liye; data compliance ke liye app/data controls bhi chahiye. Geoproximity distance + bias se traffic ka hissa shift karta hai.',
        options: [
          { t: 'Speed — sabse kam latency wala region', next: 'latency' },
          { t: 'Country/continent content mapping; separate data controls', next: 'geoloc' },
          { t: 'Distance + ek region ki taraf zyada traffic (bias) shift karna', next: 'geoprox' },
        ],
      },
      simple: { leaf: true, icon: '1️⃣', pick: 'Simple', one: 'Ek record, ek (ya kai) value — health check nahi.', when: ['Single web server / single ALB'], avoid: ['Failover ya health-based routing chahiye'], gotchas: ['Kai values do toh client random chunta hai — health check ke bina'], exam: '"single resource" → simple.', level: 'route53' },
      failover: { leaf: true, icon: '🛟', pick: 'Failover', one: 'Primary healthy hai toh primary, warna secondary (active-passive).', when: ['DR: primary region + standby region', 'Primary ALB + S3 "maintenance page"'], avoid: ['Dono regions ko ek saath traffic dena (active-active) — latency/weighted lo'], gotchas: ['Ordinary primary ko health check; eligible Alias target health inherit kar sakta hai', 'Old TTL, client caches, app/data readiness and both-unhealthy primary fallback plan karo'], exam: '"active-passive failover", "DR site" → failover routing.', level: 'route53' },
      weighted: { leaf: true, icon: '⚖️', pick: 'Weighted', one: 'Records ko weights — e.g. 90 : 10 split.', when: ['Canary release (naya version 10%)', 'Blue/green dheere shift', 'Do regions mein capacity ke hisaab se split'], avoid: ['User location based logic'], gotchas: ['Weight0 excluded while positive-weight records healthy; allzero equal probability, zero fallback may receive traffic', 'Health check jodo'], exam: '"send 10% of traffic to new version" → weighted.', level: 'route53' },
      latency: { leaf: true, icon: '⏱️', pick: 'Latency-based', one: 'User ko us AWS region ka jawab jahan network latency sabse kam.', when: ['Multi-region active-active, performance focus'], avoid: ['Compliance (latency kisi bhi desh ka region chun sakti hai)'], gotchas: ['Latency AWS ke measurement par hai, distance par nahi'], exam: '"best performance / lowest latency for global users" → latency routing.', level: 'route53' },
      geoloc: { leaf: true, icon: '🗺️', pick: 'Geolocation', one: 'User ke desh/continent/US state ke hisaab se jawab.', when: ['Approx EU source-location answer mapping; app/data residency separately enforce', 'Content localisation, licensing (video rights)'], avoid: ['Sirf speed chahiye'], gotchas: ['"Default" record banao — warna unmapped location ko koi jawab nahi'], exam: '"users in a specific country", "compliance / content restriction" → geolocation.', level: 'route53' },
      geoprox: { leaf: true, icon: '📍', pick: 'Geoproximity', one: 'Distance ke hisaab se, bias se region ka area bada/chhota.', when: ['Naye region ko dheere-dheere zyada users dena'], avoid: ['Simple setups — samajhna mushkil'], gotchas: ['Direct records supported without Traffic Flow since Jan2024; geography+bias, not latency'], exam: '"shift traffic based on geographic location using bias" → geoproximity.', level: 'route53' },
      ipbased: { leaf: true, icon: '🧾', pick: 'IP-based', one: 'Known source CIDR collection → configured endpoint.', when: ['Customer/ISP address ranges known'], avoid: ['Country inference or per-request authorization'], gotchas: ['Resolver/source ECS visibility verify karo; DNS is not access control'], exam: '"specific client CIDR ranges" → IP-based.', level: 'route53' },
      multivalue: { leaf: true, icon: '🎲', pick: 'Multivalue answer', one: 'Up to 8 healthy records random jawab mein — DNS-level simple load spreading.', when: ['Kai EC2 IPs, LB nahi lagana, health check chahiye'], avoid: ['Load balancer ka replacement samajhna (session, real LB features nahi)'], gotchas: ['Har record par health check'], exam: '"return multiple healthy IP addresses" → multivalue.', level: 'route53' },
    },
    scenarios: [
      { s: 'Naya checkout endpoint about5% authoritative DNS answers ko dena hai.', answer: 'weighted', explain: 'DNS-answer split → weighted95/5; exact users/HTTP ratio not guaranteed.' },
      { s: 'Approx EU source-location users ko localized site DNS answer dena hai.', answer: 'geoloc', explain: 'Location mapping → geolocation + default record; legal residency needs app/data controls too.' },
      { s: 'Primary region down ho toh DR region par, warna hamesha primary.', answer: 'failover', explain: 'Active-passive → failover routing + health check.' },
      { s: 'Mumbai, Singapore, Frankfurt mein same app — har user ko sabse tez region.', answer: 'latency', explain: 'Performance → latency-based.' },
      { s: '6 EC2 web servers bina load balancer ke; DNS sirf healthy servers ke IPs de.', answer: 'multivalue', explain: 'Multiple healthy IPs → multivalue answer.' },
      { s: 'Sirf ek ALB hai, koi failover nahi.', answer: 'simple', explain: 'Single resource → simple (alias record).' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'vpcconnect',
    icon: '🕸️',
    title: 'Networks kaise jodun? — VPC Peering, Transit Gateway, PrivateLink, VPN, Direct Connect',
    short: 'VPC connectivity',
    tldr: 'Do VPCs → Peering. Bahut saare VPCs + on-prem, transitive → Transit Gateway. Sirf ek service expose (overlapping CIDR bhi chalega) → PrivateLink. Office se jaldi aur sasta → Site-to-Site VPN. Consistent bandwidth/latency, private line → Direct Connect.',
    levels: ['vpcdeep', 'advnet'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kya jodna hai?',
        options: [
          { t: 'AWS VPCs aapas mein', next: 'q2' },
          { t: 'Office / on-prem datacenter ↔ AWS', next: 'q4' },
        ],
      },
      q2: {
        q: 'Poora network jodna hai ya sirf ek service doosre VPC ko deni hai?',
        why: 'Peering/TGW dono VPCs ko poora network-level access dete hain (routes + security groups se control). PrivateLink sirf ek service (NLB ke peeche) ka private endpoint deta hai — ek-tarfa, CIDR overlap bhi chalega.',
        options: [
          { t: 'Sirf ek service (SaaS, shared API) — consumer VPCs mein endpoint', next: 'privlink' },
          { t: 'Poora network-to-network', next: 'q3' },
        ],
      },
      q3: {
        q: 'Kitne VPCs?',
        why: 'Peering transitive nahi hai: A–B aur B–C peered hon, toh bhi A, C se baat nahi kar sakta. Full mesh N(N−1)/2: 10 VPCs ke 45 peers. Transit Gateway hub mein har VPC ek attachment; VPC routes, TGW tables/propagation and segmentation still configure karo.',
        options: [
          { t: '2–3 VPCs, simple', next: 'peering' },
          { t: '5+ VPCs / kai accounts / on-prem bhi hub mein', next: 'tgw' },
        ],
      },
      q4: {
        q: 'Kya chahiye — jaldi setup ya consistent private bandwidth?',
        why: 'VPN internet ke upar encrypted tunnel hai — minutes mein ready, sasta, par latency internet jaisi upar-neeche. Direct Connect dedicated fiber hai — weeks lagte hain, par predictable latency aur 1–100+ Gbps.',
        options: [
          { t: 'Aaj hi chahiye, budget kam, ~1 Gbps kaafi', next: 'vpn' },
          { t: 'Consistent latency, TBs roz transfer, 1/10/100 Gbps', next: 'dx' },
          { t: 'Direct Connect + encryption + backup path', next: 'dxvpn' },
        ],
      },
      peering: { leaf: true, icon: '🔗', pick: 'VPC Peering', one: 'Do VPCs ke beech private connection — same/cross account, same/cross region.', when: ['2–3 VPCs (app VPC ↔ shared services VPC)'], avoid: ['Overlapping CIDRs (peering banta hi nahi)', 'Transitive routing chahiye', 'Bahut saare VPCs (mesh explode)'], gotchas: ['Dono taraf route tables update karo', 'Security groups mein peer VPC ka CIDR/SG allow'], cost: 'Hourly fee nahi; data transfer (same AZ free, cross-AZ/region chargeable).', exam: '"connect two VPCs privately" → peering. "transitive" likha ho → peering NAHI.', level: 'vpcdeep' },
      tgw: { leaf: true, icon: '🕸️', pick: 'AWS Transit Gateway', one: 'Regional network hub — VPCs, VPNs, Direct Connect sab ek jagah, transitive routing.', when: ['10s–1000s VPCs, multi-account (RAM se share)', 'On-prem + saare VPCs ek hub par', 'Route tables se segmentation (prod ↔ dev alag)'], avoid: ['Sirf 2 VPCs — peering sasta'], gotchas: ['Per attachment ~$0.05/ghanta + $0.02/GB processed', 'Inter-region TGW peering alag se', 'Attachments alone full/safe reachability nahi: VPC routes and TGW table associations/propagation review karo'], cost: '10 VPC attachments ≈ $365/mahina + data.', exam: '"hub-and-spoke", "transitive routing", "hundreds of VPCs", "simplify network" → Transit Gateway.', level: 'advnet' },
      privlink: { leaf: true, icon: '🔌', pick: 'AWS PrivateLink (endpoint service)', one: 'Service provider NLB ke peeche service rakhta hai; consumers apne VPC mein interface endpoint banate hain.', when: ['SaaS product customers ke VPCs mein privately', 'Shared internal API kai accounts ko, CIDR overlap ke saath'], avoid: ['Poora network access chahiye (dono taraf se connections)'], gotchas: ['Ek-tarfa: consumer → provider', 'Provider side NLB (ya GWLB)'], cost: '~$0.01/ghanta per endpoint per AZ + $0.01/GB.', exam: '"expose a service to other VPCs/accounts privately", "overlapping CIDRs", "one-way" → PrivateLink.', level: 'advnet' },
      vpn: { leaf: true, icon: '🔒', pick: 'AWS Site-to-Site VPN', one: 'Office router ↔ AWS ke beech IPsec tunnels internet ke upar.', when: ['Jaldi hybrid connectivity', 'Direct Connect ka backup', 'Chhoti branch offices'], avoid: ['Consistent low latency / 10 Gbps+ chahiye'], gotchas: ['Har VPN connection mein 2 tunnels (HA) — dono configure karo', 'Har tunnel ~1.25 Gbps max'], cost: '~$0.05/ghanta per connection + data transfer.', exam: '"quickly", "encrypted over the internet", "low cost" → Site-to-Site VPN.', level: 'advnet' },
      dx: { leaf: true, icon: '🔗', pick: 'AWS Direct Connect', one: 'Datacenter se AWS tak dedicated private fiber — predictable latency, 1/10/100 Gbps.', when: ['Roz TBs data transfer (DX par data-out sasta)', 'Latency-sensitive hybrid apps', 'Compliance: traffic internet par nahi'], avoid: ['Kal tak chahiye (provisioning mein hafte–mahine)'], gotchas: ['DX by default encrypted nahi — MACsec (dedicated 10/100G) ya DX ke upar VPN', 'Ek DX = single point of failure — 2 locations par 2 connections ya VPN backup'], cost: 'Port-ghante + data transfer out (internet se sasta).', exam: '"consistent network performance", "dedicated private connection", "large data transfers daily" → Direct Connect.', level: 'advnet' },
      dxvpn: { leaf: true, icon: '🛡️', pick: 'Direct Connect + VPN (encrypted / backup)', one: 'DX par IPsec VPN = private + encrypted; ya DX primary, VPN internet par backup.', when: ['Compliance: private line bhi chahiye aur encryption bhi', 'Budget-friendly HA: DX primary + VPN backup'], avoid: ['Encryption/HA ki zaroorat nahi'], gotchas: ['BGP se primary/backup path preference set karo'], cost: 'DX + VPN dono.', exam: '"Direct Connect" + "encryption" → VPN over DX (ya MACsec). "DX backup at low cost" → Site-to-Site VPN.', level: 'advnet' },
    },
    compare: {
      cols: ['', 'Peering', 'Transit GW', 'PrivateLink', 'VPN', 'Direct Connect'],
      rows: [
        ['Jodta hai', 'VPC ↔ VPC', 'sab ↔ hub', 'consumer → service', 'office ↔ AWS', 'DC ↔ AWS'],
        ['Transitive', 'nahi', 'haan', 'n/a', 'TGW ke saath', 'TGW ke saath'],
        ['CIDR overlap', 'nahi chalega', 'nahi chalega', 'chalega', '—', '—'],
        ['Setup time', 'minutes', 'minutes', 'minutes', 'minutes', 'hafte'],
        ['Bill', 'sirf data', 'attachment + GB', 'endpoint + GB', 'ghanta + data', 'port + data'],
      ],
    },
    scenarios: [
      { s: 'Company ke 40 accounts mein 120 VPCs aur 2 datacenters — sab ek doosre se baat karein, prod aur dev alag segment.', answer: 'tgw', explain: 'Bahut VPCs + on-prem + segmentation → Transit Gateway.' },
      { s: 'Sirf app VPC ko shared-services VPC (AD, monitoring) se jodna hai.', answer: 'peering', explain: '2 VPCs → peering, hourly fee nahi.' },
      { s: 'Tumhari SaaS API 200 customers ke VPCs mein private chahiye; kai customers ka CIDR 10.0.0.0/16 hi hai.', answer: 'privlink', explain: 'Service-level, overlapping CIDRs → PrivateLink.' },
      { s: 'Office ko aaj shaam tak AWS se encrypted connection chahiye.', answer: 'vpn', explain: 'Jaldi + encrypted → Site-to-Site VPN.' },
      { s: 'Datacenter roz 20 TB AWS par bhejta hai, latency predictable chahiye.', answer: 'dx', explain: 'Bada steady transfer + consistent latency → Direct Connect.' },
      { s: 'Bank: Direct Connect hai, par regulator kehta hai link par bhi data encrypted ho.', answer: 'dxvpn', explain: 'DX encrypted nahi — VPN over DX (ya MACsec).' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'privateaccess',
    icon: '🔌',
    title: 'Private subnet se AWS service tak — NAT Gateway, Gateway endpoint, Interface endpoint',
    short: 'NAT vs VPC endpoint',
    tldr: 'S3/DynamoDB → Gateway endpoint (free!). Baaki AWS services (SQS, ECR, Secrets Manager...) → Interface endpoint. Internet ke third-party APIs → NAT Gateway. NAT se S3 ka traffic bhejna = paisa jalana.',
    levels: ['vpcbasics', 'vpcdeep', 'advnet', 'costdec'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Private subnet ka server kahan pahunchna chahta hai?',
        options: [
          { t: 'S3 ya DynamoDB', next: 'gwep' },
          { t: 'Doosri AWS service (SQS, SNS, ECR, Secrets Manager, KMS, STS...)', next: 'q2' },
          { t: 'Internet par third-party API / OS updates (github.com, apt repos)', next: 'nat' },
        ],
      },
      q2: {
        q: 'Traffic internet par nahi jaana chahiye (compliance), ya NAT ka data bill bada hai?',
        options: [
          { t: 'Haan — private chahiye / NAT data cost bada', next: 'ifep' },
          { t: 'Nahi, NAT pehle se hai aur traffic chhota hai', next: 'nat' },
        ],
      },
      gwep: { leaf: true, icon: '🆓', pick: 'Gateway VPC Endpoint (S3 / DynamoDB)', one: 'Route table mein entry — S3/DynamoDB traffic AWS network mein, free.', when: ['Own VPC se matching same-region S3/DynamoDB access'], avoid: ['On-prem se S3 privately (gateway endpoint VPN/DX se use nahi hota — S3 interface endpoint lo)'], gotchas: ['Sirf usi region ke S3/DynamoDB', 'Endpoint policy + bucket policy (aws:sourceVpce) se lock'], cost: 'Free. NAT ka $0.045/GB bachta hai.', exam: '"private access to S3 without internet/NAT", "cost-effective" → S3 Gateway endpoint.', iac: `resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.ap-south-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}`, level: 'vpcdeep' },
      ifep: { leaf: true, icon: '🔌', pick: 'Interface VPC Endpoint (PrivateLink)', one: 'Subnet mein ek ENI (private IP) — service ka private DNS usi par resolve hota hai.', when: ['ECR image pulls (ecr.api + ecr.dkr + S3 gateway), Secrets Manager, SQS, KMS, STS — private'], avoid: ['S3/DynamoDB ke liye jab VPC ke andar se hi hai (gateway endpoint free hai)'], gotchas: ['Har AZ mein ENI = per AZ per ghanta bill', 'Endpoint ke security group mein 443 allow', 'Private DNS enable karo'], cost: '~$0.01/ghanta per AZ + $0.01/GB.', exam: '"access AWS services privately", "without traversing the internet" (S3/DynamoDB ke alawa) → interface endpoint.', level: 'advnet' },
      nat: { leaf: true, icon: '🔁', pick: 'NAT Gateway', one: 'Private subnet ko outbound internet — inbound connections nahi.', when: ['Third-party APIs (Stripe, GitHub), OS patches'], avoid: ['S3/DynamoDB ka traffic NAT se (gateway endpoint free)', 'Inbound access (NAT andar aane nahi deta)'], gotchas: ['Zonal NAT AZ-scoped: own-AZ gateway/routes for HA; Regional NAT automatic multi-AZ mode alag current option hai', 'Public zonal NAT: public subnet + Elastic IP + IGW route; Regional NAT hosting model differs'], cost: '~$0.045/ghanta (~$33/mahina) + $0.045/GB processed. 10 TB/mahina = ~$460 sirf processing!', exam: '"instances in private subnet need internet access for updates" → NAT Gateway (HA: one per AZ).', level: 'vpcdeep' },
    },
    scenarios: [
      { s: 'Private subnet ke EC2 roz 5 TB S3 par likhte hain; NAT ka bill $230/mahina sirf processing.', answer: 'gwep', explain: 'S3 → Gateway endpoint free; NAT processing bill khatam.' },
      { s: 'Fargate tasks private subnet mein hain, bina internet ke ECR se image pull karne hain.', answer: 'ifep', explain: 'ECR → interface endpoints (ecr.api, ecr.dkr) + S3 gateway endpoint (image layers).' },
      { s: 'Private EC2 ko Stripe ka payment API call karna hai.', answer: 'nat', explain: 'Internet third-party → NAT Gateway.' },
      { s: 'Compliance: Lambda in VPC se Secrets Manager call internet par nahi jaani chahiye.', answer: 'ifep', explain: 'Secrets Manager interface endpoint.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'firewall',
    icon: '🛡️',
    title: 'Kaunsi security layer? — Security Group, NACL, WAF, Shield, Network Firewall',
    short: 'Firewall layers',
    tldr: 'Instance ke darwaze par → Security Group (stateful, sirf allow). Subnet ki boundary par explicit DENY → NACL (stateless). HTTP attacks (SQLi, XSS, bots, rate limit) → WAF. DDoS → Shield. VPC-wide domain filtering / IPS → Network Firewall.',
    levels: ['vpcbasics', 'security', 'vpcdeep'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kis cheez se bachna hai?',
        options: [
          { t: 'Galat ports/sources se instance tak connection', next: 'q2' },
          { t: 'HTTP-level attacks — SQL injection, XSS, bots, ek IP se 10,000 req/min', next: 'waf' },
          { t: 'DDoS (volumetric flood)', next: 'shield' },
          { t: 'Saare VPC ka outbound traffic sirf allowed domains par / IPS inspection', next: 'nfw' },
        ],
      },
      q2: {
        q: 'Specific IP/range ko explicitly DENY karna hai?',
        why: 'Security Group mein sirf ALLOW rules hote hain — deny nahi likh sakte. Kisi bad IP ko block karna ho toh NACL (subnet level, allow + deny, numbered rules) chahiye.',
        options: [
          { t: 'Nahi — sirf allow karna hai (port 443 ALB se)', next: 'sg' },
          { t: 'Haan — 203.0.113.0/24 ko poore subnet se block', next: 'nacl' },
        ],
      },
      sg: { leaf: true, icon: '🛡️', pick: 'Security Group', one: 'ENI/instance level, stateful, sirf allow rules — return traffic apne aap allowed.', when: ['Har EC2/RDS/Lambda-in-VPC/ALB par', 'SG-to-SG reference: "DB sirf app-SG se 5432"'], avoid: ['Explicit deny chahiye'], gotchas: ['Default: saara outbound allow, inbound kuch nahi', '0.0.0.0/0 par 22 kabhi nahi — SSM Session Manager use karo'], cost: 'Free.', exam: '"stateful", "instance level", "allow rules only" → Security Group.', level: 'vpcbasics' },
      nacl: { leaf: true, icon: '🚧', pick: 'Network ACL', one: 'Subnet level, stateless, allow + deny, rules number order mein.', when: ['Bad IP range block', 'Subnet-level extra guardrail'], avoid: ['Instance-specific rules (SG better)'], gotchas: ['Stateless: return traffic ke liye ephemeral ports (1024–65535) outbound/inbound allow karna padta hai — bhoole toh connections hang', 'Pehla match jeetta hai (rule 100 se pehle 90)'], cost: 'Free.', exam: '"stateless", "subnet level", "deny specific IP" → NACL.', level: 'vpcbasics' },
      waf: { leaf: true, icon: '🧱', pick: 'AWS WAF', one: 'Layer 7 rules — SQLi, XSS, rate-based, geo-block, bot control — CloudFront/ALB/API Gateway par.', when: ['Public web app/API par', 'Ek IP se brute-force login (rate-based rule)', 'AWS Managed Rules (core rule set) se jaldi protection'], avoid: ['Non-HTTP traffic'], gotchas: ['Count first, inspect legitimate traffic and false positives, then reviewed enforcement', 'Rates are approximate over60/120/300/600s; distributed bots/shared IPs and origin bypass need review'], cost: '$5/web ACL + $1/rule per mahina + $0.60 per 10 lakh requests.', exam: '"SQL injection", "cross-site scripting", "rate limiting by IP", "block countries" → WAF.', level: 'security' },
      shield: { leaf: true, icon: '🛡️', pick: 'AWS Shield (Standard / Advanced)', one: 'DDoS protection — Standard free sabke liye (L3/L4); Advanced paid + 24×7 response team + cost protection.', when: ['Standard: hamesha on, automatic', 'Advanced: business-critical public apps, DDoS se bill spike ka darr'], avoid: ['SQLi/XSS rokne ke liye (SQLi/XSS WAF ka kaam hai)'], gotchas: ['Advanced ~$3,000/mahina per organization (1 saal commit)'], cost: 'Standard no additional charge; Advanced approx$3000/month, one-year commitment, protected-resource DTO and other eligible fees. Review coverage/cost-protection terms.', exam: '"DDoS protection" → Shield; "24/7 DDoS response team" / "cost protection" → Shield Advanced.', level: 'security' },
      nfw: { leaf: true, icon: '🔥', pick: 'AWS Network Firewall', one: 'VPC-level managed stateful firewall — domain allow-list, IPS (Suricata rules).', when: ['Egress filtering: servers sirf *.amazonaws.com aur github.com par jaa sakein', 'Central inspection VPC with Transit Gateway'], avoid: ['Sirf instance-level port rules (SG kaafi)'], gotchas: ['Route tables firewall endpoints se guzarne chahiye — routing design zaroori'], cost: '~$0.395/ghanta per endpoint + $0.065/GB.', exam: '"filter outbound traffic by domain name", "intrusion prevention for VPC" → Network Firewall.', level: 'vpcdeep' },
    },
    compare: {
      cols: ['', 'Security Group', 'NACL', 'WAF', 'Shield', 'Network Firewall'],
      rows: [
        ['Level', 'ENI/instance', 'subnet', 'HTTP app', 'edge/network', 'VPC'],
        ['State', 'stateful', 'stateless', '—', '—', 'stateful + stateless'],
        ['Deny rules', 'nahi', 'haan', 'haan', 'auto', 'haan'],
        ['Rokta hai', 'galat port/source', 'IP ranges', 'SQLi/XSS/bots', 'DDoS', 'domains/IPS'],
      ],
    },
    scenarios: [
      { s: 'Login page par ek IP se har minute 5,000 password attempts.', answer: 'waf', explain: 'Rate-based rule → WAF.' },
      { s: 'RDS ko sirf app servers se port 5432 par connection lena chahiye.', answer: 'sg', explain: 'SG-to-SG reference, stateful allow.' },
      { s: 'Ek known malicious IP range poore public subnet se block karni hai.', answer: 'nacl', explain: 'Explicit deny at subnet → NACL.' },
      { s: 'Company chahti hai saare servers sirf approved domains (*.amazonaws.com, pypi.org) par hi outbound jaa sakein.', answer: 'nfw', explain: 'Domain-based egress filtering → Network Firewall.' },
      { s: 'Gaming company ko bade DDoS attacks ka darr hai aur attack ke din scaling bill wapas chahiye.', answer: 'shield', explain: 'DDoS cost protection + DRT → Shield Advanced.' },
      { s: 'Search box se SQL injection attempts aa rahe hain.', answer: 'waf', explain: 'SQLi managed rules → WAF.' },
    ],
  },
]);
