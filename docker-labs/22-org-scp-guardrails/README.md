# Lab22 — organization metadata aur actual SCP enforcement gap

**Pain:** attached policy aur expected AccessDenied same evidence nahi. This lab verifies a real local organization tree/registration, then deliberately tests the emulator's enforcement boundary.

No real AWS accounts or cloud resources are created. `lab.py` owns one new ephemeral127.0.0.1 Moto5.2.4 listener, dummy/lab-local config, disabled profiles/session token/metadata and explicit endpoints for **every** management/member/STS/S3 client. No shared4566reset, ~/.aws writes, Docker or system install.

## Run

Existing `docker-labs/.venv` required. From `aws-gurukul`:

```bash
./docker-labs/.venv/bin/python -I docker-labs/22-org-scp-guardrails/lab.py
```

Read the script first. Objects use a unique printed `lab22-...` prefix. The whole owned fixture lifetime is seed→exercise→probe→cleanup; a second terminal/shared server is not required. The exact repository command was replayed successfully on2026-10-27; captured behavior and cleanup appear below. Replay after changes.

## ex1 — hierarchy and actual policy attachments

1. Create an ALL-features organization with its default management account. Create two **virtual** member accounts and read DescribeCreateAccountStatus.
2. Create Workloads→Production/Sandbox OUs. Move the virtual sandbox account root→Production→Sandbox, then ListParents.
3. List direct SERVICE_CONTROL_POLICY attachments at root, every OU and the member account. Inspect FullAWSAccess at each level.
4. Create/attach the reviewed scoped policy:deny EC2/RDS/S3CreateBucket outside Mumbai, deny a wrong S3LocationConstraint, and deny StopLogging/DeleteTrail.

Actual repository replay capture (2026-10-27):

```text
PASS 1 management+2virtual member accounts exist
PASS 2 actual nested OU move and parent readback
DEFAULT ATTACHMENTS ... [('p-FullAWSAccess', 'FullAWSAccess')]
PASS 3 custom SCP attached to Sandbox metadata
```

RequestedRegion is the API endpoint Region. It does not universally constrain where an API stores data. The S3creation location condition is checked separately. This scoped example does not claim to cover every service, global endpoint or data-transfer action. Real org policies need service-by-service review and canary rollout.

## ex2 — service-specific delegated administrator

The script first attempts registration without trusted access, deregisters that temporary registration if Moto accepts, then explicitly enables access and registers correctly for `config-multiaccountsetup.amazonaws.com`.

```text
REGISTER WITHOUT TRUSTED ACCESS ACCEPTED ...
PASS 4 service-specific delegated admin readback
```

**Moto gap:** registration accepted without the documented service-access setup. The correct path is still exercised. This Config principal covers organization rules/conformance-pack setup; `config.amazonaws.com` is a separate integration for aggregation. No Config rule, aggregator, resource recorder, Identity Center or Control Tower landing zone is deployed. Delegation metadata is not service runtime readiness, account ownership or an SCP bypass.

## ex3 — act as the virtual member; test the Deny

The script requests local STS temporary credentials for the virtual member and verifies GetCallerIdentity. Moto does not establish a real role-trust/authorization proof; credentials never leave the owned emulator.

A member S3client then requests a bucket in eu-west-1, although the attached policy denies that endpoint and location. Actual result:

```text
PASS 5 temporary Moto credentials identify the virtual member account; not real trust enforcement proof
MEMBER OUTSIDE_REGION SCP ENFORCEMENT ACCEPTED ...
MOTO SCP NOT ENFORCED: forbidden request accepted
PASS 6 actual forbidden-region local bucket metadata shows evaluator gap
```

The forbidden bucket's actual LocationConstraint is eu-west-1. **Moto stored attachments but did not enforce the SCP.** Do not report this as a successful real-AWS guardrail test. The in-app bounded evaluator separately checks root→eachOU→account Allows, applicable Denies and the stated IAM/resource-policy path. Real AWS enforcement must be tested only in an explicitly approved isolated member-account canary.

ListAccounts capture currently includes State and legacy Status. Current API documentation tells callers to migrate to State because Status was scheduled for retirement on2026-09-09; the app uses State rather than relying on Moto's legacy field.

## Cleanup and limits

Only the own forbidden bucket, delegated registration/trusted access, custom SCP attachments/policy, OUs, organization memberships and organization are cleaned. Members first move back to the own root. Actual capture:

```text
BEHAVIOR CHECKS 6
PASS 7 own member memberships removed; this is not real AWS account closure
PASS 8 own organization/OU/policy/delegation/bucket fixtures cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

`RemoveAccountFromOrganization` removes membership; it **does not close a real AWS account**, end all charges or undo a real account's creation. These accounts are virtual fixtures disposed with the owned local server. Do not copy this script to real AWS. No general member-account close/remove or root-policy rollout is part of the learner's real-AWS homework without explicit approval and a separate recovery plan.

Remaining unverified:actual AWS authorization, IAM trust/SLR exceptions, RCP/declarative/tag/backup policy enforcement, service configuration, Control Tower/Identity Center/RAM/billing behavior. No full IAM/Organizations enforcement or production governance certificate is claimed.

Primary sources: [SCP evaluation](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_evaluation.html), [SCP scope/exemptions](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html), [2025full syntax expansion](https://aws.amazon.com/about-aws/whats-new/2025/09/aws-organizations-iam-language-service-control-policies/), [Config delegation](https://docs.aws.amazon.com/config/latest/developerguide/aggregated-register-delegated-administrator.html), [ListAccounts State](https://docs.aws.amazon.com/organizations/latest/APIReference/API_ListAccounts.html).
