"""Lab19: actual local envelope crypto, secret stages and protection metadata."""
import base64,json,logging,os,socket,time
from pathlib import Path
LAB=Path(__file__).resolve().parent/'.lab';LAB.mkdir(exist_ok=True)
for k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='us-east-1',AWS_MAX_ATTEMPTS='1')
import boto3
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://{host}:{port}'
clients={s:boto3.client(s,endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test') for s in ['kms','s3','secretsmanager','ssm','wafv2','ec2','elbv2','guardduty']}
kms,s3,sm,ssm,waf,ec2,elb,gd=(clients[s] for s in ['kms','s3','secretsmanager','ssm','wafv2','ec2','elbv2','guardduty'])
name='lab19-'+str(time.time_ns());owned={'keys':[],'secrets':[],'params':[],'buckets':[],'acls':[],'albs':[],'subnets':[],'vpcs':[],'detectors':[]};checks=0

def check(value,label):
 global checks
 assert value,label;checks+=1;print('PASS',checks,label,flush=True)
def call(service,op,**args):
 print('API',service,op,json.dumps(args,default=lambda v:'<bytes '+str(len(v))+'>' if isinstance(v,bytes) else str(v)),flush=True)
 r=getattr(clients[service],op)(**args);r.pop('ResponseMetadata',None);return r

def err(fn):
 try:fn();return None
 except ClientError as e:return e.response['Error']['Code']
try:
 print('OWNED MOTO',endpoint,flush=True)
 key=call('kms','create_key',Description='Lab19 only: invoices')['KeyMetadata'];kid=key['KeyId'];owned['keys'].append(kid)
 call('kms','create_alias',AliasName='alias/'+name,TargetKeyId=kid)
 call('kms','enable_key_rotation',KeyId=kid,RotationPeriodInDays=180)
 rot=call('kms','get_key_rotation_status',KeyId=kid);print('ROTATION',json.dumps(rot),flush=True);check(rot['KeyRotationEnabled'],'rotation enabled; inspect returned period support')
 context={'purpose':'invoice','tenant':'shopkaro'}
 small=call('kms','encrypt',KeyId=kid,Plaintext=b'TEST invoice 101',EncryptionContext=context)
 check(call('kms','decrypt',CiphertextBlob=small['CiphertextBlob'],EncryptionContext=context)['Plaintext']==b'TEST invoice 101','small KMS plaintext roundtrip')
 check(err(lambda:kms.decrypt(CiphertextBlob=small['CiphertextBlob'],EncryptionContext={'purpose':'invoice','tenant':'other'}))=='InvalidCiphertextException','wrong encryption context fails')
 data=call('kms','generate_data_key',KeyId=kid,KeySpec='AES_256',EncryptionContext=context)
 content=b'TEST invoice line, no customer data\n'*200;nonce=os.urandom(12);aad=json.dumps(context,sort_keys=True).encode();sealed=AESGCM(data['Plaintext']).encrypt(nonce,content,aad)
 envelope={'wrappedKey':base64.b64encode(data['CiphertextBlob']).decode(),'nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(sealed).decode(),'context':context}
 del data
 recovered=call('kms','decrypt',CiphertextBlob=base64.b64decode(envelope['wrappedKey']),EncryptionContext=context)['Plaintext'];check(AESGCM(recovered).decrypt(nonce,sealed,aad)==content,'7000-byte payload AES-GCM + KMS-wrapped key roundtrip')
 try:AESGCM(recovered).decrypt(nonce,sealed[:-1]+bytes([sealed[-1]^1]),aad);raise AssertionError('tampered accepted')
 except InvalidTag:check(True,'modified ciphertext fails authentication')
 del recovered
 call('kms','disable_key',KeyId=kid);disabled=err(lambda:kms.decrypt(CiphertextBlob=small['CiphertextBlob'],EncryptionContext=context));print('DISABLED_KEY_DECRYPT',disabled or 'ACCEPTED (emulator gap)',flush=True);call('kms','enable_key',KeyId=kid)
 b=name+'-invoices';call('s3','create_bucket',Bucket=b);owned['buckets'].append(b);call('s3','put_object',Bucket=b,Key='old.txt',Body=b'TEST old invoice')
 encryption={'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'aws:kms','KMSMasterKeyID':key['Arn']},'BucketKeyEnabled':True}]}
 call('s3','put_bucket_encryption',Bucket=b,ServerSideEncryptionConfiguration=encryption);call('s3','put_object',Bucket=b,Key='new.txt',Body=b'TEST new invoice')
 old=call('s3','head_object',Bucket=b,Key='old.txt');new=call('s3','head_object',Bucket=b,Key='new.txt');check(old.get('ServerSideEncryption')!='aws:kms' and new.get('ServerSideEncryption')=='aws:kms' and new.get('BucketKeyEnabled') is True,'default encryption affects new writes; old object unchanged')
 secret=call('secretsmanager','create_secret',Name=name+'-db',KmsKeyId=key['Arn'],SecretString='{"username":"test_app","password":"TEST_ONLY_old"}',ClientRequestToken='a'*32);sid=secret['ARN'];owned['secrets'].append(sid)
 # Local TEST backend dict demonstrates set/test before label promotion. Not PostgreSQL/Lambda.
 backend={'password':'TEST_ONLY_old'};newval={'username':'test_app','password':'TEST_ONLY_new'}
 v2=call('secretsmanager','put_secret_value',SecretId=sid,ClientRequestToken='b'*32,SecretString=json.dumps(newval),VersionStages=['AWSPENDING'])['VersionId']
 check(json.loads(call('secretsmanager','get_secret_value',SecretId=sid)['SecretString'])['password']==backend['password'],'pending secret does not replace current')
 check(json.loads(call('secretsmanager','get_secret_value',SecretId=sid,VersionStage='AWSPENDING')['SecretString'])['password']!=backend['password'],'pending credential cannot authenticate before backend set')
 backend['password']=newval['password'];check(json.loads(call('secretsmanager','get_secret_value',SecretId=sid,VersionStage='AWSPENDING')['SecretString'])['password']==backend['password'],'set then test TEST backend before promotion')
 call('secretsmanager','update_secret_version_stage',SecretId=sid,VersionStage='AWSCURRENT',MoveToVersionId=v2,RemoveFromVersionId=secret['VersionId'])
 versions=call('secretsmanager','describe_secret',SecretId=sid)['VersionIdsToStages'];check('AWSPREVIOUS' in versions[secret['VersionId']] and 'AWSCURRENT' in versions[v2],'finish promotes actual version labels')
 call('secretsmanager','update_secret_version_stage',SecretId=sid,VersionStage='AWSPENDING',RemoveFromVersionId=v2)
 check(json.loads(call('secretsmanager','get_secret_value',SecretId=sid,VersionStage='AWSCURRENT')['SecretString'])['password']==backend['password'],'explicit AWSCURRENT credential matches TEST backend')
 default=call('secretsmanager','get_secret_value',SecretId=sid);print('DEFAULT_SECRET_VERSION_MOTO_GAP',json.dumps({'matchesPromotedVersion':default['VersionId']==v2,'note':'Moto default-version pointer can remain old after label move; explicit AWSCURRENT verified'}),flush=True)
 # Isolated throwaway secret reveals Moto no-Lambda rotation gap; do not call real handler.
 probe=call('secretsmanager','create_secret',Name=name+'-rotation-probe',SecretString='TEST_ONLY');owned['secrets'].append(probe['ARN'])
 rotation=call('secretsmanager','rotate_secret',SecretId=probe['ARN'],RotationRules={'AutomaticallyAfterDays':30},RotateImmediately=False)
 print('ROTATION_WITHOUT_LAMBDA_MOTO_GAP',json.dumps(rotation),json.dumps(call('secretsmanager','describe_secret',SecretId=probe['ARN']),default=str),flush=True)
 p='/'+name+'/api-key';call('ssm','put_parameter',Name=p,Type='SecureString',KeyId=key['Arn'],Value='TEST_ONLY_config');owned['params'].append(p)
 encrypted=call('ssm','get_parameter',Name=p,WithDecryption=False)['Parameter'];decrypted=call('ssm','get_parameter',Name=p,WithDecryption=True)['Parameter'];check(encrypted['Value']!='TEST_ONLY_config' and decrypted['Value']=='TEST_ONLY_config','SSM ciphertext/default versus requested plaintext')
 vpc=call('ec2','create_vpc',CidrBlock='10.219.0.0/16')['Vpc']['VpcId'];owned['vpcs'].append(vpc)
 for cidr,az in [('10.219.1.0/24','us-east-1a'),('10.219.2.0/24','us-east-1b')]:owned['subnets'].append(call('ec2','create_subnet',VpcId=vpc,CidrBlock=cidr,AvailabilityZone=az)['Subnet']['SubnetId'])
 alb=call('elbv2','create_load_balancer',Name=name[-25:],Subnets=owned['subnets'],Scheme='internal',Type='application')['LoadBalancers'][0]['LoadBalancerArn'];owned['albs'].append(alb)
 visibility={'SampledRequestsEnabled':True,'CloudWatchMetricsEnabled':True,'MetricName':'lab19'}
 rules=[{'Name':'Common','Priority':0,'Statement':{'ManagedRuleGroupStatement':{'VendorName':'AWS','Name':'AWSManagedRulesCommonRuleSet'}},'OverrideAction':{'None':{}},'VisibilityConfig':visibility},{'Name':'LoginRate','Priority':1,'Statement':{'RateBasedStatement':{'Limit':100,'EvaluationWindowSec':60,'AggregateKeyType':'IP','ScopeDownStatement':{'ByteMatchStatement':{'SearchString':b'/login','FieldToMatch':{'UriPath':{}},'TextTransformations':[{'Priority':0,'Type':'NONE'}],'PositionalConstraint':'EXACTLY'}}}},'Action':{'Block':{}},'VisibilityConfig':visibility}]
 acl=call('wafv2','create_web_acl',Name=name,Scope='REGIONAL',DefaultAction={'Allow':{}},Rules=rules,VisibilityConfig=visibility)['Summary'];owned['acls'].append(acl)
 call('wafv2','associate_web_acl',WebACLArn=acl['ARN'],ResourceArn=alb);check(call('wafv2','get_web_acl_for_resource',ResourceArn=alb)['WebACL']['ARN']==acl['ARN'],'actual Regional ALB association metadata')
 current=call('wafv2','get_web_acl',Name=name,Scope='REGIONAL',Id=acl['Id']);changed=call('wafv2','update_web_acl',Name=name,Scope='REGIONAL',Id=acl['Id'],DefaultAction={'Allow':{}},Rules=rules,VisibilityConfig=visibility,LockToken=current['LockToken'])
 stale=err(lambda:waf.update_web_acl(Name=name,Scope='REGIONAL',Id=acl['Id'],DefaultAction={'Allow':{}},Rules=rules,VisibilityConfig=visibility,LockToken=current['LockToken']));print('STALE_WAF_TOKEN',stale or 'ACCEPTED (emulator gap)',flush=True)
 detector=call('guardduty','create_detector',Enable=True)['DetectorId'];owned['detectors'].append(detector)
 check(call('guardduty','get_detector',DetectorId=detector)['Status']=='ENABLED','GuardDuty detector enabled metadata')
 sample_error=err(lambda:gd.create_sample_findings(DetectorId=detector,FindingTypes=['UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS']))
 print('GUARDDUTY_SAMPLE_GAP',sample_error or 'accepted',flush=True)
 find_error=err(lambda:gd.list_findings(DetectorId=detector));print('GUARDDUTY_LIST_FINDINGS_GAP',find_error or 'accepted','no live threat detection claimed',flush=True)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  for d in owned['detectors']:gd.delete_detector(DetectorId=d)
  for a in owned['acls']:
   for lb in owned['albs']:waf.disassociate_web_acl(ResourceArn=lb)
   latest=waf.get_web_acl(Name=name,Scope='REGIONAL',Id=a['Id']);waf.delete_web_acl(Name=name,Scope='REGIONAL',Id=a['Id'],LockToken=latest['LockToken'])
  for lb in owned['albs']:elb.delete_load_balancer(LoadBalancerArn=lb)
  for s in owned['subnets']:ec2.delete_subnet(SubnetId=s)
  for v in owned['vpcs']:ec2.delete_vpc(VpcId=v)
  for p in owned['params']:ssm.delete_parameter(Name=p)
  for s in owned['secrets']:sm.delete_secret(SecretId=s,ForceDeleteWithoutRecovery=True)
  for b in owned['buckets']:
   for obj in s3.list_objects_v2(Bucket=b).get('Contents',[]):s3.delete_object(Bucket=b,Key=obj['Key'])
   s3.delete_bucket(Bucket=b)
  for k in owned['keys']:kms.delete_alias(AliasName='alias/'+name);kms.schedule_key_deletion(KeyId=k,PendingWindowInDays=7)
  check(all(kms.describe_key(KeyId=k)['KeyMetadata']['KeyState']=='PendingDeletion' for k in owned['keys']) and all(err(lambda p=p:ssm.get_parameter(Name=p))=='ParameterNotFound' for p in owned['params']) and not elb.describe_load_balancers()['LoadBalancers'] and not sm.list_secrets()['SecretList'] and not s3.list_buckets()['Buckets'] and not waf.list_web_acls(Scope='REGIONAL')['WebACLs'] and not gd.list_detectors()['DetectorIds'],'owned resources removed; KMS key scheduled7days')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener still open')
  except OSError:pass
  (LAB/'last-run.json').write_text(json.dumps({'endpoint':endpoint,'listenerClosed':True,'checks':checks,'resources':owned},indent=2));print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
