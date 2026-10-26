"""Actual Moto DynamoDB reads behind a bounded host cache. Owned ephemeral server only."""
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import logging
import os
from pathlib import Path
from threading import Event

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('lab_cache',ROOT/'cache.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
CacheAside=mod.CacheAside
for key in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(key,None)
LAB=ROOT/'.lab';LAB.mkdir(exist_ok=True)
os.environ.update(AWS_SHARED_CREDENTIALS_FILE=str(LAB/'credentials'),AWS_CONFIG_FILE=str(LAB/'config'),AWS_EC2_METADATA_DISABLED='true',AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_DEFAULT_REGION='ap-south-1')
import boto3
from moto.server import ThreadedMotoServer
logging.getLogger('werkzeug').setLevel(logging.ERROR)
server=ThreadedMotoServer(ip_address='127.0.0.1',port=0,verbose=False);server.start();host,port=server.get_host_and_port();endpoint=f'http://127.0.0.1:{port}'
client=boto3.client('dynamodb',endpoint_url=endpoint,region_name='ap-south-1',aws_access_key_id='test',aws_secret_access_key='test')
checks=0

def check(value,message):
    global checks
    assert value,message;checks+=1

def put(tenant,product,price,version):
    client.put_item(TableName='lab16-catalog',Item={'tenant':{'S':tenant},'product':{'S':product},'price':{'N':str(price)},'version':{'N':str(version)}})

def fetch(tenant,product):
    row=client.get_item(TableName='lab16-catalog',Key={'tenant':{'S':tenant},'product':{'S':product}},ConsistentRead=True).get('Item')
    return None if not row else {'tenant':row['tenant']['S'],'product':row['product']['S'],'price':int(row['price']['N']),'version':int(row['version']['N'])}

try:
    client.create_table(TableName='lab16-catalog',AttributeDefinitions=[{'AttributeName':'tenant','AttributeType':'S'},{'AttributeName':'product','AttributeType':'S'}],KeySchema=[{'AttributeName':'tenant','KeyType':'HASH'},{'AttributeName':'product','KeyType':'RANGE'}],BillingMode='PAY_PER_REQUEST')
    put('shop','kurta',499,1);put('other','kurta',999,1);put('shop','shoe',799,1)
    now=[0.0];cache=CacheAside(fetch,ttl=60,max_entries=2,clock=lambda:now[0])
    for _ in range(10):check(cache.get('shop','kurta')['price']==499,'cold/hot correct data')
    check(cache.stats['db_reads']==1 and cache.stats['hits']==9,'one real origin call, nine actual cache hits')
    warm=dict(cache.stats)
    check(cache.get('other','kurta')['price']==999,'tenant boundary retained in key')
    before=cache.stats['db_reads'];put('shop','kurta',599,2)
    check(cache.get('shop','kurta')['price']==499,'without invalidation stale value is visible within TTL')
    cache.invalidate('shop','kurta')
    check(cache.get('shop','kurta')['price']==599 and cache.stats['db_reads']==before+1,'DB commit then invalidate/refill actual updated row')
    now[0]=61
    before=cache.stats['db_reads'];check(cache.get('shop','kurta')['price']==599 and cache.stats['db_reads']==before+1,'expired cache triggers actual origin read')
    cache.get('shop','shoe');cache.get('other','kurta');check(cache.stats['evictions']>=1 and len(cache.entries)==2,'LRU entry cap enforced')
    returned=cache.get('other','kurta');returned['price']=0;check(cache.get('other','kurta')['price']==999,'caller mutation cannot poison cached object')
    missing=CacheAside(fetch,ttl=60,max_entries=2,clock=lambda:now[0]);check(missing.get('shop','missing') is None,'negative lookup preserves missing semantics')
    put('shop','missing',99,1);check(missing.get('shop','missing') is None,'negative cache can be stale briefly')
    now[0]+=1.1;check(missing.get('shop','missing')['price']==99,'negative cache short TTL expires')
    entered=Event();release=Event()
    def gated(tenant,product):
        row=fetch(tenant,product);entered.set()
        if not release.wait(5):raise TimeoutError('test gate not released')
        return row
    shared=CacheAside(gated,ttl=60,max_entries=2)
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures=[pool.submit(shared.get,'shop','kurta') for _ in range(20)]
        check(entered.wait(5),'cold leader reached actual origin')
        with shared.changed:check(shared.changed.wait_for(lambda:shared.stats['coalesced']==19,timeout=5),'19 requests coalesced while cold fetch held')
        release.set();results=[f.result(timeout=5) for f in futures]
    check(shared.stats['db_reads']==1 and all(r['price']==599 for r in results),'20 concurrent requests share one actual origin read')
    coalescing=dict(shared.stats)
    entered.clear();release.clear();calls=[0]
    def racing(tenant,product):
        row=fetch(tenant,product);calls[0]+=1
        if calls[0]==1:
            entered.set()
            if not release.wait(5):raise TimeoutError('test race gate not released')
        return row
    race=CacheAside(racing,ttl=60,max_entries=2)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(race.get,'shop','kurta');check(entered.wait(5),'old row is in-flight before write')
        put('shop','kurta',699,3);race.invalidate('shop','kurta');release.set();value=future.result(timeout=5)
    check(value['version']==3 and race.get('shop','kurta')['price']==699 and race.stats['db_reads']==2,'invalidation discards in-flight stale fill and retries current origin')
    error=CacheAside(lambda *_:(_ for _ in ()).throw(RuntimeError('simulated origin unavailable')))
    try:error.get('shop','kurta')
    except RuntimeError as e:check('origin unavailable' in str(e),'useful origin failure propagated')
    else:raise AssertionError('origin error suppressed')
    check(not error.entries and not error.flights,'failed refill is neither cached nor left pending')
    jitter=CacheAside(fetch,ttl=60,jitter=6,max_entries=2,clock=lambda:now[0]);jitter.get('shop','kurta');expiry=next(iter(jitter.entries.values()))[0]
    check(54<=expiry-now[0]<=60,'downward TTL jitter preserves maximum-staleness ceiling')
    invalid=0
    for kwargs in [{'ttl':0},{'ttl':float('inf')},{'max_entries':0},{'ttl':10,'jitter':9}]:
        try:CacheAside(fetch,**kwargs)
        except ValueError:invalid+=1
    check(invalid==4,'invalid cache configuration is explicit')
    wrong=CacheAside(lambda *_:{'tenant':'other','product':'kurta','price':0})
    try:wrong.get('shop','kurta')
    except ValueError as e:check('tenant/product' in str(e),'cross-scope origin row rejected')
    else:raise AssertionError('mismatching origin row accepted')
    check(not wrong.entries and not wrong.flights,'invalid origin row not cached')
    for tenant,product in [(None,'kurta'),('shop',''),([],1)]:
        try:cache.get(tenant,product)
        except ValueError:check(True,'invalid cache key explicit')
        else:raise AssertionError('invalid cache key accepted')
    print(json.dumps({'checks':checks,'warm':warm,'coalescing':coalescing,'inflightRace':{'originReads':race.stats['db_reads'],'price':value['price'],'version':value['version']},'scope':'host Python cache + real local DynamoDB calls; not Valkey runtime/performance'},indent=2),flush=True)
finally:
    cleaned=False
    try:
        client.delete_table(TableName='lab16-catalog')
        check(client.list_tables()['TableNames']==[],'owned table cleanup')
        cleaned=True
    finally:
        server.stop();server._server.server_close()
        (LAB/'last-endpoint.json').write_text(json.dumps({'host':host,'port':port,'tableCleaned':cleaned,'serverStopped':True}))
        print('OWNED TABLES [] / OWNED SERVER STOPPED' if cleaned else 'OWNED SERVER STOPPED; table delete not verified',flush=True)
