/* Bounded ASG schedule metadata and CloudWatch fixture evaluation.
   No autonomous timer, live metric collection, notification delivery or AWS SLO claim. */
(() => {
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),copy=x=>JSON.parse(JSON.stringify(x));
  const list=x=>Array.isArray(x)?x:[];
  const dims=x=>JSON.stringify(list(x).map(d=>[d.Name,d.Value]).sort((a,b)=>a[0].localeCompare(b[0])));
  const clock=a=>Date.parse(a.now||'2026-11-05T05:10:00Z')+(a.messagingClock||0)*1000;
  AG.capacityAlarmSnapshot=(account,alarm)=>{
    const d=alarm.definition;
    if(!d)return {state:alarm.state||'INSUFFICIENT_DATA',source:'legacy-fixture',reason:'Existing training alarm metadata; no runtime health proof',points:[]};
    if(alarm.manual&&clock(account)<alarm.manual.until)return {state:alarm.manual.state,source:'manual-test',reason:alarm.manual.reason,points:[]};
    const series=list(account.capacityMetrics).find(s=>s.namespace===d.Namespace&&s.metric===d.MetricName&&dims(s.dimensions)===dims(d.Dimensions)&&(!d.Unit||s.unit===d.Unit));
    const n=d.EvaluationPeriods,m=d.DatapointsToAlarm||n,stat=d.ExtendedStatistic||d.Statistic,now=clock(account);
    const points=list(series?.points).filter(p=>Number.isFinite(Date.parse(p.Timestamp))&&Date.parse(p.Timestamp)<=now&&Date.parse(p.Timestamp)>=now-n*d.Period*1000).sort((a,b)=>Date.parse(a.Timestamp)-Date.parse(b.Timestamp)).slice(-n);
    const observed=points.filter(p=>Number.isFinite(p[stat])),missing=n-observed.length;
    const result={seriesId:series?.seriesId,version:series?.version,points:copy(observed),stat,source:'fixture-metrics'};
    const percentile=stat?.startsWith('p')?Number(stat.slice(1)):null;
    const needed=percentile>0&&percentile<100?Math.ceil(10/(percentile>=50?1-percentile/100:percentile/100)):1;
    if(percentile!==null&&d.EvaluateLowSampleCountPercentile==='ignore'&&observed.some(p=>(p.SampleCount||0)<needed))return {...result,state:alarm.state||'INSUFFICIENT_DATA',source:'held-low-samples',reason:'Insufficient sample count for the percentile; previous state held, not fresh health evidence'};
    const breached=v=>({'GreaterThanThreshold':()=>v>d.Threshold,'GreaterThanOrEqualToThreshold':()=>v>=d.Threshold,'LessThanThreshold':()=>v<d.Threshold,'LessThanOrEqualToThreshold':()=>v<=d.Threshold}[d.ComparisonOperator])();
    let breaches=observed.filter(p=>breached(p[stat])).length;
    if(breaches>=m)return {...result,state:'ALARM',reason:`${breaches} observed fixture periods breach the ${m}-of-${n} threshold`};
    if(breaches+missing<m)return {...result,state:'OK',reason:'Observed fixture periods cannot reach the configured breaching count'};
    const treatment=d.TreatMissingData||'missing';
    if(missing&&treatment==='ignore')return {...result,state:alarm.state||'INSUFFICIENT_DATA',source:'held-missing',reason:'Missing-data ignore holds a prior state; no fresh complete telemetry claim'};
    if(missing&&treatment==='missing')return {...result,state:'INSUFFICIENT_DATA',source:'no-data',reason:'Required fixture periods are missing; a green dashboard is not health evidence'};
    if(treatment==='breaching')breaches+=missing;
    return {...result,state:breaches>=m?'ALARM':'OK',source:missing?'filled-missing':'fixture-metrics',reason:'Declared bounded M-of-N fixture calculation; real CloudWatch timing/lookback differs'};
  };
  const specs={
    autoscaling:{'put-scheduled-update-group-action':['auto-scaling-group-name','scheduled-action-name','start-time','end-time','recurrence','time-zone','min-size','max-size','desired-capacity'],'describe-scheduled-actions':['auto-scaling-group-name','scheduled-action-names*'],'delete-scheduled-action':['auto-scaling-group-name','scheduled-action-name']},
    cloudwatch:{'put-metric-alarm':['cli-input-json','alarm-name','alarm-description','namespace','metric-name','dimensions*','statistic','extended-statistic','threshold','comparison-operator','period','evaluation-periods','datapoints-to-alarm','treat-missing-data','evaluate-low-sample-count-percentile','unit','alarm-actions*','actions-enabled!','no-actions-enabled!'],'describe-alarms':['alarm-names*','alarm-name-prefix','state-value'],'describe-alarms-for-metric':['namespace','metric-name','dimensions*'],'delete-alarms':['alarm-names*'],'enable-alarm-actions':['alarm-names*'],'disable-alarm-actions':['alarm-names*'],'set-alarm-state':['alarm-name','state-value','state-reason'],'get-metric-statistics':['namespace','metric-name','dimensions*','statistics*','extended-statistics*','start-time','end-time','period','unit']}
  };
  AG.capacityCLI=({service,op,toks,flag,flags,sim,list:rows,print,resultJson})=>{
    if(!specs[service]||service==='autoscaling'&&!Object.prototype.hasOwnProperty.call(specs.autoscaling,op))return false;
    const required=n=>{const v=flag(n);if(v===null||v==='')throw Error('aws: error: required argument --'+n);return v;};
    const file=raw=>{if(!raw.startsWith('file://'))return raw;const n=raw.slice(7),f=Object.prototype.hasOwnProperty.call(sim.files,n)&&sim.files[n];if(!f||typeof f.content!=='string')throw Error('Unable to load paramfile '+n+'; inspect ls/cat');return f.content;};
    const json=n=>{try{return JSON.parse(file(required(n)));}catch(e){throw Error('Error parsing --'+n+': valid JSON/file required; '+e.message);}};
    const integer=(v,min,max,label)=>{if(!['string','number'].includes(typeof v)||typeof v==='string'&&!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error('ValidationError: '+label+' must be integer '+min+'..'+max);return Number(v);};
    const time=(v,label)=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,19)!==v.slice(0,19))throw Error('ValidationError: '+label+' needs a valid UTC ISO timestamp, e.g. 2026-11-05T05:15:00Z');return new Date(v).toISOString();};
    const dimensions=raw=>{if(Array.isArray(raw)&&raw.length===1&&typeof raw[0]==='string'&&(raw[0].startsWith('file://')||raw[0].trim().startsWith('[')))return dimensions(raw[0]);if(raw===undefined)return [];let d;if(typeof raw==='string'){if(raw.startsWith('file://')||raw.trim().startsWith('[')){try{d=JSON.parse(file(raw));}catch(e){throw Error('ValidationError: Dimensions needs a JSON array');}}else d=[raw];}else d=raw;if(Array.isArray(d)&&d.every(x=>typeof x==='string'))d=d.map(x=>Object.fromEntries(x.split(',').map(p=>{const i=p.indexOf('=');if(i<0)throw Error('ValidationError: dimension shorthand is Name=...,Value=...');return [p.slice(0,i),p.slice(i+1)];})));if(!Array.isArray(d)||d.length>30||d.some(x=>!object(x)||typeof x.Name!=='string'||!x.Name||typeof x.Value!=='string'||!x.Value||Object.keys(x).some(k=>!['Name','Value'].includes(k)))||new Set(d.map(x=>x.Name)).size!==d.length)throw Error('ValidationError: Dimensions needs up to30 distinct nonempty Name/Value pairs');return copy(d);};
    const statistic=s=>typeof s==='string'&&(['Average','Sum','Minimum','Maximum','SampleCount'].includes(s)||/^p\d+(?:\.\d+)?$/.test(s)&&Number(s.slice(1))<=100);
    const region=sim.account.region||'us-east-1',alarms=()=>rows('alarms');
    const alarmView=a=>{const snap=AG.capacityAlarmSnapshot(sim.account,a),d=a.definition||{MetricName:a.metric,Namespace:a.namespace||'AWS/EC2',Threshold:a.threshold};return {AlarmName:a.name,AlarmArn:`arn:aws:cloudwatch:${region}:123456789012:alarm:${a.name}`,...copy(d),StateValue:snap.state,StateReason:snap.reason};};
    try{
      if(!Object.prototype.hasOwnProperty.call(specs[service],op))throw Error('Simulator '+service+' operation not modeled: '+op+'; no live metrics are collected');
      const allowed=specs[service][op].concat(['query','output','region','no-cli-pager!']),seen=new Set();
      for(let i=3;i<toks.length;){const n=toks[i].startsWith('--')?toks[i].slice(2):'',spec=allowed.find(x=>x.replace(/[*!]$/,'')===n);if(!spec)throw Error('Unknown options: '+toks[i]);if(seen.has(n))throw Error('Duplicate option --'+n);seen.add(n);if(spec.endsWith('!')){i++;continue;}if(!toks[i+1]||toks[i+1].startsWith('--'))throw Error('aws: error: --'+n+' expected one argument');i+=2;if(spec.endsWith('*'))while(i<toks.length&&!toks[i].startsWith('--'))i++;}
      if(flag('region')&&flag('region')!==region)throw Error('Simulator scope: selected fixtures are in '+region);
      if(service==='autoscaling'){
        const name=flag('auto-scaling-group-name'),g=rows('asgs').find(g=>g.name===name);if(name&&!g)throw Error('ValidationError: Auto Scaling group not found');if(op!=='describe-scheduled-actions'&&!name)throw Error('aws: error: required argument --auto-scaling-group-name');
        const all=rows('scheduledActions');
        if(op==='describe-scheduled-actions'){const names=flags('scheduled-action-names'),selected=all.filter(a=>(!name||a.group===name)&&(!names.length||names.includes(a.name)));resultJson({ScheduledUpdateGroupActions:selected.map(a=>({AutoScalingGroupName:a.group,ScheduledActionName:a.name,StartTime:a.start,EndTime:a.end,Recurrence:a.recurrence,TimeZone:a.timezone,MinSize:a.min,MaxSize:a.max,DesiredCapacity:a.desired}))});return true;}
        const actionName=required('scheduled-action-name'),found=all.find(a=>a.group===name&&a.name===actionName);
        if(op==='delete-scheduled-action'){if(!found)throw Error('ValidationError: scheduled action not found');all.splice(all.indexOf(found),1);resultJson({});return true;}
        if(actionName.length>255)throw Error('ValidationError: scheduled action name maximum255characters');
        const start=flag('start-time')===null?undefined:time(flag('start-time'),'StartTime'),end=flag('end-time')===null?undefined:time(flag('end-time'),'EndTime'),recurrence=flag('recurrence')||undefined,timezone=flag('time-zone')||undefined;
        if(!start&&!recurrence)throw Error('ValidationError: provide a future StartTime or five-field Recurrence');
        if(start&&Date.parse(start)<=clock(sim.account)||start&&end&&Date.parse(end)<=Date.parse(start))throw Error('ValidationError: StartTime must be future; EndTime must follow StartTime');
        if(recurrence){const fields=recurrence.trim().split(/\s+/),bounds=[[0,59],[0,23],[1,31],[1,12],[0,6]];if(fields.length!==5)throw Error('ValidationError: EC2 ASG recurrence has five cron fields; EventBridge Scheduler uses a different six-field API');for(let i=0;i<5;i++){const [min,max]=bounds[i];if(!fields[i].split(',').every(piece=>{const m=piece.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);if(!m)return false;const nums=m[1]==='*'?[min,max]:m[1].split('-').map(Number);return nums.every(v=>v>=min&&v<=max)&&(nums.length<2||nums[0]<=nums[1])&&(!m[2]||Number(m[2])>0&&Number(m[2])<=max-min+1);})){throw Error('Simulator cron subset: numeric ranges/lists/steps within five-field bounds; names/special operators not modeled');}}}
        if(timezone){if(!recurrence)throw Error('Simulator scope: TimeZone applies recurring schedules; one-time StartTime uses UTC');try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format();}catch(e){throw Error('ValidationError: valid IANA TimeZone required');}}
        const next={min:g.min,max:g.max,desired:g.desired};let touched=false;for(const [arg,key]of[['min-size','min'],['max-size','max'],['desired-capacity','desired']])if(flag(arg)!==null){next[key]=integer(flag(arg),0,1000,arg);touched=true;}
        if(!touched||next.min>next.max||next.desired<next.min||next.desired>next.max)throw Error('ValidationError: scheduled MinSize≤DesiredCapacity≤MaxSize required; provide a capacity field');
        if(all.some(a=>a!==found&&a.group===name&&start&&a.start===start))throw Error('AlreadyExists: another scheduled action has this StartTime in the group');if(!found&&all.filter(a=>a.group===name).length>=125)throw Error('LimitExceeded: maximum125 scheduled actions per group');
        const row={name:actionName,group:name,start,end,recurrence,timezone,...next};if(found)Object.assign(found,row);else all.push(row);resultJson({});print('sys','Future schedule metadata stored; no timer fires or current capacity changes in this model.');return true;
      }
      if(op==='put-metric-alarm'){
        const d=flag('cli-input-json')?json('cli-input-json'):{};if(!object(d))throw Error('ValidationError: alarm input must be a JSON object');
        const fields={'alarm-name':'AlarmName','alarm-description':'AlarmDescription','namespace':'Namespace','metric-name':'MetricName','statistic':'Statistic','extended-statistic':'ExtendedStatistic','threshold':'Threshold','comparison-operator':'ComparisonOperator','period':'Period','evaluation-periods':'EvaluationPeriods','datapoints-to-alarm':'DatapointsToAlarm','treat-missing-data':'TreatMissingData','evaluate-low-sample-count-percentile':'EvaluateLowSampleCountPercentile','unit':'Unit'};
        for(const [arg,key]of Object.entries(fields))if(flag(arg)!==null)d[key]=['Threshold','Period','EvaluationPeriods','DatapointsToAlarm'].includes(key)?Number(flag(arg)):flag(arg);
        if(flag('dimensions')!==null)d.Dimensions=dimensions(flags('dimensions'));else d.Dimensions=dimensions(d.Dimensions);
        if(flag('alarm-actions')!==null)d.AlarmActions=flags('alarm-actions');
        if(toks.includes('--actions-enabled')&&toks.includes('--no-actions-enabled'))throw Error('ValidationError: conflicting actions-enabled flags');
        if(toks.includes('--actions-enabled'))d.ActionsEnabled=true;if(toks.includes('--no-actions-enabled'))d.ActionsEnabled=false;
        const supported=['AlarmName','AlarmDescription','Namespace','MetricName','Dimensions','Statistic','ExtendedStatistic','Threshold','ComparisonOperator','Period','EvaluationPeriods','DatapointsToAlarm','TreatMissingData','EvaluateLowSampleCountPercentile','Unit','AlarmActions','ActionsEnabled'];
        if(Object.keys(d).some(k=>!supported.includes(k)))throw Error('Simulator alarm subset: simple metric/percentile, dimensions, SNS action, missing/low-sample settings only');
        for(const name of ['AlarmName','Namespace','MetricName','ComparisonOperator'])if(typeof d[name]!=='string'||!d[name])throw Error('ValidationError: '+name+' is required');
        if(d.AlarmName.length>255||!Number.isFinite(d.Threshold)||!['GreaterThanThreshold','GreaterThanOrEqualToThreshold','LessThanThreshold','LessThanOrEqualToThreshold'].includes(d.ComparisonOperator))throw Error('ValidationError: valid alarm name, finite Threshold and supported ComparisonOperator required');
        if(!!d.Statistic===!!d.ExtendedStatistic||!statistic(d.Statistic||d.ExtendedStatistic)||d.Statistic?.startsWith('p')||d.ExtendedStatistic&&!d.ExtendedStatistic.startsWith('p'))throw Error('ValidationError: choose Statistic Average/Sum/Minimum/Maximum/SampleCount OR ExtendedStatistic p0..p100');
        for(const key of ['Period','EvaluationPeriods','DatapointsToAlarm'])if(d[key]!==undefined&&typeof d[key]!=='number')throw Error('ValidationError: '+key+' must be a JSON number');
        if(d.AlarmDescription!==undefined&&typeof d.AlarmDescription!=='string')throw Error('ValidationError: AlarmDescription must be a string');
        d.Period=integer(d.Period,60,86400,'Period');if(d.Period%60)throw Error('Simulator scope: standard-resolution periods must be multiples of60seconds');
        d.EvaluationPeriods=integer(d.EvaluationPeriods,1,1440,'EvaluationPeriods');d.DatapointsToAlarm=integer(d.DatapointsToAlarm??d.EvaluationPeriods,1,d.EvaluationPeriods,'DatapointsToAlarm');
        if(!['breaching','notBreaching','ignore','missing'].includes(d.TreatMissingData===undefined?'missing':d.TreatMissingData))throw Error('ValidationError: TreatMissingData must be breaching/notBreaching/ignore/missing');
        if(d.EvaluateLowSampleCountPercentile!==undefined&&!['evaluate','ignore'].includes(d.EvaluateLowSampleCountPercentile))throw Error('ValidationError: percentile low sample setting evaluate or ignore');
        if(d.Unit!==undefined&&!['Seconds','Milliseconds','Microseconds','Percent','Count','Bytes','None'].includes(d.Unit))throw Error('Simulator scope: supported Unit Seconds/Milliseconds/Microseconds/Percent/Count/Bytes/None');
        if(d.ActionsEnabled!==undefined&&typeof d.ActionsEnabled!=='boolean')throw Error('ValidationError: ActionsEnabled must be boolean');
        d.ActionsEnabled=d.ActionsEnabled!==false;d.AlarmActions=d.AlarmActions===undefined?[]:d.AlarmActions;if(!Array.isArray(d.AlarmActions)||d.AlarmActions.length>5||d.AlarmActions.some(a=>typeof a!=='string'||!/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/.test(a)))throw Error('Simulator alarm action subset: up to5 SNS topic ARNs; other AWS action types not modeled');
        const old=alarms().find(a=>a.name===d.AlarmName);let a=old;if(!a){const id=(sim.account.capacityAlarmSequence||0)+1;sim.account.capacityAlarmSequence=id;a={name:d.AlarmName,alarmId:'capacity-alarm-'+id,revision:0,state:'INSUFFICIENT_DATA'};alarms().push(a);}a.definition=copy(d);a.metric=d.MetricName;a.namespace=d.Namespace;a.threshold=d.Threshold;a.revision++;delete a.manual;resultJson({});print('sys','Alarm configuration stored; this model evaluates supplied training aggregates on read, not live AWS telemetry or action delivery.');return true;
      }
      if(op==='describe-alarms'||op==='describe-alarms-for-metric'){
        const names=flags('alarm-names'),prefix=flag('alarm-name-prefix'),state=flag('state-value'),filterDims=flag('dimensions')===null?null:dimensions(flags('dimensions'));
        if(state&&!['ALARM','OK','INSUFFICIENT_DATA'].includes(state))throw Error('ValidationError: valid StateValue required');
        if(op==='describe-alarms-for-metric'){required('namespace');required('metric-name');}
        const selected=alarms().filter(a=>(!names.length||names.includes(a.name))&&(!prefix||a.name.startsWith(prefix))&&(!state||AG.capacityAlarmSnapshot(sim.account,a).state===state)&&(op!=='describe-alarms-for-metric'||(a.definition?.Namespace||a.namespace)===required('namespace')&&(a.definition?.MetricName||a.metric)===required('metric-name')&&(!filterDims||dims(a.definition?.Dimensions)===dims(filterDims))));
        const views=selected.map(alarmView);if(resultJson({MetricAlarms:views})&&!flag('query')){const reads=sim.account.capacityAlarmReads||(sim.account.capacityAlarmReads=[]);for(const a of selected){const snap=AG.capacityAlarmSnapshot(sim.account,a);a.state=snap.state;reads.push({alarmId:a.alarmId,name:a.name,revision:a.revision||0,state:snap.state,source:snap.source,seriesId:snap.seriesId,version:snap.version,view:copy(a.definition||{})});}}return true;
      }
      if(['delete-alarms','enable-alarm-actions','disable-alarm-actions'].includes(op)){
        const names=flags('alarm-names');if(!names.length)throw Error('aws: error: --alarm-names required');
        for(const a of alarms().filter(a=>names.includes(a.name))){if(op==='delete-alarms')alarms().splice(alarms().indexOf(a),1);else{a.definition=a.definition||{AlarmName:a.name,MetricName:a.metric,Namespace:a.namespace};a.definition.ActionsEnabled=op==='enable-alarm-actions';a.revision=(a.revision||0)+1;}}resultJson({});return true;
      }
      if(op==='set-alarm-state'){
        const a=alarms().find(a=>a.name===required('alarm-name'));if(!a)throw Error('ResourceNotFound: alarm name not found');const state=required('state-value'),reason=required('state-reason');if(!['ALARM','OK','INSUFFICIENT_DATA'].includes(state))throw Error('ValidationError: valid StateValue required');a.manual={state,reason:'MANUAL TEST: '+reason,until:clock(sim.account)+(a.definition?.Period||60)*1000};a.state=state;resultJson({});print('sys','Manual alarm notification test state is not observed metric/SLO proof. This model does not deliver alarm actions.');return true;
      }
      if(op==='get-metric-statistics'){
        const namespace=required('namespace'),metric=required('metric-name'),ds=flag('dimensions')===null?[]:dimensions(flags('dimensions')),start=time(required('start-time'),'StartTime'),end=time(required('end-time'),'EndTime'),period=integer(required('period'),60,86400,'Period'),stats=[...flags('statistics'),...flags('extended-statistics')];
        if(Date.parse(start)>=Date.parse(end)||!stats.length||stats.some(s=>!statistic(s))||flags('statistics').some(s=>s.startsWith('p'))||flags('extended-statistics').some(s=>!s.startsWith('p')))throw Error('ValidationError: StartTime<EndTime and supported Statistics/ExtendedStatistics required');
        const series=list(sim.account.capacityMetrics).find(s=>s.namespace===namespace&&s.metric===metric&&dims(s.dimensions)===dims(ds)&&(!flag('unit')||s.unit===flag('unit')));
        if(series&&period!==(series.period||60))throw Error('Simulator scope: supplied aggregates have period '+(series.period||60)+' seconds; arbitrary resampling is not modeled');
        resultJson({Label:metric,Datapoints:list(series?.points).filter(p=>Date.parse(p.Timestamp)>=Date.parse(start)&&Date.parse(p.Timestamp)<Date.parse(end)).map(p=>({Timestamp:p.Timestamp,Unit:series.unit,...Object.fromEntries(stats.filter(s=>Number.isFinite(p[s])).map(s=>[s.startsWith('p')?'ExtendedStatistics':s,s.startsWith('p')?Object.fromEntries(stats.filter(k=>k.startsWith('p')&&Number.isFinite(p[k])).map(k=>[k,p[k]])):p[s]]))}))});print('sys','Provided course aggregates only; no live collection, arbitrary resampling or network queries. Requested period '+period+' seconds.');return true;
      }
      throw Error('Simulator operation not modeled');
    }catch(e){print('err',e.message);return true;}
  };
})();
