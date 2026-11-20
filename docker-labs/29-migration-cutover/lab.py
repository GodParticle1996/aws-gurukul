"""Lab29: chhota asli migration -- SQLite "on-prem" se Moto DynamoDB, full load + CDC replay + validation + cutover.

Sirf local: apna 127.0.0.1 Moto server (OS ka port), dummy keys, lab ki apni config. Asli AWS, Docker, shared 4566
server ya ~/.aws nahi. Moto DMS sirf metadata rakhta hai; data ka kaam host par Python (sqlite3 + boto3) karta hai.
Har Moto kami "GAP" line mein likhi jaati hai. Sab data TEST hai.
"""
import hashlib, json, logging, os, socket, sqlite3, subprocess, time
from pathlib import Path
from moto.server import ThreadedMotoServer
import boto3
from botocore.exceptions import ClientError

APP = Path(__file__).resolve().parents[2]
RUN = APP / '.overhaul-evidence/lab29-runs' / ('run-' + str(time.time_ns()))
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
TAG = 'lab29-' + str(time.time_ns())
kw = dict(endpoint_url=END, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
ddb, s3, dms = boto3.client('dynamodb', **kw), boto3.client('s3', **kw), boto3.client('dms', **kw)
made = {'table': False, 'bucket': False, 'task': None, 'endpoints': [], 'instance': None}
checks = 0


def cli(service, *args, ok=True, show=True):
    cmd = [str(APP / 'docker-labs/.venv/bin/aws'), '--endpoint-url', END, '--region', 'ap-south-1', service, *args]
    print('$ aws', service, *args, flush=True)
    r = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
    out = (r.stdout or '') + (r.stderr or '')
    if show and out.strip():
        print(out.strip()[:1200], flush=True)
    if ok and r.returncode:
        raise AssertionError('CLI exit ' + str(r.returncode))
    return r


def check(v, text):
    global checks
    assert v, text
    checks += 1
    print('PASS', checks, text, flush=True)


def digest(row):
    """Har order ka checksum: same data = same hash, chahe kahin bhi ho."""
    return hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()


def target_rows():
    rows, start = {}, None
    while True:
        kw2 = {'TableName': TAG + '-orders'}
        if start:
            kw2['ExclusiveStartKey'] = start
        page = ddb.scan(**kw2)
        for it in page['Items']:
            r = {'id': int(it['id']['N']), 'customer': it['customer']['S'], 'total': int(it['total']['N']), 'status': it['status']['S']}
            rows[r['id']] = r
        start = page.get('LastEvaluatedKey')
        if not start:
            return rows


def put(r):
    ddb.put_item(TableName=TAG + '-orders', Item={'id': {'N': str(r['id'])}, 'customer': {'S': r['customer']}, 'total': {'N': str(r['total'])}, 'status': {'S': r['status']}})


try:
    print('OWNED MOTO', END, 'WORKDIR', RUN, flush=True)

    # ---------- on-prem source: SQLite + change log triggers ----------
    db = sqlite3.connect(RUN / 'onprem.db')
    db.executescript('''
      CREATE TABLE orders(id INTEGER PRIMARY KEY, customer TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE changes(lsn INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, id INTEGER NOT NULL);
      CREATE TRIGGER c_ins AFTER INSERT ON orders BEGIN INSERT INTO changes(op,id) VALUES('I',NEW.id); END;
      CREATE TRIGGER c_upd AFTER UPDATE ON orders BEGIN INSERT INTO changes(op,id) VALUES('U',NEW.id); END;
      CREATE TRIGGER c_del AFTER DELETE ON orders BEGIN INSERT INTO changes(op,id) VALUES('D',OLD.id); END;
    ''')
    db.executemany('INSERT INTO orders VALUES(?,?,?,?)', [(i, f'TEST-cust-{i % 97}', 100 + (i * 37) % 4900, 'PAID') for i in range(1, 1001)])
    db.commit()
    check(db.execute('SELECT COUNT(*) FROM orders').fetchone()[0] == 1000, 'source mein 1000 TEST orders, triggers change log likh rahe')

    # ---------- DMS metadata on Moto (asli CLI) ----------
    ri = json.loads(cli('dms', 'create-replication-instance', '--replication-instance-identifier', TAG + '-ri', '--replication-instance-class', 'dms.t3.medium',
                        '--allocated-storage', '50', '--no-publicly-accessible', '--query', 'ReplicationInstance.ReplicationInstanceArn', show=False).stdout)
    made['instance'] = ri
    src = json.loads(cli('dms', 'create-endpoint', '--endpoint-identifier', TAG + '-src', '--endpoint-type', 'source', '--engine-name', 'mysql',
                         '--server-name', '127.0.0.1', '--port', '3306', '--username', 'lab', '--password', 'TEST-only',
                         '--query', 'Endpoint.EndpointArn', show=False).stdout)
    tgt = json.loads(cli('dms', 'create-endpoint', '--endpoint-identifier', TAG + '-tgt', '--endpoint-type', 'target', '--engine-name', 'dynamodb',
                         '--service-access-role-arn', 'arn:aws:iam::123456789012:role/' + TAG + '-dms', '--query', 'Endpoint.EndpointArn', show=False).stdout)
    made['endpoints'] = [src, tgt]
    (RUN / 'mappings.json').write_text(json.dumps({'rules': [{'rule-type': 'selection', 'rule-id': '1', 'rule-name': 'orders', 'object-locator': {'schema-name': 'main', 'table-name': 'orders'}, 'rule-action': 'include'}]}))
    task = json.loads(cli('dms', 'create-replication-task', '--replication-task-identifier', TAG + '-task', '--source-endpoint-arn', src, '--target-endpoint-arn', tgt,
                          '--replication-instance-arn', ri, '--migration-type', 'full-load-and-cdc', '--table-mappings', 'file://' + str(RUN / 'mappings.json'),
                          '--query', 'ReplicationTask.ReplicationTaskArn', show=False).stdout)
    made['task'] = task
    cli('dms', 'start-replication-task', '--replication-task-arn', task, '--start-replication-task-type', 'start-replication', '--query', 'ReplicationTask.Status')
    st = cli('dms', 'describe-replication-tasks', '--filters', 'Name=replication-task-arn,Values=' + task, '--query', 'ReplicationTasks[0].[MigrationType,Status]')
    check('full-load-and-cdc' in st.stdout, 'Moto par DMS instance, endpoints aur full-load-and-cdc task ka metadata bana')
    ts = cli('dms', 'describe-table-statistics', '--replication-task-arn', task, ok=False, show=False)
    mt = cli('dms', 'modify-replication-task', '--replication-task-arn', task, '--migration-type', 'full-load', ok=False, show=False)
    print('GAP describe-table-statistics exit', ts.returncode, 'aur modify-replication-task exit', mt.returncode, '-- Moto DMS mein nahi (500); data bhi Moto DMS nahi chalata', flush=True)
    check(ts.returncode != 0 and mt.returncode != 0, 'Moto DMS ki statistics/modify kami pakdi')

    # ---------- full load (host) ----------
    ddb.create_table(TableName=TAG + '-orders', KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
                     AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'N'}], BillingMode='PAY_PER_REQUEST')
    made['table'] = True
    marker = db.execute('SELECT COALESCE(MAX(lsn),0) FROM changes').fetchone()[0]
    snapshot = [dict(zip(['id', 'customer', 'total', 'status'], r)) for r in db.execute('SELECT id,customer,total,status FROM orders ORDER BY id')]
    # load ke dauran app chalti rehti hai: naye orders, badlav aur ek delete
    db.executemany('INSERT INTO orders VALUES(?,?,?,?)', [(1000 + i, f'TEST-cust-new-{i}', 999, 'PAID') for i in range(1, 26)])
    db.execute("UPDATE orders SET status='REFUNDED' WHERE id IN (3, 7, 11)")
    db.execute('UPDATE orders SET total=total+1 WHERE id=500')
    db.execute('DELETE FROM orders WHERE id=999')
    db.commit()
    for r in snapshot:
        put(r)
    print('FULL LOAD rows', len(snapshot), '| load ke dauran source mein naye changes:', db.execute('SELECT COUNT(*) FROM changes WHERE lsn>?', (marker,)).fetchone()[0], flush=True)
    check(len(target_rows()) == 1000, 'full load: target mein 1000 rows (load shuru hone ke waqt ki copy)')
    src_now = {r[0]: dict(zip(['id', 'customer', 'total', 'status'], r)) for r in db.execute('SELECT id,customer,total,status FROM orders')}
    tgt_now = target_rows()
    diff = sum(1 for i in set(src_now) | set(tgt_now) if digest(src_now.get(i, {})) != digest(tgt_now.get(i, {})))
    print('VALIDATION after full load only: mismatched rows', diff, '(CDC ke bina naye changes chhoot gaye)', flush=True)
    check(diff == 30, 'sirf full load ke baad 30 rows alag (25 naye, 4 badle, 1 delete)')

    # ---------- CDC replay (host), idempotent ----------
    def replay(from_lsn):
        applied, last = 0, from_lsn
        for lsn, op, oid in db.execute('SELECT lsn,op,id FROM changes WHERE lsn>? ORDER BY lsn', (from_lsn,)).fetchall():
            row = db.execute('SELECT id,customer,total,status FROM orders WHERE id=?', (oid,)).fetchone()
            if op == 'D' or row is None:
                ddb.delete_item(TableName=TAG + '-orders', Key={'id': {'N': str(oid)}})
            else:
                put(dict(zip(['id', 'customer', 'total', 'status'], row)))
            applied, last = applied + 1, lsn
        return applied, last
    n1, last = replay(marker)
    n2, _ = replay(marker)  # dobara chalao: result wahi rehna chahiye
    tgt_now = target_rows()
    diff = sum(1 for i in set(src_now) | set(tgt_now) if digest(src_now.get(i, {})) != digest(tgt_now.get(i, {})))
    print('CDC REPLAY applied', n1, 'changes; dobara replay', n2, '; last LSN', last, '; mismatches', diff, flush=True)
    check(diff == 0 and len(tgt_now) == len(src_now) == 1024, 'CDC ke baad source aur target barabar (1024 rows, checksums match), replay idempotent')

    # ---------- cutover runbook ----------
    app = sqlite3.connect(f'file:{RUN / "onprem.db"}?mode=ro', uri=True)  # writes roko: app ab read-only connection se
    try:
        app.execute("INSERT INTO orders VALUES(5000,'TEST-late',1,'PAID')")
        frozen = False
    except sqlite3.OperationalError as e:
        frozen = 'readonly' in str(e)
    lag = db.execute('SELECT COUNT(*) FROM changes WHERE lsn>?', (last,)).fetchone()[0]
    print('CUTOVER writes rukein:', frozen, '| CDC lag (bache changes):', lag, flush=True)
    check(frozen and lag == 0, 'cutover: source par writes ruke aur CDC lag 0')
    src_fp = hashlib.sha256(''.join(digest(src_now[i]) for i in sorted(src_now)).encode()).hexdigest()
    tg = target_rows()
    tgt_fp = hashlib.sha256(''.join(digest(tg[i]) for i in sorted(tg)).encode()).hexdigest()
    print('FINAL VALIDATION source fingerprint', src_fp[:16], '| target fingerprint', tgt_fp[:16], flush=True)
    check(src_fp == tgt_fp, 'aakhri validation: poore table ka fingerprint same')
    (RUN / 'app-config.json').write_text(json.dumps({'orders_db': 'dynamodb:' + TAG + '-orders', 'rollback': 'onprem.db read-only, 14 din'}))
    cfg = json.loads((RUN / 'app-config.json').read_text())
    smoke = ddb.get_item(TableName=cfg['orders_db'].split(':', 1)[1], Key={'id': {'N': '1001'}})['Item']['customer']['S']
    print('SWITCH app-config ->', cfg['orders_db'], '| smoke test order 1001:', smoke, '| source rollback ke liye read-only bacha', flush=True)
    check(smoke == 'TEST-cust-new-1' and (RUN / 'onprem.db').exists(), 'app config switch, smoke test pass, source bacha (rollback)')

    # ---------- NAS folder -> S3, do baar sync ----------
    nas = RUN / 'nas'
    (nas / 'invoices').mkdir(parents=True)
    for i in range(3):
        (nas / 'invoices' / f'TEST-inv-{i}.txt').write_text(f'TEST invoice {i}\n')
    bucket = TAG + '-nas'
    cli('s3', 'mb', 's3://' + bucket)
    made['bucket'] = True
    first = cli('s3', 'sync', str(nas), 's3://' + bucket + '/nas/')
    (nas / 'invoices' / 'TEST-inv-1.txt').write_text('TEST invoice 1 (badla)\n')
    second = cli('s3', 'sync', str(nas), 's3://' + bucket + '/nas/')
    up1, up2 = first.stdout.count('upload:'), second.stdout.count('upload:')
    print('S3 SYNC pehli baar', up1, 'files; dusri baar', up2, 'file (sirf badli hui)', flush=True)
    check(up1 == 3 and up2 == 1, 's3 sync: pehli baar 3, dusri baar sirf badli 1 file')
    print('BEHAVIOR CHECKS', checks, flush=True)
finally:
    try:
        if made['table']:
            ddb.delete_table(TableName=TAG + '-orders')
        if made['bucket']:
            for o in s3.list_objects_v2(Bucket=TAG + '-nas').get('Contents', []):
                s3.delete_object(Bucket=TAG + '-nas', Key=o['Key'])
            s3.delete_bucket(Bucket=TAG + '-nas')
        if made['task']:
            dms.delete_replication_task(ReplicationTaskArn=made['task'])
        for ep in made['endpoints']:
            dms.delete_endpoint(EndpointArn=ep)
        if made['instance']:
            dms.delete_replication_instance(ReplicationInstanceArn=made['instance'])
        left = {'tables': [t for t in ddb.list_tables()['TableNames'] if t.startswith(TAG)],
                'buckets': [b['Name'] for b in s3.list_buckets()['Buckets'] if b['Name'].startswith(TAG)],
                'tasks': [t['ReplicationTaskIdentifier'] for t in dms.describe_replication_tasks()['ReplicationTasks'] if t['ReplicationTaskIdentifier'].startswith(TAG)],
                'endpoints': [e['EndpointIdentifier'] for e in dms.describe_endpoints()['Endpoints'] if e['EndpointIdentifier'].startswith(TAG)],
                'instances': [i['ReplicationInstanceIdentifier'] for i in dms.describe_replication_instances()['ReplicationInstances'] if i['ReplicationInstanceIdentifier'].startswith(TAG)]}
        print('CLEANUP READBACK', json.dumps(left), flush=True)
        check(not any(left.values()), 'apne table, bucket aur DMS resources saaf')
    finally:
        server.stop()
        server._server.server_close()
        try:
            with socket.create_connection((host, port), timeout=.5):
                raise AssertionError('listener still open')
        except OSError:
            pass
        print('OWNED MOTO STOPPED / LISTENER CLOSED', flush=True)
