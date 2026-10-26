"""Lab-local JSON files; values are dummy metadata, never real endpoints."""
import json, os, pathlib
out=pathlib.Path('.lab')
def write(name,value): (out/name).write_text(json.dumps(value,indent=2)+'\n')
write('primary-health.json',dict(Type='HTTP',IPAddress='203.0.113.10',Port=80,ResourcePath='/ready',RequestInterval=30,FailureThreshold=3))
if os.environ.get('HEALTH'):
    records=[dict(Name='shopkaro-lab10.test',Type='A',AliasTarget=dict(DNSName=os.environ['ALB_DNS'],HostedZoneId=os.environ['ALB_ZONE'],EvaluateTargetHealth=True))]
    records += [dict(Name='checkout.shopkaro-lab10.test',Type='A',SetIdentifier=name,Weight=w,TTL=60,ResourceRecords=[dict(Value=ip)]) for name,w,ip in [('v1',90,'203.0.113.11'),('v2',10,'203.0.113.12')]]
    records += [dict(Name='status.shopkaro-lab10.test',Type='A',SetIdentifier=name,Failover=role,TTL=60,ResourceRecords=[dict(Value=ip)],**(dict(HealthCheckId=os.environ['HEALTH']) if role=='PRIMARY' else {})) for name,role,ip in [('primary','PRIMARY','203.0.113.10'),('maintenance','SECONDARY','203.0.113.20')]]
    write('routing.json',dict(Changes=[dict(Action='UPSERT',ResourceRecordSet=r) for r in records]))
    primary=records[-2].copy()
    write('repair.json',dict(Changes=[dict(Action='UPSERT',ResourceRecordSet=primary)]))
    primary.pop('HealthCheckId')
    write('missing-health.json',dict(Changes=[dict(Action='UPSERT',ResourceRecordSet=primary)]))
