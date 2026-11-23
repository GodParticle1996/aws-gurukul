/* Each case adds a changed requirement to the evidence from its level. */
AG.sochCases = [
  {
    id: "cloud101", title: "Budget email der se aayi",
    q: "Actual kharche par ₹5,000 ka alert aaya tab bill ₹5,400 tha. Roz ka kharcha pakadne ke liye team ko kya samjhaoge?",
    choices: ["Alert pehle ke usage par aata hai", "Alert aate hi server ruk jaata hai", "Alert bill ko limit par rokta hai", "Alert har request ka rate padhta hai"], answer: 0,
    hint: "Email bhejne ka waqt aur usage ka waqt ek baar milao.",
    explain: "AWS billing data aane mein waqt lagta hai. Email milne tak aur usage ho sakti hai. Team bill ka source dekhe aur chal rahe resources par action le."
  },
  {
    id: "vpcbasics", title: "Naya subnet kis raaste par hai?",
    q: "Kal ek aur subnet bana. Kisi ne route table select nahi ki. Naye subnet ka raasta jaanne ke liye pehle kya kholo?",
    choices: ["Web ki public route table kholo", "VPC ki main route table dekho", "DB ka security group dekho", "Subnet ka public IP flag kholo"], answer: 1,
    hint: "Subnet ko abhi kisi custom table se joda hi nahi gaya.",
    explain: "Har subnet ek route table use karta hai. Alag association na ho toh VPC ki main table ke routes naye subnet par bhi lagte hain."
  },
  {
    id: "s3", title: "Private invoice ka link",
    q: "Bucket ab private hai. Priya ko apna ek invoice das minute ke liye download karna hai. App uski pehchaan aur order dono check kar chuki hai. Kya do?",
    choices: ["Poore prefix ka read role", "Bucket ki public website", "Ek object ka signed link", "Public ACL ka chhota window"], answer: 2,
    hint: "Priya ko sirf ek file chahiye. Link das minute baad band hona chahiye.",
    explain: "App sirf Priya ke invoice ke liye chhoti expiry wala signed link banaye. Link paane wala use expiry tak khol sakta hai, isliye link bhi private rakho."
  },
  {
    id: "rds", title: "Sales report ke liye kaunsi copy?",
    q: "Checkout ki price ab sahi hai. Kal ki sales report writer ko busy kar rahi hai. Report 60 second purani ho sakti hai. Reader ab sirf 2 second peeche hai. Report kahan chale?",
    choices: ["Writer par hi report chalao", "Roz naya DB restore karo", "Standby ko report ka host do", "Reader par lag dekhkar chalao"], answer: 3,
    hint: "Report kitne second peeche reh sakti hai? Abhi reader ka lag uske andar hai.",
    explain: "RDS read replica reporting ka load le sakti hai. Report ka 60 second ka target hai. Lag badhe toh team ko report rokne ya writer lene ka faisla karna hoga."
  },
  {
    id: "elbasg", title: "Health check pass, app phir bhi tooti",
    q: "Health path theek hua. Agle din ek app baar-baar fail hui. Baaki targets healthy hain. ALB ne kharab target ko nayi requests bhejni band ki. EC2 status OK hai aur group sirf EC2 health dekhta hai. App failure par replacement kaise mile?",
    choices: ["Group par ELB health jodo", "ALB ke health checks tez karo", "Group ka max size badhao", "Target ka weight ghatao"], answer: 0,
    hint: "Traffic bhejne ka faisla ALB karta hai. Instance badalne ka faisla kaun karta hai?",
    explain: "ALB kharab target ko traffic se baahar kar sakta hai. Auto Scaling group ELB health bhi dekhega tab app ke kharab target ki jagah naya instance la sakta hai."
  },
  {
    id: "boss1", title: "Payment ka doosra raasta",
    q: "Private app ko payment company ki public IPv4 API chahiye. S3 ka gateway endpoint lag chuka hai. Payment ke liye kaunsa route rakhna hoga?",
    choices: ["S3 prefix ka doosra route", "NAT tak ka default route", "DB subnet ka local route", "ALB subnet ka local route"], answer: 1,
    hint: "Payment API ka public address S3 ki prefix list mein aayega kya?",
    explain: "S3 ka prefix sirf S3 ke addresses pakadta hai. Public payment API ko private app ke NAT se internet tak ka chalne wala raasta chahiye."
  },
  {
    id: "route53", title: "DNS mein purana address",
    q: "Authoritative DNS ab standby ka address de raha hai. Ek resolver ki purani entry mein abhi 40 second bache hain. Sabse pehle kya dekho?",
    choices: ["Primary ka naya weight", "Standby ka seedha IP", "TTL ke baad naya jawab", "Naya health check result"], answer: 2,
    hint: "Resolver ne primary ka jawab pehle hi save kiya tha. Us copy ki expiry dekho.",
    explain: "Resolver pehle se mila jawab TTL tak rakh sakta hai. Bachi hui TTL ke baad usi resolver se phir pucho aur authoritative jawab se milao."
  },
  {
    id: "cloudfront", title: "Naya poster kab dikhega?",
    q: "Origin access theek hua. Aaj wahi poster.jpg badli. Purani copy edge par abhi fresh hai. URL badal nahi sakta. Edge ko nayi copy maangne ke liye kya karo?",
    choices: ["Origin ki key phir badlo", "Bucket ki policy phir badlo", "Browser ki cache saaf karo", "Poster ka path invalidate karo"], answer: 3,
    hint: "Browser se pehle edge ki copy socho. Abhi edge ko origin se phir maangna hai.",
    explain: "Invalidation poori hone ke baad agla viewer request edge ko origin se poster dobara lene deta hai. Browser mein padi copy ki expiry alag hai."
  },
  {
    id: "efs", title: "Teesri AZ mein Linux worker",
    q: "App teesri AZ mein bhi chalegi. Regional EFS use ho raha hai. Abhi mount targets sirf pehli do AZ mein hain. Teesri AZ ka normal local mount path kaise banao?",
    choices: ["Us AZ mein mount target jodo", "Us AZ mein access point jodo", "Us AZ mein replica banao", "DNS ka TTL aur kam karo"], answer: 0,
    hint: "Access point ek folder aur identity set karta hai. AZ mein network connection kaun leta hai?",
    explain: "Regional EFS par app ki AZ mein mount target bana sakte ho. Client ko target tak network aur NFS ki ijazat bhi chahiye. Access point akela network raasta nahi banaata."
  },
  {
    id: "lambda", title: "Timeout ka hard limit",
    q: "Thumbnail theek hai. Par ek naya format ek hi pass mein 18 minute leta hai. Job ko tukdon mein todna mumkin nahi hai. Kya badlo?",
    choices: ["Timeout ko 18 minute do", "Lambi job container mein do", "Layer mein codec rakh do", "Retry ko 18 minute do"], answer: 1,
    hint: "Ek hi attempt ke 18 minute chahiye. Naya attempt pehle ka waqt aage nahi badhaata.",
    explain: "Ek Lambda invocation zyada se zyada 15 minute chal sakti hai. Alag container task ko poori job ka waqt do aur caller ko job ID lautaao."
  },
  {
    id: "dynamodb", title: "Shards ne reads badha di",
    q: "Aaj ki sales pehle ek key par thi. Ab aaj ki rows chaar random suffix par faili hain. Saare aaj ke orders chahiye. App kya padhe?",
    choices: ["Ek key ke chaar page lo", "Ek hi key par limit badhao", "Chaar keys ke page milao", "Aakhri key par scan chalao"], answer: 2,
    hint: "Kya ek partition key ki Query baaki teen suffix ki rows de sakti hai?",
    explain: "Random suffix se writes alag keys par gayin. Poore din ke liye app ko har suffix ke saare Query pages padhkar orders milaane honge."
  },
  {
    id: "caching", title: "Cache mein puraana price",
    q: "Product key theek hai. Price badalne ke baad bhi public card par das minute puraana price dikhta hai. App write ke baad hi naya price dikhana chahti hai. Kya badlo?",
    choices: ["Entry ki expiry aur door rakho", "Cache ki RAM aur badhao", "Har read par TTL badhao", "Write par cache bhi badlo"], answer: 3,
    hint: "Nayi price abhi likhi gayi hai. Purani entry apni expiry tak zinda hai.",
    explain: "Sahi key ek hi price ko baar-baar padhne mein madad karti hai. Price ki successful write ke saath cache ko update ya invalidate karne ka raasta bhi chahiye."
  },
  {
    id: "sqssns", title: "Invoice job phir mili",
    q: "Queue ko SNS se invoice job mil gayi. Worker ne invoice bana diya. Delete se pehle worker band hua. Same job phir mili. Ab kya check karo?",
    choices: ["Invoice ka saved job ID", "Pichhli receipt ka handle", "Nayi delivery ka timestamp", "Queue ka receive count"], answer: 0,
    hint: "Receipt har receive par badal sakti hai. Invoice ka kaunsa naam dono baar same tha?",
    explain: "Same kaam ki delivery dobara ho sakti hai. Invoice banaane ka record business job ID se pakdo. Dobara aayi job se doosra invoice nahi banna chahiye."
  },
  {
    id: "events", title: "Rule ka target do din band",
    q: "Rule match hota hai. Target ki delivery ke retries khatam ho gaye. Agli baar failed events sambhaal kar rakhne ke liye target par kya jodo?",
    choices: ["Rule par lambi retries", "Target ke liye SQS DLQ", "Consumer ki apni DLQ", "Poore bus ka archive"], answer: 1,
    hint: "Target tak delivery hui hi nahi. EventBridge ke paas kaunsa raasta bacha hai?",
    explain: "EventBridge target par dead-letter queue lagaao aur queue ko delivery ki ijazat do. Retries ke baad jo event target tak na pahunche, team uski wajah dekh sakegi."
  },
  {
    id: "wellarch", title: "Backup se order milta hai?",
    q: "Scanner ki findings ab zero hain. Recovery drill mein pichhle backup ka ek jaana-pehchaana order waapas dikhana hai. Kaunsa saboot loge?",
    choices: ["Backup ka size phir dekho", "Backup job ka status lo", "Restore karke order padho", "Snapshot ki date dekho"], answer: 2,
    hint: "Listing dikha sakti hai ki backup bana. Pata kaise chalega ki order khulta hai?",
    explain: "Team ek alag DB restore karke order ki ID aur expected values milaaye. Backup ki listing se waqt ya restored data ki sahi values ka pata nahi chalta."
  },
  {
    id: "dr", title: "Agli release mein AMI badli",
    q: "Aaj ki Hyderabad drill chal gayi. Kal Mumbai mein nayi golden AMI banegi. Agli drill naye release par chale, iske liye kya jodo?",
    choices: ["Template mein naam badlo", "Purani copy ko naya tag do", "DNS record ka TTL ghatao", "Release par AMI copy karo"], answer: 3,
    hint: "Har Region mein launch ke liye us Region ka AMI ID chahiye.",
    explain: "AMI ki copy ka apna regional ID hota hai. Nayi release ki copy available hone par standby template ko naye ID par le jao aur launch karke dekho."
  },
  {
    id: "containers", title: "Task chal gayi, invoice write fail",
    q: "Image pull ab sahi hai. Chalta hua app S3 mein invoice likhta hai aur AccessDenied paata hai. App ki permission kahan check hogi?",
    choices: ["Task role ki S3 policy", "Execution role ka ECR rule", "Service role ka ALB rule", "Pipeline role ka ECR rule"], answer: 0,
    hint: "Image pull ho chuki hai. Ab S3 call app ke andar se ja rahi hai.",
    explain: "ECS task ke andar app ko task role ki credentials milti hain. Execution role image pull mein kaam aata hai. App ke role aur bucket ki policy par S3 write check karo."
  },
  {
    id: "cost", title: "Raat mein khaali compute",
    q: "Team har ghante $2 ka Savings Plan lene waali hai. Test servers sirf dopahar mein chalte hain. Kharidne se pehle kis data se amount chunoge?",
    choices: ["Mahine ka kul storage bill", "Har ghante ka eligible spend", "Peak waale din ka EC2 spend", "Saal ki kul request ginti"], answer: 1,
    hint: "Dopahar aur raat ke usage ko alag rakho. Commitment ki unit par dhyaan do.",
    explain: "Savings Plans ka commitment har ghante ke liye hota hai. Dopahar ka zyada compute khaali raat ka commitment use nahi karta. Har ghante ka eligible usage dekho."
  },
  {
    id: "observability", title: "Raat ko zero orders aam hain",
    q: "Checkout theek hai. Raat ko sach mein zero orders ho sakte hain. Ab traffic ke bina bhi ek minute mein app ki khabar chahiye. Kaunsa signal lo?",
    choices: ["Sirf poore din ke orders gino", "Sirf error ki kul ginti", "Har minute ek test request", "Kal ka average traffic"], answer: 2,
    hint: "Zero orders normal hain. Kya koi signal aisa hai jo khaali raat mein bhi aana chahiye?",
    explain: "App khaali ho toh zero orders aur outage ek jaise dikh sakte hain. Regular test request ka result aur missing result dono dekhne se on-call ko alag saboot milta hai."
  },
  {
    id: "analytics", title: "Date folder ban gaya, scan phir bada",
    q: "Ab files dt ke hisaab se partitioned hain. Query poora mahina padh rahi hai. Sirf ek din ka total chahiye. SQL mein kya badlo?",
    choices: ["LIMIT mein ek row maango", "ORDER BY mein dt rakho", "SELECT mein bas dt rakho", "WHERE mein dt ki shart do"], answer: 3,
    hint: "Rows chunne aur folders chunne ka farq dekho. Din kis column se folder banta hai?",
    explain: "Partition key par din ki shart Athena ko us din ke folder tak rakhti hai. Ek aggregate row lautne se input ka scan apne aap kam nahi hota."
  },
  {
    id: "appai", title: "Login sahi, export ki ijazat alag",
    q: "Mobile token ka issuer aur audience ab sahi hain. Report export sirf reports.read scope waale users kar sakein. HTTP API route par kya rakho?",
    choices: ["Route ka required scope", "Audience mein app ID rakho", "Issuer mein pool ID rakho", "Token ka lamba expiry time"], answer: 0,
    hint: "Token sahi hai. Ab sawal ek khaas route ki ijazat ka hai.",
    explain: "JWT ki signature aur audience user ke token ko validate karti hain. Export route par reports.read scope maangne se API Gateway token mein wahi ijazat bhi dekhta hai."
  },
  {
    id: "finalboss", title: "Standby secret puraane host par",
    q: "Hyderabad mein secret padh liya. Secret ke host field mein Mumbai DB likha hai. Mumbai ab band hai. Standby ke app config mein kya milao?",
    choices: ["Primary ki rotation date", "Standby DB ka sahi endpoint", "DNS ki bachi hui TTL", "Replica ki last sync flag"], answer: 1,
    hint: "Secret ke bytes mil gaye. DB driver agla connection kis host ko bhejega?",
    explain: "Secret ki replica mein source ke connection details bhi aa sakte hain. Standby app sahi DB host chune aur usi role se connection karke ek test read dikhaye."
  },
  {
    id: "compute", title: "Batch job doosri baar chali",
    q: "Ab video Batch mein chalti hai. Pehla attempt aadhi file likhkar ruka. Retry ko kaam poora karna hai. Viewer tak kaunsi file jaani chahiye?",
    choices: ["Pehle attempt ki copy", "Naye attempt ki aadhi file", "Jaanchi hui poori file", "Sabse badi mili file"], answer: 2,
    hint: "Do attempts ki files ek saath mil sakti hain. Final naam kab publish karoge?",
    explain: "Batch retry ek aur attempt chala sakta hai. Har attempt ka output alag rakho. Poora output check hone ke baad hi final file ka pata viewer ko do."
  },
  {
    id: "datastore", title: "Feed mein sirf aaj ki posts",
    q: "Feed ki partition key userId aur sort key postTime hai. Sirf aaj ki posts chahiye. Purane din padhe bina DynamoDB request kaise banao?",
    choices: ["Filter mein aaj ka time do", "Response par date filter do", "Item milne par time padho", "Key condition mein time do"], answer: 3,
    hint: "Filter chalne ke waqt DynamoDB kaunsi rows pehle hi padh chuki hoti hai?",
    explain: "Query ki key condition user aur uske time range ko chunti hai. Baad ka filter pehle padhi hui purani rows ka read kharcha waapas nahi karta."
  },
  {
    id: "messaging", title: "Do photos ek doosre ko rok rahi hain",
    q: "Saari edits FIFO mein ek hi group mein hain. P7 ki pehli edit atki hai. P8 ko P7 ka wait nahi karna. Har photo ka apna order bhi chahiye. Group key kya lo?",
    choices: ["Har photo ki stable ID", "Har edit ki nayi UUID", "Har queue ka ek label", "Har worker ki host ID"], answer: 0,
    hint: "P7 ki har edit ki key same chahiye. P8 ki key P7 se alag chahiye.",
    explain: "FIFO ka order ek message group ke andar milta hai. Har photo ki alag stable key se P8 aage badh sakti hai aur P7 ki edits ek hi group mein rehti hain."
  },
  {
    id: "eventbridge", title: "Sirf review ko replay chahiye",
    q: "Kal ke uploads classic EventBridge bus ke archive mein hain. Audit ne sab le liye. Sirf repaired review rule ko us ghante ke events phir dena hai. Replay kaise set karo?",
    choices: ["Naya bus aur audit rule", "Wahi bus aur review rule", "Wahi bus aur saare rules", "Naya bus aur saare rules"], answer: 1,
    hint: "Archive kis bus ne banaya tha? Audit ko dobara event bhejne ki zaroorat hai kya?",
    explain: "Replay ka destination source bus hi hota hai. Kal ke ghante ka window aur review rule chuno taaki audit ko bina zaroorat wahi events phir na milein."
  },
  {
    id: "logsetl", title: "S3 mein logs thodi der baad mile",
    q: "Search ki disk theek hui. Raw S3 files abhi chhoti hain aur der se aati hain. Firehose mein traffic kam hai. Freshness aur file size ka faisla kis setting par loge?",
    choices: ["Raw logs ki retention", "Query ka time window", "Buffer ka time aur size", "Search ka refresh time"], answer: 2,
    hint: "Kam traffic par file bharne mein waqt lagta hai. Delivery ko aur kaunsi shart chala sakti hai?",
    explain: "Firehose delivery se pehle records jama kar sakta hai. Chhota buffer interval kam traffic par wait ghata sakta hai. File size aur delivery delay dono naapkar setting chuno."
  },
  {
    id: "edge", title: "Poster aur feed ek domain par",
    q: "Public poster cache se tez hua. Ab usi domain ka /feed har viewer ke liye alag hai. Har call par fresh login check chahiye. Feed ka behavior kaise rakho?",
    choices: ["Cache lamba, login hatao", "Cache chhota, login hatao", "Cache lamba, path badlo", "Cache band, login aage do"], answer: 3,
    hint: "Viewer ki pehchaan har call par origin ko chahiye. Sirf chhota TTL dene se kya hoga?",
    explain: "Feed ko har baar origin par viewer ki login ke saath pahunchna hai. Feed par caching disable karo aur zaroori auth forward karo. Public poster ka cache alag rakho."
  },
  {
    id: "costdec", title: "S3 bill ghata, NAT ab bhi chahiye?",
    q: "Dono app tables par same-Region S3 ka prefix route hai. App ek external payment API bhi bulaati hai. NAT hataane se pehle kaunsa test karo?",
    choices: ["Payment ki call chalao", "S3 object dobara padho", "NAT ka hourly rate dekho", "S3 ki latency dobara lo"], answer: 0,
    hint: "S3 aur payment ki destination alag hain. Dono par wahi route lagega kya?",
    explain: "S3 gateway endpoint sirf matching S3 traffic ka raasta badalta hai. Payment API ka address default route le sakta hai. App subnet se payment ka raasta check karo."
  },
  {
    id: "resilience", title: "Marker bacha, par ginti galat",
    q: "Worker marker aur counter ko do alag writes mein likhta hai. Marker ke baad worker band hua. Retry ne marker dekha aur job chhod di. Kaunsa repair karo?",
    choices: ["Marker par lambi retention do", "Dono writes ek transaction mein", "Dono writes par lamba timeout", "Dono writes par lambi expiry"], answer: 1,
    hint: "Marker ke baad aur counter se pehle worker phir ruk jaaye toh kya bachega?",
    explain: "Marker ki conditional Put aur counter update ek transaction mein honge toh dono saath commit honge. Beech mein crash par marker akela bachkar sahi retry ko nahi rokega."
  }
];
