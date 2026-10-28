# Lab26 — Terraform drift, import, moved aur S3 native lock

ShopKaro fictional fixture: approved SG sirf internal TLS hai; console se world SSH add hua. Existing invoices bucket ko adopt karna hai, data replace nahi karna.

Python Moto server har run apne ephemeral loopback port par start hota hai. Shared emulator/reset, Docker aur real AWS use nahi hote. Every SDK/provider/backend endpoint explicitly owned server hai; dummy credentials aur isolated credential files use hote hain. Runner only owned fixtures clean karta hai. README Terraform commands runner ke generated working directory ke liye hain; default shell AWS credentials se commands mat chalao.

## Prerequisites aur run

Existing Python venv mein Moto 5.2.4/boto3; installed Terraform **1.17.0**, cached `hashicorp/aws` **6.70.0**. Runner tools install/download nahi karta. App root se:

```bash
./docker-labs/.venv/bin/python -I docker-labs/26-terraform-drift-import/lab.py --terraform .overhaul-evidence/tools/terraform --plugin-dir docker-labs/08-three-tier-terraform/.terraform/providers
```

Missing binary/cache par argparse error deta hai. Paths apne installed tools ke hisaab se badal sakte ho. Run directory `.overhaul-evidence/lab26-runs/run-<unique>/`; generated provider.tf mein owned endpoints aur private/versioned/encrypted S3 backend ka `use_lockfile=true` dekho. Current runner AWS provider version pin karta hai. Different versions par same captured output assume mat karo.

## Samjho aur replay padho

1. Runner SDK se backend bucket/VPC banata hai; Terraform 2 resources (SG + app bucket) create karta hai. `terraform state pull` se bindings aur serial read hote hain.
2. SDK original TEST order likhta hai aur SG par TCP22/0.0.0.0/0 add karta hai. `terraform plan -refresh-only -out=refresh.tfplan` → `terraform apply refresh.tfplan`: state record badalta hai, live SSH open rehta hai. **Refresh repair nahi hai.**
3. SDK existing archive bucket + original TEST invoice banata hai. Config add hone ke baad saved stale.tfplan banta hai. `terraform import aws_s3_bucket.archive <generated-archive-name>` binding add karta hai. Old saved plan apply rejects: state serial changed.
4. Fresh `terraform plan -out=repair.tfplan` → apply: 0 add, 1 change, 0 destroy. API readback same SG ID, only internal443. Dono original TEST payloads byte comparison pass.
5. HCL `moved { from = aws_s3_bucket.archive to = aws_s3_bucket.invoices }` address migrate karta hai; 0 add/change/destroy, physical bucket ID same. Native `.tf.json` literal configuration same resources represent karti hai; validate + normal plan exit0 prove equivalence. SG ingress JSON attributes ka full object set required hai, HCL nested block defaults ke barabar fields explicitly diye hain.
6. Native JSON config mein app bucket ka physical name change + first-time force_destroy=true aur guard remove kiya. Actual saved replacement apply `BucketNotEmpty` deta hai, original TEST order intact. Provider prior successfully applied state flag use karta hai, proposed new flag same replacement mein enough nahi. Config restore hota hai.
7. `terraform plan -destroy` rejects while lifecycle.prevent_destroy remains in bucket configuration. Guard remove/config remove bypass possible; AWS delete protection/backups/IAM separate layers hain.
8. Runner own `.tflock` object `IfNoneMatch=*` se holds karta hai. Second actual Terraform plan `-lock-timeout=0s` rejects. Sirf run-owned known lock release hota hai; active shared lock force-unlock nahi hota.
9. Final full normal plan exit0. Runner intentionally disposable TEST objects removes, guards removes, actual destroy 3 objects. State resources empty; VPC/backend versions/delete markers/lock + buckets removed; listener closes.

## Captured actual output — 2026-10-28

Selected actual lines; long generated resource/request IDs in the BucketNotEmpty diagnostic are shortened with `...`.

```text
Terraform v1.17.0
- Installed hashicorp/aws v6.70.0 (unauthenticated)
PASS 1 real apply binds SG+app bucket in S3 backend state
PASS 2 refresh-only apply updates state but leaves broad live ingress unchanged
Error: Saved plan is stale
PASS 3 import advances state serial; old saved plan rejected
Plan: 0 to add, 1 to change, 0 to destroy.
PASS 4 normal apply repairs live drift without replacing SG
PASS 5 both original TEST payloads preserved
PASS 6 moved block changes binding address while original bucket identity remains
PASS 7 native tf.json config is valid and equivalent to the HCL resource state
Error: deleting S3 Bucket (...): ... api error BucketNotEmpty: The bucket you tried to delete is not empty
PASS 8 force_destroy first set with replacement does not delete original nonempty bucket
Error: Instance cannot be destroyed
PASS 9 prevent_destroy blocks proposed destruction while lifecycle remains in config
Error: Error acquiring the state lock
PASS 10 native S3 conditional lock rejects second Terraform operation
PASS 11 final real plan has zero changes and releases owned lock
BEHAVIOR CHECKS 11
Destroy complete! Resources: 3 destroyed.
PASS 12 actual owned Terraform destroy leaves backend state empty
PASS 13 owned buckets including all backend versions/lock removed
OWNED MOTO STOPPED / LISTENER CLOSED
```

Full recorded replay `.overhaul-evidence/IAC-LAB26-REPLAY.txt`. Generated IDs/serials differ each run; compare behavior and preserved IDs within one run.

## Evidence boundaries

Real Terraform parser/provider/backend and Moto resource APIs executed. No containers, SQL, SG packet filtering, real IAM deny enforcement, production S3 durability/HA/performance/concurrent-writer load test. Lock test one explicit held native S3 conditional object against a second real Terraform operation, not a benchmark. No data migration: moved kept original object. CloudFormation/CDK/SAM in lesson were verified against official docs, not executed in this lab. Runner fail-safe finally cleans only owned resources; failed cleanup is surfaced, not reported as a pass.

[Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), [normal plan](https://developer.hashicorp.com/terraform/cli/commands/plan), [refactoring](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring), [native JSON](https://developer.hashicorp.com/terraform/language/syntax/json), [provider force_destroy lifecycle](https://registry.terraform.io/providers/hashicorp/aws/6.70.0/docs/resources/s3_bucket).
