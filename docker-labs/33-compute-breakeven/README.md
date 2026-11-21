# Lab 33 · PixShare ka thumbnail aur compute bill

Ek hi 4×4 photo ko Lambda ZIP ke handler aur ECS task ki command do. Dono ka 2×2 thumbnail milao. Phir dekho roz ke active ghante badalne par Lambda ka bill kab always-on worker ke barabar aata hai.

## Lab chalao

Project root se lab ki Python venv use karo. Lab ko Moto aur boto3 chahiye. Venv banaane ke steps [lab setup](../README.md) mein hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/33-compute-breakeven/lab.py
```

Lab apna Moto server laptop ke khaali port par shuru karti hai. Dummy credentials aur config har run ke folder mein bante hain. Lambda ke liye `handler.py` ZIP mein jaata hai. ECS ki Python image ki command mein bhi wahi source jaata hai. Moto se ZIP hash, function settings, task ARN, revision aur saved command padhe jaate hain. Laptop ka Python ZIP wala handler aur saved command chalaata hai.

Har 2×2 block ke chaar pixels ka average lo aur neeche wale poore number tak rakho. Pehle block ke 0, 20, 20 aur 40 ka output 20 hai. Chaaron output pixels match hone chahiye. Moto status task ka record dikhata hai. Docker par image startup, Lambda runtime, AWS latency aur AWS bill ki jaanch abhi baaki hai.

## Bill ka hisaab

```bash
python3 -I docker-labs/33-compute-breakeven/breakeven.py
```

- 30 din aur US East (N. Virginia) ke example rates lo. Ek chhoti request ek x86 Lambda call hai. Har million calls ka $0.20 aur har GB-second ka $0.0000166667 hai. Billed time mein bill hua startup bhi gino. [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- Ek Linux/x86 Fargate task ke 2 vCPU aur 4 GB poore 720 ghante chalte hain. Har vCPU-second ka $0.000011244 aur har GB-second ka $0.000001235 hai. [Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- Ek Linux m5.large ke 720 ghanton ko $0.096/ghanta ke example rate par gino. Course mein plan ki quote 30% kam hai aur poora commitment use hota hai. Asli discount aur kitna commitment use hoga, dono apne usage par dekho. [EC2 rate example](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-fleet-examples.html) · [Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html)
- Ek active req/s ka monthly kharcha = 30 × ghante/roz × 3600 × (request rate + GB × billed seconds × GB-second rate). Is kharche se always-on monthly bill ko bhaag do. Jawaab dono ke barabar bill wala active req/s hai.
- Model mein dono always-on workers ko 20 req/s tak ka traffic sambhaalne layak maana hai. Table mein 20 se upar ka crossover sirf formula ka jawaab hai. Same latency, throughput aur spare capacity ke liye load test chahiye. Free tier, storage, network, load balancer, logs aur tax ko model se bahar rakha hai.

## Laptop par mila output

Har run ka port badal sakta hai. Poora output `.overhaul-evidence/lab33-runs/run-*/lab.log` mein milta hai.

```text
OWNED MOTO http://127.0.0.1:46083
PASS Lambda ZIP ka hash mila. Handler thumbnail, memory 512 MB aur timeout 15 second hai.
PASS Moto mein Fargate task sahi revision par mila. Status DEACTIVATING.
PASS HOST CHECK same 4x4 photo se ZIP aur ECS command dono ne [[20, 100], [8, 5]] diya.
GAP Task status Moto se mila. Lambda runtime aur ECS image laptop par launch nahi hue.
HOST CHECK USD/30 din · 512 MB · billed 200 ms · 20 req/s
hours/day   Lambda   Fargate   EC2+plan   equal req/s (Lambda=Fargate / Lambda=EC2)
        1     4.03     71.09      48.38   352.65 / 240.00
        6    24.19     71.09      48.38   58.77 / 40.00
       12    48.38     71.09      48.38   29.39 / 20.00
       24    96.77     71.09      48.38   14.69 / 10.00
PASS CLEANUP READBACK {"function": [], "role": [], "active_cluster": [], "task_interfaces": [], "active_revision": [], "vpc": []}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```
