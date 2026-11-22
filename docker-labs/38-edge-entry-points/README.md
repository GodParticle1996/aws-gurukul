# Lab 38 · Photo aur personal feed ka entry point

Ek private S3 bucket mein p7 ki test photo hai. Internal Application Load Balancer (ALB) ke HTTP listener par `/api` aur `/api/*` ki rule hai. CloudFront ka ordered behavior `/images/*` ko bucket par bhejta hai. Default behavior API origin ko chunta hai.

## Chalao

Repo root mein lab ke Python se command chalao. Script apna Moto server ek khaali loopback port par kholti hai. Dummy credentials aur config har run ki alag directory mein bante hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/38-edge-entry-points/lab.py
```

| Check | Kya padha |
|---|---|
| ELBv2 | Do AZ mein internal ALB, default 404 aur API paths ke liye listener rule ka fixed response. Lab listener HTTP metadata hai. Browser mission mein HTTPS origin hai. |
| WAF v2 | CLOUDFRONT scope ki ACL mein exact `/release-check` path par block action. Distribution ke config mein isi ACL ka ARN mila. |
| S3 aur CloudFront | S3 Block Public Access, sirf distribution ke ARN aur images prefix wali bucket policy, OAC ki SigV4 signing setting, do origins aur cache policies. |
| Host check | Python ne saved behaviors se teen paths ka target chuna. Local S3 API se test object ke bytes padhe. |
| Cleanup | Distribution disable karke delete ki. OAC, ACL, ALB listener/rule, bucket aur lab network hataaye. List APIs se resource counts dekhe aur listener band hone ka check kiya. |

Moto 5.2.4 ne `CreateVpcOrigin` par 404 diya. Lab ne internal ALB ka DNS naam custom-origin metadata ke roop mein rakha. Real private connectivity ke liye CloudFront VPC origin chahiye. Moto ne distribution readback mein OAC attachment ID bhi nahi lautaayi. `ListAccelerators` par Moto ko backend nahi mila. Browser mission mein viewer ke hit, personal feed aur WAF block local model se aate hain. Docker, real edge delivery, origin TLS, cache latency aur GA failover is run mein test nahi hue. [AWS VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html) · [AWS S3 OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

## Laptop par mila output

Moto 5.2.4 aur boto3 1.43.118 ke run ka lab log neeche hai. Har run ka port badalta hai. Log `.overhaul-evidence/lab38-runs/run-*/lab.log` mein milta hai.

```text
OWNED MOTO http://127.0.0.1:35217
PASS Internal ALB ke do AZ aur dono API path mile.
PASS Global WAF ki release-check block rule padhi.
GAP CreateVpcOrigin ka local response 404. ALB DNS ko custom-origin metadata mein rakha.
PASS S3 public block, distribution ke ARN wali policy aur signing OAC mile.
PASS Distribution par image path, default API origin aur WAF ARN mile.
READBACK image policy / API policy / forward policy / attached OAC: mila / mila / mila / missing
GAP Moto ne saari CloudFront settings readback mein nahi di.
PASS HOST CHECK Python ne teen paths milaye. S3 API se p7 ka test object padha.
GAP ListAccelerators ka local response 500. Global Accelerator ki routing test nahi hui.
PASS CLEANUP READBACK {"distributions": 0, "oacs": 0, "acls": 0, "loadBalancers": 0, "buckets": 0, "labVpcs": 0}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```
