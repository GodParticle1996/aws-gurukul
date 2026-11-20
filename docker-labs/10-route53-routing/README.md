# Lab10 — Route53 records: Alias, weighted aur failover health association

**Pain:** public domain par apex CNAME reject hota hai; canary percentage ko exact shoppers samajhna aur bina jude health check apne aap DR tod dete hain. Asli AWS CLI se JSON metadata edit karo, phir primary ka missing health link theek karo.

**Limit:** sirf local Moto metadata. Asli domain registration, public delegation, recursive DNS, HTTP probes, ALB traffic, DB replication ya timed failover nahi. Documentation IPs 203.0.113.x dummy targets hain. Aaj ka Moto `test-dns-answer` par 404 deta hai; pehle se bana health status HTTP 200 network test nahi. App ka dry run selection/cache behaviour samjhata hai.

## Setup — alag dummy credentials

Local emulator pehle se available ho toh start command skip karo. Docker install/run nahi chahiye.

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

Scripts ko `http://127.0.0.1:4566` aur dummy `test` keys chahiye. `~/.aws` mein kuch nahi likha jaata. Shared Moto reset mat karo. `.lab/resources.sh` pehle se ho toh pichhle lab ka cleanup pehle karo. Scripts padh kar chalao; setup beech mein fail ho tab bhi resource IDs save karta hai.

## ex1 — scoped ALB/zone create karo; authority metadata dekho

```bash
bash setup.sh
source .lab/resources.sh
```

Asli output, 2026-10-26 UTC ko pakda:

```text
[
    "NS",
    "SOA"
]
ALB canonical zone: Z2P70J7EXAMPLE (read returned metadata; do not hard-code Moto IDs on AWS)
```

👉 Public zone ke default NS/SOA mein authority ka metadata hota hai. `.test` naam internet delegation nahi banata. Script describe-load-balancers se mile ALB DNSName aur CanonicalHostedZoneId use karti hai; aaj ka Moto placeholder `Z2P70J7EXAMPLE` AWS Mumbai ka asli canonical zone ID nahi. Is metadata exercise mein ALB par koi app/listener nahi.

## ex2 — JSON dekho, health check aur teen routing groups banao

```bash
bash exercises.sh
source .lab/resources.sh
cat .lab/primary-health.json
cat .lab/routing.json
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE"
```

`make-records.py` aam files likhta hai; AWS CLI `file://.lab/routing.json` padhta hai. Alias mein TTL/ResourceRecords nahi hote. Weighted jodi ka har SetIdentifier unique hai aur TTL barabar 60 second. Primary failover record bane health check se juda hai. Script UPSERT use karti hai; exercises dobara chalane par save hua health check dobara use hota hai.

`exercises.sh` ke asli output ke hisse (bani IDs badalti hain):

```json
"INSYNC"
[
    {"Id":"v1","Weight":90,"Failover":null,"TTL":60,"Check":null},
    {"Id":"v2","Weight":10,"Failover":null,"TTL":60,"Check":null},
    {"Id":"primary","Weight":null,"Failover":"PRIMARY","TTL":60,"Check":"a4b86561-0b2e-412e-a1a7-b1843f5571d4"},
    {"Id":"maintenance","Weight":null,"Failover":"SECONDARY","TTL":60,"Check":null}
]
```

👉 Weighted 90/10 authoritative answers ka hissa tay karta hai, exact users/HTTP requests nahi. Moto weights save karta hai; Moto canary nahi naapta. Waiter/get-change authoritative metadata ka sync batata hai. Asli recursive caches alag hain.

## ex3 — primary ka signal hatao, dekho, theek karo

```bash
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch file://.lab/missing-health.json
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query 'ResourceRecordSets[?SetIdentifier==`primary`].{Failover:Failover,Check:HealthCheckId}'
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch file://.lab/repair.json
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query 'ResourceRecordSets[?SetIdentifier==`primary`].{Failover:Failover,Check:HealthCheckId}'
```

Asli output, query pehle/baad mein:

```json
[{"Failover":"PRIMARY","Check":null}]
[{"Failover":"PRIMARY","Check":"a4b86561-0b2e-412e-a1a7-b1843f5571d4"}]
```

Aaj ke Moto mein dono change calls ne turant `ChangeInfo.Status="INSYNC"` diya.

👉 Bina HealthCheckId ka aam primary record Route53 healthy maanta hai. Sirf check bana dene se woh record se nahi judta. HealthCheckId wapas lagane se config theek hota hai; asli DNS/probe recovery yahan test nahi hui. Alias EvaluateTargetHealth target ki health lene ka alag mechanism hai.

## ex4 — emulator ki capabilities jaancho, bina badha-chadha kar bole

```bash
aws route53 get-health-check-status --health-check-id "$HEALTH"
aws route53 test-dns-answer --hosted-zone-id "$ZONE" --record-name status.shopkaro-lab10.test --record-type A
```

Dummy endpoint ke liye aaj ke Moto ka asli result:

```json
{"HealthCheckObservations":[{"Region":"us-east-1","IPAddress":"127.0.13.37","StatusReport":{"Status":"Success: HTTP Status Code: 200. Resolved IP: 127.0.13.37. OK","CheckedTime":"2026-10-26T01:12:03.773672Z"}}]}
```

```text
An error occurred (404) when calling the TestDNSAnswer operation: Not Found
```

👉 Pehle se bana 200 203.0.113.10 ki readiness ka saboot nahi. 404 is emulator ki capability ki limit hai; `test-dns-answer` sahi AWS operation hai. Asli AWS credentials ke saath retry mat karo. Expected 404 ke baad bhi cleanup alag command ki tarah chalao. Yahan koi command asli TTL expiry ya internet delegation test nahi karta.

## ex5 — sirf lab ke apne resources delete karo, chaar khaali lists check karo

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

👉 Cleanup aaj ke exact lab records ko DELETE JSON mein padhta hai, zone delete hone tak NS/SOA rakhta hai, save hua health check, ALB, do subnets aur VPC hataata hai. Aakhri chaar lists check karti hain ki save hui zone/check/ALB/VPC IDs nahi bachi. Doosre lab ki zone/health checks ko chhoota nahi. IDs `.lab/last-cleaned-resources.sh` mein archive hoti hain; shared emulator reset kabhi nahi chahiye.

## AWS vs emulator limits

- Aaj ka Moto turant INSYNC deta hai aur ek hi static change ID dobara use karta hai; app ka simulator jaan-boojh kar PENDING→waiter→INSYNC ko tay, alag IDs ke saath dikhata hai. Dono mein se koi asli propagation time nahi naapta.
- Aaj ke Moto ke SOA output mein dictionary jaisa dikhne wala Value hai; emulator ki SOA value AWS mein copy mat karo. Setup ke NS/SOA jaise mile waise hi rakhe gaye.
- Aaj ke Moto ka health response pehle se bana hai. App saaf healthy/unhealthy fixtures use karta hai; koi asli checker nahi chalta.
- Apex CNAME/type errors aur atomic record validation app ke engine mein test hote hain; emulator ka metadata maan lena saari AWS shartein ka certificate nahi.
- Asli failover ke liye public health reachability ya supported alarm/inherited health, cutover se pehle kam TTL, test kiya standby app/data aur asli client observations chahiye. Asli AWS ka kaam optional, alag manzoori wala aur bill hone wala hai.
