"""Lab30: chhota data lake -- Firehose se raw, host ETL se dt= partitions, Glue catalog, Athena workgroup.

Sirf local: apna 127.0.0.1 Moto server (OS ka port), dummy keys, lab ki apni config. Asli AWS, Docker, shared 4566
server ya ~/.aws nahi. Moto Glue catalog rakhta hai, par crawler kuch nahi dhoondhta aur Athena SQL nahi chalata;
woh hisse "GAP" mein likhe hain aur jawaab/scan "HOST CHECK" mein Python se nikaale jaate hain. Sab data TEST hai.
"""
import csv, io, json, logging, os, socket, subprocess, time
from pathlib import Path
from moto.server import ThreadedMotoServer
import boto3
from botocore.exceptions import ClientError

APP = Path(__file__).resolve().parents[2]
RUN = APP / '.overhaul-evidence/lab30-runs' / ('run-' + str(time.time_ns()))
RUN.mkdir(parents=True)
for k in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN', 'AWS_ENDPOINT_URL']:
    os.environ.pop(k, None)
os.environ.update(AWS_ACCESS_KEY_ID='test', AWS_SECRET_ACCESS_KEY='test', AWS_DEFAULT_REGION='ap-south-1',
                  AWS_EC2_METADATA_DISABLED='true', AWS_SHARED_CREDENTIALS_FILE=str(RUN / 'credentials'),
                  AWS_CONFIG_FILE=str(RUN / 'config'), AWS_PAGER='', AWS_MAX_ATTEMPTS='1', AWS_RETRY_MODE='standard')
(RUN / 'credentials').write_text('[default]\naws_access_key_id = test\naws_secret_access_key = test\n')
(RUN / 'config').write_text('[default]\nregion = ap-south-1\noutput = json\n')
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)

server = ThreadedMotoServer(ip_address='127.0.0.1', port=0, verbose=False)
server.start()
host, port = server.get_host_and_port()
END = f'http://{host}:{port}'
TAG = 'lab30-' + str(time.time_ns())
BUCKET, DB = TAG + '-lake', 'lake_' + TAG.replace('-', '_')
kw = dict(endpoint_url=END, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
s3, glue, ath, fh, iam = (boto3.client(x, **kw) for x in ('s3', 'glue', 'athena', 'firehose', 'iam'))
made = {'bucket': False, 'stream': False, 'role': False, 'db': False, 'crawler': False, 'wg': False}
checks = 0
DAYS = ['2026-11-17', '2026-11-18', '2026-11-19']


def cli(service, *args, ok=True, show=True):
    cmd = [str(APP / 'docker-labs/.venv/bin/aws'), '--endpoint-url', END, '--region', 'ap-south-1', service, *args]
    print('$ aws', service, *args, flush=True)
    r = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
    out = (r.stdout or '') + (r.stderr or '')
    if show and out.strip():
        print(out.strip()[:900], flush=True)
    if ok and r.returncode:
        raise AssertionError('CLI exit ' + str(r.returncode))
    return r


def check(v, text):
    global checks
    assert v, text
    checks += 1
    print('PASS', checks, text, flush=True)


try:
    print('OWNED MOTO', END, 'WORKDIR', RUN, flush=True)
    s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={'LocationConstraint': 'ap-south-1'})
    made['bucket'] = True

    # ---------- ex1: Firehose se raw zone ----------
    role = iam.create_role(RoleName=TAG + '-fh', AssumeRolePolicyDocument=json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'firehose.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}))['Role']['Arn']
    made['role'] = True
    dest = {'RoleARN': role, 'BucketARN': 'arn:aws:s3:::' + BUCKET, 'Prefix': 'raw/orders/dt=!{timestamp:yyyy-MM-dd}/', 'ErrorOutputPrefix': 'errors/!{firehose:error-output-type}/', 'BufferingHints': {'SizeInMBs': 64, 'IntervalInSeconds': 60}}
    (RUN / 'firehose-dest.json').write_text(json.dumps(dest))
    cli('firehose', 'create-delivery-stream', '--delivery-stream-name', TAG + '-orders', '--delivery-stream-type', 'DirectPut', '--extended-s3-destination-configuration', 'file://' + str(RUN / 'firehose-dest.json'))
    made['stream'] = True
    states, skus = ['RJ', 'MH', 'DL', 'KA'], ['kurta-blue', 'kurta-red', 'saree-silk']
    events = [{'order_id': i, 'dt': DAYS[i % 3], 'state': states[i % 4], 'sku': skus[(i // 2) % 3], 'qty': 1 + i % 3, 'customer_id': f'TEST-c-{i % 17}'} for i in range(60)]
    recs = [{'Data': (json.dumps(e) + '\n').encode()} for e in events] + [{'Data': b'TEST-not-json\n'}]
    r = fh.put_record_batch(DeliveryStreamName=TAG + '-orders', Records=recs)
    time.sleep(1)
    keys = [o['Key'] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix='raw/').get('Contents', [])]
    print('RAW OBJECTS', keys, flush=True)
    check(r['FailedPutCount'] == 0 and len(keys) >= 1, 'Firehose ne 61 TEST records raw zone mein pahunchaye')
    print('GAP Firehose prefix literal raha:', '!{timestamp' in keys[0], '-- asli Firehose !{timestamp:yyyy-MM-dd} ko date mein badalta hai', flush=True)

    # ---------- ex2: host ETL -> curated dt= partitions ----------
    raw_bytes = 0
    good, bad = [], 0
    for k in keys:
        body = s3.get_object(Bucket=BUCKET, Key=k)['Body'].read()
        raw_bytes += len(body)
        for line in body.decode().splitlines():
            try:
                good.append(json.loads(line))
            except ValueError:
                bad += 1
    try:
        import pyarrow  # noqa: F401
        parquet = True
    except ImportError:
        parquet = False
    sizes = {}
    for d in DAYS:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(['order_id', 'state', 'sku', 'qty', 'customer_id'])
        for e in good:
            if e['dt'] == d:
                w.writerow([e['order_id'], e['state'], e['sku'], e['qty'], e['customer_id']])
        data = buf.getvalue().encode()
        sizes[d] = len(data)
        s3.put_object(Bucket=BUCKET, Key=f'curated/orders/dt={d}/part-0.csv', Body=data)
    print('ETL good rows', len(good), '| bad rows hataye', bad, '| curated partitions', json.dumps(sizes), flush=True)
    print('GAP Parquet library (pyarrow) installed:', parquet, '-- curated zone CSV mein; asli lake mein Parquet column bhi chhodta', flush=True)
    check(len(good) == 60 and bad == 1 and sum(sizes.values()) > 0, 'ETL ne 1 kharab row hataya aur 3 dt= partitions likhe')

    # ---------- ex3: Glue catalog ----------
    cli('glue', 'create-database', '--database-input', 'Name=' + DB)
    made['db'] = True
    table = {'Name': 'orders', 'PartitionKeys': [{'Name': 'dt', 'Type': 'string'}], 'StorageDescriptor': {'Columns': [{'Name': c, 'Type': t} for c, t in [('order_id', 'bigint'), ('state', 'string'), ('sku', 'string'), ('qty', 'bigint'), ('customer_id', 'string')]], 'Location': f's3://{BUCKET}/curated/orders/', 'InputFormat': 'org.apache.hadoop.mapred.TextInputFormat', 'OutputFormat': 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat', 'SerdeInfo': {'SerializationLibrary': 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe', 'Parameters': {'field.delim': ','}}}, 'Parameters': {'classification': 'csv', 'skip.header.line.count': '1'}}
    (RUN / 'table.json').write_text(json.dumps(table))
    cli('glue', 'create-table', '--database-name', DB, '--table-input', 'file://' + str(RUN / 'table.json'))
    parts = [{'Values': [d], 'StorageDescriptor': {**table['StorageDescriptor'], 'Location': f's3://{BUCKET}/curated/orders/dt={d}/'}} for d in DAYS[:2]]
    (RUN / 'parts.json').write_text(json.dumps(parts))
    cli('glue', 'batch-create-partition', '--database-name', DB, '--table-name', 'orders', '--partition-input-list', 'file://' + str(RUN / 'parts.json'))
    got = [p['Values'][0] for p in glue.get_partitions(DatabaseName=DB, TableName='orders')['Partitions']]
    print('CATALOG partitions', sorted(got), '| S3 mein', DAYS, flush=True)
    check(sorted(got) == DAYS[:2], 'catalog mein sirf 2 partitions; teesra din S3 mein hai par catalog mein nahi')
    cli('glue', 'create-crawler', '--name', TAG + '-cr', '--role', role, '--database-name', DB, '--targets', json.dumps({'S3Targets': [{'Path': f's3://{BUCKET}/curated/orders/'}]}))
    made['crawler'] = True
    cli('glue', 'start-crawler', '--name', TAG + '-cr')
    time.sleep(1)
    st = glue.get_crawler(Name=TAG + '-cr')['Crawler']['State']
    got2 = [p['Values'][0] for p in glue.get_partitions(DatabaseName=DB, TableName='orders')['Partitions']]
    print('GAP crawler state', st, '| partitions abhi bhi', sorted(got2), '-- Moto crawler S3 nahi padhta; asli crawler teesra din jod deta', flush=True)
    glue.batch_create_partition(DatabaseName=DB, TableName='orders', PartitionInputList=[{'Values': [DAYS[2]], 'StorageDescriptor': {**table['StorageDescriptor'], 'Location': f's3://{BUCKET}/curated/orders/dt={DAYS[2]}/'}}])
    got3 = [p['Values'][0] for p in glue.get_partitions(DatabaseName=DB, TableName='orders')['Partitions']]
    check(st in ('RUNNING', 'STOPPING', 'READY') and sorted(got3) == DAYS, 'crawler ki kami pakdi; teesra partition haath se (batch-create-partition) joda')

    # ---------- ex4: Athena workgroup + query ----------
    wg = {'ResultConfiguration': {'OutputLocation': f's3://{BUCKET}/athena-results/'}, 'EnforceWorkGroupConfiguration': True, 'BytesScannedCutoffPerQuery': 10485760}
    (RUN / 'wg.json').write_text(json.dumps(wg))
    cli('athena', 'create-work-group', '--name', TAG + '-analysts', '--configuration', 'file://' + str(RUN / 'wg.json'))
    made['wg'] = True
    conf = ath.get_work_group(WorkGroup=TAG + '-analysts')['WorkGroup']['Configuration']
    check(conf['EnforceWorkGroupConfiguration'] and conf['BytesScannedCutoffPerQuery'] == 10485760, 'workgroup: enforce + per-query scan limit 10 MB save')
    sql = f"SELECT state, sku, sum(qty) AS units FROM orders WHERE dt BETWEEN '{DAYS[1]}' AND '{DAYS[2]}' GROUP BY state, sku"
    qid = json.loads(cli('athena', 'start-query-execution', '--work-group', TAG + '-analysts', '--query-execution-context', 'Database=' + DB, '--query-string', sql).stdout)['QueryExecutionId']
    ex = ath.get_query_execution(QueryExecutionId=qid)['QueryExecution']
    res = ath.get_query_results(QueryExecutionId=qid)['ResultSet']['Rows']
    print('MOTO query state', ex['Status']['State'], '| result rows', len(res), '| DataScannedInBytes', ex.get('Statistics', {}).get('DataScannedInBytes'), flush=True)
    print('GAP Moto Athena SQL nahi chalata: SUCCEEDED par result khaali', flush=True)
    answer = {}
    for e in good:
        if e['dt'] in DAYS[1:]:
            answer[(e['state'], e['sku'])] = answer.get((e['state'], e['sku']), 0) + e['qty']
    pruned = sizes[DAYS[1]] + sizes[DAYS[2]]
    full = sum(sizes.values())
    print('HOST CHECK jawaab', json.dumps({f'{k[0]}/{k[1]}': v for k, v in sorted(answer.items())}), flush=True)
    print('HOST CHECK scan: bina partition', full, 'bytes | dt filter ke saath', pruned, 'bytes |', round(100 * (1 - pruned / full)), '% kam', flush=True)
    check(ex['Status']['State'] == 'SUCCEEDED' and len(res) == 0 and sum(answer.values()) > 0 and pruned < full, 'Moto ka khaali result pakda; host par jawaab aur partition pruning ka scan')
    print('BEHAVIOR CHECKS', checks, flush=True)
finally:
    try:
        if made['wg']:
            ath.delete_work_group(WorkGroup=TAG + '-analysts', RecursiveDeleteOption=True)
        if made['crawler']:
            try:
                glue.stop_crawler(Name=TAG + '-cr')
            except ClientError:
                pass
            glue.delete_crawler(Name=TAG + '-cr')
        if made['db']:
            glue.delete_database(Name=DB)
        if made['stream']:
            fh.delete_delivery_stream(DeliveryStreamName=TAG + '-orders')
        if made['role']:
            iam.delete_role(RoleName=TAG + '-fh')
        if made['bucket']:
            for o in s3.list_objects_v2(Bucket=BUCKET).get('Contents', []):
                s3.delete_object(Bucket=BUCKET, Key=o['Key'])
            s3.delete_bucket(Bucket=BUCKET)
        left = {'buckets': [b['Name'] for b in s3.list_buckets()['Buckets'] if b['Name'].startswith(TAG)],
                'databases': [d['Name'] for d in glue.get_databases()['DatabaseList'] if d['Name'] == DB],
                'crawlers': [c for c in glue.list_crawlers()['CrawlerNames'] if c.startswith(TAG)],
                'workgroups': [w['Name'] for w in ath.list_work_groups()['WorkGroups'] if w['Name'].startswith(TAG)],
                'streams': [s for s in fh.list_delivery_streams()['DeliveryStreamNames'] if s.startswith(TAG)]}
        print('CLEANUP READBACK', json.dumps(left), flush=True)
        check(not any(left.values()), 'apne bucket, catalog, crawler, workgroup aur stream saaf')
    finally:
        server.stop()
        server._server.server_close()
        try:
            with socket.create_connection((host, port), timeout=.5):
                raise AssertionError('listener still open')
        except OSError:
            pass
        print('OWNED MOTO STOPPED / LISTENER CLOSED', flush=True)
