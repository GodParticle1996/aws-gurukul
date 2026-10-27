"""Actual Moto SQS drain + durable host TEST intent ledger; no emails/provider calls."""
import concurrent.futures,json,sqlite3,threading,time
from pathlib import Path
import boto3
from botocore.config import Config

def benchmark(endpoint,queue_url,folder,workers,count=10000,duplicates=100,work_seconds=.002,offset=0):
    if endpoint!='https://sqs.us-east-1.amazonaws.com' or not queue_url.startswith(endpoint+'/'):
        raise ValueError('Only the guarded in-process Moto SQS namespace is permitted')
    folder=Path(folder);folder.mkdir(exist_ok=True)
    db=sqlite3.connect(folder/f'intents-{workers}.sqlite',check_same_thread=False)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS intents (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, phase TEXT NOT NULL)')
    if db.execute('SELECT count(*) FROM intents').fetchone()[0]!=offset:
        db.close();raise ValueError('Use a fresh own ledger; existing evidence is preserved')
    def client():
        return boto3.client('sqs',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test',config=Config(connect_timeout=2,read_timeout=5,retries={'total_max_attempts':2},max_pool_connections=workers+1))
    producer=client();sent=0
    for start in range(0,count+duplicates,10):
        rows=[]
        for i in range(start,min(start+10,count+duplicates)):
            event=i if i<count else i-count
            rows.append({'Id':str(i-start),'MessageBody':json.dumps({'eventId':f'email-{offset+event:05d}','kind':'TEST_EMAIL_INTENT','amount':499},sort_keys=True)})
        response=producer.send_message_batch(QueueUrl=queue_url,Entries=rows)
        assert not response.get('Failed'),response
        sent+=len(response['Successful'])
        if sent%1000==0:print('SEEDED',workers,sent,flush=True)
    assert sent==count+duplicates
    lock=threading.Lock();api_lock=threading.Lock();stop=threading.Event();stats={'received':0,'acknowledged':0,'duplicateIntents':0,'uniqueIntents':0};began=time.perf_counter();deadline=began+180
    def consume():
        sqs=client()
        while not stop.is_set():
            if time.perf_counter()>deadline:raise AssertionError('Finite drain deadline exceeded; inspect visibility/DLQ/consumer errors')
            with api_lock:
                messages=sqs.receive_message(QueueUrl=queue_url,MaxNumberOfMessages=10,VisibilityTimeout=60,WaitTimeSeconds=0).get('Messages',[])
            if not messages:
                time.sleep(.005);continue
            with lock:
                with db:
                    for message in messages:
                        event=json.loads(message['Body']);assert event['kind']=='TEST_EMAIL_INTENT' and event['amount']==499
                        payload=json.dumps(event,sort_keys=True);row=db.execute('SELECT payload FROM intents WHERE event_id=?',(event['eventId'],)).fetchone()
                        if row:
                            assert row[0]==payload,'Conflicting event identity cannot overwrite original work';stats['duplicateIntents']+=1
                        else:
                            db.execute('INSERT INTO intents VALUES (?,?,?)',(event['eventId'],payload,'PENDING_DISPATCH'));stats['uniqueIntents']+=1
                    stats['received']+=len(messages)
            # Declared host processing delay, outside the DB lock. It is not AWS latency.
            time.sleep(work_seconds*len(messages))
            with api_lock:
                result=sqs.delete_message_batch(QueueUrl=queue_url,Entries=[{'Id':str(i),'ReceiptHandle':m['ReceiptHandle']} for i,m in enumerate(messages)])
            assert not result.get('Failed'),result
            with lock:
                stats['acknowledged']+=len(result['Successful'])
                if stats['acknowledged']%1000==0:print('ACKNOWLEDGED',workers,stats['acknowledged'],flush=True)
                with api_lock:
                    attributes=sqs.get_queue_attributes(QueueUrl=queue_url,AttributeNames=['ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible'])['Attributes']
                if stats['uniqueIntents']==count and attributes['ApproximateNumberOfMessages']=='0' and attributes['ApproximateNumberOfMessagesNotVisible']=='0':stop.set()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            futures=[pool.submit(consume) for _ in range(workers)]
            for future in concurrent.futures.as_completed(futures):
                try:future.result()
                except BaseException:stop.set();raise
        elapsed=time.perf_counter()-began
        rows=db.execute('SELECT count(*),count(DISTINCT event_id) FROM intents').fetchone()
        assert rows==(offset+count,offset+count) and stats['uniqueIntents']==count
        assert stats['received']>=sent and stats['acknowledged']==stats['received'] and stats['duplicateIntents']==stats['received']-count,json.dumps(stats)
        assert {row[0] for row in db.execute('SELECT event_id FROM intents')}=={f'email-{i:05d}' for i in range(offset+count)},'expected intent identity set must match exactly'
        attributes=producer.get_queue_attributes(QueueUrl=queue_url,AttributeNames=['ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible'])['Attributes']
        assert attributes['ApproximateNumberOfMessages']=='0' and attributes['ApproximateNumberOfMessagesNotVisible']=='0',attributes
        result={'workers':workers,'windowStartId':offset,'uniqueTestIntents':count,'deliberateDuplicateCopies':duplicates,'received':stats['received'],'acknowledged':stats['acknowledged'],'duplicateIntents':stats['duplicateIntents'],'additionalRedeliveries':stats['received']-sent,'drainSeconds':round(elapsed,3),'uniqueIntentsPerSecond':round(count/elapsed,2),'declaredWorkDelayMs':work_seconds*1000,'motoApiCallsSerialized':True,'externalEmails':0,'remaining':attributes,'scope':'network-blocked in-process Moto SQS SDK + host SQLite intents; not network/AWS/Lambda throughput'}
        print('ACTUAL DRAIN',json.dumps(result),flush=True);return result
    finally:
        stop.set();db.close()

if __name__=='__main__':
    import os
    from moto import mock_aws
    from unittest.mock import patch
    for key in ['AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_SESSION_TOKEN']:os.environ.pop(key,None)
    root=Path(__file__).resolve().parent/'.lab'/('inprocess-'+str(time.time_ns()));root.mkdir(parents=True)
    os.environ.update(AWS_ACCESS_KEY_ID='test',AWS_SECRET_ACCESS_KEY='test',AWS_EC2_METADATA_DISABLED='true',AWS_SHARED_CREDENTIALS_FILE=str(root/'credentials'),AWS_CONFIG_FILE=str(root/'config'))
    endpoint='https://sqs.us-east-1.amazonaws.com'
    with mock_aws(),patch('socket.socket.connect',side_effect=AssertionError('Network is forbidden during in-process Moto')),patch('socket.getaddrinfo',side_effect=AssertionError('DNS is forbidden during in-process Moto')):
        sqs=boto3.client('sqs',endpoint_url=endpoint,region_name='us-east-1',aws_access_key_id='test',aws_secret_access_key='test')
        queues=[]
        try:
            results=[]
            for workers in [1,5]:
                queue=sqs.create_queue(QueueName='inprocess-'+str(workers))['QueueUrl'];queues.append(queue)
                windows=[benchmark(endpoint,queue,root,workers=workers,count=1000,duplicates=10,offset=offset) for offset in range(0,10000,1000)]
                elapsed=sum(w['drainSeconds'] for w in windows)
                ledger=sqlite3.connect(root/f'intents-{workers}.sqlite');assert ledger.execute('SELECT count(DISTINCT event_id) FROM intents').fetchone()[0]==10000;ledger.close()
                result={'workers':workers,'uniqueTestIntents':10000,'deliberateDuplicateCopies':100,'received':sum(w['received'] for w in windows),'acknowledged':sum(w['acknowledged'] for w in windows),'duplicateIntents':sum(w['duplicateIntents'] for w in windows),'measuredDrainSeconds':round(elapsed,3),'uniqueIntentsPerDrainSecond':round(10000/elapsed,2),'windowCount':10,'maxSeededUniquePerWindow':1000,'declaredWorkDelayMs':2,'motoApiCallsSerialized':True,'externalEmails':0,'scope':'network-blocked Moto SDK, API lock for emulator set-iteration bug; concurrent business workers; sum of windows excludes publishing, not initial10kburst/AWS/Lambda throughput'}
                assert result['received']>=10100 and result['acknowledged']==result['received'] and result['duplicateIntents']==result['received']-10000,result
                print('ACTUAL TEN-THOUSAND RESULT',json.dumps(result),flush=True);results.append(result)
            (root/'results.json').write_text(json.dumps(results,indent=2));print('MEASURED WORKLOAD COMPLETE',json.dumps(results),flush=True)
        finally:
            for queue in queues:sqs.delete_queue(QueueUrl=queue)
            assert not sqs.list_queues().get('QueueUrls',[])
            print('IN-PROCESS OWNED QUEUES EMPTY / NETWORK FORBIDDEN',flush=True)
