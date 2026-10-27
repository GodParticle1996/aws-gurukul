"""Lab23 preparation; owned loopback Moto only, no real AWS/Docker/SQL server."""
import json,logging,os,socket,time,sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parent;LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
for k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='ap-south-1',AWS_MAX_ATTEMPTS='1')
import boto3
from botocore.exceptions import ClientError
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)  # hide request lines and Moto's NotImplemented traceback; lab prints its own result
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}';A='ap-south-1';B='ap-south-2'
def client(s,r=A):return boto3.client(s,endpoint_url=endpoint,region_name=r,aws_access_key_id='test',aws_secret_access_key='test')
bk=client('backup');bk2=client('backup',B);rds=client('rds');rds2=client('rds',B);ec2=client('ec2');ec22=client('ec2',B);dns=client('route53');s3=client('s3');s32=client('s3',B);iam=client('iam');name='lab23-'+str(time.time_ns());own={'vault':False,'vault2':False,'plan':None,'selection':None,'db':False,'replica':False,'snap':False,'restore':False,'image':None,'image2':None,'zone':None,'hc':None,'buckets':[],'role':False};checks=0

def check(v,label):
 global checks
 assert v,label;checks+=1;print('PASS',checks,label,flush=True)
def attempt(label,fn):
 try:
  r=fn();print(label,'ACCEPTED',json.dumps(r,default=str)[:950],flush=True);return r
 except ClientError as e:
  if e.response['Error']['Code'] not in ['404','500','NotImplemented']:raise
  print(label,'UNSUPPORTED',e.response['Error']['Code'],str(e).splitlines()[0][:140],flush=True);return None
try:
 print('OWNED MOTO',endpoint,flush=True)
 role=iam.create_role(RoleName=name,AssumeRolePolicyDocument=json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':['backup.amazonaws.com','s3.amazonaws.com']},'Action':'sts:AssumeRole'}]}))['Role'];own['role']=True;arn=role['Arn']
 va=bk.create_backup_vault(BackupVaultName=name);own['vault']=True;vb=bk2.create_backup_vault(BackupVaultName=name);own['vault2']=True
 plan={'BackupPlanName':name,'Rules':[{'RuleName':'daily-copy','TargetBackupVaultName':name,'ScheduleExpression':'cron(0 1 * * ? *)','StartWindowMinutes':60,'Lifecycle':{'DeleteAfterDays':30},'CopyActions':[{'DestinationBackupVaultArn':vb['BackupVaultArn'],'Lifecycle':{'DeleteAfterDays':30}}]}]}
 pid=bk.create_backup_plan(BackupPlan=plan)['BackupPlanId'];own['plan']=pid
 db=rds.create_db_instance(DBInstanceIdentifier=name,DBInstanceClass='db.t3.micro',Engine='postgres',AllocatedStorage=20,MasterUsername='labuser',MasterUserPassword='OwnedMotoOnly23',BackupRetentionPeriod=7,StorageEncrypted=True,PubliclyAccessible=False)['DBInstance'];own['db']=True;dbarn=db['DBInstanceArn']
 selection={'SelectionName':name,'IamRoleArn':arn,'Resources':[dbarn]}
 attempt('BACKUP SELECTION',lambda:bk.create_backup_selection(BackupPlanId=pid,BackupSelection=selection))
 read=bk.get_backup_plan(BackupPlanId=pid)['BackupPlan'];check(read['Rules'][0]['CopyActions'][0]['DestinationBackupVaultArn']==vb['BackupVaultArn'],'cross-Region plan copy rule stored; selection/job runtime unsupported')
 attempt('BACKUP JOB',lambda:bk.start_backup_job(BackupVaultName=name,ResourceArn=dbarn,IamRoleArn=arn,IdempotencyToken='lab23backup'))
 bk2.put_backup_vault_lock_configuration(BackupVaultName=name,MinRetentionDays=7,MaxRetentionDays=90)
 lock=bk2.describe_backup_vault(BackupVaultName=name);print('VAULT GOVERNANCE LOCK',json.dumps({k:lock.get(k) for k in ['BackupVaultName','Locked','MinRetentionDays','MaxRetentionDays']}),flush=True)
 check(lock.get('MinRetentionDays')==7,'governance lock configuration readback only; no compliance immutability test')
 bk2.delete_backup_vault_lock_configuration(BackupVaultName=name)
 snap=rds.create_db_snapshot(DBInstanceIdentifier=name,DBSnapshotIdentifier=name)['DBSnapshot'];own['snap']=True
 restored=rds.restore_db_instance_from_db_snapshot(DBInstanceIdentifier=name+'-restored',DBSnapshotIdentifier=name,DBInstanceClass='db.t3.micro',PubliclyAccessible=False)['DBInstance'];own['restore']=True
 check(restored['DBInstanceIdentifier']==name+'-restored' and restored['DBInstanceArn']!=dbarn,'separate RDS snapshot restore instance metadata; no PostgreSQL data plane')
 replica=rds2.create_db_instance_read_replica(DBInstanceIdentifier=name+'-dr',SourceDBInstanceIdentifier=dbarn,DBInstanceClass='db.t3.micro',PubliclyAccessible=False)['DBInstance'];own['replica']=True
 check(replica['ReadReplicaSourceDBInstanceIdentifier']==dbarn and f':{B}:' in replica['DBInstanceArn'],'cross-Region replica ARN link actual metadata')
 promoted=rds2.promote_read_replica(DBInstanceIdentifier=name+'-dr')['DBInstance'];print('PROMOTED',json.dumps({k:promoted.get(k) for k in ['DBInstanceStatus','ReadReplicaSourceDBInstanceIdentifier']}),flush=True)
 after=rds2.describe_db_instances(DBInstanceIdentifier=name+'-dr')['DBInstances'][0];check(after.get('ReadReplicaSourceDBInstanceIdentifier')==dbarn,'Moto promotion returns available but retains source link; not actual independent writer proof')
 im=ec2.register_image(Name=name,Architecture='x86_64',RootDeviceName='/dev/sda1',BlockDeviceMappings=[{'DeviceName':'/dev/sda1','Ebs':{'VolumeSize':1}}])['ImageId'];own['image']=im
 cp=ec22.copy_image(SourceRegion=A,SourceImageId=im,Name=name+'-dr')['ImageId'];own['image2']=cp;image=ec22.describe_images(ImageIds=[cp])['Images'][0]
 check(image['State']=='available' and image['ImageId']!=im,'destination AMI copy metadata exists; no EC2 boot')
 for c,r,suffix in [(s3,A,'source'),(s32,B,'dest')]:
  b=name+'-'+suffix;c.create_bucket(Bucket=b,CreateBucketConfiguration={'LocationConstraint':r});own['buckets'].append((c,b));c.put_bucket_versioning(Bucket=b,VersioningConfiguration={'Status':'Enabled'})
 sb=own['buckets'][0][1];dbkt=own['buckets'][1][1]
 s3.put_bucket_replication(Bucket=sb,ReplicationConfiguration={'Role':arn,'Rules':[{'ID':'copy','Status':'Enabled','Priority':1,'Filter':{'Prefix':''},'DeleteMarkerReplication':{'Status':'Disabled'},'Destination':{'Bucket':'arn:aws:s3:::'+dbkt}}]})
 check(s3.get_bucket_replication(Bucket=sb)['ReplicationConfiguration']['Rules'][0]['Destination']['Bucket']=='arn:aws:s3:::'+dbkt,'S3 CRR configuration readback')
 s3.put_object(Bucket=sb,Key='order.json',Body=b'{"order":"TEST-23"}');check(not s32.list_objects_v2(Bucket=dbkt).get('Contents'),'Moto CRR stores config but does not replicate object')
 hc=dns.create_health_check(CallerReference=name,HealthCheckConfig={'IPAddress':'192.0.2.10','Port':443,'Type':'HTTPS','ResourcePath':'/ready','RequestInterval':30,'FailureThreshold':3})['HealthCheck']['Id'];own['hc']=hc
 zone=dns.create_hosted_zone(Name=name+'.example.invalid.',CallerReference=name)['HostedZone']['Id'];own['zone']=zone
 records=[{'Name':'orders.'+name+'.example.invalid.','Type':'A','TTL':60,'SetIdentifier':role,'Failover':role,'HealthCheckId':hc,'ResourceRecords':[{'Value':ip}]} for role,ip in [('PRIMARY','192.0.2.10'),('SECONDARY','192.0.2.20')]]
 change=dns.change_resource_record_sets(HostedZoneId=zone,ChangeBatch={'Changes':[{'Action':'CREATE','ResourceRecordSet':r} for r in records]})['ChangeInfo'];print('DNS CHANGE',json.dumps(change,default=str),flush=True)
 check(len([r for r in dns.list_resource_record_sets(HostedZoneId=zone)['ResourceRecordSets'] if r.get('Failover')])==2,'failover pair and health-check reference metadata')
 attempt('DNS TEST ANSWER',lambda:dns.test_dns_answer(HostedZoneId=zone,RecordName=records[0]['Name'],RecordType='A'))
 # Actual host-side restore and accepted-ID reconciliation, independent from Moto RDS metadata.
 source=sqlite3.connect(':memory:');snapshot=sqlite3.connect(':memory:');restored_host=sqlite3.connect(':memory:')
 try:
  source.execute('create table orders(id text primary key, accepted_at integer)')
  source.executemany('insert into orders values(?,?)',[('TEST-23-1',8000),('TEST-23-2',8060)]);source.commit();source.backup(snapshot)
  source.execute('insert into orders values(?,?)',('TEST-23-3',8120));source.commit();started=time.perf_counter();snapshot.backup(restored_host)
  recovered=restored_host.execute('select id,accepted_at from orders order by id').fetchall();accepted=source.execute('select id,accepted_at from orders order by id').fetchall();missing=sorted({x[0] for x in accepted}-{x[0] for x in recovered});age=8180-max(x[1] for x in recovered)
  print('HOST SQLITE RESTORE',json.dumps({'accepted':accepted,'recovered':recovered,'missing':missing,'recovery_point_age_s':age,'host_restore_seconds':round(time.perf_counter()-started,6)}),flush=True)
  check(missing==['TEST-23-3'] and age==120,'actual host SQLite backup/restore reconciles missing accepted ID; synthetic event clock, not AWS/PostgreSQL RTO/RPO')
 finally:restored_host.close();snapshot.close();source.close()
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  if own['zone']:
   rows=[r for r in dns.list_resource_record_sets(HostedZoneId=own['zone'])['ResourceRecordSets'] if r['Type'] not in ['NS','SOA']]
   if rows:dns.change_resource_record_sets(HostedZoneId=own['zone'],ChangeBatch={'Changes':[{'Action':'DELETE','ResourceRecordSet':r} for r in rows]})
   dns.delete_hosted_zone(Id=own['zone'])
  if own['hc']:dns.delete_health_check(HealthCheckId=own['hc'])
  for c,b in own['buckets']:
   vs=c.list_object_versions(Bucket=b)
   for v in vs.get('Versions',[])+vs.get('DeleteMarkers',[]):c.delete_object(Bucket=b,Key=v['Key'],VersionId=v['VersionId'])
   c.delete_bucket(Bucket=b)
  if own['image2']:ec22.deregister_image(ImageId=own['image2'])
  if own['image']:ec2.deregister_image(ImageId=own['image'])
  if own['replica']:rds2.delete_db_instance(DBInstanceIdentifier=name+'-dr',SkipFinalSnapshot=True)
  if own['restore']:rds.delete_db_instance(DBInstanceIdentifier=name+'-restored',SkipFinalSnapshot=True)
  for x in rds.describe_db_instances()['DBInstances']:
   if x['DBInstanceIdentifier'].startswith(name):rds.delete_db_instance(DBInstanceIdentifier=x['DBInstanceIdentifier'],SkipFinalSnapshot=True)
  if own['snap']:rds.delete_db_snapshot(DBSnapshotIdentifier=name)
  if own['selection']:bk.delete_backup_selection(BackupPlanId=own['plan'],SelectionId=own['selection'])
  if own['plan']:bk.delete_backup_plan(BackupPlanId=own['plan'])
  for c,yes in [(bk,own['vault']),(bk2,own['vault2'])]:
   if yes:
    c.delete_backup_vault(BackupVaultName=name)
  if own['role']:iam.delete_role(RoleName=name)
  check(not bk.list_backup_vaults()['BackupVaultList'] and not bk2.list_backup_vaults()['BackupVaultList'] and not rds.describe_db_instances()['DBInstances'] and not rds2.describe_db_instances()['DBInstances'] and not s3.list_buckets()['Buckets'],'own backup/DB/AMI/DNS/bucket/role fixtures cleaned')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener open')
  except OSError:pass
  print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
