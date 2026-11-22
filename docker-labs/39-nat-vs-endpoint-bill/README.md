# Lab 39 · S3 ka raasta badalne par kaunsi fee bachi?

Do private app subnets hain. Har subnet ka default route usi AZ ke public NAT gateway ko jaata hai. Lab pehle existing route tables padhti hai. Phir S3 gateway endpoint lagakar wahi destinations dobara check karti hai.

## Chalao

Repo root mein lab ki Python environment se command chalao. Script apna Moto server ek khaali loopback port par shuru karti hai. Har run ki config aur dummy credentials alag directory mein hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/39-nat-vs-endpoint-bill/lab.py
```

## Route ka saboot

Python EC2 API se private subnet ki association, active routes aur `com.amazonaws.us-east-1.s3` ki prefix list padhti hai. Ek S3 IP aur doosre IPv4 ke liye host par sabse specific matching route nikaalti hai. Tables ko badalne se pehle, sirf A par endpoint jodne ke baad, dono tables ke saath naya endpoint banaane par aur endpoint hataane ke baad ye check chalta hai.

Moto 5.2.4 mein `ModifyVpcEndpoint` ne B ki association save ki. B ki actual table mein prefix route nahi aaya. Lab ne pehle endpoint ki test association hataayi aur endpoint delete kiya. Dono tables ek saath dekar naya endpoint banaaya toh dono mein managed prefix route mila. AWS par association ke saath route AWS manage karta hai. [Gateway endpoint routing](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)

## 30 din ka planning model

| Route-table readback | NAT se guzra traffic | NAT aur public IPv4 ka subtotal |
|---|---:|---:|
| Dono tables par NAT | 200,000 GB | $9,072 |
| Sirf A ka S3 endpoint par | 101,000 GB | $4,617 |
| A aur B ka S3 endpoint par | 2,000 GB | $162 |

S3 ka 198,000 GB aur baaki 2,000 GB dono AZ mein barabar maana hai. Har NAT par ≈ $0.045/GB processed aur ≈ $0.045/hour hai. Do gateways aur do public IPv4 (≈ $0.005/hour har IP) 720 ghante rehte hain. Isliye fixed hissa $72 hai. S3 endpoint ka apna hourly ya processing charge nahi hai. S3 requests, storage, egress aur tax is subtotal se alag hain. [NAT pricing](https://aws.amazon.com/vpc/pricing/)

## Laptop par mila output

Moto 5.2.4 aur boto3 1.43.118 ka lab log neeche hai. Host ne Moto ke saved routes par calculation ki. Docker, actual packet delivery aur AWS invoice is run mein test nahi hue. Har run ka log `.overhaul-evidence/lab39-runs/run-*/lab.log` mein milta hai.

```text
OWNED MOTO http://127.0.0.1:43667
READBACK S3 prefix list ke CIDRs: 52.216.0.0/15, 3.5.0.0/19, 54.231.0.0/16.
HOST CHECK Pehle S3 bhi dono NAT par gaya. Dono private tables ka default apne NAT par raha.
HOST CHECK Sirf A jodne par A ka S3 endpoint par aur B ka S3 NAT par gaya. Dono private tables ka default apne NAT par raha.
PASS HOST CHECK Sirf A par S3 route badalne se model ka monthly subtotal $4,617 hai.
GAP ModifyVpcEndpoint mein B ki association save hui. B ki route table mein S3 prefix route nahi aaya.
PASS Naye S3 endpoint par shuru se dono private tables jodi gayin.
HOST CHECK Ab dono tables mein S3 prefix ne default se pehle endpoint chuna. Dono private tables ka default apne NAT par raha.
PASS HOST CHECK 198,000 GB S3 aur 2,000 GB baaki par monthly NAT + IPv4 model $9,072 se $162 hua. Bachat $8,910.
HOST CHECK Endpoint hataane par S3 phir NAT par gaya. Dono private tables ka default apne NAT par raha.
READBACK Endpoint delete ke baad states: ['deleted', 'deleted']
PASS CLEANUP READBACK {"vpcs": 0, "tables": 0, "subnets": 0, "labIgw": 0, "liveEndpoints": 0, "liveNats": 0, "eips": 0}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```
