/* Architect D4 extensions for the existing Classic rule and target simulator. */
(() => {
  AG.bridgeSpecs = {
    events: {'create-archive':['archive-name','event-source-arn','event-pattern','retention-days'],
      'describe-archive':['archive-name'], 'delete-archive':['archive-name'],
      'start-replay':['replay-name','event-source-arn','event-start-time','event-end-time','destination'],
      'describe-replay':['replay-name']},
    pipes: {'create-pipe':['name','source','target','role-arn','source-parameters','target-parameters'],
      'update-pipe':['name','target','role-arn','source-parameters','target-parameters'], 'describe-pipe':['name'], 'list-pipes':[]}
  };
  const invalid = msg => {throw Error('ValidationException: ' + msg);};
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const fields = (obj,allowed) => object(obj) && Object.keys(obj).every(k => allowed.includes(k));
  const safeKey = k => /^[A-Za-z][A-Za-z0-9_-]*$/.test(k) && !['constructor','prototype','__proto__'].includes(k);
  // The mission maps scalar event fields into a flat JSON object. Reject other template forms explicitly.
  AG.bridgeTemplate = function (spec, event) {
    if (!fields(spec,['InputPathsMap','InputTemplate']) || !object(spec.InputPathsMap) ||
        typeof spec.InputTemplate !== 'string') invalid('InputTransformer needs InputPathsMap and InputTemplate');
    const paths = spec.InputPathsMap;
    for (const [name,path] of Object.entries(paths)) {
      if (!safeKey(name) || typeof path !== 'string' || !path.startsWith('$.') || !path.slice(2).split('.').every(safeKey))
        invalid('Is terminal mein named fields ke liye $.detail.uploadId jaise paths chalte hain.');
    }
    const shape = JSON.parse(spec.InputTemplate.replace(/(:\s*)<([A-Za-z0-9_-]+)>/g,'$1"<$2>"'));
    if (!shape || Array.isArray(shape) || typeof shape !== 'object') invalid('Is terminal mein template ka output JSON object hai.');
    const output = {};
    for (const [key,value] of Object.entries(shape)) {
      if (!safeKey(key) || typeof value !== 'string') invalid('Is terminal mein flat JSON fields aur named variables chalte hain.');
      const match = /^<([A-Za-z0-9_-]+)>$/.exec(value);
      if (!match) {
        if (/[<>]/.test(value)) invalid('Ek poora variable har field ko do.');
        output[key] = value; continue;
      }
      if (!Object.hasOwn(paths,match[1])) invalid('Template variable ka JSON path nahi mila.');
      const found = paths[match[1]].slice(2).split('.').reduce((v,k) => v && Object.hasOwn(v,k) ? v[k] : undefined,event);
      if (found !== undefined) output[key] = found;
    }
    return output;
  };
  AG.bridgeCapture = (account,b,event,arrival) => {
    for (const a of account.archives || []) {
      if (a.busId === b.busId && !event['replay-name'] && (!a.pattern || AG.eventPatternMatch(a.pattern,event)))
        a.records.push({event, arrival});
    }
  };
  AG.bridgeCLI = function ({service, op, required, flag, doc, sim, list, clock, bus, rules, dispatch, roleAllows, machines, next, print, resultJson}) {
    if (!Object.hasOwn(AG.bridgeSpecs[service] || {},op)) {
      if (service !== 'pipes') return false;
      print('err','Is terminal mein create-pipe, update-pipe, describe-pipe aur list-pipes chalte hain.'); return true;
    }
    const a = sim.account, prefix = 'arn:aws:events:' + a.region + ':' + a.callerIdentity.Account + ':';
    const nameArg = key => {
      const name = required(key);
      if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.length > (key === 'archive-name' ? 48 : 64)) invalid('Invalid resource name');
      return name;
    };
    const missing = type => {throw Error((service === 'pipes' ? 'NotFoundException' : 'ResourceNotFoundException') + ': ' + type + ' missing');};
    const exists = type => {throw Error((service === 'pipes' ? 'ConflictException' : 'ResourceAlreadyExistsException') + ': ' + type + ' already exists');};
    if (service === 'pipes') {
      const pipes = list('pipes');
      if (op === 'list-pipes') {resultJson({Pipes:pipes.map(p => ({Name:p.Name,Arn:p.Arn,CurrentState:p.CurrentState,Source:p.Source,Target:p.Target}))});return true;}
      const name = nameArg('name'), old = pipes.find(p => p.Name === name);
      if (op === 'describe-pipe') {if (!old) missing('Pipe'); resultJson(old);return true;}
      if (op === 'create-pipe' && old) exists('Pipe');
      if (op === 'update-pipe' && !old) missing('Pipe');
      const source = old?.Source || required('source'), target = flag('target') ?? old?.Target ?? required('target');
      const role = required('role-arn'), arn = 'arn:aws:pipes:'+a.region+':'+a.callerIdentity.Account+':pipe/'+name;
      if (!list('queues').some(q=>q.arn === source) || !machines().some(m=>m.arn === target && m.type === 'STANDARD'))
        invalid('Is lab mein SQS source aur Standard workflow ka poora ARN do.');
      const src = flag('source-parameters') === null ? old?.SourceParameters || {} : doc('source-parameters');
      const dst = flag('target-parameters') === null ? old?.TargetParameters || {} : doc('target-parameters');
      if (!fields(src,['FilterCriteria','SqsQueueParameters']) || !fields(src.SqsQueueParameters ?? {},['BatchSize','MaximumBatchingWindowInSeconds']))
        invalid('Invalid SQS source parameters');
      const batch = src.SqsQueueParameters?.BatchSize, window = src.SqsQueueParameters?.MaximumBatchingWindowInSeconds;
      if (batch !== undefined && (!Number.isInteger(batch) || batch < 1 || batch > 10000)) invalid('BatchSize must be 1..10000');
      if (window !== undefined && (!Number.isInteger(window) || window < 0 || window > 300)) invalid('MaximumBatchingWindowInSeconds must be 0..300');
      if (src.FilterCriteria) {
        const f = src.FilterCriteria.Filters;
        if (!fields(src.FilterCriteria,['Filters']) || !Array.isArray(f) || !f.length || f.length > 5) invalid('FilterCriteria needs Filters');
        for (const item of f) {
          if (!fields(item,['Pattern']) || typeof item.Pattern !== 'string') invalid('Filter needs a JSON pattern string');
          AG.validateEventPattern(JSON.parse(item.Pattern));
        }
      }
      if (!fields(dst,['StepFunctionStateMachineParameters']) || !fields(dst.StepFunctionStateMachineParameters,['InvocationType']) ||
          dst.StepFunctionStateMachineParameters.InvocationType !== 'FIRE_AND_FORGET') invalid('Standard workflow needs FIRE_AND_FORGET');
      if (!['sqs:ReceiveMessage','sqs:DeleteMessage','sqs:GetQueueAttributes'].every(action => roleAllows(role,'pipes.amazonaws.com',action,source,arn)) ||
          !roleAllows(role,'pipes.amazonaws.com','states:StartExecution',target,arn)) invalid('Pipe role ka trust, queue access aur StartExecution jaancho.');
      const view = {Name:name,Arn:arn,Source:source,Target:target,RoleArn:role,DesiredState:'RUNNING',CurrentState:'RUNNING',SourceParameters:src,TargetParameters:dst};
      if (old) Object.assign(old,view); else pipes.push(view);
      resultJson({Name:name,Arn:arn,CurrentState:op==='create-pipe'?'CREATING':'UPDATING',DesiredState:'RUNNING',LastModifiedTime:clock()});
      return true;
    }
    const archives = list('archives'), replays = list('replays'), now = Date.parse(clock());
    if (op.endsWith('archive')) {
      const name = nameArg('archive-name'), old = archives.find(a=>a.name === name);
      if (op === 'create-archive') {
        if (old) exists('Archive');
        const b = bus(required('event-source-arn'));
        if (flag('event-source-arn') !== b.arn) invalid('EventSourceArn needs a bus ARN');
        const pattern = flag('event-pattern') === null ? null : AG.validateEventPattern(doc('event-pattern'));
        const days = flag('retention-days') ?? '0';
        if (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days))) invalid('RetentionDays must be a nonnegative integer');
        const archive = {name,id:next('archive'),arn:prefix+'archive/'+name,busId:b.busId,source:b.arn,days:Number(days),pattern,records:[],created:clock()};
        archives.push(archive); resultJson({ArchiveArn:archive.arn,State:'ENABLED',CreationTime:archive.created});
      } else {
        if (!old) missing('Archive');
        if (op === 'delete-archive') {archives.splice(archives.indexOf(old),1); print('ok','');}
        else resultJson({ArchiveName:name,ArchiveArn:old.arn,EventSourceArn:old.source,State:'ENABLED',RetentionDays:old.days,
          CreationTime:old.created,EventCount:old.records.filter(r=>!old.days || r.arrival > now-old.days*86400000).length,...(old.pattern?{EventPattern:JSON.stringify(old.pattern)}:{})});
      }
      return true;
    }
    const name = nameArg('replay-name'), old = replays.find(x=>x.ReplayName === name);
    if (op === 'describe-replay') {
      if (!old) missing('Replay');
      const {archiveId,...view}=old;
      if (resultJson(view) && [null,'State'].includes(flag('query'))) a.lastReplayRead=old.ReplayArn;
      return true;
    }
    if (old) exists('Replay');
    const source = required('event-source-arn'), archive = archives.find(x=>x.arn===source);
    if (!archive) missing('Archive');
    const start = required('event-start-time'), end = required('event-end-time');
    const millis = v => /^\d+(?:\.\d+)?$/.test(v) ? Number(v)*1000 : Date.parse(v);
    const from = millis(start), to = millis(end);
    if (!Number.isFinite(new Date(from).getTime()) || !Number.isFinite(new Date(to).getTime()) || from >= to) invalid('EventStartTime must be before EventEndTime');
    const dest = doc('destination'), b = bus(archive.source);
    if (!fields(dest,['Arn','FilterArns']) || dest.Arn !== b.arn || archive.busId !== b.busId) invalid('Replay needs the original bus ARN');
    const active = rules().filter(r=>r.bus === b.name);
    if (dest.FilterArns !== undefined && (!Array.isArray(dest.FilterArns) || !dest.FilterArns.length ||
        dest.FilterArns.some(arn=>!active.some(r=>r.arn===arn)))) invalid('FilterArns must name rules on the source bus');
    for (const row of archive.records) {
      const time = Date.parse(row.event.time);
      if (time < from || time > to || archive.days && row.arrival <= now-archive.days*86400000) continue;
      const event = {...row.event,'replay-name':name};
      for (const r of active) {
        if (r.state === 'DISABLED' || !r.pattern || dest.FilterArns && !dest.FilterArns.includes(r.arn) || !AG.eventPatternMatch(r.pattern,event)) continue;
        for (const target of r.targets) dispatch(r,target,event);
      }
    }
    const replay = {ReplayName:name,ReplayArn:prefix+'replay/'+name,State:'COMPLETED',Destination:dest,EventSourceArn:source,
      EventStartTime:new Date(from).toISOString(),EventEndTime:new Date(to).toISOString(),ReplayStartTime:clock(),ReplayEndTime:clock()};
    replays.push({...replay,archiveId:archive.id});resultJson({ReplayArn:replay.ReplayArn,State:'STARTING',ReplayStartTime:clock()});return true;
  };
})();
