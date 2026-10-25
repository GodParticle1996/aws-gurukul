#!/usr/bin/env python3
"""Read-only review of the Terraform-owned lab. Configuration, not packet/SQL proof."""
import json
import os
import subprocess

if os.environ.get('AWS_ENDPOINT_URL') != 'http://127.0.0.1:4566':
    raise SystemExit('source ../env.sh first: only loopback Moto is allowed')

def run(*args):
    return json.loads(subprocess.check_output(args, text=True))

def aws(*args):
    return run('aws', *args, '--output', 'json')

r = run('terraform', 'output', '-json', 'review')
sgs = aws('ec2', 'describe-security-groups', '--group-ids', r['app_sg'], r['db_sg'])['SecurityGroups']
app = next(s for s in sgs if s['GroupId'] == r['app_sg'])
db = next(s for s in sgs if s['GroupId'] == r['db_sg'])
world_ssh = sum(1 for p in app['IpPermissions'] if p.get('IpProtocol') in ('tcp', '6', '-1') and p.get('FromPort', 0) <= 22 <= p.get('ToPort', 65535)
                for c in p.get('IpRanges', []) + p.get('Ipv6Ranges', []) if c.get('CidrIp', c.get('CidrIpv6')) in ('0.0.0.0/0', '::/0'))
permissions = db['IpPermissions']
db_source = len(permissions) == 1 and permissions[0].get('FromPort') == 5432 and permissions[0].get('ToPort') == 5432 and not permissions[0].get('IpRanges') and not permissions[0].get('Ipv6Ranges') and not permissions[0].get('PrefixListIds') and [g['GroupId'] for g in permissions[0].get('UserIdGroupPairs', [])] == [r['app_sg']]
d = aws('rds', 'describe-db-instances', '--db-instance-identifier', r['db'])['DBInstances'][0]
g = aws('autoscaling', 'describe-auto-scaling-groups', '--auto-scaling-group-names', r['asg'])['AutoScalingGroups'][0]
subnets = aws('ec2', 'describe-subnets', '--subnet-ids', *g['VPCZoneIdentifier'].split(','))['Subnets']
block = aws('s3api', 'get-public-access-block', '--bucket', r['bucket'])['PublicAccessBlockConfiguration']
egress = 0
for az, rt in r['app_route_tables'].items():
    routes = aws('ec2', 'describe-route-tables', '--route-table-ids', rt)['RouteTables'][0]['Routes']
    egress += any(x.get('DestinationCidrBlock') == '0.0.0.0/0' and x.get('NatGatewayId') == r['nat_gateways'][az] for x in routes)
result = {'ssh_world_rules': world_ssh, 'db_source_is_app_sg': db_source,
          'rds_multi_az': d['MultiAZ'], 'asg_enabled_azs': len({s['AvailabilityZone'] for s in subnets}),
          's3_block_public_access': all(block.get(k) is True for k in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')),
          'app_egress_nat_azs': egress, 'rds_backups_days': d['BackupRetentionPeriod']}
print(json.dumps(result, indent=2))
assert result == {'ssh_world_rules': 0, 'db_source_is_app_sg': True, 'rds_multi_az': True, 'asg_enabled_azs': 2, 's3_block_public_access': True, 'app_egress_nat_azs': 2, 'rds_backups_days': 7}, 'Architecture review failed; compare actual API state above'
assert d['StorageEncrypted'] and not d['PubliclyAccessible'], 'DB must remain private/encrypted'
assert set(g['VPCZoneIdentifier'].split(',')) == set(r['app_subnets']), 'ASG must use private app subnets'
assert len(g['Instances']) == g['DesiredCapacity'] == 2, 'ASG membership must match desired capacity'
