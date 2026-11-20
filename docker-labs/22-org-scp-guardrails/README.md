# Lab22 — organization metadata aur asli SCP enforcement ki kami

**Pain:** laga hua policy aur expected AccessDenied ek hi saboot nahi. Yeh lab ek asli local organization tree/registration check karti hai, phir jaan-boojh kar emulator ki enforcement ki limit test karti hai.

Koi asli AWS account ya cloud resource nahi banta. `lab.py` ek naya, thodi der ka 127.0.0.1 Moto 5.2.4 listener chalata hai, dummy/lab ki apni config, band profiles/session token/metadata aur **har** management/member/STS/S3 client ke liye saaf endpoints ke saath. Shared 4566 reset, ~/.aws mein likhna, Docker ya system install nahi.

## Run

Existing `docker-labs/.venv` required. From `aws-gurukul`:

```bash
./docker-labs/.venv/bin/python -I docker-labs/22-org-scp-guardrails/lab.py
```

Pehle script padho. Objects ek unique print hue `lab22-...` prefix ke saath bante hain. Apne fixture ki poori life seed→exercise→probe→cleanup hai; doosra terminal ya shared server nahi chahiye. Yeh exact repository command 2026-10-27 ko safal chalaya gaya; pakda behaviour aur cleanup neeche hai. Badlav ke baad dobara chalao.

## ex1 — hierarchy aur asli policy attachments

1. Default management account ke saath ALL-features organization banao. Do **virtual** member accounts banao aur DescribeCreateAccountStatus padho.
2. Workloads→Production/Sandbox OUs banao. Virtual sandbox account ko root→Production→Sandbox shift karo, phir ListParents.
3. Root, har OU aur member account par seedhe laga SERVICE_CONTROL_POLICY list karo. Har level par FullAWSAccess dekho.
4. Review ki scoped policy banao/lagao: Mumbai ke bahar EC2/RDS/S3CreateBucket deny, galat S3LocationConstraint deny, aur StopLogging/DeleteTrail deny.

Asli repository replay ka capture (2026-10-27):

```text
PASS 1 management+2virtual member accounts exist
PASS 2 actual nested OU move and parent readback
DEFAULT ATTACHMENTS ... [('p-FullAWSAccess', 'FullAWSAccess')]
PASS 3 custom SCP attached to Sandbox metadata
```

RequestedRegion API endpoint ka Region hai. Yeh har jagah tay nahi karta ki API data kahan rakhti hai. S3 creation location ki condition alag se check hoti hai. Yeh scoped example har service, global endpoint ya data-transfer action cover karne ka daava nahi karta. Asli org policies ko service-by-service review aur canary rollout chahiye.

## ex2 — ek service ka delegated administrator

Script pehle bina trusted access ke registration try karti hai, Moto maan le toh us thodi der ki registration ko hata deti hai, phir saaf taur par access on karke `config-multiaccountsetup.amazonaws.com` ke liye sahi registration karti hai.

```text
REGISTER WITHOUT TRUSTED ACCESS ACCEPTED ...
PASS 4 service-specific delegated admin readback
```

**Moto gap:** likhe service-access setup ke bina bhi registration maan li gayi. Sahi raasta phir bhi chalaya jaata hai. Yeh Config principal organization rules/conformance-pack setup cover karta hai; aggregation ke liye `config.amazonaws.com` alag integration hai. Koi Config rule, aggregator, resource recorder, Identity Center ya Control Tower landing zone deploy nahi hota. Delegation metadata service ki runtime readiness, account ownership ya SCP bypass nahi.

## ex3 — virtual member ban kar Deny test karo

Script virtual member ke liye local STS temporary credentials leti hai aur GetCallerIdentity check karti hai. Moto asli role-trust/authorization ka saboot nahi deta; credentials apne emulator se bahar kabhi nahi jaate.

Phir ek member S3 client eu-west-1 mein bucket maangta hai, jabki lagi policy us endpoint aur location ko deny karti hai. Asli result:

```text
PASS 5 temporary Moto credentials identify the virtual member account; not real trust enforcement proof
MEMBER OUTSIDE_REGION SCP ENFORCEMENT ACCEPTED ...
MOTO SCP NOT ENFORCED: forbidden request accepted
PASS 6 actual forbidden-region local bucket metadata shows evaluator gap
```

Mana kiye bucket ka asli LocationConstraint eu-west-1 hai. **Moto ne attachments save kiye par SCP laagu nahi kiya.** Ise asli-AWS guardrail ka safal test mat bolo. App ka limit wala evaluator alag se root→har OU→account ke Allows, lagu Denies aur bataya IAM/resource-policy raasta check karta hai. Asli AWS enforcement sirf saaf manzoori wale alag member-account canary mein test karo.

ListAccounts capture mein abhi State aur purana Status dono aate hain. Aaj ki API documentation callers ko State par jaane ko kehti hai, kyunki Status 2026-09-09 ko hatna tay tha; app State use karta hai, Moto ke purane field par bharosa nahi karta.

## Cleanup and limits

Sirf apna mana kiya bucket, delegated registration/trusted access, custom SCP attachments/policy, OUs, organization memberships aur organization saaf hote hain. Members pehle apne root par wapas aate hain. Asli capture:

```text
BEHAVIOR CHECKS 6
PASS 7 own member memberships removed; this is not real AWS account closure
PASS 8 own organization/OU/policy/delegation/bucket fixtures cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

`RemoveAccountFromOrganization` sirf membership hataata hai; yeh **asli AWS account band nahi karta**, saare charges nahi rokta, na asli account ka banna wapas karta hai. Yeh accounts virtual fixtures hain jo apne local server ke saath khatam hote hain. Yeh script asli AWS par copy mat karo. Learner ke asli-AWS homework mein member account band/hatana ya root-policy rollout, saaf manzoori aur alag recovery plan ke bina nahi hai.

Abhi bhi check nahi hua: asli AWS authorization, IAM trust/SLR exceptions, RCP/declarative/tag/backup policy enforcement, service config, Control Tower/Identity Center/RAM/billing ka behaviour. Poore IAM/Organizations enforcement ya production governance certificate ka daava nahi.

Primary sources: [SCP evaluation](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_evaluation.html), [SCP scope/exemptions](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html), [2025 full syntax expansion](https://aws.amazon.com/about-aws/whats-new/2025/09/aws-organizations-iam-language-service-control-policies/), [Config delegation](https://docs.aws.amazon.com/config/latest/developerguide/aggregated-register-delegated-administrator.html), [ListAccounts State](https://docs.aws.amazon.com/organizations/latest/APIReference/API_ListAccounts.html).
