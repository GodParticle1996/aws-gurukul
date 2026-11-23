/* D9 joins the route, cache, worker, queue and log fixtures used earlier in the track. */
(() => {
  const B=AG.pixBill, R=AG.pixResilience, L=AG.pixLogLab;
  const tenant='41', tableName='pix-usage';
  function seed(interview){
    const a={...B.seed(true),...R.seed(false),...L.seed(),pixBoss:true};
    delete a.pixBill; delete a.pixLogs; delete a.pixResilience;
    const worker=a.lambdas.find(f=>f.name===R.worker);
    Object.assign(worker,{handler:'worker.unsafe',roleName:'pix-exec',reservedConcurrency:16,
      environment:{Variables:{TABLE_NAME:tableName}},lastUpdateStatus:'Successful'});
    a.tables[0].items=[{pk:'TOTAL#demo',units:10},{pk:'TOTAL#other',units:4}];
    a.roles=[{name:'pix-exec',usageTable:tableName}];
    a.pixLog.subscriptions=[{filterName:'hot',filterPattern:L.hotPattern,destinationArn:L.split}];
    if(interview){
      const e=a.vpcEndpoints[0];e.routeTableIds.push('rtb-b');
      a.routeTables.find(t=>t.id==='rtb-b').routes.push({type:'endpoint',prefixListId:e.prefixListId,target:e.id,state:'active',managed:true});
      a.queues[0].attributes.RedrivePolicy=JSON.stringify(R.policy);
      worker.reservedConcurrency=4;
      a.pixLog.subscriptions.push({filterName:'raw',filterPattern:'',destinationArn:L.raw,roleArn:L.role});
    }
    return a;
  }
  const currentTable=a=>a.tables.find(t=>t.name===tableName);
  const testTotal='TOTAL#'+tenant, markerPrefix='EVENT#'+tenant+'#';
  function resetSample(a){
    const t=currentTable(a);
    if(!t)return;
    t.items=t.items.filter(x=>x.pk!==testTotal && !x.pk.startsWith(markerPrefix));
    t.revision++;a.bossSamples=[];
  }
  function invoke(a,f,event){
    const t=currentTable(a),role=a.roles.find(r=>r.name===f.roleName);
    if(!t || t.status!=='ACTIVE' || t.partitionKey!=='pk' || t.sortKey || role?.usageTable!==t.name ||
       f.environment?.Variables?.TABLE_NAME!==t.name)throw Error('ConfigurationError: worker table or role');
    if(!['worker.safe','worker.unsafe'].includes(f.handler))throw Error('Runtime.HandlerNotFound');
    const records=event?.Records;
    if(!Array.isArray(records) || records.length!==1)throw Error('ValueError: one SQS test record required');
    const rec=records[0],job=JSON.parse(rec.body),queue=a.queues.find(q=>q.name===R.source);
    if(rec.eventSource!=='aws:sqs' || rec.eventSourceARN!==queue?.arn || !rec.messageId || !rec.receiptHandle ||
      job.tenant!==tenant || ![job.photo,job.operationId].every(x=>typeof x==='string' && x.length && !x.includes('#')))
      throw Error('ValueError: expected a tenant 41 test job from pix-thumbs');
    const key=markerPrefix+job.operationId, saved=t.items.find(i=>i.pk===key);
    const row=t.items.find(i=>i.pk===testTotal), before=row?.units??0;
    if(!Number.isSafeInteger(before))throw Error('ValidationException: numeric counter required');
    let result='counted';
    if(f.handler==='worker.safe' && saved){
      if(saved.photo!==job.photo)throw Error('KeyConflict: same operation with different input');
      result='duplicate';
    }else{
      // One simulator step models the two-item transaction. The Python lab runs TransactWriteItems.
      if(f.handler==='worker.safe')t.items.push({pk:key,photo:job.photo});
      if(row)row.units++;else t.items.push({pk:testTotal,units:1});
      t.revision++;
    }
    const sample={key,photo:job.photo,receipt:rec.receiptHandle,message:rec.messageId,handler:f.handler,
      configRevision:f.revisionId||'r0',tableId:t.tableId,tableRevision:t.revision,result,before,total:result==='counted'?before+1:before};
    (a.bossSamples||=[]).push(sample);
    return {result,operationId:job.operationId,units:sample.total};
  }
  function replayOK(a,version){
    const t=currentTable(a),fn=a.lambdas.find(f=>f.name===R.worker),key=markerPrefix+'p7/'+version;
    if(!t || t.status!=='ACTIVE' || t.partitionKey!=='pk' || t.sortKey || fn?.handler!=='worker.safe' || fn.pendingConfig || fn.environment?.Variables?.TABLE_NAME!==t.name ||
       !a.roles.some(r=>r.name===fn.roleName && r.usageTable===t.name))return false;
    const samples=(a.bossSamples||[]).filter(s=>s.key===key && s.handler===fn.handler && s.configRevision===(fn.revisionId||'r0') && s.tableId===t.tableId && s.tableRevision===t.revision);
    return samples.some(first=>first.result==='counted' && first.before===0 && first.total===1 &&
      samples.some(next=>next.result==='duplicate' && next.message===first.message && next.receipt!==first.receipt && next.total===1)) &&
      t.items.find(i=>i.pk===key)?.photo==='p7' && t.items.find(i=>i.pk===testTotal)?.units===1 &&
      t.items.find(i=>i.pk==='TOTAL#demo')?.units===10 && t.items.find(i=>i.pk==='TOTAL#other')?.units===4;
  }
  function auditOK(a){
    const p=a.pixLog;
    return p.subscriptions.some(f=>f.filterPattern==='' && f.destinationArn===L.raw && f.roleArn===L.role) &&
      p.subscriptions.some(f=>f.filterPattern===L.hotPattern && f.destinationArn===L.split) &&
      p.logsRole.stream===L.raw && p.logsRole.trust==='logs.amazonaws.com' &&
      p.streams['pix-raw'].DeliveryStreamStatus==='ACTIVE';
  }
  function auditSample(a){
    const p=a.pixLog,receipt=p.receipts.at(-1);
    if(!auditOK(a) || !receipt || receipt.version!==p.version || receipt.raw.length!==2 || receipt.hot.length!==1)return false;
    const [info,warn]=receipt.raw.map(x=>x.message);
    return info===JSON.stringify({requestId:'p7-read',level:'INFO'}) && warn===JSON.stringify({requestId:'p7-retry',level:'WARN'}) &&
      receipt.hot[0].requestId==='p7-retry' && receipt.hot[0].eventId===receipt.raw[1].id;
  }
  function budget(k){
    const target=[99.9,99.95,99.99][k.slo],monthsMins=30*24*60;
    const lost=(k.regions===2?5:60)+(k.async?0:30);
    const allowance=(100-target)*monthsMins/100, hit=[0,.5,.8][k.cache];
    const origins=100-80*hit;
    // 360 busy hours overlap. Only the primary has the other 240. Commitments are paid in all 720.
    const compute=k.plan*.75*720+360*Math.max(0,k.regions-k.plan)+240*Math.max(0,1-k.plan);
    const cost=200*k.regions+100+5*origins+70*k.async+compute;
    const ok=target>=99.95 && lost<=allowance && cost<=1670;
    return {target,allowance,lost,origins,compute,cost,ok,availability:100*(1-lost/monthsMins)};
  }
  AG.pixBoss={seed,invoke,resetSample,replayOK,auditOK,auditSample,budget,tenant};
})();
