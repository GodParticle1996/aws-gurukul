# Lab24 — TGW segments, VPN aur hybrid DNS metadata

**Dard:** Transit Gateway mein ek galat association ya ek extra propagation, aur dev seedha prod tak pahunch
jaata hai. Lab ek asli segmented design banata hai (prod / dev / shared / on-prem tables), GodamTech ka VPN aur
hybrid DNS jodta hai, phir dikhata hai ki Moto kahan asli AWS se alag behave karta hai.

Course fixture: Mumbai (ap-south-1) mein ShopKaro ke teen VPCs — prod 10.10.0.0/16, dev 10.20.0.0/16, shared
10.30.0.0/16 — aur GodamTech ka Bhiwandi DC 192.168.10.0/24.

## Run

`docker-labs/.venv` pehle se chahiye (`./docker-labs/start-moto.sh` ek baar chala ho). `aws-gurukul` folder se,
pehle `lab.py` padho, phir chalao:

```bash
./docker-labs/.venv/bin/python -I docker-labs/24-hybrid-tgw-segments/lab.py
```

`lab.py` apna **khud ka** Moto 5.2.4 server 127.0.0.1 ke random port par chalata hai, dummy keys aur lab-local
config use karta hai, har client ko explicit endpoint deta hai. Koi real AWS call, Docker, shared 4566 reset ya
`~/.aws` write nahi hota. Objects ek unique `lab24-...` naam ke saath bante hain aur aakhir mein saaf hote hain.

## ex1 — chaar tables, ek association har attachment ki

Script ek Transit Gateway banata hai (default association/propagation **band**), teen VPC attachments, aur chaar
route tables. Har VPC attachment apni table se associate hota hai. Propagations: rt-prod ← shared; rt-shared ←
prod, dev; rt-dev ← shared. rt-dev mein 10.10.0.0/16 ka **static blackhole**.

Asli output (2026-10-27):

```text
PASS 1 one association per VPC attachment in its own table; rt-onprem empty
PASS 2 propagation metadata stored as designed
SEARCH rt-dev [{"DestinationCidrBlock": "10.10.0.0/16", "Type": "static", "State": "blackhole"}]
SEARCH rt-prod []
PASS 3 static blackhole visible in rt-dev
PASS 4 Moto gap: propagated routes are not returned by search (real AWS lists them)
```

👉 Association = "attachment kaunsi table padhega" (exactly ek). Propagation = "attachment ke routes kin tables
mein dikhen" (kai). Asli AWS mein `search-transit-gateway-routes` propagated routes bhi dikhata hai; Moto 5.2.4 sirf
static routes dikhata hai — isliye rt-prod khaali aaya.

## ex2 — GodamTech ka VPN Transit Gateway par

Customer gateway (BGP ASN 65010, documentation IP 203.0.113.10) aur `ipsec.1` VPN connection Transit Gateway par.
Phir VPN attachment rt-onprem se associate, aur propagations: rt-onprem ← prod, shared; rt-prod ← VPN; rt-shared
← VPN (return path).

```text
VPN {"VpnConnectionId": "vpn-cadf10953ef7de87f", "State": "available", "TransitGatewayId": "tgw-ae6dc212a9a0e8923"}
VPN ATTACHMENTS [{"TransitGatewayAttachmentId": "tgw-attach-f5e255dc3c1cf7c59", "ResourceId": "vpn-cadf10953ef7de87f", "State": "available"}]
PASS 5 VPN connection on the transit gateway: metadata available immediately (real VPN starts pending)
PASS 6 VPN attachment associated with rt-onprem and propagations enabled
```

👉 Moto VPN ko turant `available` bolta hai. Asli VPN pehle `pending` rehta hai, aur tunnels tabhi UP hote hain jab
on-prem router downloaded configuration se set ho. Koi IPsec ya BGP session yahan nahi chalta. Har VPN connection
mein 2 tunnels hote hain; standard tunnel up to 1.25 Gbps.

## ex3 — hybrid DNS endpoints

Shared VPC mein Resolver **inbound** aur **outbound** endpoints (2 subnets, 2 IPs each), `godam.local` ka forwarding
rule (target 192.168.10.53) aur prod VPC se rule association.

```text
RESOLVER {"inbound": ["INBOUND", 2], "outbound": ["OUTBOUND", 2], "rule": ["godam.local.", "FORWARD"], "association": "COMPLETE"}
PASS 7 Resolver inbound/outbound endpoints (2 IPs each) and forwarding rule associated with prod VPC
```

👉 Inbound = on-prem → AWS private names. Outbound + rule = AWS → on-prem domains. API khud 2 se kam IPs reject karta
hai. Moto mein koi DNS query resolve nahi hoti — sirf configuration.

## ex4 — documented evaluator: kaun kisse baat kar sakta hai?

Script Moto ke asli metadata se associations, propagations aur static routes padhta hai, phir AWS docs ke rules
lagata hai: sabse specific prefix, same prefix par static > propagated, aur conversation ke liye dono taraf route.

```text
EVALUATOR {"prod->dev": false, "prod->shared": true, "prod->onprem": true, "dev->prod": false, "dev->shared": true, "dev->onprem": false, "shared->prod": true, "shared->dev": true, "shared->onprem": true, "onprem->prod": true, "onprem->dev": false, "onprem->shared": true}
PASS 8 documented evaluator: prod/dev reach shared, dev and prod isolated, on-prem reaches prod/shared but not dev
```

👉 Matrix asli Moto metadata + documented rules se bana hai, packets se nahi. Dev na prod tak jaata hai na on-prem
tak; shared sabko jaanta hai, isliye replies wapas jaate hain.

## ex5 — do Moto gaps jo asli AWS mein nahi hain

Ek throwaway attachment ko do tables se associate karta hai. Phir shared attachment ki propagation pehle rt-prod
se band karta hai, phir rt-dev se.

```text
DOUBLE ASSOCIATION {"TransitGatewayRouteTableId": "tgw-rtb-ae51c32ac75391ad7", "TransitGatewayAttachmentId": "tgw-attach-54716f54366d7f156", "State": "associated"}
PASS 9 Moto gap: a second association for the same attachment is accepted (real AWS allows exactly one)
SECOND PROPAGATION DISABLE HTTP 500
PASS 10 Moto gap: disabling the same attachment in a second table fails after the first disable (real AWS keeps propagation per table)
```

👉 Asli AWS: ek attachment exactly ek table se associate hota hai, aur propagation har table ke liye alag on/off hoti
hai. App ka simulator yahi asli rules follow karta hai (`Resource.AlreadyAssociated` error, per-table propagation).

## Cleanup aur emulator limits

```text
BEHAVIOR CHECKS 10
CLEANUP NOTE: route tables deleted directly; real AWS needs associations and propagations removed first
PASS 11 own TGW/route tables/attachments/VPN/CGW/Resolver/VPC fixtures cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

Moto ki association/propagation bookkeeping unwiring par toot jaati hai, isliye cleanup static routes hatakar route
tables seedha delete karta hai. Asli AWS mein pehle associations aur propagations hatani padti hain.

**Emulator limits (Moto 5.2.4, is run mein dekhe):** propagated routes search mein nahi aate; double association
accept; doosri propagation disable par 500; VPN turant `available`; DNS/IPsec/BGP runtime nahi.

**Abhi bhi unproven:** asli packets aur return traffic, VPN tunnel health aur BGP routes, ECMP bandwidth, Direct
Connect, DNS resolution, security groups/NACLs, inspection appliances aur failover timing. Real-AWS practice ke liye
alag approval aur cost review chahiye — TGW attachments aur VPN connections per hour bill hote hain.
