"""Replay host reference phases against an owned Moto DynamoDB server; no external payment."""
import importlib.util,json,logging,os,socket,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent;LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
for key in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(key,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='ap-south-1')
import boto3
from moto.server import ThreadedMotoServer
spec=importlib.util.spec_from_file_location('lab18_saga',ROOT/'saga.py');saga=importlib.util.module_from_spec(spec);spec.loader.exec_module(saga)
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}'
ddb=boto3.client('dynamodb',endpoint_url=endpoint,region_name='ap-south-1',aws_access_key_id='test',aws_secret_access_key='test');prefix='lab18-'+str(time.time_ns());tables=[];checks=0

def check(ok,message):
 global checks
 assert ok,message;checks+=1

def stock_qty(n):ddb.put_item(TableName=stock,Item={'sku':{'S':'kurta'},'available':{'N':str(n)}})
def available():return int(ddb.get_item(TableName=stock,Key={'sku':{'S':'kurta'}},ConsistentRead=True)['Item']['available']['N'])
def order(name):return {'orderId':name,'sku':'kurta','amount':2500,'quantity':1}
def count(row,field):return int(row[field+'Count']['N'])
try:
 print('OWNED MOTO '+endpoint,flush=True)
 for suffix,key in [('ledger','orderId'),('stock','sku')]:
  table=prefix+'-'+suffix;ddb.create_table(TableName=table,KeySchema=[{'AttributeName':key,'KeyType':'HASH'}],AttributeDefinitions=[{'AttributeName':key,'AttributeType':'S'}],BillingMode='PAY_PER_REQUEST');tables.append(table)
 ledger,stock=tables
 stock_qty(0);failed=saga.run(ddb,ledger,stock,order('stock-failed'));check(failed['phase']['S']=='REFUNDED','stock failure compensates TEST ledger');check(available()==0,'failed stock update preserves actual0');check(count(failed,'capture')==count(failed,'refund')==1 and count(failed,'reserve')==0,'one capture/compensation, no reservation')
 for _ in range(8):check(saga.run(ddb,ledger,stock,order('stock-failed'))==failed,'replay does not recapture/refund again')
 stock_qty(3);ready=saga.run(ddb,ledger,stock,order('stock-ready'));check(ready['phase']['S']=='READY' and available()==2,'stock+READY committed together');check(count(ready,'capture')==count(ready,'reserve')==1 and count(ready,'refund')==0,'ready counters actual')
 for _ in range(5):check(saga.run(ddb,ledger,stock,order('stock-ready'))==ready and available()==2,'READY replay never reserves twice')
 stock_qty(0)
 try:saga.run(ddb,ledger,stock,order('capture-interrupted'),interrupt='after-capture')
 except saga.Interrupted:pass
 else:raise AssertionError('crash not injected')
 partial=saga.read(ddb,ledger,'capture-interrupted');check(partial['phase']['S']=='CAPTURED' and count(partial,'capture')==1,'capture survives host interruption')
 recovered=saga.run(ddb,ledger,stock,order('capture-interrupted'));check(recovered['phase']['S']=='REFUNDED' and count(recovered,'capture')==count(recovered,'refund')==1,'resume compensates without recapture')
 stock_qty(2)
 try:saga.run(ddb,ledger,stock,order('reserve-interrupted'),interrupt='after-reserve')
 except saga.Interrupted:pass
 else:raise AssertionError('crash not injected')
 check(available()==1 and saga.read(ddb,ledger,'reserve-interrupted')['phase']['S']=='READY','atomic READY persists despite caller interruption')
 resumed=saga.run(ddb,ledger,stock,order('reserve-interrupted'));check(available()==1 and count(resumed,'reserve')==1,'resume does not reserve again')
 stock_qty(0)
 try:saga.run(ddb,ledger,stock,order('refund-outage'),refund_unavailable=True)
 except saga.RefundUnavailable:pass
 else:raise AssertionError('outage not injected')
 pending=saga.read(ddb,ledger,'refund-outage');check(pending['phase']['S']=='CAPTURED' and available()==0,'refund outage stays unresolved, not falsely completed')
 retried=saga.run(ddb,ledger,stock,order('refund-outage'));check(retried['phase']['S']=='REFUNDED' and count(retried,'capture')==1 and count(retried,'refund')==1,'monitored retry recovers same durable intent')
 try:saga.run(ddb,ledger,stock,{**order('stock-failed'),'amount':1})
 except saga.IntentConflict:pass
 else:raise AssertionError('payload conflict accepted')
 check(saga.read(ddb,ledger,'stock-failed')==failed,'conflicting payload cannot overwrite original')
 for malformed in [None,{},order('bad')|{'amount':True},order('bad')|{'quantity':0},order('bad')|{'amount':'2500'},order('bad')|{'sku':''}]:
  try:saga.run(ddb,ledger,stock,malformed)
  except ValueError:checks+=1
  else:raise AssertionError('bad input accepted')
 rows=ddb.scan(TableName=ledger,ConsistentRead=True)['Items'];check(len(rows)==5,'only five owned valid orders exist')
 print(json.dumps({'checks':checks,'failed':{'phase':failed['phase']['S'],'captures':count(failed,'capture'),'refunds':count(failed,'refund')},'ready':{'phase':ready['phase']['S'],'captures':count(ready,'capture'),'reserves':count(ready,'reserve')},'captureResume':recovered['phase']['S'],'reserveResumeCount':count(resumed,'reserve'),'refundOutageRecovery':retried['phase']['S'],'externalPayments':0,'scope':'host reference + actual local DynamoDB; not Step Functions ASL runtime'},sort_keys=True),flush=True)
finally:
 try:
  for table in tables:ddb.delete_table(TableName=table)
  left=ddb.list_tables()['TableNames'];check(not left,'owned tables removed');print('OWNED TABLES '+json.dumps(left),flush=True)
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('owned listener still open')
  except OSError:pass
  (LAB/'saga-last-run.json').write_text(json.dumps({'endpoint':endpoint,'listenerClosed':True,'checks':checks,'tables':tables},indent=2));print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
