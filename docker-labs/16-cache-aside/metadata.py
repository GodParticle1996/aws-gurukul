"""Scoped Moto cache metadata capability probe. Never connects to real AWS."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import time
import logging
import socket
from moto.server import ThreadedMotoServer

ROOT=Path(__file__).resolve().parent
LAB=ROOT/'.lab'; LAB.mkdir(exist_ok=True)
if os.environ.get('AWS_ACCESS_KEY_ID')!='test' or os.environ.get('AWS_SECRET_ACCESS_KEY')!='test':raise SystemExit('Source existing lab env.sh for dummy keys')
logging.getLogger('werkzeug').setLevel(logging.ERROR)
AWS=shutil.which('aws')
if not AWS:raise SystemExit('Source ../env.sh to use the existing AWS CLI; no automatic installation')
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();ENDPOINT=f'http://{host}:{port}'
print('OWNED EPHEMERAL MOTO '+ENDPOINT,flush=True)
for key in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(key,None)
os.environ.update(AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_DEFAULT_REGION='ap-south-1',AWS_MAX_ATTEMPTS='1',AWS_PAGER='')
STATE=LAB/'resources.json'
ids={'token':'lab16-'+str(time.time_ns()),'subnets':[],'sgs':[]}
def save():STATE.write_text(json.dumps(ids,indent=2))
def call(*args,optional=False):
 print('$ aws --endpoint-url '+ENDPOINT+' '+shlex.join(args),flush=True)
 r=subprocess.run([AWS,'--endpoint-url',ENDPOINT,'--region','ap-south-1',*args,'--output','json'],capture_output=True,text=True,timeout=30)
 print(r.stdout+r.stderr,end='',flush=True)
 if r.returncode:
  if optional:return None
  raise RuntimeError('CLI failed '+str(args[:2]))
 return json.loads(r.stdout) if r.stdout.strip() else {}
def cleanup():
 global call
 original_call=call
 def best_effort(*args,**kwargs):return original_call(*args,optional=True)
 call=best_effort
 if ids.get('dax'):call('dax','delete-cluster','--cluster-name',ids['dax'])
 for name in ids.get('groups',[]):call('elasticache','delete-replication-group','--replication-group-id',name,'--no-retain-primary-cluster')
 if ids.get('daxSubnet'):call('dax','delete-subnet-group','--subnet-group-name',ids['token'],optional=True)
 if ids.get('cacheSubnet'):call('elasticache','delete-cache-subnet-group','--cache-subnet-group-name',ids['token'])
 if ids.get('role'):
  if ids.get('policy'):call('iam','delete-role-policy','--role-name',ids['role'],'--policy-name','catalog-read')
  call('iam','delete-role','--role-name',ids['role'])
 for sg in ids['sgs']:call('ec2','delete-security-group','--group-id',sg)
 for subnet in ids['subnets']:call('ec2','delete-subnet','--subnet-id',subnet)
 if ids.get('vpc'):call('ec2','delete-vpc','--vpc-id',ids['vpc'])
 if ids.get('groups'):call('elasticache','describe-replication-groups','--query','ReplicationGroups[].ReplicationGroupId')
 if ids.get('dax'):call('dax','describe-clusters','--query','Clusters[].ClusterName')
 STATE.rename(LAB/'last-cleaned-resources.json')
 print('METADATA DELETE REQUESTS COMPLETE; unsupported APIs/tombstones discarded with owned process exit',flush=True)

def probe():
 save();token=ids['token']
 ids['vpc']=call('ec2','create-vpc','--cidr-block','10.116.0.0/16','--query','Vpc.VpcId');save()
 for i,az in enumerate(['ap-south-1a','ap-south-1b','ap-south-1c']):
  ids['subnets'].append(call('ec2','create-subnet','--vpc-id',ids['vpc'],'--cidr-block',f'10.116.{i}.0/24','--availability-zone',az,'--query','Subnet.SubnetId'));save()
 for suffix in ['app','cache']:
  ids['sgs'].append(call('ec2','create-security-group','--vpc-id',ids['vpc'],'--group-name',token+'-'+suffix,'--description','Local lab16 metadata','--query','GroupId'));save()
 for port in ['6379','9111']:call('ec2','authorize-security-group-ingress','--group-id',ids['sgs'][1],'--protocol','tcp','--port',port,'--source-group',ids['sgs'][0],'--query','Return')
 call('elasticache','create-cache-subnet-group','--cache-subnet-group-name',token,'--cache-subnet-group-description','Lab16 private metadata','--subnet-ids',*ids['subnets'],'--query','CacheSubnetGroup.CacheSubnetGroupName');ids['cacheSubnet']=True;save()
 common=['--replication-group-description','Lab16 Valkey cache metadata','--engine','valkey','--engine-version','8.0','--cache-node-type','cache.t4g.small','--cache-subnet-group-name',token,'--security-group-ids',ids['sgs'][1],'--transit-encryption-enabled','--at-rest-encryption-enabled']
 ids['groups']=[];save()
 name=token+'-catalog'
 r=call('elasticache','create-replication-group','--replication-group-id',name,*common,'--num-cache-clusters','2','--preferred-cache-cluster-azs','ap-south-1a','ap-south-1b','--automatic-failover-enabled','--multi-az-enabled','--query','ReplicationGroup.{Id:ReplicationGroupId,State:Status,Engine:Engine,MultiAZ:MultiAZ,Failover:AutomaticFailover,Members:MemberClusters,Nodes:NodeGroups[].NodeGroupMembers[].{AZ:PreferredAvailabilityZone,Role:CurrentRole},TLS:TransitEncryptionEnabled,AtRest:AtRestEncryptionEnabled}',optional=True)
 if r is not None:ids['groups'].append(name);save()
 if ids['groups']:
  call('elasticache','describe-replication-groups','--replication-group-id',name,'--query','ReplicationGroups[].{Id:ReplicationGroupId,State:Status,Members:MemberClusters,MultiAZ:MultiAZ,Failover:AutomaticFailover}')
  call('elasticache','describe-cache-clusters','--show-cache-node-info','--query','CacheClusters[].{Id:CacheClusterId,Engine:Engine,SGs:SecurityGroups,TLS:TransitEncryptionEnabled}',optional=True)
  call('elasticache','modify-replication-group','--replication-group-id',name,'--replication-group-description','Reviewed lab16 metadata','--automatic-failover-enabled','--multi-az-enabled','--apply-immediately','--query','ReplicationGroup.{State:Status,MultiAZ:MultiAZ,Failover:AutomaticFailover,Description:Description}',optional=True)
  call('elasticache','wait','replication-group-available','--replication-group-id',name,optional=True)
 # Current SDK and Moto may omit newer Valkey durability features. Do not fabricate success.
 call('elasticache','create-serverless-cache','--serverless-cache-name',token+'-serverless','--engine','valkey','--subnet-ids',*ids['subnets'][:2],'--security-group-ids',ids['sgs'][1],optional=True)
 # Only record a created serverless resource if the API really succeeded.
 serverless=call('elasticache','describe-serverless-caches','--serverless-cache-name',token+'-serverless',optional=True)
 if serverless and serverless.get('ServerlessCaches'):
  call('elasticache','delete-serverless-cache','--serverless-cache-name',token+'-serverless',optional=True)
 trust={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'dax.amazonaws.com'},'Action':'sts:AssumeRole'}]}
 role=token+'-dax';arn=call('iam','create-role','--role-name',role,'--assume-role-policy-document',json.dumps(trust),'--query','Role.Arn');ids['role']=role;save()
 policy={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['dynamodb:GetItem','dynamodb:BatchGetItem','dynamodb:Query','dynamodb:Scan','dynamodb:DescribeTable'],'Resource':'arn:aws:dynamodb:ap-south-1:123456789012:table/'+token+'-catalog'}]}
 call('iam','put-role-policy','--role-name',role,'--policy-name','catalog-read','--policy-document',json.dumps(policy));ids['policy']=True;save()
 subnet=call('dax','create-subnet-group','--subnet-group-name',token,'--description','Lab16 private','--subnet-ids',*ids['subnets'],optional=True)
 if subnet is not None:ids['daxSubnet']=True;save()
 name=token+'-dax'
 r=call('dax','create-cluster','--cluster-name',name,'--node-type','dax.t3.small','--replication-factor','3','--iam-role-arn',arn,'--subnet-group-name',token,'--security-group-ids',ids['sgs'][1],'--availability-zones','ap-south-1a','ap-south-1b','ap-south-1c','--sse-specification','Enabled=true','--cluster-endpoint-encryption-type','TLS','--query','Cluster.{Name:ClusterName,State:Status,TLS:ClusterEndpointEncryptionType,Endpoint:ClusterDiscoveryEndpoint,SSE:SSEDescription,Nodes:Nodes[].AvailabilityZone}',optional=True)
 if r is not None:ids['dax']=name;save();call('dax','describe-clusters','--cluster-names',name,'--query','Clusters[].{Name:ClusterName,State:Status,TLS:ClusterEndpointEncryptionType,Nodes:Nodes[].AvailabilityZone}')

if __name__=='__main__':
 try:probe()
 finally:
  try:cleanup()
  finally:
   server.stop();server._server.server_close()
   try:
    with socket.create_connection((host,port),timeout=.5):raise AssertionError('Owned listener still open')
   except OSError:pass
   (LAB/'metadata-endpoint.json').write_text(json.dumps({'host':host,'port':port,'serverStopped':True}))
   print('OWNED MOTO STOPPED / LISTENER CLOSED',flush=True)
