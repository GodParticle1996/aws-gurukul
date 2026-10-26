"""Owned Moto SNS/SQS fan-out, poison redrive, FIFO and durable outbox-intent probe."""
import json
import logging
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import time

ROOT=Path(__file__).resolve().parent;LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
for key in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(key,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='ap-south-1',AWS_PAGER='',AWS_MAX_ATTEMPTS='1')
import boto3
from botocore.exceptions import ClientError
from moto.server import ThreadedMotoServer
AWS=shutil.which('aws')
if not AWS:raise SystemExit('Source docker-labs/env.sh for the existing CLI')
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}'
clients={s:boto3.client(s,endpoint_url=endpoint,region_name='ap-south-1',aws_access_key_id='test',aws_secret_access_key='test') for s in ['sns','sqs','dynamodb']}
sns,sqs,ddb=(clients[s] for s in ['sns','sqs','dynamodb'])
token='lab17-'+str(time.time_ns());ids={'queues':[],'topics':[],'subscriptions':[],'tables':[]};checks=0

def check(value,message):
 global checks
 assert value,message;checks+=1

def cli(service,operation,*args,optional=False):
 command=[AWS,'--endpoint-url',endpoint,'--region','ap-south-1',service,operation,*args,'--output','json']
 print('$ aws --endpoint-url '+endpoint+' '+shlex.join([service,operation,*args]),flush=True)
 r=subprocess.run(command,capture_output=True,text=True,timeout=30);print(r.stdout+r.stderr,end='',flush=True)
 if r.returncode:
  if optional:return None
  raise RuntimeError('CLI failed '+service+' '+operation)
 return json.loads(r.stdout) if r.stdout.strip() else {}

def make_queue(suffix,attributes=None):
 name=token+'-'+suffix
 q=cli('sqs','create-queue','--queue-name',name,'--attributes',json.dumps(attributes or {}))['QueueUrl'];ids['queues'].append(q)
 arn=cli('sqs','get-queue-attributes','--queue-url',q,'--attribute-names','QueueArn')['Attributes']['QueueArn']
 return q,arn

def policy(queue,arn,topic):
 doc={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'sns.amazonaws.com'},'Action':'sqs:SendMessage','Resource':arn,'Condition':{'ArnEquals':{'aws:SourceArn':topic}}}]}
 cli('sqs','set-queue-attributes','--queue-url',queue,'--attributes',json.dumps({'Policy':json.dumps(doc)}))

def receive(url,maximum=10,visibility=0):
 return sqs.receive_message(QueueUrl=url,MaxNumberOfMessages=maximum,VisibilityTimeout=visibility,WaitTimeSeconds=0,MessageSystemAttributeNames=['All'],MessageAttributeNames=['All']).get('Messages',[])

def delete(url,messages):
 for row in messages:sqs.delete_message(QueueUrl=url,ReceiptHandle=row['ReceiptHandle'])

class IdempotencyConflict(ValueError):pass

def outbox(consumer,message):
 event=json.loads(message['Body'])
 if not isinstance(event,dict) or event.get('type')!='OrderPlaced' or not isinstance(event.get('eventId'),str) or not isinstance(event.get('orderId'),str):raise ValueError('OrderPlaced requires eventId/orderId strings')
 intent=consumer+'#'+event['eventId'];payload=json.dumps(event,sort_keys=True,separators=(',',':'))
 item={'intentId':{'S':intent},'consumer':{'S':consumer},'orderId':{'S':event['orderId']},'payload':{'S':payload},'status':{'S':'pending-dispatch'}}
 try:
  ddb.put_item(TableName=ids['tables'][0],Item=item,ConditionExpression='attribute_not_exists(intentId)')
  return 'created'
 except ClientError as e:
  if e.response['Error']['Code']!='ConditionalCheckFailedException':raise
  old=ddb.get_item(TableName=ids['tables'][0],Key={'intentId':{'S':intent}},ConsistentRead=True).get('Item')
  if old!=item:raise IdempotencyConflict('eventId reused with conflicting durable intent; do not acknowledge')
  return 'duplicate'

try:
 print('OWNED MOTO '+endpoint,flush=True)
 dlq,dlqarn=make_queue('dead',{'MessageRetentionPeriod':'604800'})
 attributes={'VisibilityTimeout':'120','ReceiveMessageWaitTimeSeconds':'20','RedrivePolicy':json.dumps({'deadLetterTargetArn':dlqarn,'maxReceiveCount':'3'})}
 email,emailarn=make_queue('email',attributes);invoice,invoicearn=make_queue('invoice',attributes)
 topic=cli('sns','create-topic','--name',token+'-orders')['TopicArn'];ids['topics'].append(topic)
 subs=[]
 for arn in [emailarn,invoicearn]:
  sub=cli('sns','subscribe','--topic-arn',topic,'--protocol','sqs','--notification-endpoint',arn,'--attributes','{"RawMessageDelivery":"true"}')['SubscriptionArn'];ids['subscriptions'].append(sub);subs.append(sub)
 probe={'type':'OrderPlaced','eventId':'policy-probe','orderId':'order-probe','total':499}
 cli('sns','publish','--topic-arn',topic,'--message',json.dumps(probe))
 before_policy=[len(receive(q)) for q in [email,invoice]]
 print('POLICY PROBE',json.dumps({'receivedWithoutQueuePolicy':before_policy,'motoGapIfNonzero':True}),flush=True)
 for q in [email,invoice]:cli('sqs','purge-queue','--queue-url',q)
 policy(email,emailarn,topic);policy(invoice,invoicearn,topic)
 for sub in subs:
  cli('sns','set-subscription-attributes','--subscription-arn',sub,'--attribute-name','FilterPolicyScope','--attribute-value','MessageBody')
  cli('sns','set-subscription-attributes','--subscription-arn',sub,'--attribute-name','FilterPolicy','--attribute-value','{"type":["OrderPlaced"]}')
  cli('sns','get-subscription-attributes','--subscription-arn',sub,'--query','Attributes.{Raw:RawMessageDelivery,Scope:FilterPolicyScope,Filter:FilterPolicy}')
 table=token+'-outbox'
 cli('dynamodb','create-table','--table-name',table,'--attribute-definitions','AttributeName=intentId,AttributeType=S','--key-schema','AttributeName=intentId,KeyType=HASH','--billing-mode','PAY_PER_REQUEST','--query','TableDescription.TableName');ids['tables'].append(table)
 event={'type':'OrderPlaced','eventId':'evt-101','orderId':'order-101','total':499}
 cli('sns','publish','--topic-arn',topic,'--message',json.dumps({'type':'OrderCancelled','eventId':'cancel-1','orderId':'order-101'}))
 check(not receive(email) and not receive(invoice),'body filter excludes cancelled event')
 for _ in range(2):cli('sns','publish','--topic-arn',topic,'--message',json.dumps(event))
 counts={};outcomes={'created':0,'duplicate':0}
 for consumer,q in [('email',email),('invoice',invoice)]:
  rows=receive(q,visibility=30);counts[consumer]=len(rows);check(len(rows)==2,'two Standard copies demonstrate duplicate input '+consumer)
  for row in rows:
   check(json.loads(row['Body'])==event,'raw body actual event '+consumer)
   outcomes[outbox(consumer,row)]+=1
   sqs.delete_message(QueueUrl=q,ReceiptHandle=row['ReceiptHandle'])
  check(not receive(q),'ack only after durable intent and verification '+consumer)
 actual=ddb.scan(TableName=table,ConsistentRead=True)['Items'];check(len(actual)==2 and outcomes=={'created':2,'duplicate':2},'independent consumers each create one durable intent despite duplicates')
 print('DURABLE INTENTS',json.dumps({'received':counts,'outboxRows':len(actual),**outcomes,'externalEmailsSent':0}),flush=True)
 # Conflict is a realistic poison event: a repeated ID now claims a different total.
 conflict={**event,'total':0}
 cli('sqs','send-message','--queue-url',email,'--message-body',json.dumps(conflict))
 receive_counts=[];conflicts=0
 for _ in range(6):
  rows=receive(email,maximum=1,visibility=0)
  if not rows:break
  row=rows[0];receive_counts.append(row['Attributes']['ApproximateReceiveCount'])
  try:outbox('email',row)
  except IdempotencyConflict as e:conflicts+=1;print('EXPECTED',str(e),flush=True)
  else:raise AssertionError('conflicting event ID was accepted')
 dead=receive(dlq,maximum=1,visibility=0)
 check(len(dead)==1 and json.loads(dead[0]['Body'])==conflict,'actual conflicting body moved into DLQ')
 check(receive_counts==['1','2','3'] and conflicts==3,'maxReceiveCount3 then actual redrive')
 check(ddb.scan(TableName=table,ConsistentRead=True)['Items']==actual,'conflict never overwrites durable intent')
 print('POISON',json.dumps({'sourceReceiveCounts':receive_counts,'dlqBody':json.loads(dead[0]['Body']),'dlqAttributes':dead[0].get('Attributes',{}),'outboxUnchanged':True}),flush=True)
 delete(dlq,dead)
 fifo,fifoarn=make_queue('ordered.fifo',{'FifoQueue':'true','ContentBasedDeduplication':'true'})
 sends=[('evt-a1','customer-a'),('evt-a1','customer-a'),('evt-a2','customer-a'),('evt-b1','customer-b')]
 for body,group in sends:cli('sqs','send-message','--queue-url',fifo,'--message-body',body,'--message-group-id',group,'--message-deduplication-id',body)
 first=receive(fifo,maximum=1,visibility=30);check(len(first)==1 and first[0]['Body']=='evt-a1','FIFO first group event')
 other=receive(fifo,visibility=30)
 print('FIFO INFLIGHT',json.dumps({'first':[r['Body'] for r in first],'otherGroupsWhileAInFlight':[r['Body'] for r in other]}),flush=True)
 check([r['Body'] for r in other]==['evt-b1'],'same group blocks while another group can proceed')
 delete(fifo,first);delete(fifo,other)
 second=receive(fifo,visibility=30);check([r['Body'] for r in second]==['evt-a2'],'same group resumes in order and duplicate send was suppressed');delete(fifo,second)
 cli('sqs','send-message','--queue-url',fifo,'--message-body','evt-a1','--message-group-id','customer-a','--message-deduplication-id','evt-a1')
 after_delete=receive(fifo);print('FIFO DEDUP AFTER DELETE',json.dumps({'messages':[r['Body'] for r in after_delete]}),flush=True)
 # AWS keeps the dedup ID for five minutes even after deletion. Moto loses it.
 print('MOTO GAP',json.dumps({'dedupAfterDeleteBroken':bool(after_delete),'awsContract':'same dedup ID suppressed for five minutes even after delete'}),flush=True)
 delete(fifo,after_delete)
 fifo_topic=cli('sns','create-topic','--name',token+'-fanout.fifo','--attributes','{"FifoTopic":"true","ContentBasedDeduplication":"true"}')['TopicArn'];ids['topics'].append(fifo_topic)
 for q,arn in [(fifo,fifoarn),(invoice,invoicearn)]:
  policy(q,arn,fifo_topic)
  sub=cli('sns','subscribe','--topic-arn',fifo_topic,'--protocol','sqs','--notification-endpoint',arn,'--attributes','{"RawMessageDelivery":"true"}')['SubscriptionArn'];ids['subscriptions'].append(sub)
 for _ in range(2):cli('sns','publish','--topic-arn',fifo_topic,'--message','fifo-fanout','--message-group-id','customer-f','--message-deduplication-id','sns-fifo-1')
 got_fifo=receive(fifo);got_standard=receive(invoice)
 print('SNS FIFO SUBSCRIBERS',json.dumps({'fifo':[r['Body'] for r in got_fifo],'standard':[r['Body'] for r in got_standard]}),flush=True)
 check([r['Body'] for r in got_fifo]==['fifo-fanout'] and all(r['Body']=='fifo-fanout' for r in got_standard) and got_standard,'FIFO topic supports both queue types; Standard remains at-least-once')
 print('MOTO OBSERVATION duplicate FIFO-topic publishes reached Standard twice; no exactly-once business guarantee',flush=True)
 delete(fifo,got_fifo);delete(invoice,got_standard)
 cli('sqs','send-message','--queue-url',invoice,'--message-body','fair-probe','--message-group-id','tenant-1',optional=True)
 fair=receive(invoice);print('STANDARD GROUP PROBE',json.dumps({'received':[r['Body'] for r in fair],'scope':'acceptance only, not fair-queue scheduling measurement'}),flush=True);delete(invoice,fair)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  for sub in ids['subscriptions']:cli('sns','unsubscribe','--subscription-arn',sub,optional=True)
  for topic in ids['topics']:cli('sns','delete-topic','--topic-arn',topic,optional=True)
  for q in ids['queues']:cli('sqs','delete-queue','--queue-url',q,optional=True)
  for table in ids['tables']:cli('dynamodb','delete-table','--table-name',table,'--query','TableDescription.TableName',optional=True)
  queues=sqs.list_queues().get('QueueUrls',[]);topics=sns.list_topics()['Topics'];tables=ddb.list_tables()['TableNames']
  check(not queues and not topics and not tables,'all owned application resources gone')
  print('OWNED RESOURCES',json.dumps({'queues':queues,'topics':topics,'tables':tables}),flush=True)
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('owned listener still open')
  except OSError:pass
  (LAB/'last-run.json').write_text(json.dumps({'endpoint':endpoint,'listenerClosed':True,'checks':checks,'resources':ids},indent=2))
  print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
