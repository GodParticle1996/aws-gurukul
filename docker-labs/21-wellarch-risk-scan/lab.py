"""Lab21: risky seed -> actual config scan -> scoped repair -> scan -> cleanup. No runtime claim."""
import json,logging,os,socket,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent;LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
for k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='us-east-1',AWS_MAX_ATTEMPTS='1')
import boto3
from botocore.exceptions import ClientError
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}'
clients={s:boto3.client(s,endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test') for s in ['s3','rds','cloudtrail','cloudwatch','sns','ec2']}
s3,rds,ct,cw,sns,ec2=(clients[s] for s in ['s3','rds','cloudtrail','cloudwatch','sns','ec2'])
# Current CloudWatch defaults CBOR. Choose a supported SDK Query model locally, never patch installed files.
from botocore.session import Session
session=Session();model=session.get_service_model('cloudwatch');model.metadata['protocol']='query';model.metadata['protocols']=['query']
cw=session.create_client('cloudwatch',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test')
name='lab21-'+str(time.time_ns());owned={'bucket':None,'db':None,'trail':None,'alarm':None,'topic':None,'vpc':None,'subs':[],'dbgroup':None};checks=0

def check(v,label):
 global checks
 assert v,label;checks+=1;print('PASS',checks,label,flush=True)
import importlib.util
spec=importlib.util.spec_from_file_location('lab21_risk_scan',ROOT/'risk_scan.py');risk_scan=importlib.util.module_from_spec(spec);spec.loader.exec_module(risk_scan)
def scan():
 clients['cloudwatch']=cw
 result=risk_scan.scan(clients,name,owned['topic']);print('ACTUAL SCAN',json.dumps(result),flush=True);return result['declaredConfigRisks']
try:
 print('OWNED MOTO',endpoint,flush=True)
 b=name;s3.create_bucket(Bucket=b);owned['bucket']=b
 s3.put_public_access_block(Bucket=b,PublicAccessBlockConfiguration={k:True for k in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']});s3.put_object(Bucket=b,Key='TEST-preserve.txt',Body=b'TEST preserve audit evidence')
 vpc=ec2.create_vpc(CidrBlock='10.221.0.0/16')['Vpc']['VpcId'];owned['vpc']=vpc
 for i in range(2):owned['subs'].append(ec2.create_subnet(VpcId=vpc,CidrBlock=f'10.221.{i+1}.0/24',AvailabilityZone='us-east-1'+chr(97+i))['Subnet']['SubnetId'])
 rds.create_db_subnet_group(DBSubnetGroupName=name,DBSubnetGroupDescription='Owned lab21',SubnetIds=owned['subs']);owned['dbgroup']=name
 rds.create_db_instance(DBInstanceIdentifier=name,Engine='postgres',DBInstanceClass='db.t3.micro',AllocatedStorage=20,MasterUsername='test_admin',MasterUserPassword='TEST_ONLY_no_live_SQL',DBSubnetGroupName=name,MultiAZ=False,BackupRetentionPeriod=0,StorageEncrypted=True,PubliclyAccessible=False);owned['db']=name
 check(len(scan())==3,'scanner finds3declared config risks before repair')
 trailarn=f'arn:aws:cloudtrail:us-east-1:123456789012:trail/{name}'
 # Probe Moto authorization gap on a disposable trail with no bucket policy.
 try:
  ct.create_trail(Name=name,S3BucketName=b,IsMultiRegionTrail=False,EnableLogFileValidation=False,IncludeGlobalServiceEvents=False);owned['trail']=name
  ct.start_logging(Name=name);print('MOTO NO_BUCKET_POLICY_START',json.dumps(ct.get_trail_status(Name=name),default=str),flush=True);ct.stop_logging(Name=name)
 except Exception as e:print('NO_POLICY_RESULT',type(e).__name__,str(e)[:200],flush=True)
 policy=risk_scan.trail_policy(b,trailarn)
 s3.put_bucket_policy(Bucket=b,Policy=json.dumps(policy));check(json.loads(s3.get_bucket_policy(Bucket=b)['Policy'])==policy,'reviewed exact trail policy persisted')
 rds.modify_db_instance(DBInstanceIdentifier=name,MultiAZ=True,BackupRetentionPeriod=7,ApplyImmediately=True);db=rds.describe_db_instances(DBInstanceIdentifier=name)['DBInstances'][0];check(db['MultiAZ'] and db['BackupRetentionPeriod']==7 and not db['PubliclyAccessible'],'HA/backup config repaired; no SQL/failover')
 topic=sns.create_topic(Name=name)['TopicArn'];owned['topic']=topic
 alarm={'AlarmName':name,'Namespace':'AWS/ApplicationELB','MetricName':'HTTPCode_Target_5XX_Count','Dimensions':[{'Name':'LoadBalancer','Value':'app/TRAINING-NOT-DEPLOYED/0000000000000021'}],'Statistic':'Sum','Unit':'Count','Threshold':5.,'ComparisonOperator':'GreaterThanThreshold','Period':60,'EvaluationPeriods':2,'DatapointsToAlarm':2,'TreatMissingData':'missing','AlarmActions':[topic]}
 cw.put_metric_alarm(**alarm);owned['alarm']=name;view=cw.describe_alarms(AlarmNames=[name])['MetricAlarms'][0];check(view['Statistic']=='Sum' and view['Threshold']==5 and view['AlarmActions']==[topic],'actual Query alarm config; no ALB deployed/metric proof');print('INITIAL ALARM',view.get('StateValue'),view.get('StateReason'),flush=True)
 if not owned['trail']:ct.create_trail(Name=name,S3BucketName=b);owned['trail']=name
 ct.update_trail(Name=name,IsMultiRegionTrail=True,EnableLogFileValidation=True,IncludeGlobalServiceEvents=True)
 selectors=ct.get_event_selectors(TrailName=name);print('DEFAULT SELECTORS',json.dumps(selectors,default=str),flush=True)
 ct.put_event_selectors(TrailName=name,EventSelectors=[{'ReadWriteType':'All','IncludeManagementEvents':True,'DataResources':[]}]);ct.start_logging(Name=name)
 trail=ct.get_trail(Name=name)['Trail'];status=ct.get_trail_status(Name=name);print('ACTUAL TRAIL',json.dumps(trail,default=str),'STATUS',json.dumps(status,default=str),flush=True)
 check(trail['IsMultiRegionTrail'] and trail['LogFileValidationEnabled'] and status['IsLogging'],'trail flags/logging config readback')
 check(len(scan())==0,'0of3declared config risks; not framework/runtime pass')
 try:lookup=ct.lookup_events()
 except ClientError as e:
  if e.response['Error']['Code']!='500':raise
  lookup={'Events':'HTTP500:captured Moto5.2.4 LookupEvents not implemented'};print('LOOKUP_EVENTS_MOTO_GAP',type(e).__name__,flush=True)
 objects=s3.list_objects_v2(Bucket=b).get('Contents',[]);print('HISTORY/DELIVERY',json.dumps({'events':lookup.get('Events'),'objects':[x['Key'] for x in objects],'note':'No automatic delivery/history/digest proof; seeded TEST object only'},default=str),flush=True)
 check(s3.get_object(Bucket=b,Key='TEST-preserve.txt')['Body'].read()==b'TEST preserve audit evidence','original TEST evidence preserved')
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  if owned['trail']:ct.stop_logging(Name=name);ct.delete_trail(Name=name)
  if owned['alarm']:cw.delete_alarms(AlarmNames=[name])
  if owned['topic']:sns.delete_topic(TopicArn=owned['topic'])
  if owned['db']:rds.delete_db_instance(DBInstanceIdentifier=name,SkipFinalSnapshot=True)
  if owned['dbgroup']:rds.delete_db_subnet_group(DBSubnetGroupName=name)
  for s in owned['subs']:ec2.delete_subnet(SubnetId=s)
  if owned['vpc']:ec2.delete_vpc(VpcId=owned['vpc'])
  if owned['bucket']:
   for x in s3.list_objects_v2(Bucket=name).get('Contents',[]):s3.delete_object(Bucket=name,Key=x['Key'])
   s3.delete_bucket(Bucket=name)
  check(not ct.describe_trails()['trailList'] and not rds.describe_db_instances()['DBInstances'] and not cw.describe_alarms()['MetricAlarms'] and not s3.list_buckets()['Buckets'],'owned fixture resources cleaned')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener open')
  except OSError:pass
  print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
