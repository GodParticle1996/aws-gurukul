# Lab19 — data keys, secret versions aur protection metadata

**Pain:** ShopKaro invoices encrypted hain, lekin app ko decrypt permission nahi. Password replace karna bhi enough nahi: secret value aur actual database credential ko safely coordinate karna padta hai.

Existing Python environment se run karo. Docker aur real AWS ki zarurat nahi:

```bash
cd aws-gurukul/docker-labs
source env.sh
python -I 19-kms-secrets-waf/lab.py
```

`lab.py` pehle padho. Script apna thodi der ka `127.0.0.1` Moto server start karta hai. Har SDK client saaf banaya endpoint, dummy keys aur lab ki apni config use karta hai; role profiles/session tokens/instance metadata band hain. Shared 4566 server, asli AWS aur `~/.aws` ko chhoota nahi jaata. Script asli operations aur assertions print karta hai; output mein credentials sirf `TEST_ONLY` naam ke fixtures hain. Kabhi asli secret input mat do.

## ex1 — chhota KMS payload, phir asli envelope encryption

CreateKey → CreateAlias → EnableKeyRotation(180 days) → GetKeyRotationStatus. Moto 5.2.4 ne yeh diya:

```json
ROTATION {"KeyRotationEnabled":true}
```

👉 Enabled flag wapas aata hai, lekin response rotation period nahi deta. **180 din ki scheduling/key-material rotation check nahi hui.** AWS mein eligible customer managed symmetric AWS_KMS keys ka automatic period 90–2560 din hai; rotation purana ciphertext dobara nahi likhti.

Matching non-secret EncryptionContext ke saath 16-byte TEST invoice ko Encrypt/Decrypt karo. Galat tenant context InvalidCiphertextException deta hai. GenerateDataKey AES_256 ek plaintext key aur wrapped key deta hai. Host `cryptography` AESGCM 7000 bytes encrypt karta hai; ciphertext/nonce/wrappedKey/context save karo, plaintext key ka reference hatao, phir unwrap karke decrypt karo. Chhed-chhaad karne se authentication tag badalta hai aur decrypt fail hota hai.

Captured assertions:

```text
PASS 2 small KMS plaintext roundtrip
PASS 3 wrong encryption context fails
PASS 4 7000-byte payload AES-GCM + KMS-wrapped key roundtrip
PASS 5 modified ciphertext fails authentication
DISABLED_KEY_DECRYPT ACCEPTED (emulator gap)
```

👉 AES-GCM roundtrip/tamper check asli host cryptography hai; KMS wrapping Moto hai. Python `del` memory ka safe mitna pakka nahi karta. Yeh reference production encryption format ya HSM/authorization ka saboot nahi. Is run mein **Moto disabled key par bhi decrypt maan leta hai**; AWS DisabledException deta hai. Asli key policy/IAM/grants/Deny aur disabled-key behaviour ke liye AWS integration testing chahiye. Seedha symmetric KMS Encrypt 4096 bytes tak chalta hai; bada payload envelope encryption use karta hai.

## ex2 — bucket ka default encryption sirf aage ke writes badalta hai

Default SSE-KMS/BucketKeyEnabled se pehle old.txt put karo; phir default set karke new.txt put karo. HeadObject dikhata hai ki purana object waisa hi hai, aur naya object aws:kms aur BucketKeyEnabled true:

```text
PASS 6 default encryption affects new writes; old object unchanged
```

👉 Isse purane objects migrate nahi hote. Bucket Keys KMS traffic ko **99% tak** kam kar sakti hain, requesters/cache/workload ke hisaab se. Cached Bucket Key ke use mein har object request par KMS call ya key policy ka dobara check zaroori nahi; jahan zaroori ho wahan S3 data-event auditing use karo. Demo bachat, asli encryption internals ya policy enforcement nahi naapta.

## ex3 — pending secret aur test kiya credential alag hain

Ek dummy secret version `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` banao; PutSecretValue AWSPENDING ke saath `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` banata hai. Default GetSecretValue abhi bhi purana credential deta hai. Ek host **TEST dict** backend credential ka kaam karta hai: set se pehle pending password match nahi karta; set/test ke baad AWSCURRENT ko naye version par le jao, AWSPREVIOUS dekho aur AWSPENDING hatao.

```text
PASS 7 pending secret does not replace current
PASS 8 pending credential cannot authenticate before backend set
PASS 9 set then test TEST backend before promotion
PASS 10 finish promotes actual version labels
PASS 11 explicit AWSCURRENT credential matches TEST backend
DEFAULT_SECRET_VERSION_MOTO_GAP {"matchesPromotedVersion":false,"note":"Moto default-version pointer can remain old after label move; explicit AWSCURRENT verified"}
```

👉 Asli default GetSecretValue AWSCURRENT ko follow karta hai. Moto 5.2.4 mein label move karne par uska alag default-version pointer purana reh jaata hai, isliye yeh lab saaf stage check karti hai aur mismatch batati hai. Host dict **PostgreSQL, Lambda rotation ya concurrent client recovery nahi**. Koi bhi secret promotion asli backend ke check ki jagah nahi le sakta.

Ek alag, phenkne layak probe 30 din ke rules ke saath, bina turant rotation aur bina Lambda ke RotateSecret bulata hai. Moto RotationEnabled=true, RotationLambdaARN="" aur ek naya AWSCURRENT version deta hai. **Yeh emulator ki kami hai, chalti hui rotation nahi.** Asli Lambda-based rotation ko sahi set kiya function aur permissions chahiye. `--no-rotate-immediately` phir bhi testSecret chalata hai; iska matlab zero invocation nahi. Docker par chalne wala Lambda/asli DB rotation check nahi hua. Managed service/bahar ke integrations ka apna supported setup hai; yeh mat maano ki har rotation ek hi raaste se chalti hai.

Apni key ke saath PutParameter SecureString; default GetParameter ciphertext deta hai, WithDecryption TEST_ONLY_config deta hai:

```text
PASS 12 SSM ciphertext/default versus requested plaintext
```

Parameter Store mein credential rotation built-in nahi. Standard storage/throughput ki shartein aur KMS requests kharche aur access par asar daalti hain.

## ex4 — WAF config/association aur optimistic concurrency

Apna two-AZ internal ALB banao (sirf metadata). Regional web ACL ka default Allow hai, jisme AWSManagedRulesCommonRuleSet + sirf /login par scoped IP 100/60s rate rule hai. AssociateWebACL, phir GetWebACLForResource exact ALB/ACL rishta check karta hai. GetWebACL LockToken deta hai; ek UpdateWebACL safal hota hai; purana token dobara use karne par WAFOptimisticLockException aata hai.

```text
PASS 13 actual Regional ALB association metadata
STALE_WAF_TOKEN WAFOptimisticLockException
```

👉 Listener, HTTP traffic, SQLi/bot/rate enforcement, propagation ya false-positive result ka koi daava nahi. Asli WAF rates ko set ki 60/120/300/600s windows par andaaze se ginta hai, exact request quota laagu nahi karta. COUNT sirf dekhta hai; BLOCK rokta hai. Bikhre, kam-rate bots ke liye extra signals/controls chahiye. CloudFront ACLs us-east-1 mein CLOUDFRONT scope use karte hain; yeh lab REGIONAL ALB metadata use karti hai.

## ex5 — detector on hona threat detection nahi

CreateDetector/GetDetector ENABLED deta hai. Aaj ke Moto mein CreateSampleFindings aur ListFindings ke endpoints 404 dete hain:

```text
PASS 14 GuardDuty detector enabled metadata
GUARDDUTY_SAMPLE_GAP 404
GUARDDUTY_LIST_FINDINGS_GAP 404 no live threat detection claimed
BEHAVIOR CHECKS 14
```

👉 App ke findings saaf taur par pehle se daale training fixtures hain. Basic GuardDuty log analysis aur optional Runtime Monitoring/doosre protection plans ka setup aur billing alag hai; Runtime Monitoring ek security agent use karta hai. Detector ka metadata plan coverage ya roka hua incident prove nahi karta.

## Cleanup

Aakhir mein sirf run ka apna detector, WAF association/ACL, ALB/subnets/VPC, parameters, secrets aur bucket objects/bucket delete hote hain. Key alias delete hota hai aur apni KMS key 7 din mein delete hone ke liye schedule hoti hai; AWS par KMS key turant delete nahi ho sakti. Cleanup bachi state check karta hai, phir apna phenkne layak server/listener band karta hai:

```text
PASS 15 owned resources removed; KMS key scheduled7days
OWNED MOTO STOPPED / LISTENER CLOSED
```

Chaudah behaviour checks + cleanup 15. Ignore hone wali `.lab/last-run.json` mein purani IDs aur band listener ka saboot hai, live AWS resources nahi. Shared server reset ya anjaana delete nahi. Fail taiyaari wale probes ne bhi cleanup chalaya; yeh README safal exact repository replay dikhata hai.

Sources: [KMS rotation](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html), [KMS Decrypt/context/errors](https://docs.aws.amazon.com/kms/latest/APIReference/API_Decrypt.html), [Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html), [secret rotation](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_RotateSecret.html), [rotation functions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html), [WAF rate caveats](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-caveats.html), [GuardDuty Runtime Monitoring](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring.html).
