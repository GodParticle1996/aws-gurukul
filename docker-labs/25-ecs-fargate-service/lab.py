"""Lab25: owned loopback Moto only. ECR hardening, both ECS roles, Fargate task definitions and a service with a
circuit breaker, plus a documented start-contract evaluator over the real Moto metadata. No real AWS, Docker run,
image pull, container or ALB probe."""
import hashlib, json, logging, os, socket, time
from datetime import datetime, timezone
from pathlib import Path
LAB = Path(__file__).resolve().parent / '.lab'; LAB.mkdir(exist_ok=True)
for k in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN']: os.environ.pop(k, None)
os.environ.update(AWS_ACCESS_KEY_ID='test', AWS_SECRET_ACCESS_KEY='test', AWS_SHARED_CREDENTIALS_FILE=str(LAB / 'credentials'),
                  AWS_CONFIG_FILE=str(LAB / 'config'), AWS_EC2_METADATA_DISABLED='true', AWS_DEFAULT_REGION='ap-south-1', AWS_MAX_ATTEMPTS='1')
import boto3
from botocore.exceptions import ClientError, WaiterError
from botocore.parsers import ResponseParserError
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)  # hide request lines; the lab prints its own results
server = ThreadedMotoServer(ip_address='127.0.0.1', port=0, verbose=False); server.start()
host, port = server.get_host_and_port(); endpoint = f'http://{host}:{port}'
def client(s): return boto3.client(s, endpoint_url=endpoint, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
ecr, ecs, iam, ec2, elb = client('ecr'), client('ecs'), client('iam'), client('ec2'), client('elbv2')
stamp = str(time.time_ns()); name = 'lab25-' + stamp; short = 'l25' + stamp[-7:]; REPO = name + '/orders'; checks = 0
own = {'repo': None, 'roles': [], 'policies': [], 'cluster': None, 'tds': [], 'services': [], 'vpc': None, 'subnets': [], 'sgs': [], 'rt': None, 'eps': [], 'tgs': []}
ACCT = '123456789012'; INVOICES = 'arn:aws:s3:::shopkaro-invoices/*'

def check(ok, label):
    global checks
    assert ok, label; checks += 1; print('PASS', checks, label, flush=True)

def code(e):  # Moto answers some unimplemented calls with an HTML 500 page
    if isinstance(e, ResponseParserError): return 'HTTP 500'
    return 'HTTP 500' if e.response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 500 else e.response['Error']['Code']

def manifest(n):  # Moto digests an image from its layer digests, so each image needs its own layer
    layer = 'sha256:' + hashlib.sha256(b'layer-%d' % n).hexdigest()
    return json.dumps({'schemaVersion': 2, 'mediaType': 'application/vnd.docker.distribution.manifest.v2+json',
                       'config': {'mediaType': 'application/vnd.docker.container.image.v1+json', 'size': 1469, 'digest': 'sha256:' + hashlib.sha256(b'config-%d' % n).hexdigest()},
                       'layers': [{'mediaType': 'application/vnd.docker.image.rootfs.diff.tar.gzip', 'size': 31000000 + n, 'digest': layer}]})

# Declared push dates (Moto stamps every image "now"); the course evaluator applies ECR's documented lifecycle rules to them.
PUSHED = {'u-sep02': '2026-09-02T08:12:00Z', 'u-sep23': '2026-09-23T08:11:00Z', 'v2.3.0': '2026-10-10T11:00:00Z', 'v2.4.0': '2026-10-24T11:00:00Z', 'u-pr1412': '2026-10-27T12:40:00Z',
          'u-pr1413': '2026-10-27T15:05:00Z', 'v2.5.0': '2026-10-27T18:00:00Z', 'u-pr1414': '2026-10-28T08:20:00Z'}
NOW = '2026-10-28T10:00:00Z'
KEEP3 = {'rules': [{'rulePriority': 1, 'description': 'Sirf 3 sabse nayi images rakho', 'selection': {'tagStatus': 'any', 'countType': 'imageCountMoreThan', 'countNumber': 3}, 'action': {'type': 'expire'}}]}
SAFE = {'rules': [{'rulePriority': 1, 'description': '7 din se purane untagged builds hatao', 'selection': {'tagStatus': 'untagged', 'countType': 'sinceImagePushed', 'countUnit': 'days', 'countNumber': 7}, 'action': {'type': 'expire'}},
                  {'rulePriority': 2, 'description': 'Release tags: sabse naye 10 rakho', 'selection': {'tagStatus': 'tagged', 'tagPrefixList': ['v'], 'countType': 'imageCountMoreThan', 'countNumber': 10}, 'action': {'type': 'expire'}}]}

def lifecycle_preview(images, policy):
    """ECR docs: rules select together, the lower rulePriority wins, an image selected by a higher-priority rule is never
    expired by a lower one (it still counts), imageCountMoreThan keeps the youngest N, sinceImagePushed uses age in days."""
    imgs = sorted(images, key=lambda i: i['pushed'], reverse=True); claimed, out = set(), []
    def sel(s, i):
        t = i['tags']
        if s['tagStatus'] == 'any': return True
        if s['tagStatus'] == 'untagged': return not t
        return bool(t) and all(any(x.startswith(p) for x in t) for p in s['tagPrefixList'])
    for r in sorted(policy['rules'], key=lambda r: r['rulePriority']):
        s = r['selection']; c = [i for i in imgs if sel(s, i)]
        if s['countType'] == 'imageCountMoreThan': over = c[s['countNumber']:]
        else: over = [i for i in c if (datetime.fromisoformat(NOW.replace('Z', '+00:00')) - datetime.fromisoformat(i['pushed'].replace('Z', '+00:00'))).days > s['countNumber']]
        out += [i['label'] for i in over if i['digest'] not in claimed]
        claimed.update(i['digest'] for i in c)
    return out

try:
    print('OWNED MOTO', endpoint, flush=True)
    # ex1 — ECR: immutable release tags (latest excluded), scan-on-push rule, distinct images.
    ecr.create_repository(repositoryName=REPO, imageTagMutability='IMMUTABLE'); own['repo'] = REPO
    ecr.put_registry_scanning_configuration(scanType='BASIC', rules=[{'scanFrequency': 'SCAN_ON_PUSH', 'repositoryFilters': [{'filter': name + '/*', 'filterType': 'WILDCARD'}]}])
    labels = ['u-sep02', 'u-sep23', 'v2.3.0', 'v2.4.0', 'u-pr1412', 'u-pr1413', 'v2.5.0', 'u-pr1414']; digest = {}
    for n, label in enumerate(labels, 1):  # untagged builds first: Moto 5.2.4 crashes on untagged pushes once exclusion filters exist
        if label.startswith('u-'): digest[label] = ecr.put_image(repositoryName=REPO, imageManifest=manifest(n))['image']['imageId']['imageDigest']
    ecr.put_image_tag_mutability(repositoryName=REPO, imageTagMutability='IMMUTABLE_WITH_EXCLUSION', imageTagMutabilityExclusionFilters=[{'filterType': 'WILDCARD', 'filter': 'latest'}])
    for n, label in enumerate(labels, 1):
        if not label.startswith('u-'): digest[label] = ecr.put_image(repositoryName=REPO, imageManifest=manifest(n), imageTag=label)['image']['imageId']['imageDigest']
    try:
        ecr.put_image(repositoryName=REPO, imageManifest=manifest(97)); untagged = 'accepted'
    except (ClientError, ResponseParserError) as e: untagged = code(e)
    print('GAP untagged push with exclusion filters', untagged, flush=True)
    check(untagged == 'HTTP 500', 'Moto gap: an untagged push into a repository with exclusion filters returns HTTP 500 (real ECR accepts untagged pushes)')
    ecr.put_image(repositoryName=REPO, imageManifest=manifest(4), imageTag='latest')  # latest → same image as v2.4.0
    try:
        ecr.put_image(repositoryName=REPO, imageManifest=manifest(99), imageTag='v2.4.0'); repush = 'accepted'
    except ClientError as e: repush = code(e)
    moved = ecr.put_image(repositoryName=REPO, imageManifest=manifest(98), imageTag='latest')['image']['imageId']['imageDigest']
    repo = ecr.describe_repositories(repositoryNames=[REPO])['repositories'][0]
    print('IMMUTABLE', json.dumps({'mode': repo['imageTagMutability'], 'exclusions': repo.get('imageTagMutabilityExclusionFilters'), 'repush v2.4.0': repush, 'latest moved': moved != digest['v2.4.0']}), flush=True)
    check(repo['imageTagMutability'] == 'IMMUTABLE_WITH_EXCLUSION' and repush == 'ImageAlreadyExistsException' and moved != digest['v2.4.0'],
          'release tag re-push rejected (Moto code ImageAlreadyExistsException; real ECR: ImageTagAlreadyExistsException); excluded latest still moves')
    scan = ecr.get_registry_scanning_configuration()['scanningConfiguration']
    check(scan['scanType'] == 'BASIC' and scan['rules'][0]['scanFrequency'] == 'SCAN_ON_PUSH', 'registry-level BASIC scan-on-push rule stored (no CVE scan runs in Moto)')
    # ex2 — lifecycle: policy stored, preview missing in Moto, invalid ordering accepted; course evaluator decides.
    ecr.put_lifecycle_policy(repositoryName=REPO, lifecyclePolicyText=json.dumps(SAFE))
    check(json.loads(ecr.get_lifecycle_policy(repositoryName=REPO)['lifecyclePolicyText']) == SAFE, 'safe lifecycle policy stored and read back')
    try:
        ecr.start_lifecycle_policy_preview(repositoryName=REPO, lifecyclePolicyText=json.dumps(KEEP3)); preview = 'accepted'
    except (ClientError, ResponseParserError) as e: preview = code(e)
    bad = {'rules': [{'rulePriority': 1, 'selection': {'tagStatus': 'any', 'countType': 'imageCountMoreThan', 'countNumber': 3}, 'action': {'type': 'expire'}}, {'rulePriority': 2, 'selection': {'tagStatus': 'untagged', 'countType': 'imageCountMoreThan', 'countNumber': 1}, 'action': {'type': 'expire'}}]}
    try:
        ecr.put_lifecycle_policy(repositoryName=REPO, lifecyclePolicyText=json.dumps(bad)); any_first = 'accepted'
    except ClientError as e: any_first = code(e)
    ecr.put_lifecycle_policy(repositoryName=REPO, lifecyclePolicyText=json.dumps(SAFE))
    print('GAP lifecycle', json.dumps({'start_lifecycle_policy_preview': preview, 'any rule before untagged rule': any_first}), flush=True)
    check(preview == 'HTTP 500' and any_first == 'accepted', 'Moto gap: no lifecycle preview, and an any-rule that is not last is accepted (real ECR rejects it)')
    tags = {d['imageDigest']: d.get('imageTags', []) for d in ecr.describe_images(repositoryName=REPO)['imageDetails']}
    images = [{'label': l, 'digest': d, 'tags': tags.get(d, []), 'pushed': PUSHED[l]} for l, d in digest.items()]
    k3, safe = lifecycle_preview(images, KEEP3), lifecycle_preview(images, SAFE)
    print('LIFECYCLE EVALUATOR', json.dumps({'keep-3 expires': k3, 'safe expires': safe}), flush=True)
    check('v2.4.0' in k3 and 'v2.3.0' in k3 and sorted(safe) == ['u-sep02', 'u-sep23'], 'documented evaluator: keep-3 would expire the release and rollback images; safe expires only old untagged builds')
    # ex3 — IAM: execution role (ECR pull + logs) and task role (S3 invoices); Moto has no AWS managed policies loaded.
    trust = json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'ecs-tasks.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]})
    for r in ['exec', 'task']:
        iam.create_role(RoleName=f'{name}-{r}', AssumeRolePolicyDocument=trust); own['roles'].append(f'{name}-{r}')
    try:
        iam.attach_role_policy(RoleName=f'{name}-exec', PolicyArn='arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'); managed = 'attached'
    except ClientError as e: managed = code(e)
    pull = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': ['ecr:GetAuthorizationToken', 'ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage', 'logs:CreateLogStream', 'logs:PutLogEvents'], 'Resource': '*'}]}
    parn = iam.create_policy(PolicyName=f'{name}-exec-pull', PolicyDocument=json.dumps(pull))['Policy']['Arn']; own['policies'].append(parn)
    iam.attach_role_policy(RoleName=f'{name}-exec', PolicyArn=parn)
    iam.put_role_policy(RoleName=f'{name}-task', PolicyName='invoices-put', PolicyDocument=json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': 's3:PutObject', 'Resource': INVOICES}]}))
    print('IAM', json.dumps({'AWS managed AmazonECSTaskExecutionRolePolicy': managed, 'exec policy': 'customer-managed copy of the ECR pull + logs actions', 'task policy': 's3:PutObject on shopkaro-invoices/*'}), flush=True)
    check(managed == 'NoSuchEntity', 'Moto gap: AWS managed policies are not loaded by default, so the lab attaches a customer-managed copy of the documented actions')
    # ex4 — network metadata: two private subnets, endpoints instead of NAT, task SG ← ALB SG, ip and instance target groups.
    vpc = ec2.create_vpc(CidrBlock='10.40.0.0/16')['Vpc']['VpcId']; own['vpc'] = vpc
    subs = [ec2.create_subnet(VpcId=vpc, CidrBlock=c, AvailabilityZone=z)['Subnet']['SubnetId'] for c, z in [('10.40.10.0/24', 'ap-south-1a'), ('10.40.11.0/24', 'ap-south-1b')]]; own['subnets'] = subs
    rt = ec2.create_route_table(VpcId=vpc)['RouteTable']['RouteTableId']; own['rt'] = rt
    own['assocs'] = [ec2.associate_route_table(RouteTableId=rt, SubnetId=s)['AssociationId'] for s in subs]
    sg_alb = ec2.create_security_group(GroupName=short + '-alb', Description='alb', VpcId=vpc)['GroupId']; sg_task = ec2.create_security_group(GroupName=short + '-orders', Description='orders tasks', VpcId=vpc)['GroupId']
    sg_ep = ec2.create_security_group(GroupName=short + '-ep', Description='endpoints', VpcId=vpc)['GroupId']; own['sgs'] = [sg_task, sg_ep, sg_alb]
    ec2.authorize_security_group_ingress(GroupId=sg_task, IpPermissions=[{'IpProtocol': 'tcp', 'FromPort': 8080, 'ToPort': 8080, 'UserIdGroupPairs': [{'GroupId': sg_alb}]}])
    ec2.authorize_security_group_ingress(GroupId=sg_ep, IpPermissions=[{'IpProtocol': 'tcp', 'FromPort': 443, 'ToPort': 443, 'IpRanges': [{'CidrIp': '10.40.0.0/16'}]}])
    for svc in ['ecr.api', 'ecr.dkr', 'logs']:
        own['eps'].append(ec2.create_vpc_endpoint(VpcId=vpc, ServiceName=f'com.amazonaws.ap-south-1.{svc}', VpcEndpointType='Interface', SubnetIds=subs, SecurityGroupIds=[sg_ep], PrivateDnsEnabled=True)['VpcEndpoint']['VpcEndpointId'])
    own['eps'].append(ec2.create_vpc_endpoint(VpcId=vpc, ServiceName='com.amazonaws.ap-south-1.s3', VpcEndpointType='Gateway', RouteTableIds=[rt])['VpcEndpoint']['VpcEndpointId'])
    tg_ip = elb.create_target_group(Name=short + '-ip', Protocol='HTTP', Port=8080, VpcId=vpc, TargetType='ip', HealthCheckPath='/health')['TargetGroups'][0]['TargetGroupArn']
    tg_inst = elb.create_target_group(Name=short + '-inst', Protocol='HTTP', Port=80, VpcId=vpc, TargetType='instance')['TargetGroups'][0]['TargetGroupArn']; own['tgs'] = [tg_ip, tg_inst]
    eps = ec2.describe_vpc_endpoints(VpcEndpointIds=own['eps'])['VpcEndpoints']
    print('NETWORK', json.dumps(sorted([e['ServiceName'].split('ap-south-1.')[1], e['VpcEndpointType'], ('private DNS ' + str(e.get('PrivateDnsEnabled'))) if e['VpcEndpointType'] == 'Interface' else ('route table ' + str(rt in e.get('RouteTableIds', [])))] for e in eps)), flush=True)
    check(len(eps) == 4 and all(e.get('PrivateDnsEnabled') for e in eps if e['VpcEndpointType'] == 'Interface'), 'ecr.api + ecr.dkr + logs interface endpoints (private DNS) and S3 gateway endpoint on the private route table')
    # ex5 — ECS: cluster, task definitions, service; Moto validation gaps printed explicitly.
    ecs.create_cluster(clusterName=name, capacityProviders=['FARGATE', 'FARGATE_SPOT']); own['cluster'] = name
    uri = f'{ACCT}.dkr.ecr.ap-south-1.amazonaws.com/{REPO}'
    def container(tag): return [{'name': 'orders', 'image': f'{uri}:{tag}', 'essential': True, 'portMappings': [{'containerPort': 8080, 'protocol': 'tcp'}],
                                 'logConfiguration': {'logDriver': 'awslogs', 'options': {'awslogs-group': '/ecs/orders', 'awslogs-region': 'ap-south-1', 'awslogs-stream-prefix': 'ecs'}}}]
    role = lambda r: f'arn:aws:iam::{ACCT}:role/{name}-{r}'
    def register(family, tag, exec_r, task_r, cpu='512', memory='1024', mode='awsvpc'):
        kw = {k: v for k, v in [('executionRoleArn', exec_r and role(exec_r)), ('taskRoleArn', task_r and role(task_r))] if v}
        td = ecs.register_task_definition(family=family, requiresCompatibilities=['FARGATE'], networkMode=mode, cpu=cpu, memory=memory, containerDefinitions=container(tag), **kw)['taskDefinition']
        own['tds'].append(td['taskDefinitionArn']); return td
    good = register(name, 'v2.4.0', 'exec', 'task')['taskDefinitionArn']
    swapped = register(name, 'v2.5.0', 'task', 'exec')['taskDefinitionArn']
    one_role = register(name, 'v2.5.0', 'exec', 'exec')['taskDefinitionArn']
    size = register(name + '-size', 'v2.4.0', 'exec', 'task', cpu='256', memory='8192')
    bridge = register(name + '-bridge', 'v2.4.0', 'exec', 'task', mode='bridge')
    nolog = register(name + '-noexec', 'v2.4.0', None, 'task')
    net = {'awsvpcConfiguration': {'subnets': subs, 'securityGroups': [sg_task], 'assignPublicIp': 'DISABLED'}}
    inst = ecs.create_service(cluster=name, serviceName='orders-inst', taskDefinition=good, desiredCount=1, launchType='FARGATE', networkConfiguration=net,
                              loadBalancers=[{'targetGroupArn': tg_inst, 'containerName': 'orders', 'containerPort': 8080}])['service']; own['services'].append('orders-inst')
    both = ecs.create_service(cluster=name, serviceName='orders-both', taskDefinition=good, desiredCount=1, launchType='FARGATE', capacityProviderStrategy=[{'capacityProvider': 'FARGATE_SPOT', 'weight': 1}], networkConfiguration=net)['service']; own['services'].append('orders-both')
    print('GAP ecs', json.dumps({'256 CPU + 8 GB registered': size['revision'] == 1, 'bridge silently became': bridge['networkMode'], 'awslogs without execution role registered': 'executionRoleArn' not in nolog,
                                 'instance target group accepted': inst['status'], 'launch type + strategy accepted': both['status']}), flush=True)
    check(size['revision'] == 1 and bridge['networkMode'] == 'awsvpc' and 'executionRoleArn' not in nolog and inst['status'] == both['status'] == 'ACTIVE',
          'Moto gaps: invalid Fargate size, bridge mode, awslogs without execution role, instance target group and launch type + strategy are all accepted (real ECS rejects each)')
    svc = ecs.create_service(cluster=name, serviceName='orders', taskDefinition=good, desiredCount=2, launchType='FARGATE', networkConfiguration=net,
                             loadBalancers=[{'targetGroupArn': tg_ip, 'containerName': 'orders', 'containerPort': 8080}],
                             deploymentConfiguration={'deploymentCircuitBreaker': {'enable': True, 'rollback': True}, 'maximumPercent': 200, 'minimumHealthyPercent': 100})['service']; own['services'].append('orders')
    ecs.update_service(cluster=name, service='orders', taskDefinition=swapped)
    s = ecs.describe_services(cluster=name, services=['orders'])['services'][0]
    try:
        ecs.get_waiter('services_stable').wait(cluster=name, services=['orders'], WaiterConfig={'Delay': 1, 'MaxAttempts': 2}); waiter = 'stable'
    except WaiterError as e: waiter = str(e).split(': ', 1)[-1]
    print('SERVICE', json.dumps({'deploymentConfiguration': s.get('deploymentConfiguration'), 'running': s['runningCount'], 'pending': s['pendingCount'], 'deployments': [[d['taskDefinition'].split('/')[-1], d['rolloutState']] for d in s['deployments']],
                                 'service.taskDefinition after update': s['taskDefinition'], 'tasks listed': len(ecs.list_tasks(cluster=name, serviceName='orders')['taskArns']), 'services-stable waiter': waiter}), flush=True)
    check(s.get('deploymentConfiguration') is None and s['runningCount'] == 0 and len(s['deployments']) == 1 and waiter == 'Max attempts exceeded',
          'Moto gaps: circuit-breaker config not returned, no task ever runs, update-service makes no new deployment, the waiter never succeeds')
    # ex6 — documented start contract over the real Moto metadata (no container runs).
    def docs(r):
        out = [iam.get_policy_version(PolicyArn=p['PolicyArn'], VersionId=iam.get_policy(PolicyArn=p['PolicyArn'])['Policy']['DefaultVersionId'])['PolicyVersion']['Document'] for p in iam.list_attached_role_policies(RoleName=r)['AttachedPolicies']]
        return out + [iam.get_role_policy(RoleName=r, PolicyName=n)['PolicyDocument'] for n in iam.list_role_policies(RoleName=r)['PolicyNames']]
    def grants(arn):
        acts, s3 = set(), []
        for d in docs(arn.split('/')[-1]):
            for st in d['Statement'] if isinstance(d['Statement'], list) else [d['Statement']]:
                a = st['Action'] if isinstance(st['Action'], list) else [st['Action']]; res = st['Resource'] if isinstance(st['Resource'], list) else [st['Resource']]
                if st['Effect'] == 'Allow': acts.update(a); s3 += res if 's3:PutObject' in a else []
        return {g for g, ok in [('ecr-pull', {'ecr:GetAuthorizationToken', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'} <= acts), ('logs', {'logs:CreateLogStream', 'logs:PutLogEvents'} <= acts), ('s3-invoices', bool({'*', INVOICES} & set(s3)))] if ok}
    def trusted(arn):
        st = iam.get_role(RoleName=arn.split('/')[-1])['Role']['AssumeRolePolicyDocument']['Statement']
        return any('ecs-tasks.amazonaws.com' in json.dumps(x.get('Principal', {})) for x in st)
    def pull_path(subnets, logs):
        found = {e['ServiceName'].split('ap-south-1.')[1]: e for e in ec2.describe_vpc_endpoints(Filters=[{'Name': 'vpc-id', 'Values': [vpc]}])['VpcEndpoints'] if e['State'].lower() == 'available'}
        for sn in subnets:
            table = ec2.describe_route_tables(Filters=[{'Name': 'association.subnet-id', 'Values': [sn]}])['RouteTables'][0]
            if any(r.get('NatGatewayId') for r in table['Routes']): continue
            if not all(found.get(k, {}).get('PrivateDnsEnabled') for k in ['ecr.api', 'ecr.dkr']): return 'ecr'
            if table['RouteTableId'] not in found.get('s3', {}).get('RouteTableIds', []): return 's3'
            if logs and 'logs' not in found: return 'logs'
        return None
    def contract(td_arn):
        td = ecs.describe_task_definition(taskDefinition=td_arn)['taskDefinition']; c = td['containerDefinitions'][0]; ex, tk = td.get('executionRoleArn'), td.get('taskRoleArn')
        if any(r and not trusted(r) for r in [ex, tk]): return 'ECS unable to assume role'
        path = pull_path(subs, c.get('logConfiguration', {}).get('logDriver') == 'awslogs')
        if path == 'ecr': return 'CannotPull: connection issue to ECR (timeout)'
        if not ex or 'ecr-pull' not in grants(ex): return 'CannotPull: AccessDenied ecr:GetAuthorizationToken (' + (ex or 'no execution role').split('/')[-1] + ')'
        if c['image'].split(':')[-1] not in sum(tags.values(), []): return 'CannotPull: manifest not found'
        if path == 's3': return 'CannotPull: layer download timeout (no S3 gateway route)'
        if path == 'logs' or 'logs' not in grants(ex): return 'ResourceInitializationError: logs'
        return 'START + S3 OK' if tk and 's3-invoices' in grants(tk) else 'START, app AccessDenied s3:PutObject (' + (tk or 'no task role').split('/')[-1] + ')'
    matrix = {'orders:1 exec=pull+logs task=S3': contract(good), 'orders:2 roles swapped': contract(swapped), 'orders:3 task role = execution role': contract(one_role)}
    ec2.delete_vpc_endpoints(VpcEndpointIds=[own['eps'][1]])  # remove ecr.dkr, then re-evaluate the good revision
    matrix['orders:1 after ecr.dkr endpoint deleted'] = contract(good)
    print('CONTRACT', json.dumps({k: v.replace(name + '-', '') for k, v in matrix.items()}), flush=True)
    check(list(matrix.values()) == ['START + S3 OK', 'CannotPull: AccessDenied ecr:GetAuthorizationToken (' + name + '-task)', 'START, app AccessDenied s3:PutObject (' + name + '-exec)', 'CannotPull: connection issue to ECR (timeout)'],
          'documented evaluator over real Moto metadata: right roles start and upload; swapped roles cannot pull; one shared role starts but S3 is denied; missing ecr.dkr times out')
    print('BEHAVIOR CHECKS', checks, flush=True)
finally:
    try:
        for sv in own['services']:
            ecs.update_service(cluster=own['cluster'], service=sv, desiredCount=0); ecs.delete_service(cluster=own['cluster'], service=sv)
        for td in own['tds']: ecs.deregister_task_definition(taskDefinition=td)
        if own['cluster']: ecs.delete_cluster(cluster=own['cluster'])
        if own['repo']: ecr.delete_repository(repositoryName=own['repo'], force=True)
        ecr.put_registry_scanning_configuration(scanType='BASIC', rules=[])
        for t in own['tgs']: elb.delete_target_group(TargetGroupArn=t)
        if own['eps']: ec2.delete_vpc_endpoints(VpcEndpointIds=[e for e in own['eps'] if e != own['eps'][1]])
        for a in own.get('assocs', []): ec2.disassociate_route_table(AssociationId=a)
        if own['rt']: ec2.delete_route_table(RouteTableId=own['rt'])
        for g in own['sgs']: ec2.delete_security_group(GroupId=g)
        for s in own['subnets']: ec2.delete_subnet(SubnetId=s)
        if own['vpc']: ec2.delete_vpc(VpcId=own['vpc'])
        for r in own['roles']:
            for p in iam.list_attached_role_policies(RoleName=r)['AttachedPolicies']: iam.detach_role_policy(RoleName=r, PolicyArn=p['PolicyArn'])
            for n in iam.list_role_policies(RoleName=r)['PolicyNames']: iam.delete_role_policy(RoleName=r, PolicyName=n)
            iam.delete_role(RoleName=r)
        for p in own['policies']: iam.delete_policy(PolicyArn=p)
        left = {'repos': [r for r in ecr.describe_repositories()['repositories'] if r['repositoryName'] == own['repo']],
                'clusters': [c for c in ecs.describe_clusters(clusters=[name])['clusters'] if c['status'] == 'ACTIVE'],
                'roles': [r for r in iam.list_roles()['Roles'] if r['RoleName'] in own['roles']],
                'vpcs': [v for v in ec2.describe_vpcs()['Vpcs'] if v['VpcId'] == own['vpc']],
                'scan rules': ecr.get_registry_scanning_configuration()['scanningConfiguration']['rules']}
        check(not any(left.values()), 'own ECR repo/scan rule, ECS cluster/services/task definitions, IAM roles/policies, target groups, endpoints and VPC cleaned')
    finally:
        server.stop(); server._server.server_close()
        try:
            with socket.create_connection((host, port), timeout=.5): raise AssertionError('listener open')
        except OSError: pass
        print('OWNED MOTO STOPPED / LISTENER CLOSED', flush=True)
