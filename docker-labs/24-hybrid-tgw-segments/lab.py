"""Lab24: owned loopback Moto only. TGW segments, VPN-on-TGW and Resolver metadata, plus a documented
route evaluator over the real Moto metadata. No real AWS, Docker, IPsec, BGP or packets."""
import ipaddress, json, logging, os, socket, time
from pathlib import Path
LAB = Path(__file__).resolve().parent / '.lab'; LAB.mkdir(exist_ok=True)
for k in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN']: os.environ.pop(k, None)
os.environ.update(AWS_ACCESS_KEY_ID='test', AWS_SECRET_ACCESS_KEY='test', AWS_SHARED_CREDENTIALS_FILE=str(LAB / 'credentials'),
                  AWS_CONFIG_FILE=str(LAB / 'config'), AWS_EC2_METADATA_DISABLED='true', AWS_DEFAULT_REGION='ap-south-1', AWS_MAX_ATTEMPTS='1')
import boto3
from botocore.exceptions import ClientError
from botocore.parsers import ResponseParserError
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)  # hide request lines; the lab prints its own results
server = ThreadedMotoServer(ip_address='127.0.0.1', port=0, verbose=False); server.start()
host, port = server.get_host_and_port(); endpoint = f'http://{host}:{port}'
def client(s): return boto3.client(s, endpoint_url=endpoint, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
ec2, r53r = client('ec2'), client('route53resolver')
name = 'lab24-' + str(time.time_ns()); checks = 0
own = {'tgw': None, 'vpcs': [], 'atts': [], 'rts': [], 'cgw': None, 'vpn': None, 'sg': None, 'eps': [], 'rule': None, 'rassoc': None}

def check(ok, label):
    global checks
    assert ok, label; checks += 1; print('PASS', checks, label, flush=True)

def routes(rt):  # what Moto returns for active + blackhole routes
    return ec2.search_transit_gateway_routes(TransitGatewayRouteTableId=rt, Filters=[{'Name': 'state', 'Values': ['active', 'blackhole']}])['Routes']

try:
    print('OWNED MOTO', endpoint, flush=True)
    tgw = ec2.create_transit_gateway(Description=name, Options={'DefaultRouteTableAssociation': 'disable', 'DefaultRouteTablePropagation': 'disable'})['TransitGateway']['TransitGatewayId']; own['tgw'] = tgw
    net = {}
    for key, cidr in [('prod', '10.10.0.0/16'), ('dev', '10.20.0.0/16'), ('shared', '10.30.0.0/16')]:
        vpc = ec2.create_vpc(CidrBlock=cidr)['Vpc']['VpcId']; own['vpcs'].append(vpc)
        sub = ec2.create_subnet(VpcId=vpc, CidrBlock=cidr.replace('0.0/16', '1.0/24'), AvailabilityZone='ap-south-1a')['Subnet']['SubnetId']
        att = ec2.create_transit_gateway_vpc_attachment(TransitGatewayId=tgw, VpcId=vpc, SubnetIds=[sub])['TransitGatewayVpcAttachment']['TransitGatewayAttachmentId']; own['atts'].append(att)
        net[key] = {'vpc': vpc, 'subnet': sub, 'att': att, 'cidr': cidr}
    rt = {k: ec2.create_transit_gateway_route_table(TransitGatewayId=tgw)['TransitGatewayRouteTable']['TransitGatewayRouteTableId'] for k in ['prod', 'dev', 'shared', 'onprem']}
    own['rts'] = list(rt.values())
    for k in ['prod', 'dev', 'shared']:
        ec2.associate_transit_gateway_route_table(TransitGatewayRouteTableId=rt[k], TransitGatewayAttachmentId=net[k]['att'])
    for table, src in [('prod', 'shared'), ('shared', 'prod'), ('shared', 'dev'), ('dev', 'shared')]:
        ec2.enable_transit_gateway_route_table_propagation(TransitGatewayRouteTableId=rt[table], TransitGatewayAttachmentId=net[src]['att'])
    ec2.create_transit_gateway_route(DestinationCidrBlock='10.10.0.0/16', TransitGatewayRouteTableId=rt['dev'], Blackhole=True)
    assoc = {k: [a['TransitGatewayAttachmentId'] for a in ec2.get_transit_gateway_route_table_associations(TransitGatewayRouteTableId=rt[k])['Associations']] for k in rt}
    check(all(assoc[k] == [net[k]['att']] for k in ['prod', 'dev', 'shared']) and assoc['onprem'] == [], 'one association per VPC attachment in its own table; rt-onprem empty')
    props = {k: sorted(p['TransitGatewayAttachmentId'] for p in ec2.get_transit_gateway_route_table_propagations(TransitGatewayRouteTableId=rt[k])['TransitGatewayRouteTablePropagations']) for k in rt}
    check(props['shared'] == sorted([net['prod']['att'], net['dev']['att']]) and props['dev'] == [net['shared']['att']], 'propagation metadata stored as designed')
    dev_routes, prod_routes = routes(rt['dev']), routes(rt['prod'])
    print('SEARCH rt-dev', json.dumps([{k: r.get(k) for k in ['DestinationCidrBlock', 'Type', 'State']} for r in dev_routes]), flush=True)
    print('SEARCH rt-prod', json.dumps([{k: r.get(k) for k in ['DestinationCidrBlock', 'Type', 'State']} for r in prod_routes]), flush=True)
    check(any(r['DestinationCidrBlock'] == '10.10.0.0/16' and r['State'] == 'blackhole' for r in dev_routes), 'static blackhole visible in rt-dev')
    check(not any(r.get('Type') == 'propagated' for r in dev_routes + prod_routes), 'Moto gap: propagated routes are not returned by search (real AWS lists them)')
    cgw = ec2.create_customer_gateway(BgpAsn=65010, PublicIp='203.0.113.10', Type='ipsec.1')['CustomerGateway']['CustomerGatewayId']; own['cgw'] = cgw
    vpn = ec2.create_vpn_connection(CustomerGatewayId=cgw, Type='ipsec.1', TransitGatewayId=tgw, Options={'StaticRoutesOnly': False})['VpnConnection']; own['vpn'] = vpn['VpnConnectionId']
    print('VPN', json.dumps({k: vpn.get(k) for k in ['VpnConnectionId', 'State', 'TransitGatewayId']}), flush=True)
    vpn_att = [a for a in ec2.describe_transit_gateway_attachments()['TransitGatewayAttachments'] if a.get('ResourceType') == 'vpn']
    print('VPN ATTACHMENTS', json.dumps([{k: a.get(k) for k in ['TransitGatewayAttachmentId', 'ResourceId', 'State']} for a in vpn_att]), flush=True)
    check(vpn['State'] == 'available' and vpn['TransitGatewayId'] == tgw, 'VPN connection on the transit gateway: metadata available immediately (real VPN starts pending)')
    if vpn_att:
        net['onprem'] = {'att': vpn_att[0]['TransitGatewayAttachmentId'], 'cidr': '192.168.10.0/24'}
        ec2.associate_transit_gateway_route_table(TransitGatewayRouteTableId=rt['onprem'], TransitGatewayAttachmentId=net['onprem']['att'])
        for table, src in [('onprem', 'prod'), ('onprem', 'shared'), ('prod', 'onprem'), ('shared', 'onprem')]:
            ec2.enable_transit_gateway_route_table_propagation(TransitGatewayRouteTableId=rt[table], TransitGatewayAttachmentId=net[src]['att'])
        check(True, 'VPN attachment associated with rt-onprem and propagations enabled')
    else:
        print('VPN ATTACHMENT MISSING: Moto created no vpn-type TGW attachment, so on-prem routing is skipped', flush=True)
    sg = ec2.create_security_group(GroupName=name, Description='lab24 resolver', VpcId=net['shared']['vpc'])['GroupId']; own['sg'] = sg
    sub2 = ec2.create_subnet(VpcId=net['shared']['vpc'], CidrBlock='10.30.2.0/24', AvailabilityZone='ap-south-1b')['Subnet']['SubnetId']
    ips = [{'SubnetId': net['shared']['subnet']}, {'SubnetId': sub2}]
    inbound = r53r.create_resolver_endpoint(CreatorRequestId=name + '-in', Name=name + '-in', SecurityGroupIds=[sg], Direction='INBOUND', IpAddresses=ips)['ResolverEndpoint']; own['eps'].append(inbound['Id'])
    outbound = r53r.create_resolver_endpoint(CreatorRequestId=name + '-out', Name=name + '-out', SecurityGroupIds=[sg], Direction='OUTBOUND', IpAddresses=ips)['ResolverEndpoint']; own['eps'].append(outbound['Id'])
    rule = r53r.create_resolver_rule(CreatorRequestId=name + '-rule', Name=name, RuleType='FORWARD', DomainName='godam.local', ResolverEndpointId=outbound['Id'], TargetIps=[{'Ip': '192.168.10.53', 'Port': 53}])['ResolverRule']; own['rule'] = rule['Id']
    ra = r53r.associate_resolver_rule(ResolverRuleId=rule['Id'], VPCId=net['prod']['vpc'])['ResolverRuleAssociation']; own['rassoc'] = ra['Id']
    print('RESOLVER', json.dumps({'inbound': [inbound['Direction'], inbound['IpAddressCount']], 'outbound': [outbound['Direction'], outbound['IpAddressCount']], 'rule': [rule['DomainName'], rule['RuleType']], 'association': ra['Status']}), flush=True)
    check(inbound['IpAddressCount'] == 2 and rule['DomainName'].rstrip('.') == 'godam.local' and ra['VPCId'] == net['prod']['vpc'], 'Resolver inbound/outbound endpoints (2 IPs each) and forwarding rule associated with prod VPC')
    # Documented evaluator over the real Moto metadata: most specific prefix, static beats propagated, return path needed.
    cidr_of = {v['att']: v['cidr'] for v in net.values()}
    def table_of(att): return next((k for k in rt if att in [a['TransitGatewayAttachmentId'] for a in ec2.get_transit_gateway_route_table_associations(TransitGatewayRouteTableId=rt[k])['Associations']]), None)
    def table_routes(k):
        out = []
        for r in routes(rt[k]):
            if r.get('Type') == 'static': out.append((r['DestinationCidrBlock'], None if r['State'] == 'blackhole' else r['TransitGatewayAttachments'][0]['TransitGatewayAttachmentId'], 'static'))
        statics = {c for c, _, _ in out}
        for p in ec2.get_transit_gateway_route_table_propagations(TransitGatewayRouteTableId=rt[k])['TransitGatewayRouteTablePropagations']:
            c = cidr_of.get(p['TransitGatewayAttachmentId'])
            if c and c not in statics: out.append((c, p['TransitGatewayAttachmentId'], 'propagated'))
        return out
    def hop(src, dst_ip):
        k = table_of(src)
        if not k: return None
        hits = [r for r in table_routes(k) if ipaddress.ip_address(dst_ip) in ipaddress.ip_network(r[0])]
        if not hits: return None
        best = max(hits, key=lambda r: (ipaddress.ip_network(r[0]).prefixlen, r[2] == 'static'))
        return best[1]
    probe = {k: str(ipaddress.ip_network(v['cidr'])[10]) for k, v in net.items()}
    keys = list(net); matrix = {}
    for a in keys:
        for b in keys:
            if a != b: matrix[a + '->' + b] = hop(net[a]['att'], probe[b]) == net[b]['att'] and hop(net[b]['att'], probe[a]) == net[a]['att']
    print('EVALUATOR', json.dumps(matrix), flush=True)
    expect = {'prod->shared': True, 'dev->shared': True, 'dev->prod': False, 'prod->dev': False}
    if 'onprem' in net: expect.update({'onprem->prod': True, 'onprem->shared': True, 'onprem->dev': False})
    check(all(matrix[k] == v for k, v in expect.items()), 'documented evaluator: prod/dev reach shared, dev and prod isolated' + (', on-prem reaches prod/shared but not dev' if 'onprem' in net else ''))
    # Double-association probe on a throwaway attachment + two throwaway tables, so the real design stays clean.
    pv = ec2.create_vpc(CidrBlock='10.99.0.0/16')['Vpc']['VpcId']; own['vpcs'].append(pv)
    ps = ec2.create_subnet(VpcId=pv, CidrBlock='10.99.1.0/24', AvailabilityZone='ap-south-1a')['Subnet']['SubnetId']
    patt = ec2.create_transit_gateway_vpc_attachment(TransitGatewayId=tgw, VpcId=pv, SubnetIds=[ps])['TransitGatewayVpcAttachment']['TransitGatewayAttachmentId']; own['atts'].append(patt)
    own['probe_rts'] = [ec2.create_transit_gateway_route_table(TransitGatewayId=tgw)['TransitGatewayRouteTable']['TransitGatewayRouteTableId'] for _ in range(2)]
    ec2.associate_transit_gateway_route_table(TransitGatewayRouteTableId=own['probe_rts'][0], TransitGatewayAttachmentId=patt)
    dup = ec2.associate_transit_gateway_route_table(TransitGatewayRouteTableId=own['probe_rts'][1], TransitGatewayAttachmentId=patt)['Association']
    print('DOUBLE ASSOCIATION', json.dumps({k: dup.get(k) for k in ['TransitGatewayRouteTableId', 'TransitGatewayAttachmentId', 'State']}), flush=True)
    check(dup['State'] == 'associated', 'Moto gap: a second association for the same attachment is accepted (real AWS allows exactly one)')
    # Multi-table propagation: Moto lists both, but after one disable the second disable for the same attachment fails.
    ec2.disable_transit_gateway_route_table_propagation(TransitGatewayRouteTableId=rt['prod'], TransitGatewayAttachmentId=net['shared']['att'])
    try:
        ec2.disable_transit_gateway_route_table_propagation(TransitGatewayRouteTableId=rt['dev'], TransitGatewayAttachmentId=net['shared']['att']); second = 'accepted'
    except (ClientError, ResponseParserError) as e:
        second = 'HTTP 500' if isinstance(e, ResponseParserError) or e.response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 500 else e.response['Error']['Code']
    print('SECOND PROPAGATION DISABLE', second, flush=True)
    check(second == 'HTTP 500', 'Moto gap: disabling the same attachment in a second table fails after the first disable (real AWS keeps propagation per table)')
    print('BEHAVIOR CHECKS', checks, flush=True)
finally:
    try:
        for r in own['rts'] + own.get('probe_rts', []):  # Moto's single association/propagation pointer breaks unwiring; delete static routes, then tables directly
            for s in ec2.search_transit_gateway_routes(TransitGatewayRouteTableId=r, Filters=[{'Name': 'type', 'Values': ['static']}])['Routes']:
                ec2.delete_transit_gateway_route(TransitGatewayRouteTableId=r, DestinationCidrBlock=s['DestinationCidrBlock'])
            ec2.delete_transit_gateway_route_table(TransitGatewayRouteTableId=r)
        print('CLEANUP NOTE: route tables deleted directly; real AWS needs associations and propagations removed first', flush=True)
        if own['rassoc']: r53r.disassociate_resolver_rule(ResolverRuleId=own['rule'], VPCId=own['vpcs'][0])
        if own['rule']: r53r.delete_resolver_rule(ResolverRuleId=own['rule'])
        for e in own['eps']: r53r.delete_resolver_endpoint(ResolverEndpointId=e)
        if own['vpn']: ec2.delete_vpn_connection(VpnConnectionId=own['vpn'])
        if own['cgw']: ec2.delete_customer_gateway(CustomerGatewayId=own['cgw'])
        for a in own['atts']: ec2.delete_transit_gateway_vpc_attachment(TransitGatewayAttachmentId=a)
        if own['tgw']: ec2.delete_transit_gateway(TransitGatewayId=own['tgw'])
        if own['sg']: ec2.delete_security_group(GroupId=own['sg'])
        for v in own['vpcs']:
            for s in ec2.describe_subnets(Filters=[{'Name': 'vpc-id', 'Values': [v]}])['Subnets']: ec2.delete_subnet(SubnetId=s['SubnetId'])
            ec2.delete_vpc(VpcId=v)
        left_vpcs = [v for v in ec2.describe_vpcs()['Vpcs'] if v['VpcId'] in own['vpcs']]
        left_tgw = [t for t in ec2.describe_transit_gateways()['TransitGateways'] if t['TransitGatewayId'] == own['tgw'] and t['State'] not in ('deleted', 'deleting')]
        left_eps = [e for e in r53r.list_resolver_endpoints()['ResolverEndpoints'] if e['Id'] in own['eps']]
        check(not left_vpcs and not left_tgw and not left_eps, 'own TGW/route tables/attachments/VPN/CGW/Resolver/VPC fixtures cleaned')
    finally:
        server.stop(); server._server.server_close()
        try:
            with socket.create_connection((host, port), timeout=.5): raise AssertionError('listener open')
        except OSError: pass
        print('OWNED MOTO STOPPED / LISTENER CLOSED', flush=True)
