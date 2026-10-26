# Lab10 — Route53 records: Alias, weighted aur failover health association

**Pain:** public domain ka apex CNAME reject hota hai; canary percentage ko exact shoppers samajhna aur unlinked health check automatic DR break karte hain. Real AWS CLI se JSON metadata edit karo, phir missing primary health association repair karo.

**Boundary:** local Moto metadata only. No real domain registration, public delegation, recursive DNS, HTTP probes, ALB traffic, DB replication or timed failover. Documentation IPs203.0.113.x are dummy targets. Current Moto `test-dns-answer` returns404; canned health status HTTP200 is not a network test. In-app dry run explains selection/cache behavior.

## Setup — isolated dummy credentials

Existing local emulator available ho toh start command skip karo. Docker install/run required nahi.

```bash
cd aws-gurukul/docker-labs
./start-moto.sh
source env.sh
cd 10-route53-routing
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
```

Scripts require `http://127.0.0.1:4566` and dummy `test` keys. No `~/.aws` writes. Shared Moto reset mat karo. Existing `.lab/resources.sh` ho toh previous lab cleanup pehle karo. Scripts read karke run karo; setup resource IDs partial failure par bhi save karta hai.

## ex1 — scoped ALB/zone create karo; authority metadata dekho

```bash
bash setup.sh
source .lab/resources.sh
```

Asli output, captured2026-10-26UTC:

```text
[
    "NS",
    "SOA"
]
ALB canonical zone: Z2P70J7EXAMPLE (read returned metadata; do not hard-code Moto IDs on AWS)
```

👉 Public zone default NS/SOA has authority metadata. `.test` name does not create internet delegation. Script uses ALB DNSName and CanonicalHostedZoneId returned by describe-load-balancers; current Moto placeholder `Z2P70J7EXAMPLE` is not AWS Mumbai canonical zone ID. ALB contains no app/listener in this metadata exercise.

## ex2 — inspect JSON, create health check and three routing groups

```bash
bash exercises.sh
source .lab/resources.sh
cat .lab/primary-health.json
cat .lab/routing.json
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE"
```

`make-records.py` writes ordinary files; AWS CLI reads `file://.lab/routing.json`. Alias omits TTL/ResourceRecords. Weighted pair has unique SetIdentifier and equal TTL60seconds. Primary failover record links created health check. Script uses UPSERT; repeated exercises reuse the saved health check.

Asli output excerpts from `exercises.sh` (generated IDs vary):

```json
"INSYNC"
[
    {"Id":"v1","Weight":90,"Failover":null,"TTL":60,"Check":null},
    {"Id":"v2","Weight":10,"Failover":null,"TTL":60,"Check":null},
    {"Id":"primary","Weight":null,"Failover":"PRIMARY","TTL":60,"Check":"a4b86561-0b2e-412e-a1a7-b1843f5571d4"},
    {"Id":"maintenance","Weight":null,"Failover":"SECONDARY","TTL":60,"Check":null}
]
```

👉 Weighted90/10 controls authoritative answer proportions, not exact users/HTTP requests. Moto stores weights; Moto does not measure a canary. Waiter/get-change reports authoritative metadata synchronization. Real recursive caches are separate.

## ex3 — remove primary signal, inspect, repair

```bash
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch file://.lab/missing-health.json
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query 'ResourceRecordSets[?SetIdentifier==`primary`].{Failover:Failover,Check:HealthCheckId}'
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch file://.lab/repair.json
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query 'ResourceRecordSets[?SetIdentifier==`primary`].{Failover:Failover,Check:HealthCheckId}'
```

Asli output query before/after:

```json
[{"Failover":"PRIMARY","Check":null}]
[{"Failover":"PRIMARY","Check":"a4b86561-0b2e-412e-a1a7-b1843f5571d4"}]
```

Both change calls returned `ChangeInfo.Status="INSYNC"` immediately in current Moto.

👉 Ordinary primary record without HealthCheckId is treated healthy by Route53. Merely creating a check does not associate the check. Restoring HealthCheckId repairs configuration; actual DNS/probe recovery remains untested here. Alias EvaluateTargetHealth is a separate inherited-health mechanism.

## ex4 — probe emulator capabilities without overclaiming

```bash
aws route53 get-health-check-status --health-check-id "$HEALTH"
aws route53 test-dns-answer --hosted-zone-id "$ZONE" --record-name status.shopkaro-lab10.test --record-type A
```

Asli current Moto result for dummy endpoint:

```json
{"HealthCheckObservations":[{"Region":"us-east-1","IPAddress":"127.0.13.37","StatusReport":{"Status":"Success: HTTP Status Code: 200. Resolved IP: 127.0.13.37. OK","CheckedTime":"2026-10-26T01:12:03.773672Z"}}]}
```

```text
An error occurred (404) when calling the TestDNSAnswer operation: Not Found
```

👉 Canned200 is not203.0.113.10 readiness proof.404 is this emulator capability limit; `test-dns-answer` is a valid AWS operation. Do not retry against real AWS credentials. Run cleanup as a separate command even after the expected404. No command here tests real TTL expiration or internet delegation.

## ex5 — delete only lab-owned resources, verify four empty lists

```bash
bash cleanup.sh
```

Asli output excerpts:

```text
Deleting lab non-default records: 5
... ChangeInfo Status: INSYNC ...
[]
[]
[]
[]
```

👉 Cleanup reads exact current lab records into DELETE JSON, preserves NS/SOA until zone deletion, removes saved health check, ALB, two subnets and VPC. Four final lists check saved zone/check/ALB/VPC IDs absent. Another lab's zone/health checks remain untouched. IDs archive in `.lab/last-cleaned-resources.sh`; shared emulator reset never needed.

## AWS vs emulator limits

- Current Moto returns INSYNC immediately and reuses a static change ID; app simulator deliberately models PENDING→waiter→INSYNC with deterministic distinct IDs. Neither measures real propagation time.
- Current Moto SOA output contains a serialized dictionary-looking Value; do not copy the emulator SOA value into AWS. Setup NS/SOA are retained as returned.
- Current Moto health response is canned. App uses explicit healthy/unhealthy fixtures; no real checker runs.
- Apex CNAME/type errors and atomic record validation are tested in the in-app engine; emulator metadata acceptance does not certify all AWS constraints.
- Real failover needs public health reachability or supported alarm/inherited health, lower TTL ahead of cutover, tested standby app/data readiness and actual client observations. Real AWS work is optional, separately approved and billable.
