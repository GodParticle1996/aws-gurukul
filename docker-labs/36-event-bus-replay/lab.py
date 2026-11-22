"""Check Classic bus delivery, archive replay and Pipes on an owned loopback Moto server."""
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import json
import logging
import os
from pathlib import Path
import socket
import tempfile
from time import monotonic, sleep

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab36-runs"
EVIDENCE.mkdir(parents=True, exist_ok=True)
RUN = Path(tempfile.mkdtemp(prefix="run-", dir=EVIDENCE))
for key in list(os.environ):
    if key.startswith("AWS_"):
        del os.environ[key]
(RUN / "config").write_text("[default]\nregion = us-east-1\n")
(RUN / "credentials").write_text("[default]\naws_access_key_id=test\naws_secret_access_key=test\n")
os.environ.update(AWS_CONFIG_FILE=str(RUN / "config"), AWS_SHARED_CREDENTIALS_FILE=str(RUN / "credentials"),
                  AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test", AWS_DEFAULT_REGION="us-east-1",
                  AWS_MAX_ATTEMPTS="1", AWS_EC2_METADATA_DISABLED="true", NO_PROXY="localhost,127.0.0.1")
import boto3
from moto.server import ThreadedMotoServer

logging.getLogger("werkzeug").setLevel(logging.CRITICAL)


def say(line):
    print(line, flush=True)
    with (RUN / "lab.log").open("a") as stream:
        print(line, file=stream)


def check(ok, message):
    if not ok:
        raise AssertionError(message)
    say("PASS " + message)


def main(endpoint):
    def client(service):
        return boto3.client(service, endpoint_url=endpoint)

    ev, sqs, pipes, iam, sfn = map(client, ["events", "sqs", "pipes", "iam", "stepfunctions"])
    now = datetime.now(timezone.utc).replace(microsecond=0)
    bus = "pix-uploads"
    archive = "pix-history"
    pipe = "pix-check"
    all_uploads = {"source": ["pixshare.app"], "detail-type": ["PhotoUploaded"]}
    premium = {**all_uploads, "detail": {"tier": ["premium"]}}
    transform = {"InputPathsMap": {"upload": "$.detail.uploadId", "tier": "$.detail.tier"},
                 "InputTemplate": '{"uploadId":"<upload>","tier":"<tier>"}'}

    def drain(url):
        rows = []
        for _ in range(10):
            page = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10, WaitTimeSeconds=1)
            if not page.get("Messages"):
                return rows
            for message in page["Messages"]:
                rows.append(json.loads(message["Body"]))
                sqs.delete_message(QueueUrl=url, ReceiptHandle=message["ReceiptHandle"])
        raise AssertionError("queue did not drain")

    with ExitStack() as clean:
        bus_arn = ev.create_event_bus(Name=bus)["EventBusArn"]
        clean.callback(ev.delete_event_bus, Name=bus)
        archive_arn = ev.create_archive(ArchiveName=archive, EventSourceArn=bus_arn,
                         EventPattern=json.dumps(all_uploads), RetentionDays=7)["ArchiveArn"]
        clean.callback(ev.delete_archive, ArchiveName=archive)
        arch = ev.describe_archive(ArchiveName=archive)
        check(arch["EventSourceArn"] == bus_arn and arch["RetentionDays"] == 7, "Classic bus ka saat din wala archive mila.")

        def queue(name):
            url = sqs.create_queue(QueueName=name)["QueueUrl"]
            clean.callback(sqs.delete_queue, QueueUrl=url)
            arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
            return url, arn

        review, audit, inbox = [queue(n) for n in ["pix-review", "pix-audit", "pix-inbox"]]

        def route(name, pattern, dest, transformer=None):
            arn = ev.put_rule(Name=name, EventBusName=bus, EventPattern=json.dumps(pattern))["RuleArn"]
            clean.callback(ev.delete_rule, Name=name, EventBusName=bus)
            policy = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "events.amazonaws.com"},
                      "Action": "sqs:SendMessage", "Resource": dest[1], "Condition": {"ArnEquals": {"aws:SourceArn": arn}}}]}
            sqs.set_queue_attributes(QueueUrl=dest[0], Attributes={"Policy": json.dumps(policy)})
            target = {"Id": "queue", "Arn": dest[1]}
            if transformer:
                target["InputTransformer"] = transformer
            result = ev.put_targets(Rule=name, EventBusName=bus, Targets=[target])
            assert result["FailedEntryCount"] == 0
            clean.callback(ev.remove_targets, Rule=name, EventBusName=bus, Ids=["queue"])
            assert ev.list_targets_by_rule(Rule=name, EventBusName=bus)["Targets"] == [target]
            return arn

        review_rule = route("premium", premium, review, transform)
        route("audit", all_uploads, audit)
        samples = [("p7","premium",20), ("p8","basic",19), ("p9","premium",5)]
        entries = []
        results = []
        for upload, tier, minutes in samples:
            time = now - timedelta(minutes=minutes)
            detail = {"uploadId": upload, "tier": tier}
            event = {"version":"0", "id":"11111111-1111-4111-8111-111111111111",
                     "source":"pixshare.app", "detail-type":"PhotoUploaded", "account":"123456789012",
                     "time":time.isoformat(), "region":"us-east-1", "resources":[], "detail":detail}
            result = ev.test_event_pattern(EventPattern=json.dumps(premium), Event=json.dumps(event))
            results.append(result.get("Result"))
            entries.append({"Source":event["source"], "DetailType":event["detail-type"], "Detail":json.dumps(detail),
                            "EventBusName":bus, "Time":time})
        if results == [None] * 3:
            say("GAP TestEventPattern ne teen calls mein Result field nahi diya.")
        else:
            check(results == [True, False, True], "TestEventPattern ne premium aur basic alag kiye.")
        sent = ev.put_events(Entries=entries)
        assert sent["FailedEntryCount"] == 0 and all(r.get("EventId") for r in sent["Entries"])
        live, audited = drain(review[0]), drain(audit[0])
        check(sorted(live, key=lambda e:e["uploadId"]) == [{"uploadId":"p7","tier":"premium"},{"uploadId":"p9","tier":"premium"}],
              "Review queue ko sirf p7 aur p9 ke chhote JSON mile.")
        check(sorted(e["detail"]["uploadId"] for e in audited) == ["p7","p8","p9"], "Audit queue ko teen poore events mile.")

        replay = "fix-review"
        ev.start_replay(ReplayName=replay, EventSourceArn=archive_arn, EventStartTime=now-timedelta(minutes=21),
                        EventEndTime=now-timedelta(minutes=18), Destination={"Arn":bus_arn, "FilterArns":[review_rule]})
        state = ev.describe_replay(ReplayName=replay)
        check(state["State"] == "COMPLETED" and state["Destination"]["FilterArns"] == [review_rule],
              "Replay COMPLETED hua. Saved destination mein sirf premium rule hai.")
        replayed, other = drain(review[0]), drain(audit[0])
        ids = sorted(e.get("detail", e)["uploadId"] for e in replayed)
        assert "p7" in ids
        say("READBACK replay review=" + str(ids) + " audit=" + str(sorted(e["detail"]["uploadId"] for e in other)))
        if ids != ["p7"] or other or replayed != [{"uploadId":"p7","tier":"premium"}]:
            say("GAP Replay mein chuni window ke bahar IDs: " + str([i for i in ids if i != "p7"]) +
                ". Audit copies: " + str(len(other)) + ". Review par poore envelopes: " + str(sum("detail" in e for e in replayed)) + ".")
        else:
            say("PASS Sirf chuni window ka p7 review queue tak phir pahuncha.")
        applied = set()
        for row in live + replayed:
            applied.add(row.get("detail", row)["uploadId"])
        check(applied == {"p7","p9"}, "HOST CHECK uploadId se ek hi upload ek baar gina.")

        def role(name, service):
            trust = {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":service},"Action":"sts:AssumeRole"}]}
            arn = iam.create_role(RoleName=name, AssumeRolePolicyDocument=json.dumps(trust))["Role"]["Arn"]
            clean.callback(iam.delete_role, RoleName=name)
            return arn

        machine_role = role("pix-state-role","states.amazonaws.com")
        machine = sfn.create_state_machine(name="pix-review-flow", roleArn=machine_role,
                 definition=json.dumps({"StartAt":"Done","States":{"Done":{"Type":"Succeed"}}}))["stateMachineArn"]
        clean.callback(sfn.delete_state_machine, stateMachineArn=machine)
        pipe_role = role("pix-pipe-role","pipes.amazonaws.com")
        access = {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["sqs:ReceiveMessage","sqs:DeleteMessage","sqs:GetQueueAttributes"],"Resource":inbox[1]},
                                                    {"Effect":"Allow","Action":"states:StartExecution","Resource":machine}]}
        iam.put_role_policy(RoleName="pix-pipe-role",PolicyName="route",PolicyDocument=json.dumps(access))
        clean.callback(iam.delete_role_policy, RoleName="pix-pipe-role", PolicyName="route")
        def source_params(field):
            return {"SqsQueueParameters":{"BatchSize":1},"FilterCriteria":{"Filters":[{"Pattern":json.dumps({field:{"tier":["premium"]}})}]}}
        target_params = {"StepFunctionStateMachineParameters":{"InvocationType":"FIRE_AND_FORGET"}}
        pipes.create_pipe(Name=pipe, Source=inbox[1], Target=machine, RoleArn=pipe_role,
                          SourceParameters=source_params("detail"),TargetParameters=target_params)
        clean.callback(pipes.delete_pipe, Name=pipe)
        assert pipes.describe_pipe(Name=pipe)["SourceParameters"] == source_params("detail")
        pipes.update_pipe(Name=pipe, RoleArn=pipe_role, SourceParameters=source_params("body"), TargetParameters=target_params)
        cfg = pipes.describe_pipe(Name=pipe)
        check((cfg["Source"], cfg["Target"], cfg["RoleArn"], cfg["SourceParameters"],cfg["TargetParameters"]) ==
              (inbox[1], machine, pipe_role, source_params("body"),target_params), "Pipe mein body.tier, SQS aur Standard workflow waapas padhe.")
        for _ in range(10):
            cfg = pipes.describe_pipe(Name=pipe)
            if cfg["CurrentState"] == "RUNNING":
                break
            sleep(.2)
        say("READBACK Pipe CurrentState=" + cfg["CurrentState"])
        sqs.send_message(QueueUrl=inbox[0], MessageBody=json.dumps({"tier":"premium","uploadId":"p10"}))
        for _ in range(6):
            runs = sfn.list_executions(stateMachineArn=machine)["executions"]
            if runs:
                break
            sleep(.25)
        if runs:
            payload = json.loads(sfn.describe_execution(executionArn=runs[0]["executionArn"])["input"])
            assert json.loads(payload[0]["body"])["uploadId"] == "p10"
            say("PASS Pipe ke target execution mein p10 mila.")
        else:
            assert drain(inbox[0]) == [{"tier":"premium","uploadId":"p10"}]
            say("GAP Pipe readback mila. Poll ke dauran execution zero tha aur p10 source queue mein mila.")
    remaining = {"customBuses":len([b for b in ev.list_event_buses()["EventBuses"] if b["Name"] != "default"]),
                 "archives":len(ev.list_archives()["Archives"]), "queues":len(sqs.list_queues().get("QueueUrls",[])),
                 "pipes":len(pipes.list_pipes()["Pipes"]), "machines":len(sfn.list_state_machines()["stateMachines"]),
                 "pixRoles":len([r for r in iam.list_roles()["Roles"] if r["RoleName"].startswith("pix-")])}
    check(not any(remaining.values()), "CLEANUP READBACK " + json.dumps(remaining))
    say("READBACK Replay history " + ev.describe_replay(ReplayName=replay)["State"] + ". Replay delete ki API nahi hai.")

with socket.socket() as preflight:
    preflight.bind(("127.0.0.1", 0))
server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
server.start()
host, port = server.get_host_and_port()
try:
    endpoint = f"http://{host}:{port}"
    os.environ["AWS_ENDPOINT_URL"] = endpoint
    say("OWNED MOTO " + endpoint)
    main(endpoint)
finally:
    server.stop()
    with socket.socket() as probe:
        check(probe.connect_ex((host, port)) != 0, "OWNED MOTO STOPPED / LISTENER CLOSED")
