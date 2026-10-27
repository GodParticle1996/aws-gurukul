"""Org22 preparation: own loopback Moto, virtual account metadata; no real AWS accounts."""
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
def client(s,region='us-east-1',creds=None):
 kw={'aws_access_key_id':'test','aws_secret_access_key':'test'} if creds is None else {'aws_access_key_id':creds['AccessKeyId'],'aws_secret_access_key':creds['SecretAccessKey'],'aws_session_token':creds['SessionToken']}
 return boto3.client(s,endpoint_url=endpoint,region_name=region,**kw)
org=client('organizations');sts=client('sts');name='lab22-'+str(time.time_ns());own={'organization':False,'accounts':[],'ous':[],'policies':[],'delegation':False,'access':False,'bucket':None};checks=0;member=None

def check(v,label):
 global checks
 assert v,label;checks+=1;print('PASS',checks,label,flush=True)
def attempt(label,fn):
 try:r=fn();print(label,'ACCEPTED',json.dumps(r,default=str)[:700],flush=True);return r
 except ClientError as e:print(label,'ERROR',e.response['Error']['Code'],str(e)[:120],flush=True);return None
try:
 print('OWNED MOTO',endpoint,flush=True)
 o=org.create_organization(FeatureSet='ALL')['Organization'];own['organization']=True;root=org.list_roots()['Roots'][0]['Id'];print('ORGANIZATION',json.dumps(o),'ROOT',root,flush=True)
 ids={}
 for label in ['sandbox','audit']:
  status=org.create_account(Email=f'{label}-{name}@example.invalid',AccountName=name+'-'+label)['CreateAccountStatus'];poll=org.describe_create_account_status(CreateAccountRequestId=status['Id'])['CreateAccountStatus'];print('CREATE ACCOUNT STATUS',json.dumps(poll,default=str),flush=True);aid=poll.get('AccountId')
  assert aid,'Moto account ID unavailable';ids[label]=aid;own['accounts'].append(aid)
 check(len(org.list_accounts()['Accounts'])==3,'management+2virtual member accounts exist')
 for label,parent in [('Workloads',root),('Production',None),('Sandbox',None)]:
  ou=org.create_organizational_unit(ParentId=parent or own['ous'][0],Name=label)['OrganizationalUnit']['Id'];own['ous'].append(ou)
 org.move_account(AccountId=ids['sandbox'],SourceParentId=root,DestinationParentId=own['ous'][1]);org.move_account(AccountId=ids['sandbox'],SourceParentId=own['ous'][1],DestinationParentId=own['ous'][2])
 check(org.list_parents(ChildId=ids['sandbox'])['Parents'][0]['Id']==own['ous'][2],'actual nested OU move and parent readback')
 for target in [root,*own['ous'],ids['sandbox']]:
  rows=org.list_policies_for_target(TargetId=target,Filter='SERVICE_CONTROL_POLICY')['Policies'];print('DEFAULT ATTACHMENTS',target,[(p['Id'],p['Name']) for p in rows],flush=True)
 policy={'Version':'2012-10-17','Statement':[{'Sid':'RegionalAPI','Effect':'Deny','Action':['ec2:*','rds:*','s3:CreateBucket'],'Resource':'*','Condition':{'StringNotEquals':{'aws:RequestedRegion':'ap-south-1'}}},{'Sid':'BucketLocation','Effect':'Deny','Action':'s3:CreateBucket','Resource':'*','Condition':{'StringNotEquals':{'s3:LocationConstraint':'ap-south-1'}}},{'Sid':'Audit','Effect':'Deny','Action':['cloudtrail:StopLogging','cloudtrail:DeleteTrail'],'Resource':'*'}]}
 pid=org.create_policy(Content=json.dumps(policy),Description='Owned course region/audit guard only',Name=name,Type='SERVICE_CONTROL_POLICY')['Policy']['PolicySummary']['Id'];own['policies'].append(pid);org.attach_policy(PolicyId=pid,TargetId=own['ous'][2])
 check(any(p['Id']==pid for p in org.list_policies_for_target(TargetId=own['ous'][2],Filter='SERVICE_CONTROL_POLICY')['Policies']),'custom SCP attached to Sandbox metadata')
 service='config-multiaccountsetup.amazonaws.com'
 result=attempt('REGISTER WITHOUT TRUSTED ACCESS',lambda:org.register_delegated_administrator(AccountId=ids['audit'],ServicePrincipal=service))
 if result is not None:own['delegation']=True;org.deregister_delegated_administrator(AccountId=ids['audit'],ServicePrincipal=service);own['delegation']=False
 org.enable_aws_service_access(ServicePrincipal=service);own['access']=True;org.register_delegated_administrator(AccountId=ids['audit'],ServicePrincipal=service);own['delegation']=True
 check(any(a['Id']==ids['audit'] for a in org.list_delegated_administrators(ServicePrincipal=service)['DelegatedAdministrators']),'service-specific delegated admin readback')
 creds=sts.assume_role(RoleArn=f"arn:aws:iam::{ids['sandbox']}:role/OrganizationAccountAccessRole",RoleSessionName='lab22-owned-test')['Credentials'];msts=client('sts',creds=creds);who=msts.get_caller_identity();check(who['Account']==ids['sandbox'],'temporary Moto credentials identify the virtual member account; not real trust enforcement proof')
 member=client('s3','eu-west-1',creds);b=name+'-forbidden';result=attempt('MEMBER OUTSIDE_REGION SCP ENFORCEMENT',lambda:member.create_bucket(Bucket=b,CreateBucketConfiguration={'LocationConstraint':'eu-west-1'}))
 if result is not None:
  own['bucket']=b;print('MOTO SCP NOT ENFORCED: forbidden request accepted',flush=True);check(member.get_bucket_location(Bucket=b)['LocationConstraint']=='eu-west-1','actual forbidden-region local bucket metadata shows evaluator gap')
 else:check(True,'forbidden request rejected; inspect captured API error before attributing to SCP')
 print('ACCOUNT FIELDS',json.dumps(org.list_accounts()['Accounts'],default=str),flush=True)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  if own['bucket']:member.delete_bucket(Bucket=own['bucket'])
  if own['delegation']:org.deregister_delegated_administrator(AccountId=ids['audit'],ServicePrincipal='config-multiaccountsetup.amazonaws.com')
  if own['access']:org.disable_aws_service_access(ServicePrincipal='config-multiaccountsetup.amazonaws.com')
  for p in own['policies']:
   for t in org.list_targets_for_policy(PolicyId=p)['Targets']:org.detach_policy(PolicyId=p,TargetId=t['TargetId'])
   org.delete_policy(PolicyId=p)
  for a in own['accounts']:
   parent=org.list_parents(ChildId=a)['Parents'][0]['Id']
   if parent!=root:org.move_account(AccountId=a,SourceParentId=parent,DestinationParentId=root)
  for ou in reversed(own['ous']):org.delete_organizational_unit(OrganizationalUnitId=ou)
  for a in own['accounts']:org.remove_account_from_organization(AccountId=a)
  if own['organization']:
   check(len(org.list_accounts()['Accounts'])==1,'own member memberships removed; this is not real AWS account closure')
   org.delete_organization()
  check(True,'own organization/OU/policy/delegation/bucket fixtures cleaned')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener open')
  except OSError:pass
  print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
