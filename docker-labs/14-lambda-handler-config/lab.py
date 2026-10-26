"""Moto metadata lab controller. Explicit loopback CLI endpoint, exact saved IDs only."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import time
import zipfile

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
LAB = ROOT/'.lab'; LAB.mkdir(exist_ok=True)
STATE = LAB/'resources.json'
if os.environ.get('AWS_ENDPOINT_URL') != 'http://127.0.0.1:4566' or os.environ.get('AWS_ACCESS_KEY_ID') != 'test' or os.environ.get('AWS_SECRET_ACCESS_KEY') != 'test':
    raise SystemExit('Source docker-labs/env.sh: existing loopback4566 and dummy test/test required')
for key in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN']:
    os.environ.pop(key, None)
os.environ.update(AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'), AWS_CONFIG_FILE=str(LAB/'config'), AWS_EC2_METADATA_DISABLED='true', AWS_MAX_ATTEMPTS='1', AWS_PAGER='', AWS_DEFAULT_REGION='ap-south-1')
AWS = shutil.which('aws')
if not AWS:
    raise SystemExit('Source docker-labs/env.sh to use existing CLI; no automatic installation')
ids = json.loads(STATE.read_text()) if STATE.exists() else {}


def save():
    STATE.write_text(json.dumps(ids, indent=2))


def call(*args, optional=False):
    command = [AWS, '--endpoint-url', 'http://127.0.0.1:4566', '--region', 'ap-south-1', *args, '--output', 'json']
    print('$ aws ' + shlex.join(list(args)), flush=True)
    response = subprocess.run(command, capture_output=True, text=True, timeout=30)
    print(response.stdout + response.stderr, end='', flush=True)
    if response.returncode and not optional:
        raise RuntimeError('CLI failed: ' + ' '.join(args[:2]))
    try:
        return json.loads(response.stdout)
    except ValueError:
        return None


def cleanup():
    if ids.get('mapping'):
        call('lambda', 'delete-event-source-mapping', '--uuid', ids['mapping'])
    if ids.get('function'):
        if ids.get('pc'):
            call('lambda', 'delete-provisioned-concurrency-config', '--function-name', ids['function'], '--qualifier', ids['version'])
        call('lambda', 'delete-function', '--function-name', ids['function'])
        groups = call('logs', 'describe-log-groups', '--log-group-name-prefix', '/aws/lambda/'+ids['function'])
        if any(g['logGroupName'] == '/aws/lambda/'+ids['function'] for g in groups.get('logGroups', [])):
            call('logs', 'delete-log-group', '--log-group-name', '/aws/lambda/'+ids['function'])
    for queue in ids.get('queues', []):
        call('sqs', 'delete-queue', '--queue-url', queue)
    for bucket in ids.get('buckets', []):
        call('s3api', 'delete-bucket', '--bucket', bucket)
    if ids.get('policy'):
        call('iam', 'delete-role-policy', '--role-name', ids['role'], '--policy-name', 'lab14')
    if ids.get('role'):
        call('iam', 'delete-role', '--role-name', ids['role'])
    call('lambda', 'list-functions', '--query', "Functions[?FunctionName=='"+ids.get('function', 'missing')+"'].FunctionName")
    buckets = ids.get('buckets', [])
    if buckets:
        call('s3api', 'list-buckets', '--query', "Buckets[?"+'||'.join("Name=='"+b+"'" for b in buckets)+'].Name')
    STATE.rename(LAB/'last-cleaned-resources.json')


def setup():
    if ids:
        raise SystemExit('Saved resources exist; cleanup before setup')
    ids.update(token='lab14-'+str(time.time_ns()), buckets=[], queues=[]); save()
    try:
        for suffix in ['source', 'thumbs']:
            bucket = ids['token']+'-'+suffix
            call('s3api', 'create-bucket', '--bucket', bucket, '--create-bucket-configuration', 'LocationConstraint=ap-south-1')
            ids['buckets'].append(bucket); save()
        for suffix in ['jobs', 'failures']:
            queue = call('sqs', 'create-queue', '--queue-name', ids['token']+'-'+suffix, '--attributes', 'VisibilityTimeout=120')['QueueUrl']
            ids['queues'].append(queue); save()
            ids[suffix+'Arn'] = call('sqs', 'get-queue-attributes', '--queue-url', queue, '--attribute-names', 'QueueArn')['Attributes']['QueueArn']; save()
        trust = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'lambda.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}
        role = ids['token']+'-role'
        arn = call('iam', 'create-role', '--role-name', role, '--assume-role-policy-document', json.dumps(trust))['Role']['Arn']
        ids['role'] = role; save()
        policy = {'Version': '2012-10-17', 'Statement': [
            {'Effect': 'Allow', 'Action': ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'], 'Resource': ids['jobsArn']},
            {'Effect': 'Allow', 'Action': 'sqs:SendMessage', 'Resource': ids['failuresArn']},
            {'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:GetObjectVersion'], 'Resource': 'arn:aws:s3:::'+ids['buckets'][0]+'/uploads/*'},
            {'Effect': 'Allow', 'Action': ['s3:PutObject', 's3:GetObject'], 'Resource': 'arn:aws:s3:::'+ids['buckets'][1]+'/thumbs/*'},
            {'Effect': 'Allow', 'Action': ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], 'Resource': 'arn:aws:logs:ap-south-1:123456789012:log-group:/aws/lambda/lab14-*:*'}]}
        call('iam', 'put-role-policy', '--role-name', role, '--policy-name', 'lab14', '--policy-document', json.dumps(policy)); ids['policy'] = True; save()
        with zipfile.ZipFile(LAB/'app.zip', 'w') as archive:
            archive.write(ROOT/'app.py', 'app.py')
        environment = {'Variables': {'SOURCE_BUCKET': ids['buckets'][0], 'OUTPUT_BUCKET': ids['buckets'][1], 'AWS_ENDPOINT_URL': 'http://127.0.0.1:4566'}}
        name = ids['token']+'-resize'
        call('lambda', 'create-function', '--function-name', name, '--runtime', 'python3.12', '--handler', 'app.handler', '--role', arn, '--zip-file', 'fileb://'+str(LAB/'app.zip'), '--memory-size', '128', '--timeout', '3', '--environment', json.dumps(environment))
        ids['function'] = name; save()
    except Exception:
        cleanup()
        raise


def exercises():
    if not ids.get('function'):
        raise SystemExit('Run setup first')
    name = ids['function']
    call('lambda', 'update-function-configuration', '--function-name', name, '--memory-size', '1024', '--timeout', '15')
    call('lambda', 'wait', 'function-updated-v2', '--function-name', name)
    call('lambda', 'get-function-configuration', '--function-name', name, '--query', '{Memory:MemorySize,Timeout:Timeout,Update:LastUpdateStatus}')
    call('lambda', 'put-function-concurrency', '--function-name', name, '--reserved-concurrent-executions', '10')
    call('lambda', 'put-function-event-invoke-config', '--function-name', name, '--maximum-retry-attempts', '2', '--maximum-event-age-in-seconds', '3600', '--destination-config', json.dumps({'OnFailure': {'Destination': ids['failuresArn']}}))
    mapping = call('lambda', 'create-event-source-mapping', '--function-name', name, '--event-source-arn', ids['jobsArn'], '--batch-size', '10', '--function-response-types', 'ReportBatchItemFailures', '--enabled')
    ids['mapping'] = mapping['UUID']; save()
    call('lambda', 'list-event-source-mappings', '--function-name', name)
    call('lambda', 'add-permission', '--function-name', name, '--statement-id', 'source-only', '--action', 'lambda:InvokeFunction', '--principal', 's3.amazonaws.com', '--source-account', '123456789012', '--source-arn', 'arn:aws:s3:::'+ids['buckets'][0])
    call('lambda', 'get-policy', '--function-name', name)
    # Empty queues and no bucket notifications: no automatic trigger invokes.
    metadata = call('lambda', 'invoke', '--function-name', name, '--payload', '{}', str(LAB/'invoke-body.txt'))
    print('Invoke metadata:', json.dumps(metadata))
    print('Invoke body:', (LAB/'invoke-body.txt').read_text())
    ids['version'] = call('lambda', 'publish-version', '--function-name', name)['Version']; save()
    pc = call('lambda', 'put-provisioned-concurrency-config', '--function-name', name, '--qualifier', ids['version'], '--provisioned-concurrent-executions', '1', optional=True)
    ids['pc'] = pc is not None; save()


if len(sys.argv) != 2 or sys.argv[1] not in ['setup', 'exercises', 'cleanup']:
    raise SystemExit('Usage: python -I lab.py setup|exercises|cleanup')
{'setup': setup, 'exercises': exercises, 'cleanup': cleanup}[sys.argv[1]]()
