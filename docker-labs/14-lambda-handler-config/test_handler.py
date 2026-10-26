"""Real host-Python execution against two owned loopback Moto buckets; always cleanup."""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import time
from urllib.parse import quote_plus
import xml.etree.ElementTree as ET
import boto3

ROOT = Path(__file__).parent
(ROOT / '.lab').mkdir(exist_ok=True)
for key in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN']:
    os.environ.pop(key, None)
os.environ.update(AWS_ACCESS_KEY_ID='test', AWS_SECRET_ACCESS_KEY='test', AWS_DEFAULT_REGION='ap-south-1', AWS_ENDPOINT_URL='http://127.0.0.1:4566', AWS_SHARED_CREDENTIALS_FILE=str(ROOT/'.lab/credentials'), AWS_CONFIG_FILE=str(ROOT/'.lab/config'), AWS_EC2_METADATA_DISABLED='true')
spec = importlib.util.spec_from_file_location('app', ROOT/'app.py')
app = importlib.util.module_from_spec(spec); spec.loader.exec_module(app)
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:4566')
name = 'lab14-handler-' + str(time.time_ns())
created, checks = [], 0


def check(value, message):
    global checks
    assert value, message
    checks += 1


try:
    for suffix in ['source', 'thumbs']:
        bucket = name+'-'+suffix
        s3.create_bucket(Bucket=bucket, CreateBucketConfiguration={'LocationConstraint': 'ap-south-1'})
        created.append(bucket)
    source, output = created
    os.environ.update(SOURCE_BUCKET=source, OUTPUT_BUCKET=output)
    s3.put_bucket_versioning(Bucket=source, VersioningConfiguration={'Status': 'Enabled'})
    key = 'uploads/red kurta+.svg'
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="red"/></svg>'
    version = s3.put_object(Bucket=source, Key=key, Body=svg)['VersionId']
    event = {'Records': [{'eventSource': 'aws:s3', 's3': {'bucket': {'name': source}, 'object': {'key': quote_plus(key), 'versionId': version}}}]}
    first = app.handler(event, None)['results'][0]
    second = app.handler(event, None)['results'][0]
    check(first['written'] == 3, 'first event writes3 actual derivatives')
    check(second['written'] == 0 and second['duplicates'] == 3, 'duplicate adds no objects')
    contents = s3.list_objects_v2(Bucket=output)['Contents']
    check(len(contents) == 3, 'exact3 output keys')
    for item in contents:
        size = item['Key'].rsplit('/', 1)[-1].split('.')[0]
        root = ET.fromstring(s3.get_object(Bucket=output, Key=item['Key'])['Body'].read())
        check(root.get('width') == root.get('height') == size, 'actual dimensions match key')
    check(s3.get_object(Bucket=source, Key=key, VersionId=version)['Body'].read() == svg, 'original version bytes preserved')
    partial = app.handler({'Records': [{'eventSource': 'aws:sqs', 'messageId': 'good-1', 'body': json.dumps(event)}, {'eventSource': 'aws:sqs', 'messageId': 'bad-1', 'body': 'not-json'}]}, None)
    check(partial == {'batchItemFailures': [{'itemIdentifier': 'bad-1'}]}, 'only failed message reported')
    check(len(s3.list_objects_v2(Bucket=output)['Contents']) == 3, 'partial duplicate does not rewrite')
    new = s3.put_object(Bucket=source, Key=key, Body=svg.replace(b'red', b'blue'))['VersionId']
    next_event = json.loads(json.dumps(event)); next_event['Records'][0]['s3']['object']['versionId'] = new
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(lambda _: app.handler(next_event, None)['results'][0], range(4)))
    check(sum(x['written'] for x in rows) == 3 and sum(x['duplicates'] for x in rows) == 9, 'concurrent deliveries3 creates9 verified duplicates')
    check(len(s3.list_objects_v2(Bucket=output)['Contents']) == 6, 'two source versions6 outputs')
    check(app.handler(event, None)['results'][0]['duplicates'] == 3, 'stale event reads exact old version')
    for invalid in [None, {}, {'Records': [{'eventSource': 'aws:s3', 's3': None}]}, {'Records': [{'eventSource': 'aws:s3', 's3': {'bucket': {}, 'object': {'key': 4}}}]}, {'Records': [{'eventSource': 'aws:s3', 's3': {'bucket': {'name': source}, 'object': {'key': quote_plus(key)}}}]}]:
        try:
            app.handler(invalid, None)
        except ValueError:
            check(True, 'invalid event gives useful error')
        else:
            check(False, 'invalid event should fail')
    malformed = {'Records': [{'eventSource': 'aws:sqs', 'messageId': 'bad-'+str(i), 'body': body} for i, body in enumerate(['null', '[]', json.dumps({'Records': [{'eventSource': 'aws:s3', 's3': []}]})])]}
    check(app.handler(malformed, None) == {'batchItemFailures': [{'itemIdentifier': 'bad-'+str(i)} for i in range(3)]}, 'malformed bodies reported individually')
    s3.put_object(Bucket=output, Key=first['prefix']+'64.svg', Body=b'corrupt')
    try:
        app.handler(event, None)
    except ValueError as error:
        check('differs' in str(error), 'corrupt existing output rejected')
    else:
        check(False, 'corrupt derivative should fail')
    print(json.dumps({'checks': checks, 'first': {'written': first['written'], 'duplicates': first['duplicates']}, 'second': {'written': second['written'], 'duplicates': second['duplicates']}, 'partial': partial, 'concurrent': {'written': sum(x['written'] for x in rows), 'duplicates': sum(x['duplicates'] for x in rows)}, 'outputObjects': 6}, indent=2))
finally:
    for bucket in reversed(created):
        versions = s3.list_object_versions(Bucket=bucket)
        for item in versions.get('Versions', []) + versions.get('DeleteMarkers', []):
            s3.delete_object(Bucket=bucket, Key=item['Key'], VersionId=item['VersionId'])
        for item in s3.list_objects_v2(Bucket=bucket).get('Contents', []):
            s3.delete_object(Bucket=bucket, Key=item['Key'])
        s3.delete_bucket(Bucket=bucket)
    print('Scoped handler cleanup complete:', created)
