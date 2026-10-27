"""Owned Moto ASG schedule / RDS replica / Lambda mapping metadata only."""
import io,json,logging,os,socket,time,zipfile
from datetime import datetime,timedelta,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent;LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
for k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='us-east-1')
import boto3
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}'
clients={s:boto3.client(s,endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test') for s in ['ec2','autoscaling','rds','iam','lambda','sqs']}
ec2,asg,rds,iam,lam,sqs=(clients[s] for s in ['ec2','autoscaling','rds','iam','lambda','sqs']);prefix='lab20meta-'+str(time.time_ns());owned={'vpcs':[],'subnets':[],'templates':[],'groups':[],'dbgroups':[],'dbs':[],'roles':[],'functions':[],'mappings':[],'queues':[]};checks=0

def check(ok,label):
 global checks
 assert ok,label;checks+=1;print('PASS',checks,label,flush=True)
try:
 print('OWNED MOTO',endpoint,flush=True)
 vpc=ec2.create_vpc(CidrBlock='10.221.0.0/16')['Vpc']['VpcId'];owned['vpcs'].append(vpc)
 for i in range(3):owned['subnets'].append(ec2.create_subnet(VpcId=vpc,CidrBlock=f'10.221.{i+1}.0/24',AvailabilityZone='us-east-1'+chr(97+i))['Subnet']['SubnetId'])
 image=ec2.describe_images()['Images'][0]['ImageId'];lt=ec2.create_launch_template(LaunchTemplateName=prefix,LaunchTemplateData={'ImageId':image,'InstanceType':'t3.small'})['LaunchTemplate']['LaunchTemplateId'];owned['templates'].append(lt)
 asg.create_auto_scaling_group(AutoScalingGroupName=prefix,MinSize=3,MaxSize=6,DesiredCapacity=6,VPCZoneIdentifier=','.join(owned['subnets']),LaunchTemplate={'LaunchTemplateId':lt,'Version':'1'},HealthCheckType='ELB',HealthCheckGracePeriod=120);owned['groups'].append(prefix)
 asg.update_auto_scaling_group(AutoScalingGroupName=prefix,MaxSize=16,DesiredCapacity=12)
 group=asg.describe_auto_scaling_groups(AutoScalingGroupNames=[prefix])['AutoScalingGroups'][0];check(group['MaxSize']==16 and group['DesiredCapacity']==12 and len(group['Instances'])==12,'current ASG scale metadata12instances; no boot/runtime timing')
 now=datetime.now(timezone.utc);sale=now+timedelta(days=10)
 for name,desired,hours in [('sale-up',12,0),('sale-down',6,3)]:asg.put_scheduled_update_group_action(AutoScalingGroupName=prefix,ScheduledActionName=prefix+'-'+name,StartTime=sale+timedelta(hours=hours),MinSize=3 if desired==6 else 12,MaxSize=16,DesiredCapacity=desired)
 actions=asg.describe_scheduled_actions(AutoScalingGroupName=prefix)['ScheduledUpdateGroupActions'];print('SCHEDULE METADATA',json.dumps([{'name':x['ScheduledActionName'],'desired':x['DesiredCapacity'],'start':x.get('StartTime')} for x in actions],default=str),flush=True);check(len(actions)==2 and asg.describe_auto_scaling_groups(AutoScalingGroupNames=[prefix])['AutoScalingGroups'][0]['DesiredCapacity']==12,'future scheduled down action does not immediately scale down')
 asg.put_scheduled_update_group_action(AutoScalingGroupName=prefix,ScheduledActionName=prefix+'-recurring',Recurrence='15 10 * * *',TimeZone='Asia/Kolkata',DesiredCapacity=12)
 recurring=asg.describe_scheduled_actions(AutoScalingGroupName=prefix,ScheduledActionNames=[prefix+'-recurring'])['ScheduledUpdateGroupActions'];print('ASG FIVE-FIELD TIMEZONE',json.dumps(recurring,default=str),flush=True);check(len(recurring)==1,'recurring five-field schedule accepted; inspect timezone readback')
 dbgroup=prefix+'-db';rds.create_db_subnet_group(DBSubnetGroupName=dbgroup,DBSubnetGroupDescription='Owned metadata only',SubnetIds=owned['subnets']);owned['dbgroups'].append(dbgroup)
 source=prefix+'-orders';rds.create_db_instance(DBInstanceIdentifier=source,DBInstanceClass='db.t3.micro',Engine='postgres',AllocatedStorage=20,MasterUsername='test_admin',MasterUserPassword='TEST_ONLY_not_a_live_DB',MultiAZ=True,PubliclyAccessible=False,StorageEncrypted=True,BackupRetentionPeriod=7,DBSubnetGroupName=dbgroup);owned['dbs'].append(source)
 replica=prefix+'-reader';rds.create_db_instance_read_replica(DBInstanceIdentifier=replica,SourceDBInstanceIdentifier=source,DBInstanceClass='db.t3.micro',PubliclyAccessible=False);owned['dbs'].insert(0,replica)
 db=rds.describe_db_instances(DBInstanceIdentifier=replica)['DBInstances'][0];check(db['ReadReplicaSourceDBInstanceIdentifier']==source and not db['PubliclyAccessible'] and db['DBInstanceStatus']=='available','replica source/private/available metadata; no SQL/lag proof')
 primary=rds.describe_db_instances(DBInstanceIdentifier=source)['DBInstances'][0];check(primary['MultiAZ'] and primary['BackupRetentionPeriod']==7,'primary HA/backup metadata preserved')
 role=iam.create_role(RoleName=prefix,AssumeRolePolicyDocument=json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'lambda.amazonaws.com'},'Action':'sts:AssumeRole'}]}))['Role']['Arn'];owned['roles'].append(prefix)
 q=sqs.create_queue(QueueName=prefix,Attributes={'VisibilityTimeout':'60'})['QueueUrl'];owned['queues'].append(q);qarn=sqs.get_queue_attributes(QueueUrl=q,AttributeNames=['QueueArn'])['Attributes']['QueueArn']
 iam.put_role_policy(RoleName=prefix,PolicyName='consume-own-queue',PolicyDocument=json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['sqs:ReceiveMessage','sqs:DeleteMessage','sqs:GetQueueAttributes'],'Resource':qarn}]}))
 buf=io.BytesIO()
 with zipfile.ZipFile(buf,'w') as z:z.writestr('app.py','def handler(event, context):\n    return {"batchItemFailures": []}\n')
 lam.create_function(FunctionName=prefix,Runtime='python3.12',Handler='app.handler',Role=role,Code={'ZipFile':buf.getvalue()},Timeout=10);owned['functions'].append(prefix)
 lam.put_function_concurrency(FunctionName=prefix,ReservedConcurrentExecutions=20)
 mapping=lam.create_event_source_mapping(FunctionName=prefix,EventSourceArn=qarn,BatchSize=10,FunctionResponseTypes=['ReportBatchItemFailures'],ScalingConfig={'MaximumConcurrency':5})['UUID'];owned['mappings'].append(mapping)
 lam.update_event_source_mapping(UUID=mapping,ScalingConfig={'MaximumConcurrency':20});view=lam.get_event_source_mapping(UUID=mapping);print('MAPPING SCALING READBACK',json.dumps({k:view.get(k) for k in ['State','ScalingConfig','FunctionResponseTypes','BatchSize']}),flush=True)
 check(lam.get_function_concurrency(FunctionName=prefix)['ReservedConcurrentExecutions']==20,'function reserved capacity20 readback, not provisioned warm environments')
 print('MAPPING MAXIMUM CONCURRENCY SUPPORTED',view.get('ScalingConfig')=={'MaximumConcurrency':20},'metadata only; function never invoked; queue stayed empty',flush=True)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  for m in owned['mappings']:lam.delete_event_source_mapping(UUID=m)
  for f in owned['functions']:lam.delete_function(FunctionName=f)
  for q in owned['queues']:sqs.delete_queue(QueueUrl=q)
  for role in owned['roles']:iam.delete_role_policy(RoleName=role,PolicyName='consume-own-queue');iam.delete_role(RoleName=role)
  for db in owned['dbs']:rds.delete_db_instance(DBInstanceIdentifier=db,SkipFinalSnapshot=True)
  for g in owned['dbgroups']:rds.delete_db_subnet_group(DBSubnetGroupName=g)
  for g in owned['groups']:asg.delete_auto_scaling_group(AutoScalingGroupName=g,ForceDelete=True)
  for lt in owned['templates']:ec2.delete_launch_template(LaunchTemplateId=lt)
  for s in owned['subnets']:ec2.delete_subnet(SubnetId=s)
  for v in owned['vpcs']:ec2.delete_vpc(VpcId=v)
  check(not lam.list_functions()['Functions'] and not rds.describe_db_instances()['DBInstances'] and not asg.describe_auto_scaling_groups()['AutoScalingGroups'] and not sqs.list_queues().get('QueueUrls',[]),'owned function/DB/group/queues cleaned')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener still open')
  except OSError:pass
  (LAB/'metadata-last-run.json').write_text(json.dumps({'endpoint':endpoint,'listenerClosed':True,'checks':checks,'resources':owned}));print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
