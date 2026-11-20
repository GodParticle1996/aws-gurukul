# Lab27 — apna kharcha saaf karo, value bachate hue

ShopKaro ki fictional inventory. "Available" volume apne aap phenkne layak nahi hota: purana import recovery point bachao. Production volume ki ID/size/encryption aur set ki hui performance waisi hi rakho.

## Chalao — app ke root folder se

Pehle se bane Python venv mein Moto 5.2.4, boto3 aur AWS CLI chahiye. Docker ya asli AWS nahi chahiye. Runner installed tools use karta hai; khud kuch install nahi karta.

```bash
./docker-labs/.venv/bin/python -I docker-labs/27-cost-waste-hunter/lab.py
```

Runner apna thodi der ka loopback Moto server, dummy keys, har call par saaf endpoint aur lab ki apni credential/config files use karta hai. Shared emulator/reset aur ~/.aws ko chhoota nahi. `.overhaul-evidence/lab27-runs/run-<unique>/` mein JSON inputs milenge; print hue AWS commands runner ke apne endpoint/environment ke saath dobara chalaye gaye hain. Yeh commands normal asli-AWS shell mein mat chalana.

## Har operation ka matlab

1. SDK apna encrypted 1000 GiB gp2 volume, approved detached 200 GiB import volume, expired fixture snapshot, khaali EIP aur TEST log banata hai. Lab ke volumes unattached metadata fixtures hain; browser wala protected two-AZ runtime environment asli lab mein boot nahi hota.
2. Asli `aws ec2 create-snapshot --volume-id <owned-import>` aur `aws ec2 wait snapshot-completed --snapshot-ids <returned-ID>`. API se completed metadata aane ke baad approved source volume delete hota hai. **Moto block data ki copy/restore integrity prove nahi karta.**
3. `aws ec2 modify-volume --volume-id <owned-prod> --volume-type gp3 --iops 3000 --throughput 250`. Asli describe readback se purani ID, 1000 GiB, encryption, 3000 IOPS, 250 MiB/s check hota hai. Performance saaf likhne se alag-alag documented default raaston se bachte hain. Asli AWS mein modification ka time, filesystem aur workload I/O alag se monitor/test karo; Moto mein modification status "modifying" par atka reh sakta hai.
4. Khaali EIP release; approved purana snapshot delete, taaza recovery-point metadata bacha rehta hai. Aakhri achha production backup browser mission mein bachaya jaata hai; asli lab mein sirf apne phenkne layak fixtures hain.
5. Dev log par 14 din ki retention set hoti hai, aaj ka TEST log readback mein waisa hi rehta hai. Expiry/deletion ka time aur archival billing simulate nahi hote.
6. Scoped SNS topic policy + har mahine 1000 USD ka COST Budget + ACTUAL 80% notice banta hai. Alag FORECASTED 90% notice bhi CLI se banta hai; describe-notifications mein 2 entries aati hain. SNS policy readback mein exact scoped SourceAccount/SourceArn permission check hoti hai. **Subscriber input maana gaya; subscriber readback Moto mein unimplemented (500). Apne aap notifications, receiver tak delivery ya kharche ki rok prove nahi hoti.**
7. CE get-cost-and-usage khaali ResultsByTime deta hai; local resource ka bill meter nahi hota. prices.json mein lagbhag, source se check kiye N.Virginia rates se EBS + listed IPv4 ki aage ki monthly inventory ka andaaza banta hai, yeh asli invoice ki bachat nahi. 730 ghante/₹88 per USD model ki maani hui baatein hain. Snapshots ka bill badle hue blocks par hota hai; VolumeSize ko bill hone wale bytes mat samjho. Logs/compute/network/taxes/credits/commitments isme nahi gine gaye.
8. Aakhir mein sirf apne volume/snapshot/IP/log/topic/budget IDs delete hote hain. Moto ke default/vendor AMI snapshots ko shuru ki ID baseline se compare kiya jaata hai; vendor fixtures delete nahi hote. Listener band hota hai. Cleanup fail ho toh error aata hai.

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

Aakhri exact runner record `.overhaul-evidence/COST-LAB27-REPLAY.txt`; pehle ka probe `COST-MOTO-PROBE.txt`. Is phenkne layak hisse ka expected andaaza: lagbhag $123.65/month pehle aur $85 baad mein (farak $38.65), listed exclusions ke saath; is andaaze ko asli AWS bachat mat bolna. Browser mein ek extra bachaya hua audit volume aur live EIP hai, isliye inventory ke totals alag hain.

## Boundaries / failures

Koi asli EBS block device, OS, snapshot filesystem recovery, I/O benchmark, timed volume modification, asli IAM enforcement, billing ya alert/email delivery nahi. Snapshot waiter/retention/resource fields asli API metadata hain. Production cleanup ke liye manzoori, test kiya restore aur asli workload ka check chahiye. Koi command shared fixtures ki list ya delete nahi karta. Pehle probe mein Moto ke OwnerIds=self alias ne default snapshots bhi dikhaye the; cleanup exact apni IDs aur baseline bachav ke checks use karta hai. Venv/CLI missing ho toh lab setup ki documentation dekho; runner khud tools install nahi karta.

[gp2/gp3 comparison](https://docs.aws.amazon.com/us_en/emr/latest/ManagementGuide/emr-plan-storage-compare-volume-types.html), [IPv4 pricing](https://aws.amazon.com/vpc/pricing/), [modify-volume](https://docs.aws.amazon.com/cli/latest/reference/ec2/modify-volume.html), [Budget SNS policy](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html), [retention timing](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html).
