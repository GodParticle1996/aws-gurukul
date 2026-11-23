/* D8 uses the shared DynamoDB, SQS and Lambda commands. These are the worker's inputs and receipts. */
(() => {
  const account = '123456789012', region = 'us-east-1';
  const source = 'pix-thumbs', dead = 'pix-failed', worker = 'pix-worker';
  const ledger = 'pix-events', usage = 'pix-usage';
  const url = name => 'https://sqs.' + region + '.amazonaws.com/' + account + '/' + name;
  const arn = name => 'arn:aws:sqs:' + region + ':' + account + ':' + name;
  const policy = {deadLetterTargetArn:arn(dead), maxReceiveCount:5};
  const table = (name, items) => ({name, tableId:name+'-initial', status:'ACTIVE', billing:'PAY_PER_REQUEST',
    partitionKey:'pk', attributeTypes:{pk:'S'}, revision:1, items});
  function seed(repair) {
    const queues = [source,dead].map(name => ({name, arn:arn(name), url:url(name), isFifo:false, messages:[],
      visibilityTimeout:60, attributes:{MessageRetentionPeriod:name===dead?'1209600':'345600'}}));
    const tables = [table(usage,[{pk:'TOTAL#demo',units:10},{pk:'TOTAL#other',units:4}])];
    if (repair) {
      tables.push(table(ledger,[{pk:'EVENT#demo/p7/v1',photo:'p7'}]));
      queues[0].attributes.RedrivePolicy = JSON.stringify({...policy,maxReceiveCount:1});
    }
    return {pixResilience:true, region, callerIdentity:{Account:account}, queues, tables,
      lambdas:[{name:worker, state:'Active', runtime:'python3.12', handler:'app.handler', timeout:10,
        memory:256, reservedConcurrency:repair?16:undefined},
        {name:'pix-feed',state:'Active',runtime:'python3.12',reservedConcurrency:8}],
      eventSourceMappings:[{uuid:'map-pix',functionName:worker,eventSourceArn:arn(source),state:'Enabled',batchSize:1,
        batchingWindow:0,responseTypes:[],revision:1}]};
  }
  function transaction(version) {
    return [
      {Put:{TableName:ledger, Item:{pk:{S:'EVENT#demo/p7/'+version},photo:{S:'p7'}},
        ConditionExpression:'attribute_not_exists(pk)'}},
      {Update:{TableName:usage,Key:{pk:{S:'TOTAL#demo'}},UpdateExpression:'ADD #units :one',
        ConditionExpression:'attribute_exists(pk)',ExpressionAttributeNames:{'#units':'units'},
        ExpressionAttributeValues:{':one':{N:'1'}}}}
    ];
  }
  const getTable = (tables,name) => tables?.find(t=>t.name===name);
  const item = (t,pk) => t?.items?.find(row=>row.pk===pk);
  function queueOK(a) {
    const q=a.queues.find(q=>q.name===source), dlq=a.queues.find(q=>q.name===dead);
    if(!q || !dlq || q.isFifo || dlq.isFifo || dlq.arn!==arn(dead) || q.arn!==arn(source))return false;
    const p=JSON.parse(q.attributes.RedrivePolicy || '{}'), allow=JSON.parse(dlq.attributes.RedriveAllowPolicy || '{}');
    return p.deadLetterTargetArn===dlq.arn && Number(p.maxReceiveCount)===5 &&
      Number(q.attributes.VisibilityTimeout??q.visibilityTimeout)>=60 &&
      Number(dlq.attributes.MessageRetentionPeriod)>Number(q.attributes.MessageRetentionPeriod) &&
      (!allow.redrivePermission || allow.redrivePermission==='allowAll' ||
       allow.redrivePermission==='byQueue' && allow.sourceQueueArns.includes(q.arn));
  }
  function capOK(a) {
    const f=a.lambdas.find(f=>f.name===worker), m=a.eventSourceMappings.find(m=>m.functionName===worker);
    return f?.state==='Active' && f.timeout===10 && f.reservedConcurrency===4 &&
      a.lambdas.find(f=>f.name==='pix-feed')?.reservedConcurrency===8 &&
      m?.state==='Enabled' && m.eventSourceArn===arn(source) && m.batchSize===1;
  }
  function counted(s, repair) {
    const events=getTable(s.account.tables,ledger), counts=getTable(s.account.tables,usage);
    const key='EVENT#demo/p7/'+(repair?'v2':'v1');
    const priorOK=!repair || item(events,'EVENT#demo/p7/v1')?.photo==='p7';
    return events?.status==='ACTIVE' && events.billing==='PAY_PER_REQUEST' && events.partitionKey==='pk' &&
      !events.sortKey && events.attributeTypes.pk==='S' && item(events,key)?.photo==='p7' &&
      events.items.length===(repair?2:1) && priorOK && item(counts,'TOTAL#demo')?.units===11 &&
      item(counts,'TOTAL#other')?.units===4;
  }
  function replayed(s, repair) {
    const ok=s.ddbLastTransaction, fail=s.ddbLastFailedTransaction;
    if(!ok || !fail || !counted(s,repair) || ok.items.length!==2 || fail.items.length!==2)return false;
    // Both attempts must still describe the same two live tables and their current revisions.
    const fresh=proof=>[ledger,usage].every(name=>{
      const t=getTable(s.account.tables,name), snap=getTable(proof.tables,name);
      return snap && snap.tableId===t.tableId && snap.revision===t.revision;
    });
    const proofOK=proof=>{
      const put=proof.items.find(x=>x.Put)?.Put, update=proof.items.find(x=>x.Update)?.Update;
      if(!put || !update)return false;
      const expand=(expr,names={})=>(expr||'').replace(/#\w+/g,k=>names[k]||k).replace(/\s+/g,'');
      const add=/^ADD\s+(#?\w+)\s+(:\w+)$/i.exec(update.UpdateExpression||'');
      return put.TableName===ledger && put.Item?.pk?.S==='EVENT#demo/p7/'+(repair?'v2':'v1') && put.Item.photo?.S==='p7' &&
        expand(put.ConditionExpression,put.ExpressionAttributeNames)==='attribute_not_exists(pk)' &&
        update.TableName===usage && update.Key?.pk?.S==='TOTAL#demo' && add &&
        expand(add[1],update.ExpressionAttributeNames)==='units' && Number(update.ExpressionAttributeValues?.[add[2]]?.N)===1 &&
        expand(update.ConditionExpression,update.ExpressionAttributeNames)==='attribute_exists(pk)';
    };
    return fresh(ok) && fresh(fail) && proofOK(ok) && proofOK(fail) &&
      fail.reasons.every((r,i)=>r===(fail.items[i].Put?'ConditionalCheckFailed':'None'));
  }

  // One tick is one second. All initial calls arrive at zero. Their retries use reproducible draws.
  function simulate(k) {
    let seed=7921;
    const draw=()=>{ seed=(Math.imul(1664525,seed)+1013904223)>>>0; return seed/4294967296; };
    const slots=[[...Array(k.clients)].map((_,id)=>({id,attempt:0}))];
    const written=new Set(), acknowledged=new Set();
    let duplicates=0, peak=0, attempts=0;
    for(let t=0;t<slots.length;t++){
      const calls=slots[t]||[];
      if(t>=k.outage)peak=Math.max(peak,calls.length);
      calls.forEach(({id,attempt},index)=>{
        attempts++;
        if(t>=k.outage && index<4){
          const replay=written.has(id);
          if(replay)duplicates++;
          else written.add(id);
          // For every fourth client only the reply to the first successful write is lost.
          if(replay || id%4!==0){acknowledged.add(id);return;}
        }
        if(attempt>=k.retries)return;
        const window=Math.min(8,k.base*2**attempt);
        const delay=k.jitter ? 1+Math.floor(draw()*window) : window;
        (slots[t+delay]||=[]).push({id,attempt:attempt+1});
      });
    }
    return {peak,duplicates,attempts,writes:written.size,acks:acknowledged.size,
      lastAttempt:slots.length-1, wave:Array.from(slots,s=>s?.length||0)};
  }
  const fits=(k,m)=>k.clients===12 && k.outage===2 && m.acks===12 && m.peak<=4 && m.lastAttempt<=18;
  AG.pixResilience={seed,transaction,source,dead,ledger,usage,worker,url,policy,queueOK,capOK,counted,replayed,simulate,fits};
})();
