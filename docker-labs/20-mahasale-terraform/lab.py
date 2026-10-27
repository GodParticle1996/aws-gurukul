"""Owned Moto + pinned local Terraform probe; no AWS or shared reset."""
import json,logging,os,shutil,socket,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent;LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
APP=ROOT.parents[1]
TERRAFORM=Path(os.environ.get('LAB20_TERRAFORM') or shutil.which('terraform') or APP/'.overhaul-evidence/tools/terraform')
PROVIDER=Path(os.environ.get('LAB20_PLUGIN_DIR') or APP/'docker-labs/08-three-tier-terraform/.terraform/providers')
if not TERRAFORM.is_file():raise SystemExit('Terraform1.17+ required; set LAB20_TERRAFORM to a verified installed binary (README).')
for k in list(os.environ):
 if k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN'] or k.startswith('TF_CLI_ARGS'):os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='us-east-1',TF_IN_AUTOMATION='1',CHECKPOINT_DISABLE='1',TF_DATA_DIR=str(LAB/'tf-data'))
state=LAB/'state.tfstate'
if state.exists() and json.loads(state.read_text()).get('resources'):raise SystemExit('Existing own state is nonempty: preserve it and inspect README recovery; do not reset/delete it.')
import boto3
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}';prefix='lab20-'+str(time.time_ns())
os.environ.update(TF_VAR_moto_endpoint=endpoint,TF_VAR_prefix=prefix)
applied=False;cw=None;alarm_names=[]

def tf(*args,allowed=(0,)):
 cmd=[str(TERRAFORM),*args,'-no-color'];print('$ terraform',' '.join(args),flush=True);p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=180);print(p.stdout+p.stderr,end='',flush=True)
 if p.returncode not in allowed:raise RuntimeError('terraform status '+str(p.returncode))
 return p
try:
 print('OWNED MOTO',endpoint,flush=True)
 tf('fmt','-check');tf('init','-reconfigure','-input=false',*(['-plugin-dir='+str(PROVIDER)] if PROVIDER.exists() else []));tf('validate')
 tf('plan','-out='+str(LAB/'plan'),'-input=false');tf('apply','-input=false',str(LAB/'plan'));applied=True
 data=json.loads(subprocess.check_output([str(TERRAFORM),'output','-json','review'],cwd=ROOT,text=True));(LAB/'review.json').write_text(json.dumps(data,indent=2));print('ACTUAL OUTPUT IDS',json.dumps(data),flush=True)
 drift=tf('plan','-detailed-exitcode','-input=false',allowed=(0,2));print('REPEAT PLAN EXIT',drift.returncode,'known Moto OAC/default/JSON readback gaps; not a zero-drift claim',flush=True)
 # Moto5.2.4 cannot speak the provider's current CloudWatch CBOR protocol.
 # Select AWS-supported Query only in this client's in-memory model; no package files change.
 session=boto3.Session();model=session._session.get_component('data_loader').load_service_model('cloudwatch','service-2');model['metadata']['protocol']='query';model['metadata']['protocols']=['query']
 cw=session.client('cloudwatch',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test')
 assert cw.meta.service_model.resolved_protocol=='query';print('CLOUDWATCH COMPATIBILITY PROTOCOL query; Terraform native alarms disabled due captured CBOR gap',flush=True)
 alarm_names=data['alarms']
 cw.put_metric_alarm(AlarmName=alarm_names[0],Namespace='AWS/ApplicationELB',MetricName='TargetResponseTime',ExtendedStatistic='p95',ComparisonOperator='GreaterThanThreshold',Threshold=.4,Unit='Seconds',Period=60,EvaluationPeriods=3,DatapointsToAlarm=2,TreatMissingData='missing',EvaluateLowSampleCountPercentile='ignore',AlarmActions=[data['alerts_topic']],Dimensions=[{'Name':'LoadBalancer','Value':data['alb'].split(':loadbalancer/')[1]}])
 cw.put_metric_alarm(AlarmName=alarm_names[1],Namespace='AWS/SQS',MetricName='ApproximateAgeOfOldestMessage',Statistic='Maximum',ComparisonOperator='GreaterThanThreshold',Threshold=120,Unit='Seconds',Period=60,EvaluationPeriods=2,DatapointsToAlarm=2,TreatMissingData='notBreaching',AlarmActions=[data['alerts_topic']],Dimensions=[{'Name':'QueueName','Value':data['queues']['five'].split('/')[-1]}])
 alarms=cw.describe_alarms(AlarmNames=alarm_names)['MetricAlarms'];print('ACTUAL QUERY ALARM METADATA',json.dumps(alarms,default=str),flush=True)
 assert len(alarms)==2 and next(a for a in alarms if a['AlarmName'].endswith('-p95'))['ExtendedStatistic']=='p95'
 cf=boto3.client('cloudfront',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test')
 config=cf.get_distribution_config(Id=data['distribution'])['DistributionConfig']
 print('ACTUAL OAC READBACK',json.dumps({'requested':data['oac'],'returned':config['Origins']['Items'][0].get('OriginAccessControlId'),'scope':'known Moto gap; no working private CDN claim'}),flush=True)
 sns=boto3.client('sns',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test')
 sqs=boto3.client('sqs',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test')
 sns.publish(TopicArn=data['alerts_topic'],Message=json.dumps({'kind':'READINESS_TEST','run':prefix}))
 messages=sqs.receive_message(QueueUrl=data['alert_queue'],MaxNumberOfMessages=1,WaitTimeSeconds=0).get('Messages',[])
 assert len(messages)==1 and json.loads(messages[0]['Body'])=={'kind':'READINESS_TEST','run':prefix}
 sqs.delete_message(QueueUrl=data['alert_queue'],ReceiptHandle=messages[0]['ReceiptHandle'])
 print('MANUAL NOTIFICATION ROUTE VERIFIED SNS -> SQS TEST body; not metric-triggered paging',flush=True)

except BaseException:
 import traceback;traceback.print_exc();raise
finally:
 try:
  cleanup_errors=[]
  if cw is not None and alarm_names:
   try:cw.delete_alarms(AlarmNames=alarm_names)
   except Exception as error:cleanup_errors.append(str(error));print('OWNED ALARM CLEANUP ERROR',str(error),flush=True)
  if state.exists():tf('destroy','-auto-approve','-input=false')
  assert not cleanup_errors,cleanup_errors
  empty=not json.loads(state.read_text()).get('resources',[]) if state.exists() else True
  print('OWNED TERRAFORM STATE EMPTY',empty,flush=True);assert empty,'own Terraform state must be empty'
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener still open')
  except OSError:pass
  (LAB/'last-run.json').write_text(json.dumps({'endpoint':endpoint,'listenerClosed':True,'prefix':prefix,'applied':applied}));print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
