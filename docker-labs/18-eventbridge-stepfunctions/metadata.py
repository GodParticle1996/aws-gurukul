"""Owned Moto EventBridge Classic, Scheduler and Step Functions metadata probe."""
import json
import logging
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import time
import zipfile

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
clients={s:boto3.client(s,endpoint_url=endpoint,region_name='ap-south-1',aws_access_key_id='test',aws_secret_access_key='test') for s in ['events','sqs','iam','scheduler','stepfunctions','lambda']}
events,sqs,iam,scheduler,sfn,lambda_client=(clients[s] for s in ['events','sqs','iam','scheduler','stepfunctions','lambda'])
token='lab18-'+str(time.time_ns());ids={'queues':[],'rules':[],'roles':[],'schedules':[],'groups':[],'machines':[],'functions':[]};checks=0

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

def make_queue(suffix):
 q=cli('sqs','create-queue','--queue-name',token+'-'+suffix)['QueueUrl'];ids['queues'].append(q)
 arn=cli('sqs','get-queue-attributes','--queue-url',q,'--attribute-names','QueueArn')['Attributes']['QueueArn'];return q,arn

def receive(q):return sqs.receive_message(QueueUrl=q,MaxNumberOfMessages=10,VisibilityTimeout=0,WaitTimeSeconds=0,MessageSystemAttributeNames=['All']).get('Messages',[])

def policy(q,arn,rule):
 doc={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'events.amazonaws.com'},'Action':'sqs:SendMessage','Resource':arn,'Condition':{'ArnEquals':{'aws:SourceArn':rule}}}]}
 cli('sqs','set-queue-attributes','--queue-url',q,'--attributes',json.dumps({'Policy':json.dumps(doc)}))
try:
 print('OWNED MOTO '+endpoint,flush=True)
 work,workarn=make_queue('refunds');dead,deadarn=make_queue('dead')
 name=token+'-refund-requested'
 pattern={'source':['shop.orders'],'detail-type':['RefundRequested'],'detail':{'amount':[{'numeric':['>',1000]}],'currency':['INR'],'customerId':[{'prefix':'customer-'}],'environment':[{'anything-but':'test'}],'debugToken':[{'exists':False}]}}
 rule=cli('events','put-rule','--name',name,'--event-pattern',json.dumps(pattern),'--state','ENABLED')['RuleArn'];ids['rules'].append(name)
 target={'Id':'refund-queue','Arn':workarn,'RetryPolicy':{'MaximumRetryAttempts':3,'MaximumEventAgeInSeconds':3600},'DeadLetterConfig':{'Arn':deadarn}}
 cli('events','put-targets','--rule',name,'--targets',json.dumps([target]))
 target_read=cli('events','list-targets-by-rule','--rule',name)
 check(target_read['Targets']==[target],'target retry/DLQ metadata exact readback')
 detail={'orderId':'order-101','amount':2500,'currency':'INR','customerId':'customer-101','environment':'prod'}
 event={'id':'test-event','version':'0','account':'123456789012','region':'ap-south-1','time':'2026-10-26T00:00:00Z','resources':[],'source':'shop.orders','detail-type':'RefundRequested','detail':detail}
 variants=[('match',detail,True),('amount-boundary',{**detail,'amount':1000},False),('string-amount',{**detail,'amount':'2500'},False),('wrong-prefix',{**detail,'customerId':'guest-101'},False),('test-environment',{**detail,'environment':'test'},False),('debug-present',{**detail,'debugToken':False},False),('null-is-present',{**detail,'debugToken':None},False)]
 for label,value,expected in variants:
  response=cli('events','test-event-pattern','--event-pattern',json.dumps(pattern),'--event',json.dumps({**event,'detail':value}),optional=True)
  print('PATTERN PROBE',json.dumps({'case':label,'expected':expected,'actual':response}),flush=True)
  if response is not None and 'Result' in response:check(response['Result'] is expected,'pattern operator '+label)
  else:print('MOTO GAP TestEventPattern has no modeled Result; actual routing tested separately',flush=True)
 entry={'Source':'shop.orders','DetailType':'RefundRequested','Detail':json.dumps(detail)}
 cli('events','put-events','--entries',json.dumps([entry]))
 no_policy=receive(work);print('POLICY PROBE',json.dumps({'withoutQueuePolicy':len(no_policy),'motoGapIfNonzero':True}),flush=True)
 cli('sqs','purge-queue','--queue-url',work)
 policy(work,workarn,rule);policy(dead,deadarn,rule)
 for q in [work,dead]:
  actual=json.loads(cli('sqs','get-queue-attributes','--queue-url',q,'--attribute-names','Policy')['Attributes']['Policy']);check(actual['Statement'][0]['Condition']['ArnEquals']['aws:SourceArn']==rule,'scoped destination policy readback')
 entries=[{**entry,'Detail':json.dumps(value)} for _,value,_ in variants]
 cli('events','put-events','--entries',json.dumps(entries))
 delivered=receive(work);bodies=[json.loads(m['Body']) for m in delivered]
 print('ACTUAL ROUTING',json.dumps({'count':len(bodies),'details':[b.get('detail') for b in bodies]}),flush=True)
 check(len(bodies)==1 and bodies[0]['detail']==detail,'actual rule routes only complete matching event')
 for row in delivered:sqs.delete_message(QueueUrl=work,ReceiptHandle=row['ReceiptHandle'])
 group=token+'-reports';group_arn=cli('scheduler','create-schedule-group','--name',group)['ScheduleGroupArn'];ids['groups'].append(group)
 trust={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'scheduler.amazonaws.com'},'Action':'sts:AssumeRole','Condition':{'StringEquals':{'aws:SourceAccount':'123456789012','aws:SourceArn':group_arn}}}]}
 role_name=token+'-scheduler';role=cli('iam','create-role','--role-name',role_name,'--assume-role-policy-document',json.dumps(trust))['Role']['Arn'];ids['roles'].append(role_name)
 permissions={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':'sqs:SendMessage','Resource':[workarn,deadarn]}]}
 cli('iam','put-role-policy','--role-name',role_name,'--policy-name','deliver-report','--policy-document',json.dumps(permissions))
 scheduled={'Arn':workarn,'RoleArn':role,'Input':'{"job":"nightly-report"}','RetryPolicy':{'MaximumRetryAttempts':3,'MaximumEventAgeInSeconds':3600},'DeadLetterConfig':{'Arn':deadarn}}
 schedule=token+'-nightly';cli('scheduler','create-schedule','--name',schedule,'--group-name',group,'--schedule-expression','cron(0 3 * * ? *)','--schedule-expression-timezone','Asia/Kolkata','--flexible-time-window','{"Mode":"OFF"}','--target',json.dumps(scheduled));ids['schedules'].append(schedule)
 read_schedule=cli('scheduler','get-schedule','--name',schedule,'--group-name',group)
 check(read_schedule['ScheduleExpression']=='cron(0 3 * * ? *)' and read_schedule['ScheduleExpressionTimezone']=='Asia/Kolkata' and read_schedule['FlexibleTimeWindow']=={'Mode':'OFF'} and read_schedule['Target']==scheduled and read_schedule['State']=='ENABLED','nightly schedule target/timezone/retry/DLQ metadata')
 read_role=cli('iam','get-role','--role-name',role_name)['Role'];check(read_role['AssumeRolePolicyDocument']==trust,'scheduler trust scoped to schedule GROUP, not schedule ARN')
 lambda_role_name=token+'-lambda';lambda_role=cli('iam','create-role','--role-name',lambda_role_name,'--assume-role-policy-document','{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}')['Role']['Arn'];ids['roles'].append(lambda_role_name)
 archive=LAB/'function.zip'
 with zipfile.ZipFile(archive,'w') as z:z.writestr('app.py','def handler(event, context):\n    return {"accepted": True}\n')
 function=token+'-fraud-check';cli('lambda','create-function','--function-name',function,'--role',lambda_role,'--runtime','python3.12','--handler','app.handler','--zip-file','fileb://'+str(archive));ids['functions'].append(function)
 cli('lambda','add-permission','--function-name',function,'--statement-id','allow-order-rule','--principal','events.amazonaws.com','--source-arn',rule,'--action','lambda:InvokeFunction')
 lambda_policy=json.loads(cli('lambda','get-policy','--function-name',function)['Policy']);statement=lambda_policy['Statement'][0];check(statement['Principal']=={'Service':'events.amazonaws.com'} and statement['Condition']['ArnLike']['AWS:SourceArn']==rule,'Lambda resource policy exact rule metadata; no invoke runtime')
 sm_role_name=token+'-workflow';sm_role=cli('iam','create-role','--role-name',sm_role_name,'--assume-role-policy-document','{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"states.amazonaws.com"},"Action":"sts:AssumeRole"}]}')['Role']['Arn'];ids['roles'].append(sm_role_name)
 definition={'StartAt':'VerifyStock','States':{'VerifyStock':{'Type':'Choice','Choices':[{'Variable':'$.stockAvailable','BooleanEquals':False,'Next':'RecordRefund'}],'Default':'Ready'},'RecordRefund':{'Type':'Pass','Result':{'outcome':'REFUND_REQUIRED'},'End':True},'Ready':{'Type':'Pass','Result':{'outcome':'READY_FOR_FULFILMENT'},'End':True}}}
 sm=cli('stepfunctions','create-state-machine','--name',token+'-refund-flow','--type','STANDARD','--role-arn',sm_role,'--definition',json.dumps(definition))['stateMachineArn'];ids['machines'].append(sm)
 stored=cli('stepfunctions','describe-state-machine','--state-machine-arn',sm)
 check(json.loads(stored['definition'])==definition,'actual definition readback')
 execution=cli('stepfunctions','start-execution','--state-machine-arn',sm,'--name','stock-failed','--input','{"stockAvailable":false}')['executionArn']
 status=cli('stepfunctions','describe-execution','--execution-arn',execution)
 history=cli('stepfunctions','get-execution-history','--execution-arn',execution)
 print('SFN METADATA PROBE',json.dumps({'status':status['status'],'output':status.get('output'),'stateEnteredNames':[e.get('stateEnteredEventDetails',{}).get('name') for e in history['events'] if 'stateEnteredEventDetails' in e],'scope':'default backend does not execute requested ASL; optional parser dependency unavailable'}),flush=True)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  for n in ids['schedules']:cli('scheduler','delete-schedule','--name',n,'--group-name',ids['groups'][0],optional=True)
  for n in ids['groups']:cli('scheduler','delete-schedule-group','--name',n,optional=True)
  for sm in ids['machines']:cli('stepfunctions','delete-state-machine','--state-machine-arn',sm,optional=True)
  for function in ids['functions']:cli('lambda','delete-function','--function-name',function,optional=True)
  for n in ids['rules']:
   cli('events','remove-targets','--rule',n,'--ids','refund-queue',optional=True);cli('events','delete-rule','--name',n,optional=True)
  for q in ids['queues']:cli('sqs','delete-queue','--queue-url',q,optional=True)
  for n in ids['roles']:
   for policy_name in iam.list_role_policies(RoleName=n)['PolicyNames']:cli('iam','delete-role-policy','--role-name',n,'--policy-name',policy_name,optional=True)
   cli('iam','delete-role','--role-name',n,optional=True)
  leftovers={'queues':sqs.list_queues().get('QueueUrls',[]),'rules':events.list_rules()['Rules'],'schedules':scheduler.list_schedules()['Schedules'],'groups':scheduler.list_schedule_groups()['ScheduleGroups'],'machines':sfn.list_state_machines()['stateMachines'],'roles':iam.list_roles()['Roles'],'functions':lambda_client.list_functions()['Functions']}
  print('OWNED RESOURCES',json.dumps(leftovers,default=str),flush=True)
  check(not any(leftovers[k] for k in ['queues','rules','schedules','machines','roles','functions']),'all owned fixtures cleaned')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('owned listener still open')
  except OSError:pass
  (LAB/'last-run.json').write_text(json.dumps({'endpoint':endpoint,'listenerClosed':True,'checks':checks,'resources':ids},indent=2));print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
