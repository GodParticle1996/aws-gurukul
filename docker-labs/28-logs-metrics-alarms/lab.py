"""Lab28: logs, metric filters, Logs Insights aur alarms -- apne thodi der ke Moto server par.

Sirf local: ek naya 127.0.0.1 Moto server (OS ka diya port), dummy keys, lab ki apni config.
Asli AWS, shared 4566 server, Docker ya ~/.aws ko chhoota nahi. Har Moto ki kami "GAP" line mein likhi jaati hai;
jo cheez Moto nahi karta (p99, M-of-N, metric filter se metric) woh "HOST CHECK" mein Python se jaanchi jaati hai.
"""
import json, logging, math, os, socket, subprocess, time
from pathlib import Path
from moto.server import ThreadedMotoServer
import boto3
from botocore.exceptions import ClientError

APP = Path(__file__).resolve().parents[2]
RUN = APP / '.overhaul-evidence/lab28-runs' / ('run-' + str(time.time_ns()))
RUN.mkdir(parents=True)
for k in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN', 'AWS_ENDPOINT_URL']:
    os.environ.pop(k, None)
os.environ.update(AWS_ACCESS_KEY_ID='test', AWS_SECRET_ACCESS_KEY='test', AWS_DEFAULT_REGION='ap-south-1',
                  AWS_EC2_METADATA_DISABLED='true', AWS_SHARED_CREDENTIALS_FILE=str(RUN / 'credentials'),
                  AWS_CONFIG_FILE=str(RUN / 'config'), AWS_PAGER='', AWS_MAX_ATTEMPTS='1', AWS_RETRY_MODE='standard')
(RUN / 'credentials').write_text('[default]\naws_access_key_id = test\naws_secret_access_key = test\n')
(RUN / 'config').write_text('[default]\nregion = ap-south-1\noutput = json\n')
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)  # emulator ke 500 traceback chhupao; CLI exit code dikhta hai

server = ThreadedMotoServer(ip_address='127.0.0.1', port=0, verbose=False)
server.start()
host, port = server.get_host_and_port()
END = f'http://{host}:{port}'
TAG = 'lab28-' + str(time.time_ns())
G_CHECKOUT, G_PAYMENT, G_AUDIT = f'/{TAG}/checkout', f'/{TAG}/payment', f'/{TAG}/audit'
NS = 'ShopKaro/' + TAG
lg = boto3.client('logs', endpoint_url=END, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
cw = boto3.client('cloudwatch', endpoint_url=END, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
groups, alarms, checks = [], [], 0


def cli(service, *args, ok=True):
    """Asli AWS CLI, sirf apne endpoint par."""
    cmd = [str(APP / 'docker-labs/.venv/bin/aws'), '--endpoint-url', END, '--region', 'ap-south-1', service, *args]
    print('$ aws', service, *args, flush=True)
    r = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
    out = (r.stdout or '') + (r.stderr or '')
    if out.strip():
        print(out.strip()[:1500], flush=True)
    if ok and r.returncode:
        raise AssertionError('CLI exit ' + str(r.returncode))
    return r


def check(v, text):
    global checks
    assert v, text
    checks += 1
    print('PASS', checks, text, flush=True)


def level_error(msg):
    """HOST reference: JSON pattern { $.level = "ERROR" } ka matlab."""
    try:
        return json.loads(msg).get('level') == 'ERROR'
    except ValueError:
        return False


def p99(values):
    """Nearest-rank p99, jaise course ka model."""
    s = sorted(values)
    return s[max(0, math.ceil(0.99 * len(s)) - 1)]


try:
    print('OWNED MOTO', END, 'WORKDIR', RUN, flush=True)

    # ---------- ex1: retention ----------
    for g in (G_CHECKOUT, G_PAYMENT, G_AUDIT):
        lg.create_log_group(logGroupName=g)
        groups.append(g)
        lg.create_log_stream(logGroupName=g, logStreamName='app')
    lg.put_retention_policy(logGroupName=G_AUDIT, retentionInDays=365)
    before = {x['logGroupName']: x.get('retentionInDays') for x in lg.describe_log_groups(logGroupNamePrefix='/' + TAG)['logGroups']}
    print('RETENTION BEFORE', json.dumps(before), flush=True)
    check(before[G_CHECKOUT] is None and before[G_PAYMENT] is None, 'app log groups default mein never expire (retentionInDays nahi)')
    for g in (G_CHECKOUT, G_PAYMENT):
        cli('logs', 'put-retention-policy', '--log-group-name', g, '--retention-in-days', '30')
    cli('logs', 'describe-log-groups', '--log-group-name-prefix', '/' + TAG, '--query', 'logGroups[].{name:logGroupName,days:retentionInDays}')
    after = {x['logGroupName']: x.get('retentionInDays') for x in lg.describe_log_groups(logGroupNamePrefix='/' + TAG)['logGroups']}
    check(after[G_CHECKOUT] == 30 and after[G_PAYMENT] == 30 and after[G_AUDIT] == 365, 'app logs 30 din, audit 365 din waisa hi')
    probe = cli('logs', 'put-retention-policy', '--log-group-name', G_PAYMENT, '--retention-in-days', '31', ok=False)
    got = lg.describe_log_groups(logGroupNamePrefix=G_PAYMENT)['logGroups'][0].get('retentionInDays')
    print('GAP Moto ne retention 31 maan li (exit', probe.returncode, ', ab', got, '); asli AWS 31 ko InvalidParameterException se rokta hai', flush=True)
    lg.put_retention_policy(logGroupName=G_PAYMENT, retentionInDays=30)

    # ---------- ex2: metric filter ----------
    now = int(time.time() * 1000)
    old = [
        {'timestamp': now - 120000, 'message': json.dumps({'level': 'ERROR', 'orderId': 'TEST-o-104', 'msg': 'payment call failed after retry'})},
        {'timestamp': now - 110000, 'message': json.dumps({'level': 'INFO', 'orderId': 'TEST-o-102', 'msg': 'retry budget ok; no ERROR seen'})},
    ]
    lg.put_log_events(logGroupName=G_CHECKOUT, logStreamName='app', logEvents=old)
    transform = 'metricName=CheckoutErrors,metricNamespace=' + NS + ',metricValue=1,defaultValue=0'
    cli('logs', 'put-metric-filter', '--log-group-name', G_CHECKOUT, '--filter-name', 'checkout-errors',
        '--filter-pattern', '{ $.level = "ERROR" }', '--metric-transformations', transform)
    cli('logs', 'describe-metric-filters', '--log-group-name', G_CHECKOUT)
    mf = lg.describe_metric_filters(logGroupName=G_CHECKOUT)['metricFilters']
    check(len(mf) == 1 and mf[0]['metricTransformations'][0]['defaultValue'] == 0, 'metric filter aur defaultValue 0 save hue')
    new = [
        {'timestamp': now - 60000, 'message': json.dumps({'level': 'ERROR', 'orderId': 'TEST-o-106', 'msg': 'payment call failed after retry'})},
        {'timestamp': now - 50000, 'message': json.dumps({'level': 'ERROR', 'orderId': 'TEST-o-107', 'msg': 'payment call failed after retry'})},
    ]
    lg.put_log_events(logGroupName=G_CHECKOUT, logStreamName='app', logEvents=new)
    time.sleep(1)
    metrics = cw.list_metrics(Namespace=NS)['Metrics']
    print('GAP metric filter ke baad list-metrics:', json.dumps(metrics), '-- Moto filter se metric nahi banata', flush=True)
    host_count = sum(1 for e in new if level_error(e['message']))
    print('HOST CHECK filter ke BAAD aaye ERROR-level events:', host_count, '(pehle ke events gine nahi jaate; asli CloudWatch bhi backfill nahi karta)', flush=True)
    check(host_count == 2 and not metrics, 'host reference 2 naye errors ginta hai; Moto metric nahi banata (gap pakda)')
    term = cli('logs', 'filter-log-events', '--log-group-name', G_CHECKOUT, '--filter-pattern', 'ERROR', '--query', 'events[].message')
    term_n = len(json.loads(term.stdout))
    js = lg.filter_log_events(logGroupName=G_CHECKOUT, filterPattern='{ $.level = "ERROR" }')['events']
    print('TERM PATTERN "ERROR" matches', term_n, '(INFO line "no ERROR seen" bhi gini gayi)', flush=True)
    print('GAP JSON pattern { $.level = "ERROR" } par Moto ne', len(js), 'events lautaye -- pattern ignore hua; asli AWS sirf 3 ERROR-level deta', flush=True)
    check(term_n == 4 and len(js) == 4, 'term pattern zyada ginta hai; Moto JSON pattern ignore karta hai (dono pakde)')

    # ---------- ex3: Logs Insights ----------
    pay = []
    for i, (gw, status) in enumerate([('card-beta', 'OK'), ('upi-alpha', 'TIMEOUT'), ('upi-alpha', 'OK'), ('upi-alpha', 'TIMEOUT'),
                                      ('upi-alpha', 'TIMEOUT'), ('card-beta', 'OK'), ('upi-alpha', 'TIMEOUT'), ('upi-alpha', 'TIMEOUT'), ('upi-alpha', 'TIMEOUT')]):
        pay.append({'timestamp': now - 300000 + i * 1000, 'message': json.dumps({'gateway': gw, 'status': status, 'latencyMs': 5000 if status == 'TIMEOUT' else 230})})
    lg.put_log_events(logGroupName=G_PAYMENT, logStreamName='app', logEvents=pay)
    qs = 'filter status = "TIMEOUT" | stats count(*) as timeouts by gateway'
    start = cli('logs', 'start-query', '--log-group-name', G_PAYMENT, '--start-time', str(now // 1000 - 3600),
                '--end-time', str(now // 1000 + 60), '--query-string', qs)
    qid = json.loads(start.stdout)['queryId']
    time.sleep(1)
    res = cli('logs', 'get-query-results', '--query-id', qid)
    rows = json.loads(res.stdout)['results']
    fields = sorted({f['field'] for r in rows for f in r})
    print('GAP Insights ne', len(rows), 'rows diye, fields', fields, '-- stats count(*) by gateway nahi gina', flush=True)
    by_gw = {}
    for e in pay:
        m = json.loads(e['message'])
        if m['status'] == 'TIMEOUT':
            by_gw[m['gateway']] = by_gw.get(m['gateway'], 0) + 1
    print('HOST CHECK timeouts by gateway:', json.dumps(by_gw), flush=True)
    check(by_gw == {'upi-alpha': 6} and 'timeouts' not in fields, 'host par upi-alpha 6 timeouts; Moto stats nahi chalata (gap pakda)')

    # ---------- ex4: average vs p99, alarms ----------
    base = time.time() - 600
    minutes = []
    for i in range(10):
        slow = i in (5, 7, 8)  # 10 mein se 3 dheeme minutes, aakhri 5 mein
        vals = [0.4] * 98 + [8.0, 8.0] if slow else [0.4] * 100
        minutes.append(vals)
        cw.put_metric_data(Namespace=NS, MetricData=[{'MetricName': 'CheckoutLatency', 'Timestamp': base + i * 60, 'Values': vals, 'Unit': 'Seconds'}])
    avg_all = round(sum(sum(v) for v in minutes) / sum(len(v) for v in minutes), 3)
    p99s = [p99(v) for v in minutes]
    last5 = p99s[-5:]
    breaches = sum(1 for v in last5 if v > 2)
    host_state = 'ALARM' if breaches >= 3 else 'OK'
    print('HOST CHECK average', avg_all, 's; har minute ka p99', p99s, '; aakhri 5 mein breach', breaches, '->', host_state, flush=True)
    check(avg_all < 1 and breaches == 3 and host_state == 'ALARM', 'average tail chhupata hai; p99 3/5 breach host par ALARM')
    t0 = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(base - 60))
    t1 = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(base + 660))
    st = cli('cloudwatch', 'get-metric-statistics', '--namespace', NS, '--metric-name', 'CheckoutLatency', '--start-time', t0,
             '--end-time', t1, '--period', '60', '--extended-statistics', 'p99')
    p99_points = [d for d in json.loads(st.stdout)['Datapoints'] if 'ExtendedStatistics' in d]
    print('GAP Moto ne p99 ki value', 'nahi di' if not p99_points else 'di', '(datapoints:', len(json.loads(st.stdout)['Datapoints']), ')', flush=True)
    av = cli('cloudwatch', 'get-metric-statistics', '--namespace', NS, '--metric-name', 'CheckoutLatency', '--start-time', t0,
             '--end-time', t1, '--period', '600', '--statistics', 'Average')
    moto_avg = [round(d['Average'], 3) for d in json.loads(av.stdout)['Datapoints']]
    print('MOTO Average', moto_avg, flush=True)
    check(not p99_points and moto_avg and abs(moto_avg[0] - avg_all) < 0.01, 'Moto Average host jaisa; p99 value Moto nahi deta (gap pakda)')

    cli('cloudwatch', 'put-metric-alarm', '--alarm-name', TAG + '-p99', '--namespace', NS, '--metric-name', 'CheckoutLatency',
        '--extended-statistic', 'p99', '--period', '60', '--evaluation-periods', '5', '--datapoints-to-alarm', '3', '--threshold', '2',
        '--comparison-operator', 'GreaterThanThreshold', '--treat-missing-data', 'missing')
    alarms.append(TAG + '-p99')
    cli('cloudwatch', 'put-metric-alarm', '--alarm-name', TAG + '-errors', '--namespace', NS, '--metric-name', 'CheckoutErrors',
        '--statistic', 'Sum', '--period', '60', '--evaluation-periods', '3', '--datapoints-to-alarm', '2', '--threshold', '5',
        '--comparison-operator', 'GreaterThanOrEqualToThreshold', '--treat-missing-data', 'notBreaching')
    alarms.append(TAG + '-errors')
    d = cw.describe_alarms(AlarmNames=[TAG + '-p99'])['MetricAlarms'][0]
    print('MOTO p99 alarm state', d['StateValue'], '| ExtendedStatistic', d.get('ExtendedStatistic'), '| DatapointsToAlarm', d.get('DatapointsToAlarm'), flush=True)
    print('GAP Moto alarm evaluate nahi karta: host reference', host_state, 'kehta hai, Moto', d['StateValue'], 'dikhata hai', flush=True)
    check(d.get('ExtendedStatistic') == 'p99' and d.get('DatapointsToAlarm') == 3 and d['StateValue'] != 'ALARM', 'alarm definition save; state Moto ne evaluate nahi ki (gap pakda)')

    cli('cloudwatch', 'set-alarm-state', '--alarm-name', TAG + '-p99', '--state-value', 'ALARM', '--state-reason', 'TEST notification route only')
    m = cw.describe_alarms(AlarmNames=[TAG + '-p99'])['MetricAlarms'][0]
    print('MANUAL STATE', m['StateValue'], '|', m['StateReason'], '-- yeh notification ka test hai, health ka saboot nahi', flush=True)
    check(m['StateValue'] == 'ALARM', 'set-alarm-state manual test dikhta hai')

    comp = cli('cloudwatch', 'put-composite-alarm', '--alarm-name', TAG + '-page', '--alarm-rule',
               'ALARM("' + TAG + '-p99") OR ALARM("' + TAG + '-errors")', ok=False)
    print('GAP put-composite-alarm exit', comp.returncode, '-- Moto 5.2.4 mein yeh API bana hi nahi (500)', flush=True)
    hist = cli('cloudwatch', 'describe-alarm-history', '--alarm-name', TAG + '-p99', ok=False)
    print('GAP describe-alarm-history exit', hist.returncode, '-- Moto mein nahi', flush=True)
    check(comp.returncode != 0 and hist.returncode != 0, 'composite alarm aur alarm history Moto mein nahi (dono pakde)')
    print('BEHAVIOR CHECKS', checks, flush=True)
finally:
    try:
        if alarms:
            cw.delete_alarms(AlarmNames=alarms)
        for g in groups:
            try:
                lg.delete_log_group(logGroupName=g)
            except ClientError as e:
                print('cleanup error', g, e, flush=True)
        left = {'alarms': [a['AlarmName'] for a in cw.describe_alarms(AlarmNamePrefix=TAG)['MetricAlarms']],
                'logGroups': [x['logGroupName'] for x in lg.describe_log_groups(logGroupNamePrefix='/' + TAG)['logGroups']]}
        print('CLEANUP READBACK', json.dumps(left), flush=True)
        check(not left['alarms'] and not left['logGroups'], 'apne alarms aur log groups saaf')
    finally:
        server.stop()
        server._server.server_close()
        try:
            with socket.create_connection((host, port), timeout=.5):
                raise AssertionError('listener still open')
        except OSError:
            pass
        print('OWNED MOTO STOPPED / LISTENER CLOSED', flush=True)
