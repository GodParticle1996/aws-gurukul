"""Cost API boundary probe: own isolated Moto only, no billing/runtime claim."""
import json,logging,os,socket,subprocess,time
from pathlib import Path
from moto.server import ThreadedMotoServer
import boto3
from botocore.exceptions import ClientError
APP=Path(__file__).resolve().parents[2];RUN=APP/'.overhaul-evidence/lab27-runs'/('run-'+str(time.time_ns()));RUN.mkdir(parents=True)
for k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN','AWS_ENDPOINT_URL']:os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_DEFAULT_REGION='us-east-1',AWS_EC2_METADATA_DISABLED='true',AWS_SHARED_CREDENTIALS_FILE=str(RUN/'credentials'),AWS_CONFIG_FILE=str(RUN/'config'),AWS_PAGER='')
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();END=f'http://{host}:{port}';name='lab27-'+str(time.time_ns());vols=[];snaps=[];ip=None;topic=None;budget=False;logs=False;checks=0
clients={svc:boto3.client(svc,endpoint_url=END,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test') for svc in ['ec2','logs','budgets','sns','ce']};ec2=clients['ec2'];lg=clients['logs'];bg=clients['budgets'];sns=clients['sns']
baseline_snaps={x['SnapshotId'] for x in ec2.describe_snapshots()['Snapshots']}
def cli(service,*args,ok=True):
 cmd=[str(APP/'docker-labs/.venv/bin/aws'),'--endpoint-url',END,'--region','us-east-1',service,*args];print('$ aws',service,*args,flush=True);r=subprocess.run(cmd,text=True,capture_output=True,timeout=30);print(r.stdout+r.stderr,end='',flush=True)
 if ok and r.returncode:raise AssertionError('CLI exit '+str(r.returncode))
 return r

def estimate():
 prices=json.loads((Path(__file__).parent/'prices.json').read_text());return round(sum(v['Size']*prices['gp3GiBMonthUSD']+max(0,v.get('Iops',3000)-3000)*prices['extraIOPSMonthUSD']+max(0,v.get('Throughput',125)-125)*prices['extraMiBsMonthUSD'] if v['VolumeType']=='gp3' else v['Size']*prices['gp2GiBMonthUSD'] for v in ec2.describe_volumes()['Volumes'])+len(ec2.describe_addresses()['Addresses'])*prices['ipv4HourUSD']*prices['hoursPerModelMonth'],2)

def check(v,t):
 global checks
 assert v,t;checks+=1;print('PASS',checks,t,flush=True)
try:
 print('OWNED MOTO',END,'WORKDIR',RUN,flush=True)
 prod=ec2.create_volume(AvailabilityZone='us-east-1a',Size=1000,VolumeType='gp2',Encrypted=True,TagSpecifications=[{'ResourceType':'volume','Tags':[{'Key':'Name','Value':name+'-prod'},{'Key':'Owner','Value':'orders'}]}])['VolumeId'];vols.append(prod)
 scratch=ec2.create_volume(AvailabilityZone='us-east-1a',Size=200,VolumeType='gp2',Encrypted=True,TagSpecifications=[{'ResourceType':'volume','Tags':[{'Key':'Name','Value':name+'-disposable'},{'Key':'ApprovedDelete','Value':'true'}]}])['VolumeId'];vols.append(scratch)
 old=ec2.create_snapshot(VolumeId=scratch,Description=name+'-expired-fixture')['SnapshotId'];snaps.append(old)
 ip=ec2.allocate_address(Domain='vpc')['AllocationId'];lg.create_log_group(logGroupName=name);logs=True;lg.create_log_stream(logGroupName=name,logStreamName='app');lg.put_log_events(logGroupName=name,logStreamName='app',logEvents=[{'timestamp':int(time.time()*1000),'message':'TEST-cost-original'}])
 before=estimate();print('APPROX FUTURE MONTHLY EBS + LISTED IPv4 MODEL BEFORE USD',before,'NOT actual billing; snapshots/logs/EC2/network/taxes excluded',flush=True)
 cli('ec2','describe-volumes','--filters','Name=status,Values=available')
 created=cli('ec2','create-snapshot','--volume-id',scratch,'--description',name+'-preserve-before-delete');sid=json.loads(created.stdout)['SnapshotId'];snaps.append(sid);cli('ec2','wait','snapshot-completed','--snapshot-ids',sid);check(ec2.describe_snapshots(SnapshotIds=[sid])['Snapshots'][0]['State']=='completed','preservation snapshot completed before deleting approved detached volume')
 cli('ec2','delete-volume','--volume-id',scratch);vols.remove(scratch);check(not ec2.describe_volumes(Filters=[{'Name':'volume-id','Values':[scratch]}])['Volumes'],'approved detached volume deleted; preserved snapshot remains')
 cli('ec2','modify-volume','--volume-id',prod,'--volume-type','gp3','--iops','3000','--throughput','250');cli('ec2','describe-volumes-modifications','--volume-ids',prod);v=ec2.describe_volumes(VolumeIds=[prod])['Volumes'][0];check(v['VolumeType']=='gp3' and v['Size']==1000 and v['Encrypted'] and v['Iops']==3000 and v.get('Throughput')==250,'gp2 to gp3 preserves original volume ID, size and encryption metadata')
 cli('ec2','release-address','--allocation-id',ip);ip=None;check(not ec2.describe_addresses()['Addresses'],'unassociated IPv4 released')
 cli('ec2','delete-snapshot','--snapshot-id',old);snaps.remove(old);check(ec2.describe_snapshots(SnapshotIds=[sid])['Snapshots'][0]['SnapshotId']==sid,'expired approved fixture removed; fresh preservation snapshot retained')
 cli('logs','put-retention-policy','--log-group-name',name,'--retention-in-days','14');g=lg.describe_log_groups(logGroupNamePrefix=name)['logGroups'][0];check(g['retentionInDays']==14 and lg.get_log_events(logGroupName=name,logStreamName='app')['events'][0]['message']=='TEST-cost-original','14-day retention metadata stored, current TEST log retained')
 topic=sns.create_topic(Name=name)['TopicArn'];policy={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'budgets.amazonaws.com'},'Action':'SNS:Publish','Resource':topic,'Condition':{'StringEquals':{'aws:SourceAccount':'123456789012'},'ArnLike':{'aws:SourceArn':'arn:aws:budgets::123456789012:*'}}}]};sns.set_topic_attributes(TopicArn=topic,AttributeName='Policy',AttributeValue=json.dumps(policy))
 definition={'BudgetName':name,'BudgetLimit':{'Amount':'1000','Unit':'USD'},'TimeUnit':'MONTHLY','BudgetType':'COST'};notifications=[{'Notification':{'NotificationType':'ACTUAL','ComparisonOperator':'GREATER_THAN','Threshold':80,'ThresholdType':'PERCENTAGE'},'Subscribers':[{'SubscriptionType':'SNS','Address':topic}]}]
 (RUN/'budget.json').write_text(json.dumps(definition));(RUN/'notifications.json').write_text(json.dumps(notifications));cli('budgets','create-budget','--account-id','123456789012','--budget','file://'+str(RUN/'budget.json'),'--notifications-with-subscribers','file://'+str(RUN/'notifications.json'));budget=True
 b=bg.describe_budget(AccountId='123456789012',BudgetName=name)['Budget'];ns=bg.describe_notifications_for_budget(AccountId='123456789012',BudgetName=name)['Notifications'];print('ACTUAL BUDGET',json.dumps(b,default=str),'NOTIFICATIONS',json.dumps(ns,default=str),flush=True);check(float(b['BudgetLimit']['Amount'])==1000 and ns[0]['Threshold']==80,'monthly cost Budget and 80 percent notification metadata stored; subscriber input accepted')
 print('GAP Moto DescribeSubscribersForNotification is unimplemented (captured500); no subscriber readback or automatic alert claim',flush=True)
 (RUN/'topic-policy.json').write_text(json.dumps(policy));cli('sns','set-topic-attributes','--topic-arn',topic,'--attribute-name','Policy','--attribute-value','file://'+str(RUN/'topic-policy.json'))
 forecast={'NotificationType':'FORECASTED','ComparisonOperator':'GREATER_THAN','Threshold':90,'ThresholdType':'PERCENTAGE'};(RUN/'threshold90.json').write_text(json.dumps(forecast));(RUN/'subscribers.json').write_text(json.dumps([{'SubscriptionType':'SNS','Address':topic}]))
 cli('budgets','create-notification','--account-id','123456789012','--budget-name',name,'--notification','file://'+str(RUN/'threshold90.json'),'--subscribers','file://'+str(RUN/'subscribers.json'))
 listed=cli('budgets','describe-notifications-for-budget','--account-id','123456789012','--budget-name',name);policy_read=json.loads(sns.get_topic_attributes(TopicArn=topic)['Attributes']['Policy']);check(len(json.loads(listed.stdout)['Notifications'])==2 and policy_read==policy,'standalone notification CLI and scoped SNS topic policy readback; no auto delivery')

 # Moto cost data is not a local resource billing meter; probe and label the boundary.
 sample=cli('ce','get-cost-and-usage','--time-period','Start=2026-10-01,End=2026-11-01','--granularity','MONTHLY','--metrics','UnblendedCost',ok=False);print('COST EXPLORER BOUNDARY: emulator response is synthetic/unavailable; no actual bill or saving claim',flush=True)
 print('APPROX FUTURE MONTHLY INVENTORY MODEL AFTER USD',estimate(),'DELTA USD',round(before-estimate(),2),'not observed invoice savings',flush=True)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  if budget:bg.delete_budget(AccountId='123456789012',BudgetName=name)
  if topic:sns.delete_topic(TopicArn=topic)
  if logs:lg.delete_log_group(logGroupName=name)
  if ip:ec2.release_address(AllocationId=ip)
  for sid in snaps:ec2.delete_snapshot(SnapshotId=sid)
  for vid in vols:ec2.delete_volume(VolumeId=vid)
  current_snaps={x['SnapshotId'] for x in ec2.describe_snapshots()['Snapshots']}
  clean={'volumes':len(ec2.describe_volumes()['Volumes']),'newSnapshotIDs':sorted(current_snaps-baseline_snaps),'baselineSnapshotsPreserved':baseline_snaps<=current_snaps,'addresses':len(ec2.describe_addresses()['Addresses']),'logs':len(lg.describe_log_groups()['logGroups']),'topics':len(sns.list_topics()['Topics']),'budgets':len(bg.describe_budgets(AccountId='123456789012')['Budgets'])}
  print('CLEANUP READBACK',json.dumps(clean),flush=True)
  check(all(clean[k]==0 for k in ['volumes','addresses','logs','topics','budgets']) and not clean['newSnapshotIDs'] and clean['baselineSnapshotsPreserved'],'all owned fixtures cleaned; Moto default AMI snapshots untouched')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener still open')
  except OSError:pass
  print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
