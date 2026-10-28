"""Owned Moto + local Terraform drift/import/move/lock probe; no real AWS/shared reset/Docker."""
import json,logging,os,socket,subprocess,time
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--terraform',required=True,help='Path to an installed Terraform binary; this lab installs nothing')
parser.add_argument('--plugin-dir',required=True,help='Existing provider mirror/cache containing hashicorp/aws 6.70.0')
args=parser.parse_args()
TF=Path(args.terraform).resolve();PLUGINS=Path(args.plugin_dir).resolve()
if not TF.is_file() or not os.access(TF,os.X_OK):parser.error('Terraform executable missing; use an installed binary path')
if not PLUGINS.is_dir():parser.error('Provider cache missing; use an existing pinned AWS provider 6.70.0 mirror')
APP=Path(__file__).resolve().parents[2];ROOT=APP/'.overhaul-evidence/lab26-runs';ROOT.mkdir(parents=True,exist_ok=True);RUN=ROOT/('run-'+str(time.time_ns()));RUN.mkdir()

for k in list(os.environ):
 if k in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN','AWS_ENDPOINT_URL'] or k.startswith('TF_CLI_ARGS'):os.environ.pop(k,None)
os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_SHARED_CREDENTIALS_FILE=str(RUN/'credentials'),AWS_CONFIG_FILE=str(RUN/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='ap-south-1',TF_IN_AUTOMATION='1',CHECKPOINT_DISABLE='1',TF_DATA_DIR=str(RUN/'tfdata'))
import boto3
from botocore.exceptions import ClientError
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();END=f'http://{host}:{port}';name='lab26-'+str(time.time_ns());owned={'backend':False,'archive':False,'vpc':None,'sg':None};checks=0;initialized=False
s3=boto3.client('s3',endpoint_url=END,region_name='ap-south-1',aws_access_key_id='test',aws_secret_access_key='test');ec2=boto3.client('ec2',endpoint_url=END,region_name='ap-south-1',aws_access_key_id='test',aws_secret_access_key='test')
def tf(*args,allowed=(0,)):
 print('$ terraform '+' '.join(args),flush=True);r=subprocess.run([str(TF),*args,'-no-color'],cwd=RUN,text=True,capture_output=True,timeout=120);print(r.stdout+r.stderr,end='',flush=True)
 if r.returncode not in allowed:raise AssertionError('Terraform exit '+str(r.returncode))
 return r

def check(v,label):
 global checks
 assert v,label;checks+=1;print('PASS',checks,label,flush=True)
def resources():
 r=subprocess.run([str(TF),'state','pull'],cwd=RUN,text=True,capture_output=True,timeout=30);return json.loads(r.stdout)
def config(label='archive',move=False,protect=True):
 moved='moved {\n from = aws_s3_bucket.archive\n to = aws_s3_bucket.invoices\n}\n' if move else ''
 guard='lifecycle { prevent_destroy = true }' if protect else ''
 return f'''resource "aws_security_group" "app" {{
 name = "{name}"
 description = "owned lab26"
 vpc_id = "{owned['vpc']}"
 ingress {{
  from_port = 443
  to_port = 443
  protocol = "tcp"
  cidr_blocks = ["10.42.0.0/16"]
 }}
}}
resource "aws_s3_bucket" "app" {{
 bucket = "{name}-app"
 force_destroy = false
 {guard}
}}
''' + (f'''resource "aws_s3_bucket" "{label}" {{
 bucket = "{name}-archive"
 force_destroy = false
 {guard}
}}
'''+moved if owned['archive'] else '')
def empty_bucket(bucket):
 vs=s3.list_object_versions(Bucket=bucket)
 for v in vs.get('Versions',[])+vs.get('DeleteMarkers',[]):s3.delete_object(Bucket=bucket,Key=v['Key'],VersionId=v['VersionId'])
 for v in s3.list_objects_v2(Bucket=bucket).get('Contents',[]):s3.delete_object(Bucket=bucket,Key=v['Key'])
try:
 print('OWNED MOTO',END,'WORKDIR',RUN,flush=True)
 print(subprocess.check_output([str(TF),'version'],text=True),flush=True)
 backend=name+'-state';s3.create_bucket(Bucket=backend,CreateBucketConfiguration={'LocationConstraint':'ap-south-1'});owned['backend']=True;s3.put_bucket_versioning(Bucket=backend,VersioningConfiguration={'Status':'Enabled'})
 s3.put_public_access_block(Bucket=backend,PublicAccessBlockConfiguration={k:True for k in ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets']});s3.put_bucket_encryption(Bucket=backend,ServerSideEncryptionConfiguration={'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]})
 owned['vpc']=ec2.create_vpc(CidrBlock='10.42.0.0/16')['Vpc']['VpcId']
 (RUN/'provider.tf').write_text(f'''terraform {{
 required_providers {{ aws = {{ source = "hashicorp/aws", version = "6.70.0" }} }}
 backend "s3" {{
  bucket = "{backend}"
  key = "lab26/terraform.tfstate"
  region = "ap-south-1"
  use_lockfile = true
  use_path_style = true
  skip_credentials_validation = true
  skip_requesting_account_id = true
  skip_metadata_api_check = true
  skip_region_validation = true
  skip_s3_checksum = true
  endpoints = {{ s3 = "{END}" }}
 }}
}}
provider "aws" {{
 region = "ap-south-1"
 access_key = "test"
 secret_key = "test"
 skip_credentials_validation = true
 skip_requesting_account_id = true
 skip_metadata_api_check = true
 skip_region_validation = true
 s3_use_path_style = true
 endpoints {{
  ec2 = "{END}"
  s3 = "{END}"
  sts = "{END}"
 }}
}}
''');(RUN/'main.tf').write_text(config())
 tf('fmt');tf('init','-reconfigure','-input=false','-plugin-dir='+str(PLUGINS));initialized=True;tf('validate');tf('plan','-out=initial.tfplan','-input=false');tf('apply','-input=false','initial.tfplan')
 st=resources();check(len(st['resources'])==2,'real apply binds SG+app bucket in S3 backend state')
 owned['sg']=next(x['instances'][0]['attributes']['id'] for x in st['resources'] if x['type']=='aws_security_group')
 s3.put_object(Bucket=name+'-app',Key='TEST-preserve.txt',Body=b'original order TEST-26')
 ec2.authorize_security_group_ingress(GroupId=owned['sg'],IpPermissions=[{'IpProtocol':'tcp','FromPort':22,'ToPort':22,'IpRanges':[{'CidrIp':'0.0.0.0/0'}]}])
 before=resources();tf('plan','-refresh-only','-out=refresh.tfplan','-input=false');tf('apply','-input=false','refresh.tfplan');sg=ec2.describe_security_groups(GroupIds=[owned['sg']])['SecurityGroups'][0]
 check(any(r.get('FromPort')==22 for r in sg['IpPermissions']),'refresh-only apply updates state but leaves broad live ingress unchanged')
 s3.create_bucket(Bucket=name+'-archive',CreateBucketConfiguration={'LocationConstraint':'ap-south-1'});owned['archive']=True;s3.put_object(Bucket=name+'-archive',Key='TEST-original.txt',Body=b'archive TEST-26')
 (RUN/'main.tf').write_text(config());tf('plan','-out=stale.tfplan','-input=false');tf('import','-input=false','aws_s3_bucket.archive',name+'-archive')
 stale=tf('apply','-input=false','stale.tfplan',allowed=(1,));check('Saved plan is stale' in stale.stdout+stale.stderr,'import advances state serial; old saved plan rejected')
 tf('plan','-out=repair.tfplan','-input=false');tf('apply','-input=false','repair.tfplan')
 sg=ec2.describe_security_groups(GroupIds=[owned['sg']])['SecurityGroups'][0];check(len(sg['IpPermissions'])==1 and sg['IpPermissions'][0]['FromPort']==443,'normal apply repairs live drift without replacing SG')
 check(s3.get_object(Bucket=name+'-app',Key='TEST-preserve.txt')['Body'].read()==b'original order TEST-26' and s3.get_object(Bucket=name+'-archive',Key='TEST-original.txt')['Body'].read()==b'archive TEST-26','both original TEST payloads preserved')
 tf('plan','-detailed-exitcode','-input=false',allowed=(0,2))
 old_id=next(x['instances'][0]['attributes']['id'] for x in resources()['resources'] if x['name']=='archive')
 (RUN/'main.tf').write_text(config('invoices',True));tf('plan','-out=move.tfplan','-input=false');tf('apply','-input=false','move.tfplan');st=resources();check(not any(x['name']=='archive' for x in st['resources']) and next(x['instances'][0]['attributes']['id'] for x in st['resources'] if x['name']=='invoices')==old_id,'moved block changes binding address while original bucket identity remains')
 # Native Terraform JSON syntax, same literal resources/identities as the HCL above.
 j={'resource':{'aws_security_group':{'app':{'name':name,'description':'owned lab26','vpc_id':owned['vpc'],'ingress':[{'from_port':443,'to_port':443,'protocol':'tcp','cidr_blocks':['10.42.0.0/16'],'description':'','ipv6_cidr_blocks':[],'prefix_list_ids':[],'security_groups':[],'self':False}]}},'aws_s3_bucket':{n:{'bucket':name+suffix,'force_destroy':False,'lifecycle':{'prevent_destroy':True}} for n,suffix in [('app','-app'),('invoices','-archive')]}}}
 (RUN/'main.tf').unlink();(RUN/'main.tf.json').write_text(json.dumps(j,indent=2));tf('validate');jplan=tf('plan','-detailed-exitcode','-input=false',allowed=(0,2));check(jplan.returncode==0,'native tf.json config is valid and equivalent to the HCL resource state')
 # Provider must use previously applied force_destroy state during replacement.
 force_doc=json.loads(json.dumps(j));app_doc=force_doc['resource']['aws_s3_bucket']['app'];app_doc['bucket']=name+'-replacement';app_doc['force_destroy']=True;app_doc.pop('lifecycle')
 (RUN/'main.tf.json').write_text(json.dumps(force_doc,indent=2));tf('plan','-out=force-first.tfplan','-input=false');force_first=tf('apply','-input=false','force-first.tfplan',allowed=(1,))
 check('BucketNotEmpty' in force_first.stdout+force_first.stderr and s3.get_object(Bucket=name+'-app',Key='TEST-preserve.txt')['Body'].read()==b'original order TEST-26','force_destroy first set with replacement does not delete original nonempty bucket')
 (RUN/'main.tf.json').write_text(json.dumps(j,indent=2))
 deny=tf('plan','-destroy','-input=false',allowed=(1,));check('prevent_destroy' in deny.stdout+deny.stderr,'prevent_destroy blocks proposed destruction while lifecycle remains in config')
 lockkey='lab26/terraform.tfstate.tflock';info={'ID':'11111111-2222-4333-8444-555555555555','Operation':'OperationTypeApply','Who':'lab26-owned-holder','Version':'1.17.0','Created':'2026-10-28T00:00:00Z','Path':backend+'/lab26/terraform.tfstate'}
 s3.put_object(Bucket=backend,Key=lockkey,Body=json.dumps(info).encode(),IfNoneMatch='*')
 blocked=tf('plan','-lock-timeout=0s','-input=false',allowed=(1,));check('Error acquiring the state lock' in blocked.stdout+blocked.stderr,'native S3 conditional lock rejects second Terraform operation')
 s3.delete_object(Bucket=backend,Key=lockkey)
 clean=tf('plan','-detailed-exitcode','-input=false',allowed=(0,2));check(clean.returncode==0,'final real plan has zero changes and releases owned lock')
 print('STATE SERIAL',resources()['serial'],'CURRENT ADDRESSES',[(x['type'],x['name']) for x in resources()['resources']],flush=True)
 print('BEHAVIOR CHECKS',checks,flush=True)
finally:
 try:
  if initialized:
   for b in [name+'-app',name+'-archive']:
    if any(x['Name']==b for x in s3.list_buckets()['Buckets']):empty_bucket(b)
   (RUN/'main.tf.json').unlink(missing_ok=True)
   (RUN/'main.tf').write_text(config('invoices',True,False) if owned['archive'] else config(protect=False));tf('destroy','-auto-approve','-input=false')
   check(not resources().get('resources'),'actual owned Terraform destroy leaves backend state empty')
  if owned['archive'] and any(x['Name']==name+'-archive' for x in s3.list_buckets()['Buckets']):empty_bucket(name+'-archive');s3.delete_bucket(Bucket=name+'-archive')
  if owned['vpc']:ec2.delete_vpc(VpcId=owned['vpc'])
  if owned['backend']:empty_bucket(name+'-state');s3.delete_bucket(Bucket=name+'-state')
  check(not s3.list_buckets()['Buckets'],'owned buckets including all backend versions/lock removed')
 finally:
  server.stop();server._server.server_close()
  try:
   with socket.create_connection((host,port),timeout=.5):raise AssertionError('listener open')
  except OSError:pass
  print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
