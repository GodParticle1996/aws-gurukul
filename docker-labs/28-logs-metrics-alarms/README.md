# Lab28 — logs, metric filters, Logs Insights aur alarms (asli Moto par)

**Pain:** ShopKaro ka checkout kabhi-kabhi 8 second leta hai, par average 0.4 second dikhta hai aur koi alarm nahi bajta. Logs "never expire" par hain aur bill badh raha hai. Yeh lab asli AWS CLI se retention, metric filter, Logs Insights aur alarms chalati hai, aur saaf dikhati hai ki local emulator kya karta hai aur kya nahi.

**Scope:** sirf local Moto 5.2.4. Asli AWS, Docker, shared 4566 server ya `~/.aws` nahi. Sirf TEST data. Jo cheez Moto nahi karta (filter se metric banana, p99, alarm evaluation), woh **HOST CHECK** mein Python se jaanchi jaati hai. Har emulator ki kami **GAP** line mein likhi jaati hai.

## Chalao — app ke root folder se

Pehle se bane `docker-labs/.venv` mein Moto 5.2.4, boto3 aur AWS CLI chahiye. Runner khud kuch install nahi karta.

```bash
./docker-labs/.venv/bin/python -I docker-labs/28-logs-metrics-alarms/lab.py
```

Runner apna naya `127.0.0.1` Moto server OS ke diye port par chalata hai, dummy `test` keys aur lab ki apni credential/config files use karta hai, aur `AWS_MAX_ATTEMPTS=1` rakhta hai taaki emulator ka 500 error baar-baar retry na ho. Har resource ka naam `lab28-<number>` se shuru hota hai. Inputs aur config `.overhaul-evidence/lab28-runs/run-<number>/` mein bante hain. Print hue commands sirf runner ke apne endpoint ke liye hain; inhe normal asli-AWS shell mein mat chalana.

## ex1 — retention: default never expire

Teen log groups bante hain: checkout, payment aur audit (audit par pehle se 365 din). Asli output (2026-11-20, naam chhota kiya):

```text
RETENTION BEFORE {".../audit": 365, ".../checkout": null, ".../payment": null}
PASS 1 app log groups default mein never expire (retentionInDays nahi)
$ aws logs put-retention-policy --log-group-name /lab28-.../checkout --retention-in-days 30
$ aws logs put-retention-policy --log-group-name /lab28-.../payment --retention-in-days 30
PASS 2 app logs 30 din, audit 365 din waisa hi
$ aws logs put-retention-policy --log-group-name /lab28-.../payment --retention-in-days 31
GAP Moto ne retention 31 maan li (exit 0 , ab 31 ); asli AWS 31 ko InvalidParameterException se rokta hai
```

👉 Asli AWS mein retention sirf tay values (1, 3, 5, 7, 14, 30, 60, 90 ... 3653 din) mein set hoti hai. Moto 31 bhi maan leta hai, isliye runner turant 30 wapas lagata hai. App ka simulator asli niyam laagu karta hai. Audit ki 365 din retention ko chhoota nahi gaya.

## ex2 — metric filter: sirf aage ke events, aur sahi pattern

Do events filter se **pehle** bheje jaate hain (ek ERROR, ek INFO jiske message mein "no ERROR seen" likha hai). Phir JSON pattern `{ $.level = "ERROR" }` aur `defaultValue 0` ke saath filter banta hai, aur do naye ERROR events aate hain.

```text
PASS 3 metric filter aur defaultValue 0 save hue
GAP metric filter ke baad list-metrics: [] -- Moto filter se metric nahi banata
HOST CHECK filter ke BAAD aaye ERROR-level events: 2 (pehle ke events gine nahi jaate; asli CloudWatch bhi backfill nahi karta)
TERM PATTERN "ERROR" matches 4 (INFO line "no ERROR seen" bhi gini gayi)
GAP JSON pattern { $.level = "ERROR" } par Moto ne 4 events lautaye -- pattern ignore hua; asli AWS sirf 3 ERROR-level deta
PASS 5 term pattern zyada ginta hai; Moto JSON pattern ignore karta hai (dono pakde)
```

👉 Asli CloudWatch mein metric filter sirf banne ke **baad** aaye events ginta hai; purane logs ke liye Logs Insights chalao. Term pattern `ERROR` har us line ko gin leta hai jisme yeh shabd ho, chahe level INFO ho. JSON pattern sirf `level` field dekhta hai. Moto filter save karta hai, par na metric banata hai, na `filter-log-events` mein JSON pattern laagu karta hai.

## ex3 — Logs Insights: query chalti hai, stats nahi

Payment log group mein 9 events hain (6 TIMEOUT, sab `upi-alpha` par). Query: `filter status = "TIMEOUT" | stats count(*) as timeouts by gateway`.

```text
$ aws logs start-query --log-group-name /lab28-.../payment --start-time ... --end-time ... --query-string filter status = "TIMEOUT" | stats count(*) as timeouts by gateway
{ "queryId": "558a7e00-e0ff-1b73-a9b7-4749bccfe910" }
$ aws logs get-query-results --query-id 558a7e00-e0ff-1b73-a9b7-4749bccfe910
"results": [ [ { "field": "@ptr", "value": "12" } ], ... 9 rows ... ], "status": "Complete"
GAP Insights ne 9 rows diye, fields ['@ptr'] -- stats count(*) by gateway nahi gina
HOST CHECK timeouts by gateway: {"upi-alpha": 6}
```

👉 Moto ne na filter laagu kiya (9 rows, 6 nahi), na `stats` gina. Asli Logs Insights `upi-alpha: 6` jaisi ek row deta, aur scan hue GB ka bill lagta (lagbhag $0.005/GB). App ka simulator chhota sa subset (`fields`, `filter`, `stats`, `sort`, `limit`) sach mein chalata hai.

## ex4 — average vs p99, aur alarms

10 minute ka latency data bhejte hain: har minute 100 samples. 3 minutes mein 2 samples 8 second ke hain (2%), baaki sab 0.4 second.

```text
HOST CHECK average 0.446 s; har minute ka p99 [0.4, 0.4, 0.4, 0.4, 0.4, 8.0, 0.4, 8.0, 8.0, 0.4] ; aakhri 5 mein breach 3 -> ALARM
GAP Moto ne p99 ki value nahi di (datapoints: 10 )
MOTO Average [0.446]
PASS 8 Moto Average host jaisa; p99 value Moto nahi deta (gap pakda)
MOTO p99 alarm state OK | ExtendedStatistic p99 | DatapointsToAlarm 3
GAP Moto alarm evaluate nahi karta: host reference ALARM kehta hai, Moto OK dikhata hai
MANUAL STATE ALARM | TEST notification route only -- yeh notification ka test hai, health ka saboot nahi
GAP put-composite-alarm exit 255 -- Moto 5.2.4 mein yeh API bana hi nahi (500)
GAP describe-alarm-history exit 255 -- Moto mein nahi
BEHAVIOR CHECKS 11
```

👉 Average 0.446 second hai, jabki 3 minutes ka p99 8 second. Average tail chhupata hai. Moto Average sahi nikaalta hai, par p99 ki value nahi deta aur alarm ko evaluate nahi karta (alarm OK hi rehta hai). `set-alarm-state` se state badalna sirf notification route ka test hai. Composite alarm aur alarm history Moto 5.2.4 mein bane hi nahi; app ka simulator composite rule (`ALARM("a") OR ALARM("b")`) sach mein jaanchta hai.

## Cleanup — sirf apne resources

```text
CLEANUP READBACK {"alarms": [], "logGroups": []}
PASS 12 apne alarms aur log groups saaf
OWNED MOTO STOPPED / LISTENER CLOSED
```

`finally` block sirf apne alarms aur log groups delete karta hai, phir apna server band karta hai aur check karta hai ki listener band hua. Shared reset ya anjaana delete nahi.

## Emulator ki limits (imaandar list)

- Retention ki galat value (31) maan leta hai.
- Metric filter save karta hai, par usse metric nahi banata.
- `filter-log-events` mein JSON pattern ignore karta hai; term pattern chalta hai.
- Logs Insights mein filter aur `stats` nahi chalte; sirf rows lautata hai.
- `get-metric-statistics` mein p99 ki value nahi deta; Average deta hai.
- Alarms evaluate nahi karta; `put-composite-alarm` aur `describe-alarm-history` 500 dete hain.
- Koi asli SNS delivery, Synthetics, X-Ray/OpenTelemetry, CloudTrail data events ya billing nahi.

Asli AWS par yeh sab optional, alag manzoori wala aur bill hone wala kaam hai. Level ka homework steps aur cleanup batata hai.

Sources: [metric filters](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html), [filter pattern syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html), [retention values](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html), [Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html), [percentile alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html), [composite alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Create_Composite_Alarm.html), [missing data](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-missing-data).
