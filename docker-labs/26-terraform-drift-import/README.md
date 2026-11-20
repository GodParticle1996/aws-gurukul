# Lab26 — Terraform drift, import, moved aur S3 native lock

ShopKaro fictional fixture: approved SG sirf internal TLS hai; console se world SSH add hua. Existing invoices bucket ko adopt karna hai, data replace nahi karna.

Python Moto server har run mein apne thodi der ke loopback port par start hota hai. Shared emulator/reset, Docker aur asli AWS use nahi hote. Har SDK/provider/backend endpoint saaf taur par apna server hai; dummy credentials aur alag credential files use hoti hain. Runner sirf apne fixtures saaf karta hai. README ke Terraform commands runner ki banayi working directory ke liye hain; normal shell ke AWS credentials se yeh commands mat chalao.

## Prerequisites aur run

Existing Python venv mein Moto 5.2.4/boto3; installed Terraform **1.17.0**, cached `hashicorp/aws` **6.70.0**. Runner tools install/download nahi karta. App root se:

```bash
./docker-labs/.venv/bin/python -I docker-labs/26-terraform-drift-import/lab.py --terraform "$(command -v terraform)" --plugin-dir docker-labs/08-three-tier-terraform/.terraform/providers
```

Binary/cache missing ho toh argparse error deta hai. Paths apne installed tools ke hisaab se badal sakte ho. Run directory `.overhaul-evidence/lab26-runs/run-<unique>/`; bani provider.tf mein apne endpoints aur private/versioned/encrypted S3 backend ka `use_lockfile=true` dekho. Aaj ka runner AWS provider ka version pin karta hai. Doosre versions par wahi output aayega, yeh mat maano.

## Samjho aur replay padho

1. Runner SDK se backend bucket/VPC banata hai; Terraform 2 resources (SG + app bucket) create karta hai. `terraform state pull` se bindings aur serial read hote hain.
2. SDK original TEST order likhta hai aur SG par TCP 22/0.0.0.0/0 add karta hai. `terraform plan -refresh-only -out=refresh.tfplan` → `terraform apply refresh.tfplan`: state record badalta hai, live SSH open rehta hai. **Refresh repair nahi hai.**
3. SDK pehle se bana archive bucket + asli TEST invoice banata hai. Config jodne ke baad saved stale.tfplan banta hai. `terraform import aws_s3_bucket.archive <generated-archive-name>` binding jodta hai. Purana saved plan apply karne par reject hota hai, kyunki state serial badal gaya.
4. Taaza `terraform plan -out=repair.tfplan` → apply: 0 add, 1 change, 0 destroy. API readback mein wahi SG ID, sirf internal 443. Dono asli TEST payloads ka byte comparison pass hota hai.
5. HCL `moved { from = aws_s3_bucket.archive to = aws_s3_bucket.invoices }` address badalta hai; 0 add/change/destroy, physical bucket ID wahi. Native `.tf.json` literal config wahi resources dikhata hai; validate + normal plan exit 0 se barabar hona prove hota hai. SG ingress ke JSON attributes ka poora object set chahiye, isliye HCL nested block ke defaults jaise fields saaf likhe hain.
6. Native JSON config mein app bucket ka physical name badla + pehli baar force_destroy=true aur guard hataya. Asli saved replacement apply `BucketNotEmpty` deta hai, asli TEST order bacha rehta hai. Provider pichhli safal apply wali state ka flag use karta hai, isliye usi replacement mein naya flag kaafi nahi. Config wapas restore hota hai.
7. Jab tak bucket config mein lifecycle.prevent_destroy hai, `terraform plan -destroy` reject hota hai. Guard ya config hata kar bypass ho sakta hai; AWS delete protection/backups/IAM alag layers hain.
8. Runner apna `.tflock` object `IfNoneMatch=*` se pakad kar rakhta hai. Doosra asli Terraform plan `-lock-timeout=0s` ke saath reject hota hai. Sirf run ka apna jaana-pehchana lock chhoda jaata hai; chalta hua shared lock force-unlock nahi hota.
9. Aakhri poora normal plan exit 0. Runner soch kar phenkne layak TEST objects hataata hai, guards hataata hai, aur asli destroy 3 objects ka hota hai. State resources khaali; VPC/backend versions/delete markers/lock + buckets hat jaate hain; listener band hota hai.

## Captured actual output — 2026-10-28

Chuni hui asli lines; BucketNotEmpty diagnostic mein lambe resource/request IDs ko `...` se chhota kiya gaya hai.

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

Poora recorded replay `.overhaul-evidence/IAC-LAB26-REPLAY.txt`. Bani IDs/serials har run mein alag hote hain; behaviour aur ek hi run ke andar bachi IDs compare karo.

## Evidence boundaries

Asli Terraform parser/provider/backend aur Moto resource APIs chale. Containers, SQL, SG packet filtering, asli IAM deny enforcement, production S3 durability/HA/performance ya concurrent-writer load test nahi hua. Lock test mein ek saaf pakda hua native S3 conditional object, doosre asli Terraform operation ke saamne; yeh benchmark nahi. Data migration nahi: moved ne asli object rakha. Lesson ke CloudFormation/CDK/SAM ko official docs se check kiya gaya, is lab mein chalaya nahi. Runner ka fail-safe aakhir mein sirf apne resources saaf karta hai; fail hua cleanup saaf dikhaya jaata hai, pass nahi bola jaata.

[Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), [normal plan](https://developer.hashicorp.com/terraform/cli/commands/plan), [refactoring](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring), [native JSON](https://developer.hashicorp.com/terraform/language/syntax/json), [provider force_destroy lifecycle](https://registry.terraform.io/providers/hashicorp/aws/6.70.0/docs/resources/s3_bucket).
