# Lab27 — owned cost cleanup, value preserve karke

ShopKaro fictional inventory. Available volume disposable automatically nahi hai: original import recovery point preserve karo. Same production volume ID/size/encryption aur configured performance retain karo.

## Run — app root se

Existing Python venv mein Moto5.2.4, boto3 aur AWS CLI required. No Docker or real AWS needed. Runner installed tools use karta hai; tools install nahi karta.

```bash
./docker-labs/.venv/bin/python -I docker-labs/27-cost-waste-hunter/lab.py
```

Runner apna ephemeral loopback Moto server, dummy keys, explicit per-call endpoint aur lab-local credential/config files use karta hai. Shared emulator/reset aur ~/.aws untouched. `.overhaul-evidence/lab27-runs/run-<unique>/` mein JSON inputs milenge; printed AWS commands runner ke owned endpoint/environment ke saath replay hue hain. Commands ko default real-AWS shell mein mat chalana.

## Har operation ka meaning

1. SDK own encrypted1000GiB gp2 volume, approved detached200GiB import volume, expired fixture snapshot, idleEIP aur TESTlog seed karta hai. Lab volumes unattached metadata fixtures hain; browser ka protected two-AZ runtime environment actual lab mein boot nahi hota.
2. Actual `aws ec2 create-snapshot --volume-id <owned-import>` aur `aws ec2 wait snapshot-completed --snapshot-ids <returned-ID>`. API completed metadata ke baad approved sourcevolume delete. **Moto block data copy/restore integrity prove nahi karta.**
3. `aws ec2 modify-volume --volume-id <owned-prod> --volume-type gp3 --iops 3000 --throughput 250`. Actual describe readback originalID,1000GiB,encryption,3000IOPS,250MiB/s verify. Explicitperformance avoids different documented default paths. Actual AWS modification timing, filesystem and workload I/O separately monitor/test karo; Moto modification status may remain modifying.
4. IdleEIP release; approved oldsnapshot delete, fresh recovery-point metadata retained. Last-good production backup ko browser mission protects; actual lab has only own disposable fixtures.
5. Devlog14day retention set, current TESTlog readback unchanged. Expiry/deletion timing/archival billing simulated nahi.
6. Scoped SNS topic policy + monthly1000USD COST Budget + ACTUAL80% notice created. Standalone FORECASTED90% notice CLI bhi create; describe-notifications list2entries. SNS policy readback exact scoped SourceAccount/SourceArn permission verify. **Subscriber input accepted; subscriber readback Moto unimplemented500. Automatic notifications, receiver delivery or spend cap prove nahi.**
7. CE get-cost-and-usage returns empty ResultsByTime; localresourcebill meter nahi. prices.json approximate source-checked N.Virginia rates se EBS + listed IPv4 future monthly inventory estimate banta hai, actual invoice saving nahi.730h/₹88perUSD model assumptions. Snapshots billed incremental changed blocks se; VolumeSize ko billedbytes mat samjho. Logs/compute/network/taxes/credits/commitments excluded.
8. Finally only owned volume/snapshot/IP/log/topic/budget IDs delete. Moto default/vendor AMI snapshots initialIDbaseline se compare; vendor fixtures delete nahi. Listener closes. Failed cleanup raises error.

## Actual captured replay — 2026-10-28

```text
PASS 1 preservation snapshot completed before deleting approved detached volume
PASS 2 approved detached volume deleted; preserved snapshot remains
PASS 3 gp2 to gp3 preserves original volume ID, size and encryption metadata
PASS 4 unassociated IPv4 released
PASS 5 expired approved fixture removed; fresh preservation snapshot retained
PASS 6 14-day retention metadata stored, current TEST log retained
PASS 7 monthly cost Budget and 80 percent notification metadata stored; subscriber input accepted
GAP Moto DescribeSubscribersForNotification is unimplemented (captured500); no subscriber readback or automatic alert claim
PASS 8 standalone notification CLI and scoped SNS topic policy readback; no auto delivery
COST EXPLORER BOUNDARY: emulator response is synthetic/unavailable; no actual bill or saving claim
BEHAVIOR CHECKS 8
PASS 9 all owned fixtures cleaned; Moto default AMI snapshots untouched
OWNED MOTO STOPPED / LISTENER CLOSED
```

Final exact runner record `.overhaul-evidence/COST-LAB27-REPLAY.txt`; earlier probe `COST-MOTO-PROBE.txt`. Expected estimate for this disposable slice: approx$123.65/month before and$85after (delta$38.65), subject to listed exclusions; estimate readout must not be called actual AWS savings. Browser has additional preserved auditvolume/liveEIP, so inventory totals differ.

## Boundaries / failures

No actual EBS block device, OS, snapshot filesystem recovery, I/O benchmark, timed volume modification, real IAM enforcement, billing, alert/email delivery. Snapshot waiter/retention/resource fields are actual API metadata. Production cleanup needs approval, tested restore and real workload validation. No command lists or deletes shared fixtures. Moto OwnerIds=self alias included default snapshots in initial probe; cleanup uses exact owned-ID and baseline preservation checks. Missing venv/CLI: use existing lab setup documentation; runner itself does not install tools.

[gp2/gp3 comparison](https://docs.aws.amazon.com/us_en/emr/latest/ManagementGuide/emr-plan-storage-compare-volume-types.html), [IPv4 pricing](https://aws.amazon.com/vpc/pricing/), [modify-volume](https://docs.aws.amazon.com/cli/latest/reference/ec2/modify-volume.html), [Budget SNS policy](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html), [retention timing](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html).
