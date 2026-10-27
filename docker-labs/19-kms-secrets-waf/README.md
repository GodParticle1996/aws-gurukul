# Lab19 — data keys, secret versions aur protection metadata

**Pain:** ShopKaro invoices encrypted hain, lekin app ko decrypt permission nahi. Password replace karna bhi enough nahi: secret value aur actual database credential ko safely coordinate karna padta hai.

Existing Python environment se run karo. Docker aur real AWS ki zarurat nahi:

```bash
cd aws-gurukul/docker-labs
source env.sh
python -I 19-kms-secrets-waf/lab.py
```

`lab.py` pehle padho. Script apna ephemeral `127.0.0.1` Moto server start karta hai. Har SDK client explicit generated endpoint, dummy keys aur lab-local config use karta hai; role profiles/session tokens/instance metadata disabled hain. Shared4566 server, real AWS aur `~/.aws` touch nahi hote. Script actual operations aur assertions print karta hai; output mein credentials sirf named `TEST_ONLY` fixtures hain. Kabhi real secret input mat do.

## ex1 — small KMS payload, phir actual envelope encryption

CreateKey → CreateAlias → EnableKeyRotation(180 days) → GetKeyRotationStatus. Moto5.2.4 returned:

```json
ROTATION {"KeyRotationEnabled":true}
```

👉 Enabled flag round-trips, lekin response rotation period nahi deta. **180-day scheduling/key-material rotation verify nahi hui.** AWS eligible customer managed symmetric AWS_KMS keys ka automatic period90–2560days hai; rotation old ciphertext rewrite nahi karti.

Encrypt/Decrypt16-byte TEST invoice with matching non-secret EncryptionContext. Wrong tenant context returns InvalidCiphertextException. GenerateDataKey AES_256 returns a plaintext key and wrapped key. Host `cryptography` AESGCM encrypts7000bytes; save ciphertext/nonce/wrappedKey/context, discard plaintext key reference, then unwrap and decrypt. Tampering changes authentication tag and fails.

Captured assertions:

```text
PASS 2 small KMS plaintext roundtrip
PASS 3 wrong encryption context fails
PASS 4 7000-byte payload AES-GCM + KMS-wrapped key roundtrip
PASS 5 modified ciphertext fails authentication
DISABLED_KEY_DECRYPT ACCEPTED (emulator gap)
```

👉 AES-GCM roundtrip/tamper check is real host cryptography; KMS wrapping is Moto. Python `del` does not guarantee secure memory erasure. This reference is not a production encryption format or HSM/authorization proof. **Moto accepts decrypt while disabled** in this run; AWS returns DisabledException. Real key policy/IAM/grants/Deny and disabled-key behavior need AWS integration testing. Direct symmetric KMS Encrypt supports up to4096bytes; large payload uses envelope encryption.

## ex2 — bucket default encryption changes future writes

Put old.txt before default SSE-KMS/BucketKeyEnabled; then configure the default and put new.txt. HeadObject shows old object unchanged, new object aws:kms and BucketKeyEnabled true:

```text
PASS 6 default encryption affects new writes; old object unchanged
```

👉 No old-object migration is implied. Bucket Keys can reduce KMS traffic by **up to99%**, depending on requesters/cache/workload. Cached Bucket Key use need not call KMS or recheck key policy per object request; use S3 data-event auditing where required. The demo does not measure savings, real encryption internals or policy enforcement.

## ex3 — pending secret is different from a tested credential

Create a dummy secret version `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`; PutSecretValue creates `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` with AWSPENDING. GetSecretValue default still returns old credential. A host **TEST dict** acts as the backend credential: before set, pending password does not match; after set/test, move AWSCURRENT to the new version, inspect AWSPREVIOUS and remove AWSPENDING.

```text
PASS 7 pending secret does not replace current
PASS 8 pending credential cannot authenticate before backend set
PASS 9 set then test TEST backend before promotion
PASS 10 finish promotes actual version labels
PASS 11 explicit AWSCURRENT credential matches TEST backend
DEFAULT_SECRET_VERSION_MOTO_GAP {"matchesPromotedVersion":false,"note":"Moto default-version pointer can remain old after label move; explicit AWSCURRENT verified"}
```

👉 Real default GetSecretValue follows AWSCURRENT. Moto5.2.4 label move leaves its separate default-version pointer stale, so this lab verifies the explicit stage and reports the mismatch. The host dict is **not PostgreSQL, Lambda rotation or concurrent client recovery**. No secret promotion should replace a real backend validation.

An isolated throwaway probe calls RotateSecret with30-day rules/no immediate rotation and no Lambda. Moto returns RotationEnabled=true, RotationLambdaARN="" and a new AWSCURRENT version. **This is an emulator gap, not working rotation.** Real Lambda-based rotation requires a valid configured function and permissions. `--no-rotate-immediately` still invokes testSecret; it does not mean zero invocation. Docker-dependent Lambda/real DB rotation remains unverified. Managed service/external integrations have their own supported setup; do not assume all rotation uses the same path.

PutParameter SecureString with the own key; GetParameter default returns ciphertext, WithDecryption returns TEST_ONLY_config:

```text
PASS 12 SSM ciphertext/default versus requested plaintext
```

Parameter Store has no built-in credential rotation. Standard storage/throughput conditions and KMS requests still affect cost and access.

## ex4 — WAF config/association and optimistic concurrency

Create an owned two-AZ internal ALB (metadata only). Regional web ACL default Allow contains AWSManagedRulesCommonRuleSet plus IP100/60s rate rule scoped exactly to /login. AssociateWebACL, then GetWebACLForResource verifies the exact ALB/ACL relationship. GetWebACL supplies LockToken; one UpdateWebACL succeeds; reusing old token returns WAFOptimisticLockException.

```text
PASS 13 actual Regional ALB association metadata
STALE_WAF_TOKEN WAFOptimisticLockException
```

👉 No listener, HTTP traffic, SQLi/bot/rate enforcement, propagation or false-positive result is claimed. Real WAF estimates rates over configured60/120/300/600s windows, rather than enforcing an exact request quota. COUNT observes; BLOCK enforces. Distributed low-rate bots need additional signals/controls. CloudFront ACLs use CLOUDFRONT scope in us-east-1; this lab uses REGIONAL ALB metadata.

## ex5 — detector enabled is not threat detection

CreateDetector/GetDetector returns ENABLED. Current Moto endpoints for CreateSampleFindings and ListFindings return404:

```text
PASS 14 GuardDuty detector enabled metadata
GUARDDUTY_SAMPLE_GAP 404
GUARDDUTY_LIST_FINDINGS_GAP 404 no live threat detection claimed
BEHAVIOR CHECKS 14
```

👉 In-app findings are explicitly seeded training fixtures. Foundational GuardDuty log analysis and optional Runtime Monitoring/other protection plans have separate setup and billing; Runtime Monitoring uses a security agent. Detector metadata does not prove plan coverage or a prevented incident.

## Cleanup

Finally deletes only run-owned detector, WAF association/ACL, ALB/subnets/VPC, parameters, secrets and bucket objects/bucket. Key alias deleted and own KMS key scheduled for deletion with7days; a KMS key cannot be immediately deleted on AWS. Cleanup asserts remaining state, then closes the owned disposable server/listener:

```text
PASS 15 owned resources removed; KMS key scheduled7days
OWNED MOTO STOPPED / LISTENER CLOSED
```

Fourteen behavior checks plus cleanup15. Ignored `.lab/last-run.json` contains historical IDs and closed-listener evidence, not live AWS resources. No shared server reset or unrelated deletion. Failed preparation probes also ran cleanup; this README reflects the successful exact repository replay.

Sources: [KMS rotation](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html), [KMS Decrypt/context/errors](https://docs.aws.amazon.com/kms/latest/APIReference/API_Decrypt.html), [Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html), [secret rotation](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_RotateSecret.html), [rotation functions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html), [WAF rate caveats](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-caveats.html), [GuardDuty Runtime Monitoring](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring.html).
