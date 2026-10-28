# Lab25 — ECR, dono ECS roles aur Fargate service ka start contract

**Dard:** ShopKaro ka pehla container deploy `CannotPullContainerError` par ruka, aur doosra deploy healthy dikha par
app S3 par `AccessDenied` deta raha. Lab ek asli ECR repository (immutable tags, scan rule, lifecycle), execution role
aur task role, Fargate task definitions aur ek circuit-breaker service banata hai, phir dikhata hai ki Moto kahan asli
AWS se alag behave karta hai — aur asli start rules ek documented evaluator se lagata hai.

Course fixture: Mumbai (ap-south-1), repository `lab25-<timestamp>/orders`, VPC 10.40.0.0/16 ke do private subnets
(1a, 1b), NAT ke bina — ecr.api, ecr.dkr, logs interface endpoints aur S3 gateway endpoint.

## Run

`docker-labs/.venv` pehle se chahiye (`./docker-labs/start-moto.sh` ek baar chala ho). `aws-gurukul` folder se,
pehle `lab.py` padho, phir chalao:

```bash
./docker-labs/.venv/bin/python -I docker-labs/25-ecs-fargate-service/lab.py
```

`lab.py` apna **khud ka** Moto 5.2.4 server 127.0.0.1 ke random port par chalata hai, dummy keys aur lab-local
config use karta hai, har client ko explicit endpoint deta hai. Koi real AWS call, Docker, shared 4566 reset ya
`~/.aws` write nahi hota. Objects ek unique `lab25-...` naam ke saath bante hain aur aakhir mein saaf hote hain.

## ex1 — ECR: release tags immutable, `latest` excluded, scan rule

Repository pehle `IMMUTABLE` banti hai, untagged builds push hote hain, phir mode `IMMUTABLE_WITH_EXCLUSION` (filter
`latest`) hota hai aur release tags push hote hain. Phir v2.4.0 tag par doosri image push karne ki koshish, aur
`latest` ko nayi image par le jaana. Registry-level BASIC scan-on-push rule `lab25-…/*` par.

Asli output (2026-10-28):

```text
GAP untagged push with exclusion filters HTTP 500
PASS 1 Moto gap: an untagged push into a repository with exclusion filters returns HTTP 500 (real ECR accepts untagged pushes)
IMMUTABLE {"mode": "IMMUTABLE_WITH_EXCLUSION", "exclusions": [{"filterType": "WILDCARD", "filter": "latest"}], "repush v2.4.0": "ImageAlreadyExistsException", "latest moved": true}
PASS 2 release tag re-push rejected (Moto code ImageAlreadyExistsException; real ECR: ImageTagAlreadyExistsException); excluded latest still moves
PASS 3 registry-level BASIC scan-on-push rule stored (no CVE scan runs in Moto)
```

👉 Asli ECR ek release tag par doosri image ko `ImageTagAlreadyExistsException` se rokta hai; Moto wahi rok lagata hai
par error code `ImageAlreadyExistsException` deta hai. Moto 5.2.4 exclusion filters ke saath untagged push par crash
karta hai (500) — isliye lab untagged builds pehle push karta hai. Scan rule store hota hai, par Moto koi CVE scan
nahi chalata.

## ex2 — lifecycle policy: preview kahan hai?

Safe policy (untagged > 7 din expire; `v*` tags mein sabse naye 10 rakho) lagti hai aur wapas padhi jaati hai. Phir
`start-lifecycle-policy-preview` aur ek galat policy (`any` rule pehli priority par).

```text
PASS 4 safe lifecycle policy stored and read back
GAP lifecycle {"start_lifecycle_policy_preview": "HTTP 500", "any rule before untagged rule": "accepted"}
PASS 5 Moto gap: no lifecycle preview, and an any-rule that is not last is accepted (real ECR rejects it)
LIFECYCLE EVALUATOR {"keep-3 expires": ["u-pr1412", "v2.4.0", "v2.3.0", "u-sep23", "u-sep02"], "safe expires": ["u-sep23", "u-sep02"]}
PASS 6 documented evaluator: keep-3 would expire the release and rollback images; safe expires only old untagged builds
```

👉 Moto sab images ko "abhi" push hua maanta hai aur preview nahi deta, isliye lab har digest ko ek declared push
date deta hai aur ECR ke documented rules lagata hai: rules saath mein select karte hain, chhoti `rulePriority` jeetti
hai, higher-priority rule ki image neeche wala rule expire nahi kar sakta. "Sirf 3 sabse nayi rakho" teen PR builds ke
baad v2.4.0 (release) aur v2.3.0 (rollback) dono uda deta — app mission ka trap yahi hai.

## ex3 — IAM: execution role vs task role

Dono roles ka trust `ecs-tasks.amazonaws.com`. Execution role ko ECR pull + logs, task role ko sirf
`s3:PutObject` on `shopkaro-invoices/*`.

```text
IAM {"AWS managed AmazonECSTaskExecutionRolePolicy": "NoSuchEntity", "exec policy": "customer-managed copy of the ECR pull + logs actions", "task policy": "s3:PutObject on shopkaro-invoices/*"}
PASS 7 Moto gap: AWS managed policies are not loaded by default, so the lab attaches a customer-managed copy of the documented actions
```

👉 Asli account mein `AmazonECSTaskExecutionRolePolicy` attach karo. Moto default mein AWS managed policies load
nahi karta, isliye lab wahi documented actions (ecr:GetAuthorizationToken, BatchCheckLayerAvailability,
GetDownloadUrlForLayer, BatchGetImage, logs:CreateLogStream, PutLogEvents) ek customer-managed policy mein deta hai.

## ex4 — network: NAT ke bina private pull path

```text
NETWORK [["ecr.api", "Interface", "private DNS True"], ["ecr.dkr", "Interface", "private DNS True"], ["logs", "Interface", "private DNS True"], ["s3", "Gateway", "route table True"]]
PASS 8 ecr.api + ecr.dkr + logs interface endpoints (private DNS) and S3 gateway endpoint on the private route table
```

👉 Fargate platform 1.4.0+ ko dono ECR endpoints chahiye; image layers S3 (`prod-ap-south-1-starport-layer-bucket`)
mein hain, isliye S3 gateway endpoint subnet ki route table par; awslogs ke liye logs endpoint. Moto sirf metadata
rakhta hai — koi DNS ya traffic nahi.

## ex5 — ECS: jo Moto accept kar leta hai, asli ECS nahi

```text
GAP ecs {"256 CPU + 8 GB registered": true, "bridge silently became": "awsvpc", "awslogs without execution role registered": true, "instance target group accepted": "ACTIVE", "launch type + strategy accepted": "ACTIVE"}
PASS 9 Moto gaps: invalid Fargate size, bridge mode, awslogs without execution role, instance target group and launch type + strategy are all accepted (real ECS rejects each)
SERVICE {"deploymentConfiguration": null, "running": 0, "pending": 2, "deployments": [["lab25-1793209445471873896:1", "IN_PROGRESS"]], "service.taskDefinition after update": "arn:aws:ecs:ap-south-1:123456789012:task-definition/lab25-1793209445471873896:2", "tasks listed": 0, "services-stable waiter": "Max attempts exceeded"}
PASS 10 Moto gaps: circuit-breaker config not returned, no task ever runs, update-service makes no new deployment, the waiter never succeeds
```

👉 Asli ECS: 256 CPU ke saath sirf 512 MB–2 GB valid; Fargate sirf `awsvpc`; awslogs ke liye execution role zaroori;
awsvpc ke saath target type `ip`; launch type aur capacity provider strategy saath mein nahi. Moto in sabko chup-chaap
maan leta hai, koi task nahi chalata, aur update ke baad naya deployment nahi banata — isliye "Moto mein chal gaya"
ka matlab "AWS mein chalega" nahi. App ka simulator in paanchon galtiyon ko asli ECS jaise reject karta hai.

## ex6 — documented start contract, asli Moto metadata par

Lab Moto se task definitions, role trust aur policies, route tables aur endpoints padhta hai, phir course ke rules
lagata hai: role assume ho sake → ECR tak raasta → execution role ki ECR permission → image maujood → S3 layer path →
logs → task role ki S3 permission. Phir ecr.dkr endpoint asli API se delete karke dobara jaanchta hai.

```text
CONTRACT {"orders:1 exec=pull+logs task=S3": "START + S3 OK", "orders:2 roles swapped": "CannotPull: AccessDenied ecr:GetAuthorizationToken (task)", "orders:3 task role = execution role": "START, app AccessDenied s3:PutObject (exec)", "orders:1 after ecr.dkr endpoint deleted": "CannotPull: connection issue to ECR (timeout)"}
PASS 11 documented evaluator over real Moto metadata: right roles start and upload; swapped roles cannot pull; one shared role starts but S3 is denied; missing ecr.dkr times out
```

👉 Yahi do hook failures hain: roles ulte → start se pehle `CannotPullContainerError` (execution role); ek hi role
dono jagah → task healthy par app ko `AccessDenied` (task role). Endpoint hata do toh error AccessDenied nahi,
connection timeout hota hai — network variant.

## Cleanup aur emulator limits

```text
BEHAVIOR CHECKS 11
PASS 12 own ECR repo/scan rule, ECS cluster/services/task definitions, IAM roles/policies, target groups, endpoints and VPC cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

**Emulator limits (Moto 5.2.4, is run mein dekhe):** exclusion filters ke saath untagged push par 500; immutable tag
error code alag; lifecycle preview 500; `any` rule ki ordering validate nahi; AWS managed policies default mein nahi;
Fargate size, network mode, awslogs execution role, target type aur launch type + strategy validate nahi;
circuit-breaker config wapas nahi aata; koi task nahi chalta; update-service naya deployment nahi banata; waiter
kabhi stable nahi.

## Docker section — Docker install hone ke baad (abhi verified nahi)

Is machine par Docker abhi install nahi hai, isliye neeche ke commands **chalaye nahi gaye** aur unka output yahan
nahi hai. Docker aane par yahi lab poora karo:

```bash
mkdir -p /tmp/orders-demo && cd /tmp/orders-demo
printf 'FROM public.ecr.aws/docker/library/python:3.12-slim\nWORKDIR /app\nCOPY app.py .\nUSER 1000\nEXPOSE 8080\nCMD ["python", "app.py"]\n' > Dockerfile
printf 'from http.server import BaseHTTPRequestHandler, HTTPServer\nclass H(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")\nHTTPServer(("", 8080), H).serve_forever()\n' > app.py
docker build -t orders:v2.4.0 .
docker run --rm -d -p 8080:8080 --name orders orders:v2.4.0 && curl -s localhost:8080/health && docker stop orders
docker buildx build --platform linux/amd64,linux/arm64 -t orders:v2.4.0-multi .   # multi-arch: ARM64 Fargate ke liye
```

Dekhna: image ka size (`docker image ls`), container port 8080 par jawab, aur multi-arch build dono platforms ke liye
manifest list banata hai ya nahi. Asli ECR push (`aws ecr get-login-password | docker login …`) alag approval ke baad.

**Abhi bhi unproven:** asli image pull aur layer download, container start, ALB health checks, Fargate scheduling,
Spot interruption, circuit-breaker timing, scan findings aur lifecycle expiry ka 24-ghante wala asli kaam. Real-AWS
practice ke liye approval aur cost review chahiye — Fargate tasks per second bill hote hain, interface endpoints per
hour per AZ.
