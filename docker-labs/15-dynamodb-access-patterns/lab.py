"""Scoped CLI + boto3 DynamoDB lab; no live AWS endpoint or shared reset."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import time
from collections import Counter

ROOT = Path(__file__).resolve().parent
LAB = ROOT/'.lab'; LAB.mkdir(exist_ok=True)
STATE = LAB/'resources.json'
ENDPOINT = 'http://127.0.0.1:4566'
if os.environ.get('AWS_ENDPOINT_URL') != ENDPOINT or os.environ.get('AWS_ACCESS_KEY_ID') != 'test' or os.environ.get('AWS_SECRET_ACCESS_KEY') != 'test':
    raise SystemExit('Source docker-labs/env.sh: loopback4566 and dummy test/test required')
for key in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN']:
    os.environ.pop(key, None)
os.environ.update(AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'), AWS_CONFIG_FILE=str(LAB/'config'), AWS_EC2_METADATA_DISABLED='true', AWS_MAX_ATTEMPTS='1', AWS_PAGER='', AWS_DEFAULT_REGION='ap-south-1')
import boto3
client = boto3.client('dynamodb', endpoint_url=ENDPOINT, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
AWS = shutil.which('aws')
if not AWS:
    raise SystemExit('Source env.sh to use existing CLI')
ids = json.loads(STATE.read_text()) if STATE.exists() else {}

def save(): STATE.write_text(json.dumps(ids, indent=2))
def call(*args, error=None):
    command = [AWS, '--endpoint-url', ENDPOINT, '--region', 'ap-south-1', *args, '--output', 'json']
    print('$ aws --endpoint-url '+ENDPOINT+' '+shlex.join(args), flush=True)
    r = subprocess.run(command, capture_output=True, text=True, timeout=30)
    print(r.stdout+r.stderr, end='', flush=True)
    if error:
        assert r.returncode and error in r.stderr, 'expected '+error
        return None
    if r.returncode: raise RuntimeError('CLI failed: '+' '.join(args[:2]))
    return json.loads(r.stdout) if r.stdout.strip() else None

def wire(row): return {k: {'N':str(v)} if isinstance(v, int) else {'S':v} for k,v in row.items()}
def scan(name):
    rows=[]; extra={}
    while True:
        r=client.scan(TableName=name, **extra); rows += r['Items']
        if not r.get('LastEvaluatedKey'): return rows
        extra={'ExclusiveStartKey':r['LastEvaluatedKey']}

def batch(name, rows):
    for start in range(0,len(rows),25):
        pending={name:[{'PutRequest':{'Item':x}} for x in rows[start:start+25]]}
        for attempt in range(8):
            pending=client.batch_write_item(RequestItems=pending)['UnprocessedItems']
            if not pending: break
            time.sleep(min(.02*2**attempt,1))
        assert not pending, 'UnprocessedItems remain; stop and retry safely'

def create(name, pk, sk=None):
    defs=[{'AttributeName':pk,'AttributeType':'S'}]; keys=[{'AttributeName':pk,'KeyType':'HASH'}]
    if sk: defs += [{'AttributeName':sk,'AttributeType':'S'}]; keys += [{'AttributeName':sk,'KeyType':'RANGE'}]
    call('dynamodb','create-table','--table-name',name,'--attribute-definitions',json.dumps(defs),'--key-schema',json.dumps(keys),'--billing-mode','PAY_PER_REQUEST','--query','TableDescription.{Name:TableName,State:TableStatus,Keys:KeySchema}')
    ids['tables'].append(name); save()
    call('dynamodb','wait','table-exists','--table-name',name)

def setup():
    if ids: raise SystemExit('Saved resources exist: cleanup before setup')
    ids.update(token='lab15-'+str(time.time_ns()),tables=[]); save()
    ids.update(old=ids['token']+'-v1',new=ids['token']+'-v2',checkout=ids['token']+'-checkout'); save()
    create(ids['old'],'status','cartId')
    rows=[wire({'cartId':f'cart-{i:04d}','status':'active' if i<950 else 'saved','sellerId':'seller-'+str(i%10),'updatedAt':1800000000+i,'expiresAt':1900000000+i,'total':499,'version':1}) for i in range(1000)]
    batch(ids['old'],rows)
    actual=scan(ids['old']); assert len(actual)==1000
    counts=Counter(x['status']['S'] for x in actual)
    print('SOURCE',json.dumps({'items':len(actual),'partitionKeyCounts':dict(sorted(counts.items()))}),flush=True)

def exercises():
    old,new=ids['old'],ids['new']
    before=scan(old)
    assert len(before)==1000
    create(new,'cartId')
    batch(new,before)
    copied=scan(new)
    canonical=lambda rows: sorted(json.dumps(r,sort_keys=True) for r in rows)
    assert canonical(before)==canonical(copied)
    counts=Counter(x['cartId']['S'] for x in copied)
    print('BACKFILL',json.dumps({'sourceItems':len(before),'targetItems':len(copied),'equalAttributes':True,'distinctCartKeys':len(counts),'maxItemsPerLogicalKey':max(counts.values())}),flush=True)
    index={'Create':{'IndexName':'bySeller','KeySchema':[{'AttributeName':'sellerId','KeyType':'HASH'},{'AttributeName':'updatedAt','KeyType':'RANGE'}],'Projection':{'ProjectionType':'ALL'}}}
    call('dynamodb','update-table','--table-name',new,'--attribute-definitions','AttributeName=sellerId,AttributeType=S','AttributeName=updatedAt,AttributeType=N','--global-secondary-index-updates',json.dumps([index]),'--query','TableDescription.{State:TableStatus,Indexes:GlobalSecondaryIndexes[].{Name:IndexName,State:IndexStatus}}')
    call('dynamodb','wait','table-exists','--table-name',new)
    for _ in range(20):
        state=call('dynamodb','describe-table','--table-name',new,'--query','Table.GlobalSecondaryIndexes[].{Name:IndexName,State:IndexStatus}')
        if state and all(i['State']=='ACTIVE' for i in state): break
        time.sleep(.1)
    else: raise RuntimeError('GSI not ACTIVE; table-exists is not a GSI waiter')
    query=['dynamodb','query','--table-name',new,'--index-name','bySeller','--key-condition-expression','#s = :s','--expression-attribute-names','{"#s":"sellerId"}','--expression-attribute-values','{":s":{"S":"seller-1"}}','--query','{Count:Count,ScannedCount:ScannedCount,FirstCart:Items[0].cartId.S}']
    r=call(*query); assert r['Count']==100
    call(*query,'--consistent-read',error='ValidationException')
    call('dynamodb','update-continuous-backups','--table-name',new,'--point-in-time-recovery-specification','PointInTimeRecoveryEnabled=true,RecoveryPeriodInDays=35','--query','ContinuousBackupsDescription.PointInTimeRecoveryDescription.{Status:PointInTimeRecoveryStatus,Days:RecoveryPeriodInDays}')
    call('dynamodb','describe-continuous-backups','--table-name',new,'--query','ContinuousBackupsDescription.PointInTimeRecoveryDescription.{Status:PointInTimeRecoveryStatus,Days:RecoveryPeriodInDays}')
    call('dynamodb','update-time-to-live','--table-name',new,'--time-to-live-specification','Enabled=true,AttributeName=expiresAt')
    call('dynamodb','describe-time-to-live','--table-name',new)
    item=wire({'cartId':'cart-new','status':'active','sellerId':'seller-1','updatedAt':1800002000,'expiresAt':1900002000,'total':499,'version':1})
    call('dynamodb','put-item','--table-name',new,'--item',json.dumps(item),'--condition-expression','attribute_not_exists(cartId)')
    wrong=dict(item,total={'N':'0'})
    call('dynamodb','put-item','--table-name',new,'--item',json.dumps(wrong),'--condition-expression','attribute_not_exists(cartId)',error='ConditionalCheckFailedException')
    got=call('dynamodb','get-item','--table-name',new,'--key','{"cartId":{"S":"cart-new"}}','--consistent-read','--query','Item.{Cart:cartId.S,Total:total.N}')
    assert got['Total']=='499'
    r=call(*query); assert r['Count']==101
    assert canonical(before)==canonical(scan(old)), 'source must remain untouched'
    create(ids['checkout'],'id')
    call('dynamodb','put-item','--table-name',ids['checkout'],'--item','{"id":{"S":"SKU#kurta"},"available":{"N":"1"}}')
    def transaction(n):
        return [{'Update':{'TableName':ids['checkout'],'Key':{'id':{'S':'SKU#kurta'}},'UpdateExpression':'SET available = available - :n','ConditionExpression':'available >= :n','ExpressionAttributeValues':{':n':{'N':str(n)}}}}, {'Put':{'TableName':ids['checkout'],'Item':{'id':{'S':'ORDER#9001'},'quantity':{'N':str(n)}},'ConditionExpression':'attribute_not_exists(id)'}}]
    call('dynamodb','transact-write-items','--transact-items',json.dumps(transaction(2)),'--client-request-token','lab15-failed',error='TransactionCanceledException')
    stock=client.get_item(TableName=ids['checkout'],Key={'id':{'S':'SKU#kurta'}},ConsistentRead=True)['Item']
    assert stock['available']['N']=='1' and 'Item' not in client.get_item(TableName=ids['checkout'],Key={'id':{'S':'ORDER#9001'}})
    print('ROLLBACK stock=1 orderAbsent=true',flush=True)
    call('dynamodb','transact-write-items','--transact-items',json.dumps(transaction(1)),'--client-request-token','lab15-success')
    stock=client.get_item(TableName=ids['checkout'],Key={'id':{'S':'SKU#kurta'}},ConsistentRead=True)['Item']
    order=client.get_item(TableName=ids['checkout'],Key={'id':{'S':'ORDER#9001'}},ConsistentRead=True)['Item']
    assert stock['available']['N']=='0' and order['quantity']['N']=='1'
    print('ATOMIC-COMMIT stock=0 orderQuantity=1',flush=True)
    call('dynamodb','transact-write-items','--transact-items',json.dumps(transaction(1)),'--client-request-token','lab15-success',error='TransactionCanceledException')
    print('MOTO GAP: same-token replay re-evaluates conditions; real AWS token is idempotent for 10 minutes',flush=True)

def cleanup():
    if not ids: raise SystemExit('No saved resources to delete')
    for name in reversed(ids['tables']):
        call('dynamodb','delete-table','--table-name',name,'--query','TableDescription.TableName')
        call('dynamodb','wait','table-not-exists','--table-name',name)
    left=[x for x in client.list_tables()['TableNames'] if x in ids['tables']]
    assert not left
    print('OWNED_TABLES_REMAIN',json.dumps(left),flush=True)
    STATE.rename(LAB/'last-cleaned-resources.json')

if __name__=='__main__':
    action=sys.argv[1] if len(sys.argv)>1 else ''
    if action not in ('setup','exercises','cleanup'): raise SystemExit('Use setup | exercises | cleanup')
    globals()[action]()
