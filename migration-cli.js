/* Migration fixture (Advanced 9): a bounded AWS DMS control-plane model.
   Replication instance, endpoints, connection tests, tasks, waiters and table statistics.
   No data is copied, no SQL runs and no timing is real: waiters advance the documented status steps.
   Active only when account.dmsMode is true. */
(() => {
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const copy = x => JSON.parse(JSON.stringify(x));
  const ID = /^[A-Za-z][A-Za-z0-9-]{0,62}$/;
  const ENGINES = ['oracle', 'mysql', 'postgres', 'aurora', 'aurora-postgresql', 'sqlserver', 'mariadb', 's3', 'dynamodb'];

  /* What a task would move, given its table mappings (selection rules only). */
  AG.dmsSelected = (account, mappings) => {
    const tables = account.sourceTables || [];
    let rules;
    try { rules = (typeof mappings === 'string' ? JSON.parse(mappings) : mappings).rules; } catch (e) { return null; }
    if (!Array.isArray(rules)) return null;
    const like = (p, v) => new RegExp('^' + String(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(v);
    const sel = rules.filter(r => r['rule-type'] === 'selection');
    if (!sel.length) return null;
    return tables.filter(t => {
      let on = false;
      for (const r of sel) { const o = r['object-locator'] || {}; if (like(o['schema-name'] || '%', t.schema) && like(o['table-name'] || '%', t.name)) on = r['rule-action'] === 'include' ? true : r['rule-action'] === 'exclude' ? false : on; }
      return on;
    }).map(t => t.schema + '.' + t.name);
  };

  const specs = {
    'create-replication-instance': ['replication-instance-identifier', 'replication-instance-class', 'allocated-storage', 'replication-subnet-group-identifier', 'vpc-security-group-ids*', 'multi-az!', 'no-multi-az!', 'publicly-accessible!', 'no-publicly-accessible!', 'engine-version'],
    'describe-replication-instances': ['filters*'],
    'create-endpoint': ['endpoint-identifier', 'endpoint-type', 'engine-name', 'server-name', 'port', 'database-name', 'username', 'password', 'postgre-sql-settings', 'oracle-settings', 'ssl-mode'],
    'describe-endpoints': ['filters*'],
    'test-connection': ['replication-instance-arn', 'endpoint-arn'],
    'describe-connections': ['filters*'],
    'create-replication-task': ['replication-task-identifier', 'source-endpoint-arn', 'target-endpoint-arn', 'replication-instance-arn', 'migration-type', 'table-mappings', 'replication-task-settings'],
    'describe-replication-tasks': ['filters*', 'without-settings!'],
    'start-replication-task': ['replication-task-arn', 'start-replication-task-type'],
    'stop-replication-task': ['replication-task-arn'],
    'modify-replication-task': ['replication-task-arn', 'migration-type', 'table-mappings', 'replication-task-settings'],
    'describe-table-statistics': ['replication-task-arn'],
    'wait': []
  };
  AG.dmsCLI = ({ service, op, toks, flag, flags, sim, list, print, resultJson }) => {
    const a = sim.account;
    if (!a.dmsMode || service !== 'dms' || !Object.prototype.hasOwnProperty.call(specs, op)) return false;
    try {
      const region = a.region || 'us-east-1', acct = a.callerIdentity?.Account || '123456789012';
      const file = raw => { if (!String(raw).startsWith('file://')) return raw; const n = raw.slice(7), f = Object.prototype.hasOwnProperty.call(sim.files || {}, n) && sim.files[n]; if (!f || typeof f.content !== 'string') throw Error('Unable to load paramfile ' + raw + ': ls/cat se file naam dekho'); return f.content; };
      const json = (n, raw) => { try { return JSON.parse(file(raw)); } catch (e) { throw Error('Error parsing parameter --' + n + ': Invalid JSON'); } };
      const required = n => { const v = flag(n); if (v === null || v === '') throw Error('aws: error: the following arguments are required: --' + n); return v; };
      const filters = () => { const out = {}; for (const raw of flags('filters')) { const m = raw.match(/^Name=([^,]+),Values=(.+)$/); if (!m) throw Error('Error parsing parameter --filters: Name=..,Values=.. use karo'); out[m[1]] = m[2].split(','); } return out; };
      if (op !== 'wait') {
        const allowed = specs[op].concat(['query', 'output', 'region', 'no-cli-pager!']), seen = new Set();
        for (let i = 3; i < toks.length;) {
          const n = toks[i].startsWith('--') ? toks[i].slice(2) : '', spec = allowed.find(x => x.replace(/[*!]$/, '') === n);
          if (!spec) throw Error('Unknown options: ' + toks[i]);
          if (seen.has(n)) throw Error('Duplicate option --' + n); seen.add(n);
          if (spec.endsWith('!')) { i++; continue; }
          if (toks[i + 1] === undefined || /^--[a-z]/i.test(toks[i + 1])) throw Error('aws: error: argument --' + n + ': expected one argument');
          i += 2; if (spec.endsWith('*')) while (i < toks.length && !/^--[a-z]/i.test(toks[i])) i++;
        }
      }
      if (flag('region') && flag('region') !== region) throw Error('Simulator scope: is fixture ke resources ' + region + ' mein hain');
      const instances = list('dmsInstances'), endpoints = list('dmsEndpoints'), tasks = list('dmsTasks'), conns = list('dmsConnections');
      const byArn = (rows, arn, what) => { const r = rows.find(x => x.arn === arn); if (!r) throw Error('ResourceNotFoundFault: ' + what + ' could not be found.'); return r; };
      const seq = k => { a.dmsSeq = (a.dmsSeq || 0) + 1; return k + String(a.dmsSeq).padStart(4, '0'); };
      const stamp = () => { a.dmsRevision = (a.dmsRevision || 0) + 1; };
      const instView = i => ({ ReplicationInstanceIdentifier: i.id, ReplicationInstanceClass: i.cls, ReplicationInstanceStatus: i.status, AllocatedStorage: i.storage, MultiAZ: i.multiAz, PubliclyAccessible: i.public, ReplicationSubnetGroup: { ReplicationSubnetGroupIdentifier: i.subnetGroup }, ReplicationInstanceArn: i.arn });
      const epView = e => ({ EndpointIdentifier: e.id, EndpointType: e.type.toUpperCase(), EngineName: e.engine, ServerName: e.server, Port: e.port, DatabaseName: e.database, Status: 'active', EndpointArn: e.arn, ...(e.settings ? { [e.settingsKey]: copy(e.settings) } : {}) });
      const taskView = (t, withSettings) => ({ ReplicationTaskIdentifier: t.id, SourceEndpointArn: t.source, TargetEndpointArn: t.target, ReplicationInstanceArn: t.instance, MigrationType: t.type, TableMappings: t.mappings, ...(withSettings ? { ReplicationTaskSettings: t.settings } : {}), Status: t.status, ...(t.stopReason ? { StopReason: t.stopReason } : {}), ReplicationTaskArn: t.arn, ...(t.stats ? { ReplicationTaskStats: copy(t.stats) } : {}) });

      if (op === 'create-replication-instance') {
        const id = required('replication-instance-identifier'), cls = required('replication-instance-class');
        if (!ID.test(id) || /--|-$/.test(id)) throw Error('InvalidParameterValueException: identifier letter se shuru ho, sirf letters/numbers/hyphen, 63 tak');
        if (instances.some(i => i.id === id)) throw Error('ResourceAlreadyExistsFault: Replication instance already exists');
        if (!/^dms\.(t3|c5|c6i|r5|r6i)\.(micro|small|medium|large|xlarge|2xlarge|4xlarge)$/.test(cls)) throw Error('InvalidParameterValueException: replication instance class jaise dms.t3.medium ya dms.r6i.large do');
        const sg = flag('replication-subnet-group-identifier');
        if (sg && !(a.dmsSubnetGroups || []).includes(sg)) throw Error('ResourceNotFoundFault: Replication subnet group ' + sg + ' not found');
        if (toks.includes('--publicly-accessible') && toks.includes('--no-publicly-accessible')) throw Error('ValidationError: conflicting publicly-accessible flags');
        const storage = flag('allocated-storage') === null ? 50 : Number(flag('allocated-storage'));
        if (!Number.isInteger(storage) || storage < 5 || storage > 6144) throw Error('InvalidParameterValueException: allocated-storage 5..6144 GB');
        const row = { id, cls, storage, subnetGroup: sg || 'default', multiAz: toks.includes('--multi-az'), public: !toks.includes('--no-publicly-accessible'), status: 'creating', arn: `arn:aws:dms:${region}:${acct}:rep:${seq('GODAMRI').toUpperCase()}` };
        instances.push(row); stamp();
        return resultJson({ ReplicationInstance: instView(row) }), true;
      }
      if (op === 'describe-replication-instances') { const f = filters(); return resultJson({ ReplicationInstances: instances.filter(i => !f['replication-instance-id'] || f['replication-instance-id'].includes(i.id)).map(instView) }), true; }
      if (op === 'create-endpoint') {
        const id = required('endpoint-identifier'), type = required('endpoint-type'), engine = required('engine-name');
        if (!ID.test(id)) throw Error('InvalidParameterValueException: endpoint identifier letter se shuru ho');
        if (endpoints.some(e => e.id === id)) throw Error('ResourceAlreadyExistsFault: Endpoint already exists');
        if (!['source', 'target'].includes(type)) throw Error('InvalidParameterValueException: endpoint-type source ya target');
        if (!ENGINES.includes(engine)) throw Error('InvalidParameterValueException: engine-name supported nahi: ' + engine);
        const pg = flag('postgre-sql-settings'), ora = flag('oracle-settings');
        if (pg && ora) throw Error('InvalidParameterCombinationException: ek endpoint par ek hi engine settings');
        let settings = null, settingsKey = null;
        if (pg) { settings = json('postgre-sql-settings', pg); settingsKey = 'PostgreSQLSettings'; }
        if (ora) { settings = json('oracle-settings', ora); settingsKey = 'OracleSettings'; }
        const usesSecret = settings && settings.SecretsManagerSecretId;
        if (usesSecret && (flag('username') || flag('password'))) throw Error('InvalidParameterCombinationException: Secrets Manager ke saath username/password mat do');
        if (usesSecret && !settings.SecretsManagerAccessRoleArn) throw Error('InvalidParameterValueException: SecretsManagerAccessRoleArn bhi chahiye');
        if (usesSecret && !(a.secrets || []).some(s => s.arn === settings.SecretsManagerSecretId)) throw Error('ResourceNotFoundFault: secret nahi mila: ' + settings.SecretsManagerSecretId);
        if (!usesSecret && engine !== 's3' && engine !== 'dynamodb') { required('server-name'); required('port'); }
        const port = flag('port') === null ? undefined : Number(flag('port'));
        const row = { id, type, engine, server: flag('server-name') || (settings && settings.ServerName) || undefined, port, database: flag('database-name') || undefined, settings, settingsKey, plainPassword: !!flag('password'), ssl: flag('ssl-mode') || 'none', arn: `arn:aws:dms:${region}:${acct}:endpoint:${seq('GODAMEP').toUpperCase()}` };
        endpoints.push(row); stamp();
        if (row.plainPassword) print('sys', 'Note: password command line par diya. Asli kaam mein Secrets Manager use karo (shell history mein password reh jaata hai).');
        return resultJson({ Endpoint: epView(row) }), true;
      }
      if (op === 'describe-endpoints') { const f = filters(); return resultJson({ Endpoints: endpoints.filter(e => !f['endpoint-id'] || f['endpoint-id'].includes(e.id)).map(epView) }), true; }
      if (op === 'test-connection') {
        const i = byArn(instances, required('replication-instance-arn'), 'Replication instance'), e = byArn(endpoints, required('endpoint-arn'), 'Endpoint');
        if (i.status !== 'available') throw Error('InvalidResourceStateFault: Replication instance status ' + i.status + ' hai; pehle available hone ka wait karo');
        const old = conns.find(c => c.instance === i.arn && c.endpoint === e.arn);
        const row = { instance: i.arn, endpoint: e.arn, endpointId: e.id, instanceId: i.id, status: 'testing', reason: '' };
        if (old) Object.assign(old, row); else conns.push(row);
        return resultJson({ Connection: { ReplicationInstanceArn: i.arn, EndpointArn: e.arn, Status: 'testing', EndpointIdentifier: e.id, ReplicationInstanceIdentifier: i.id } }), true;
      }
      if (op === 'describe-connections') { const f = filters(); return resultJson({ Connections: conns.filter(c => !f['endpoint-arn'] || f['endpoint-arn'].includes(c.endpoint)).map(c => ({ ReplicationInstanceArn: c.instance, EndpointArn: c.endpoint, Status: c.status, ...(c.reason ? { LastFailureMessage: c.reason } : {}), EndpointIdentifier: c.endpointId, ReplicationInstanceIdentifier: c.instanceId })) }), true; }
      if (op === 'create-replication-task') {
        const id = required('replication-task-identifier');
        if (!ID.test(id)) throw Error('InvalidParameterValueException: task identifier letter se shuru ho');
        if (tasks.some(t => t.id === id)) throw Error('ResourceAlreadyExistsFault: Replication task already exists');
        const src = byArn(endpoints, required('source-endpoint-arn'), 'Source endpoint'), tgt = byArn(endpoints, required('target-endpoint-arn'), 'Target endpoint'), inst = byArn(instances, required('replication-instance-arn'), 'Replication instance');
        if (src.type !== 'source' || tgt.type !== 'target') throw Error('InvalidParameterValueException: source endpoint type source aur target endpoint type target hona chahiye');
        const type = required('migration-type');
        if (!['full-load', 'cdc', 'full-load-and-cdc'].includes(type)) throw Error('InvalidParameterValueException: migration-type full-load | cdc | full-load-and-cdc');
        const mappings = file(required('table-mappings')), selected = AG.dmsSelected(a, mappings);
        if (!selected) throw Error('InvalidParameterValueException: table-mappings mein kam se kam ek selection rule chahiye (JSON)');
        if (!selected.length) throw Error('InvalidParameterValueException: table-mappings kisi bhi source table ko select nahi karti');
        const settings = flag('replication-task-settings') === null ? '{}' : file(flag('replication-task-settings'));
        try { if (!object(JSON.parse(settings))) throw 0; } catch (e) { throw Error('InvalidParameterValueException: replication-task-settings valid JSON object ho'); }
        const row = { id, source: src.arn, target: tgt.arn, instance: inst.arn, type, mappings, settings, status: 'creating', arn: `arn:aws:dms:${region}:${acct}:task:${seq('GODAMTASK').toUpperCase()}`, starts: 0 };
        tasks.push(row); stamp();
        return resultJson({ ReplicationTask: taskView(row, true) }), true;
      }
      if (op === 'describe-replication-tasks') { const f = filters(); return resultJson({ ReplicationTasks: tasks.filter(t => !f['replication-task-id'] || f['replication-task-id'].includes(t.id)).map(t => taskView(t, !toks.includes('--without-settings'))) }), true; }
      if (op === 'modify-replication-task') {
        const t = byArn(tasks, required('replication-task-arn'), 'Replication task');
        if (!['stopped', 'ready', 'failed'].includes(t.status)) throw Error('InvalidResourceStateFault: task ' + t.status + ' hai; modify se pehle stop karo');
        const type = flag('migration-type');
        if (type !== null) { if (!['full-load', 'cdc', 'full-load-and-cdc'].includes(type)) throw Error('InvalidParameterValueException: migration-type full-load | cdc | full-load-and-cdc'); t.type = type; }
        if (flag('table-mappings') !== null) { const m = file(flag('table-mappings')), sel = AG.dmsSelected(a, m); if (!sel || !sel.length) throw Error('InvalidParameterValueException: table-mappings kisi source table ko select nahi karti'); t.mappings = m; }
        if (flag('replication-task-settings') !== null) t.settings = file(flag('replication-task-settings'));
        if (type === null && flag('table-mappings') === null && flag('replication-task-settings') === null) throw Error('InvalidParameterCombinationException: kuch to badlo (migration-type, table-mappings ya settings)');
        stamp(); resultJson({ ReplicationTask: taskView(t, true) });
        print('sys', 'Asli AWS mein status thodi der "modifying" rehta hai, phir wapas ' + t.status + '. Simulator seedha ' + t.status + ' dikhata hai.');
        return true;
      }
      if (op === 'start-replication-task') {
        const t = byArn(tasks, required('replication-task-arn'), 'Replication task'), kind = required('start-replication-task-type');
        if (!['start-replication', 'resume-processing', 'reload-target'].includes(kind)) throw Error('InvalidParameterValueException: start-replication | resume-processing | reload-target');
        if (!['ready', 'stopped', 'failed'].includes(t.status)) throw Error('InvalidResourceStateFault: task ' + t.status + ' hai; ready ya stopped hona chahiye');
        if (kind === 'start-replication' && t.starts > 0) throw Error('InvalidResourceStateFault: start-replication sirf pehli baar; dobara ke liye resume-processing ya reload-target');
        for (const ep of [t.source, t.target]) { const c = conns.find(c => c.instance === t.instance && c.endpoint === ep); if (!c || c.status !== 'successful') throw Error('InvalidResourceStateFault: endpoint connection test successful nahi; pehle test-connection karo'); }
        t.status = 'starting'; t.startKind = kind; t.starts++; t.stats = null; stamp();
        return resultJson({ ReplicationTask: taskView(t, false) }), true;
      }
      if (op === 'stop-replication-task') { const t = byArn(tasks, required('replication-task-arn'), 'Replication task'); if (t.status !== 'running') throw Error('InvalidResourceStateFault: sirf running task stop hota hai'); t.status = 'stopped'; t.stopReason = 'Stop Reason NORMAL'; stamp(); return resultJson({ ReplicationTask: taskView(t, false) }), true; }
      if (op === 'describe-table-statistics') {
        const t = byArn(tasks, required('replication-task-arn'), 'Replication task');
        if (!['running', 'stopped'].includes(t.status) || !t.stats) return resultJson({ ReplicationTaskArn: t.arn, TableStatistics: [] }), true;
        const rows = AG.dmsTableStats(a, t);
        a.dmsStatsRead = { arn: t.arn, revision: a.dmsRevision || 0 };
        return resultJson({ ReplicationTaskArn: t.arn, TableStatistics: rows }), true;
      }
      if (op === 'wait') {
        const what = toks[3]; if (!what) throw Error('aws: error: wait ke baad waiter ka naam do');
        const f = (() => { const out = {}; const i = toks.indexOf('--filters'); if (i < 0) return out; for (let j = i + 1; j < toks.length && !toks[j].startsWith('--'); j++) { const m = toks[j].match(/^Name=([^,]+),Values=(.+)$/); if (!m) throw Error('Error parsing parameter --filters'); out[m[1]] = m[2].split(','); } return out; })();
        for (let i = 4; i < toks.length;) { if (toks[i] === '--filters') { i++; while (i < toks.length && !toks[i].startsWith('--')) i++; continue; } if (['--region', '--query', '--output'].includes(toks[i])) { i += 2; continue; } throw Error('Unknown options: ' + toks[i]); }
        const pick = (rows, key, idKey) => { const v = f[key]; if (!v) throw Error('aws: error: --filters Name=' + key + ',Values=... do'); const r = rows.filter(x => v.includes(x[idKey])); if (!r.length) throw Error('Waiter failed: koi resource match nahi hua'); return r; };
        if (what === 'replication-instance-available') { for (const i of pick(instances, 'replication-instance-id', 'id')) i.status = 'available'; stamp(); return print('ok', ''), true; }
        if (what === 'test-connection-succeeds') {
          for (const c of pick(conns, 'endpoint-arn', 'endpoint')) { const e = endpoints.find(x => x.arn === c.endpoint); const fail = e && AG.dmsConnectionProblem ? AG.dmsConnectionProblem(a, e) : ''; if (fail) { c.status = 'failed'; c.reason = fail; stamp(); throw Error('Waiter TestConnectionSucceeds failed: Waiter encountered a terminal failure state: ' + fail); } c.status = 'successful'; }
          stamp(); return print('ok', ''), true;
        }
        if (what === 'replication-task-ready') { for (const t of pick(tasks, 'replication-task-id', 'id')) { if (!['creating', 'ready'].includes(t.status)) throw Error('Waiter ReplicationTaskReady failed: Waiter encountered a terminal failure state: status ' + t.status); t.status = 'ready'; } stamp(); return print('ok', ''), true; }
        if (what === 'replication-task-running') {
          for (const t of pick(tasks, 'replication-task-id', 'id')) {
            if (!['starting', 'running'].includes(t.status)) throw Error('Waiter ReplicationTaskRunning failed: status ' + t.status);
            const full = t.type !== 'cdc';
            t.status = t.type === 'full-load' ? 'stopped' : 'running';
            if (t.type === 'full-load') t.stopReason = 'Stop Reason FULL_LOAD_ONLY_FINISHED';
            t.stats = { FullLoadProgressPercent: full ? 100 : 0, TablesLoaded: full ? AG.dmsSelected(a, t.mappings).length : 0, TablesLoading: 0, TablesQueued: 0, TablesErrored: 0, ElapsedTimeMillis: 5400000 };
          }
          stamp(); return print('ok', ''), true;
        }
        throw Error('Simulator dms waiters: replication-instance-available, test-connection-succeeds, replication-task-ready, replication-task-running');
      }
      return false;
    } catch (e) { print('err', e.message); return true; }
  };
})();
