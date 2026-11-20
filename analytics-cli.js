/* Analytics fixture (Advanced 9b): a bounded Glue Data Catalog + Athena model.
   Crawler runs finish on the next get-crawler read; Athena runs a tiny SQL subset over seeded sample rows and
   bills a modelled DataScannedInBytes (format, partitions, columns). No real Spark/Presto engine, no real S3 scan.
   Active only when account.lakeMode is true. */
(() => {
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const copy = x => JSON.parse(JSON.stringify(x));
  const MB = 1024 * 1024;

  /* Modelled scan size: CSV/JSON read whole files; Parquet reads only the asked columns. */
  AG.lakeScanBytes = (t, parts, cols) => {
    const per = t.bytesPerPartition, n = parts.length;
    if (t.format !== 'parquet') return per * n;
    const frac = Math.max(1, cols.length) / t.columns.length;
    return Math.round(per * n * frac);
  };

  /* Tiny SQL subset over seeded rows. */
  function runSql(a, db, sql) {
    const q = sql.trim().replace(/;$/, '');
    let m;
    if ((m = q.match(/^MSCK\s+REPAIR\s+TABLE\s+([A-Za-z_][\w]*)$/i))) {
      const t = table(a, db, m[1]);
      if (!t.partitionKeys.length) throw Error('FAILED: table partitioned nahi hai');
      const added = t.s3Partitions.filter(p => !t.partitions.includes(p));
      t.partitions.push(...added); t.partitions.sort();
      return { kind: 'DDL', rows: [['Partitions not in metastore: ' + added.join(', ')]], cols: ['result'], scanned: 0, added };
    }
    if ((m = q.match(/^SHOW\s+PARTITIONS\s+([A-Za-z_][\w]*)$/i))) { const t = table(a, db, m[1]); return { kind: 'DDL', rows: t.partitions.map(p => ['dt=' + p]), cols: ['partition'], scanned: 0 }; }
    m = q.match(/^SELECT\s+(.+?)\s+FROM\s+([A-Za-z_][\w.]*)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/is);
    if (!m) throw Error('FAILED: simulator SQL subset: SELECT ... FROM table [WHERE dt ...] [GROUP BY ...] [ORDER BY ...] [LIMIT n], MSCK REPAIR TABLE, SHOW PARTITIONS');
    const [, selRaw, tname, whereRaw, groupRaw, orderRaw, limitRaw] = m;
    const t = table(a, db, tname.includes('.') ? tname.split('.')[1] : tname);
    const sel = selRaw.split(',').map(x => x.trim());
    const star = sel.length === 1 && sel[0] === '*';
    const allCols = t.columns.map(c => c.name);
    const items = star ? allCols.map(c => ({ col: c, name: c })) : sel.map(s => {
      const mm = s.match(/^(sum|count|max|min|avg)\(\s*(\*|[A-Za-z_]\w*)\s*\)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?$|^([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?$/i);
      if (!mm) throw Error('FAILED: SELECT item samajh nahi aaya: ' + s);
      if (mm[1]) return { fn: mm[1].toLowerCase(), col: mm[2], name: mm[3] || (mm[1].toLowerCase() + '_' + mm[2]).replace('*', 'all') };
      return { col: mm[4], name: mm[5] || mm[4] };
    });
    for (const it of items) if (it.col !== '*' && !allCols.includes(it.col) && !t.partitionKeys.includes(it.col)) throw Error("FAILED: COLUMN_NOT_FOUND: Column '" + it.col + "' cannot be resolved");
    // WHERE: only partition predicates on dt are modelled (pruning); other predicates are rejected
    let parts = t.partitions.slice();
    if (whereRaw) {
      if (!t.partitionKeys.includes('dt')) throw Error("FAILED: COLUMN_NOT_FOUND: Column 'dt' cannot be resolved (yeh table partitioned nahi)");
      const w = whereRaw.trim();
      let mm;
      if ((mm = w.match(/^dt\s+BETWEEN\s+'([\d-]+)'\s+AND\s+'([\d-]+)'$/i))) parts = parts.filter(p => p >= mm[1] && p <= mm[2]);
      else if ((mm = w.match(/^dt\s*(=|>=|>|<=|<)\s*'([\d-]+)'$/i))) parts = parts.filter(p => ({ '=': p === mm[2], '>=': p >= mm[2], '>': p > mm[2], '<=': p <= mm[2], '<': p < mm[2] }[mm[1]]));
      else throw Error('FAILED: simulator WHERE subset: dt = / >= / BETWEEN \'YYYY-MM-DD\' (partition filter)');
    }
    const scanCols = star ? allCols : [...new Set(items.map(i => i.col).filter(c => c !== '*' && !t.partitionKeys.includes(c)))];
    const scanned = AG.lakeScanBytes(t, parts, scanCols);
    let rows = t.rows.filter(r => parts.includes(r.dt));
    const group = groupRaw ? groupRaw.split(',').map(x => x.trim()) : [];
    const aggs = items.filter(i => i.fn);
    if (aggs.length || group.length) {
      for (const gcol of group) if (!items.some(i => !i.fn && i.col === gcol)) throw Error("FAILED: '" + gcol + "' GROUP BY mein hai par SELECT mein nahi");
      for (const i of items) if (!i.fn && !group.includes(i.col)) throw Error("FAILED: '" + i.col + "' must be an aggregate expression or appear in GROUP BY clause");
      const map = new Map();
      for (const r of rows) { const k = JSON.stringify(group.map(c => r[c])); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
      rows = [...map.values()].map(rs => Object.fromEntries(items.map(i => [i.name, !i.fn ? rs[0][i.col] : i.fn === 'count' ? rs.length : i.fn === 'sum' ? rs.reduce((s, r) => s + Number(r[i.col]), 0) : i.fn === 'max' ? Math.max(...rs.map(r => Number(r[i.col]))) : i.fn === 'min' ? Math.min(...rs.map(r => Number(r[i.col]))) : Math.round(rs.reduce((s, r) => s + Number(r[i.col]), 0) / rs.length * 100) / 100])));
    } else rows = rows.map(r => Object.fromEntries(items.map(i => [i.name, r[i.col]])));
    if (orderRaw) { const om = orderRaw.trim().match(/^([A-Za-z_]\w*)(?:\s+(ASC|DESC))?$/i); if (!om) throw Error('FAILED: ORDER BY ek column ya alias'); const d = (om[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1; rows.sort((x, y) => (x[om[1]] > y[om[1]] ? 1 : x[om[1]] < y[om[1]] ? -1 : 0) * d); }
    if (limitRaw) rows = rows.slice(0, Number(limitRaw));
    return { kind: 'DML', cols: items.map(i => i.name), rows: rows.map(r => items.map(i => r[i.name])), scanned, parts, table: t.name, star, scanCols, filtered: !!whereRaw, grouped: group.slice() };
  }
  function table(a, db, name) {
    const d = (a.glueDatabases || []).find(x => x.name === db);
    if (!d) throw Error("FAILED: SCHEMA_NOT_FOUND: Schema '" + db + "' does not exist");
    const t = (a.glueTables || []).find(x => x.database === db && x.name === name);
    if (!t) throw Error("FAILED: TABLE_NOT_FOUND: Table '" + db + '.' + name + "' does not exist");
    return t;
  }
  AG.lakeRunSql = runSql;

  const specs = {
    glue: {
      'create-database': ['database-input'], 'get-databases': [], 'create-crawler': ['name', 'role', 'database-name', 'targets', 'table-prefix'], 'start-crawler': ['name'], 'get-crawler': ['name'],
      'get-tables': ['database-name'], 'get-table': ['database-name', 'name'], 'get-partitions': ['database-name', 'table-name']
    },
    athena: {
      'create-work-group': ['name', 'configuration', 'description'], 'get-work-group': ['work-group'], 'start-query-execution': ['query-string', 'query-execution-context', 'work-group', 'result-configuration'],
      'get-query-execution': ['query-execution-id'], 'get-query-results': ['query-execution-id']
    }
  };
  AG.lakeCLI = ({ service, op, toks, flag, flags, sim, list, print, resultJson }) => {
    const a = sim.account;
    if (!a.lakeMode || !specs[service] || !Object.prototype.hasOwnProperty.call(specs[service], op)) return false;
    try {
      const allowed = specs[service][op].concat(['query', 'output', 'region', 'no-cli-pager!']), seen = new Set();
      for (let i = 3; i < toks.length;) {
        const n = toks[i].startsWith('--') ? toks[i].slice(2) : '', spec = allowed.find(x => x.replace(/[*!]$/, '') === n);
        if (!spec) throw Error('Unknown options: ' + toks[i]);
        if (seen.has(n)) throw Error('Duplicate option --' + n); seen.add(n);
        if (spec.endsWith('!')) { i++; continue; }
        if (toks[i + 1] === undefined || /^--[a-z]/i.test(toks[i + 1])) throw Error('aws: error: argument --' + n + ': expected one argument');
        i += 2;
      }
      const region = a.region || 'us-east-1', acct = a.callerIdentity?.Account || '123456789012';
      if (flag('region') && flag('region') !== region) throw Error('Simulator scope: is fixture ke resources ' + region + ' mein hain');
      const required = n => { const v = flag(n); if (v === null || v === '') throw Error('aws: error: the following arguments are required: --' + n); return v; };
      const file = raw => { if (!String(raw).startsWith('file://')) return raw; const n = raw.slice(7), f = Object.prototype.hasOwnProperty.call(sim.files || {}, n) && sim.files[n]; if (!f || typeof f.content !== 'string') throw Error('Unable to load paramfile ' + raw); return f.content; };
      const shorthand = raw => { const s = file(raw).trim(); if (s.startsWith('{')) { try { return JSON.parse(s); } catch (e) { throw Error('Error parsing parameter: Invalid JSON'); } } return Object.fromEntries(s.split(',').map(p => { const i = p.indexOf('='); if (i < 1) throw Error('Error parsing parameter: Key=Value use karo'); return [p.slice(0, i), p.slice(i + 1)]; })); };
      const dbs = list('glueDatabases'), crawlers = list('glueCrawlers'), tables = list('glueTables'), wgs = list('athenaWorkGroups'), queries = list('athenaQueries');
      if (service === 'glue') {
        if (op === 'create-database') { const d = shorthand(required('database-input')); if (!d.Name || !/^[a-z0-9_]{1,255}$/.test(d.Name)) throw Error('InvalidInputException: database Name chhote letters, number, underscore'); if (dbs.some(x => x.name === d.Name)) throw Error('AlreadyExistsException: Database already exists.'); dbs.push({ name: d.Name }); return resultJson({}), true; }
        if (op === 'get-databases') return resultJson({ DatabaseList: dbs.map(d => ({ Name: d.name, CatalogId: acct })) }), true;
        if (op === 'create-crawler') {
          const name = required('name'), role = required('role'), db = required('database-name'), targets = shorthand(required('targets'));
          if (crawlers.some(c => c.name === name)) throw Error('AlreadyExistsException: Crawler already exists');
          if (!dbs.some(d => d.name === db)) throw Error('EntityNotFoundException: Database ' + db + ' not found');
          if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(role)) throw Error('InvalidInputException: role ka poora ARN do');
          const paths = (targets.S3Targets || []).map(t => t.Path);
          if (!paths.length) throw Error('InvalidInputException: Targets mein S3Targets[].Path do');
          crawlers.push({ name, role, db, paths, prefix: flag('table-prefix') || '', state: 'READY', runs: 0, last: null });
          return resultJson({}), true;
        }
        if (op === 'start-crawler') { const c = crawlers.find(x => x.name === required('name')); if (!c) throw Error('EntityNotFoundException: Crawler entry with name ' + flag('name') + ' does not exist'); if (c.state !== 'READY') throw Error('CrawlerRunningException: Crawler with name ' + c.name + ' has already started'); c.state = 'RUNNING'; return resultJson({}), true; }
        if (op === 'get-crawler') {
          const c = crawlers.find(x => x.name === required('name')); if (!c) throw Error('EntityNotFoundException: Crawler entry not found');
          if (c.state === 'RUNNING') { const made = AG.lakeCrawl ? AG.lakeCrawl(a, c) : []; c.state = 'READY'; c.runs++; c.last = { Status: 'SUCCEEDED', TablesCreatedOrUpdated: made }; }
          return resultJson({ Crawler: { Name: c.name, Role: c.role, DatabaseName: c.db, Targets: { S3Targets: c.paths.map(p => ({ Path: p })) }, State: c.state, ...(c.last ? { LastCrawl: { Status: c.last.Status } } : {}) } }), true;
        }
        if (op === 'get-tables' || op === 'get-table') {
          const db = required('database-name'); if (!dbs.some(d => d.name === db)) throw Error('EntityNotFoundException: Database ' + db + ' not found');
          const view = t => ({ Name: t.name, DatabaseName: t.database, StorageDescriptor: { Columns: copy(t.columns), Location: t.location, SerdeInfo: { SerializationLibrary: t.format === 'parquet' ? 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' : 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe' } }, PartitionKeys: t.partitionKeys.map(k => ({ Name: k, Type: 'string' })), Parameters: { classification: t.format } });
          if (op === 'get-table') { const t = tables.find(x => x.database === db && x.name === required('name')); if (!t) throw Error('EntityNotFoundException: Table ' + flag('name') + ' not found'); return resultJson({ Table: view(t) }), true; }
          return resultJson({ TableList: tables.filter(t => t.database === db).map(view) }), true;
        }
        if (op === 'get-partitions') { const t = tables.find(x => x.database === required('database-name') && x.name === required('table-name')); if (!t) throw Error('EntityNotFoundException: Table not found'); return resultJson({ Partitions: t.partitions.map(p => ({ Values: [p], StorageDescriptor: { Location: t.location + 'dt=' + p + '/' } })) }), true; }
      }
      if (service === 'athena') {
        const wgView = w => ({ Name: w.name, State: 'ENABLED', Configuration: { ResultConfiguration: { OutputLocation: w.output }, EnforceWorkGroupConfiguration: w.enforce, ...(w.cutoff ? { BytesScannedCutoffPerQuery: w.cutoff } : {}), EngineVersion: { SelectedEngineVersion: 'AUTO', EffectiveEngineVersion: 'Athena engine version 3' } } });
        if (op === 'create-work-group') {
          const name = required('name'); if (!/^[a-zA-Z0-9._-]{1,128}$/.test(name)) throw Error('InvalidRequestException: workgroup name'); if (wgs.some(w => w.name === name)) throw Error('InvalidRequestException: WorkGroup is already created');
          const c = flag('configuration') === null ? {} : (() => { try { return JSON.parse(file(flag('configuration'))); } catch (e) { throw Error('Error parsing parameter --configuration: Invalid JSON'); } })();
          const output = c.ResultConfiguration && c.ResultConfiguration.OutputLocation;
          if (output && !/^s3:\/\/[a-z0-9.-]+\/.*$/.test(output)) throw Error('InvalidRequestException: OutputLocation s3://bucket/prefix/ ho');
          if (c.BytesScannedCutoffPerQuery !== undefined && (!Number.isInteger(c.BytesScannedCutoffPerQuery) || c.BytesScannedCutoffPerQuery < 10 * MB)) throw Error('InvalidRequestException: BytesScannedCutoffPerQuery kam se kam 10 MB (10485760) ho');
          wgs.push({ name, output: output || null, enforce: c.EnforceWorkGroupConfiguration === true, cutoff: c.BytesScannedCutoffPerQuery || null });
          return resultJson({}), true;
        }
        if (op === 'get-work-group') { const w = wgs.find(x => x.name === required('work-group')); if (!w) throw Error('InvalidRequestException: WorkGroup is not found.'); return resultJson({ WorkGroup: wgView(w) }), true; }
        if (op === 'start-query-execution') {
          const sql = required('query-string'), wgName = flag('work-group') || 'primary', w = wgs.find(x => x.name === wgName);
          if (!w) throw Error('InvalidRequestException: WorkGroup ' + wgName + ' is not found.');
          const ctx = flag('query-execution-context') === null ? {} : shorthand(flag('query-execution-context'));
          const rc = flag('result-configuration') === null ? null : shorthand(flag('result-configuration'));
          const output = w.enforce || !rc ? w.output : rc.OutputLocation;
          if (!output) throw Error('InvalidRequestException: No output location provided. An output location is required either through the Workgroup result configuration setting or as an API input.');
          const seq = (a.athenaSeq || 0) + 1; a.athenaSeq = seq;
          const id = 'b0a1c2d3-0000-4a4b-8c8d-' + String(seq).padStart(12, '0');
          const row = { id, sql, workgroup: wgName, database: ctx.Database || 'default', output, state: 'SUCCEEDED', read: false };
          try {
            const r = runSql(a, row.database, sql);
            row.result = r; row.scanned = r.kind === 'DDL' ? 0 : Math.max(10 * MB, r.scanned);
            if (r.kind === 'DML' && w.cutoff && r.scanned > w.cutoff) { row.state = 'CANCELLED'; row.reason = 'Query exhausted resources: bytes scanned limit was exceeded (workgroup BytesScannedCutoffPerQuery). Billed for data scanned till cancel.'; row.scanned = w.cutoff; row.result = null; }
          } catch (e) { row.state = 'FAILED'; row.reason = e.message.replace(/^FAILED: /, ''); row.scanned = 0; }
          queries.push(row);
          return resultJson({ QueryExecutionId: id }), true;
        }
        if (op === 'get-query-execution') {
          const q = queries.find(x => x.id === required('query-execution-id')); if (!q) throw Error('InvalidRequestException: QueryExecution ' + flag('query-execution-id') + ' was not found');
          return resultJson({ QueryExecution: { QueryExecutionId: q.id, Query: q.sql, StatementType: q.result && q.result.kind === 'DDL' ? 'DDL' : 'DML', ResultConfiguration: { OutputLocation: q.output + q.id + '.csv' }, QueryExecutionContext: { Database: q.database }, Status: { State: q.state, ...(q.reason ? { StateChangeReason: q.reason } : {}) }, Statistics: { DataScannedInBytes: q.scanned, EngineExecutionTimeInMillis: q.result ? 900 + Math.round(q.scanned / MB) * 4 : 120 }, WorkGroup: q.workgroup } }), true;
        }
        if (op === 'get-query-results') {
          const q = queries.find(x => x.id === required('query-execution-id')); if (!q) throw Error('InvalidRequestException: QueryExecution was not found');
          if (q.state !== 'SUCCEEDED') throw Error('InvalidRequestException: Query has not yet finished. Current state: ' + q.state);
          q.read = true;
          const head = { Data: q.result.cols.map(c => ({ VarCharValue: c })) };
          return resultJson({ ResultSet: { Rows: [head, ...q.result.rows.map(r => ({ Data: r.map(v => ({ VarCharValue: String(v) })) }))], ResultSetMetadata: { ColumnInfo: q.result.cols.map(c => ({ Name: c, Type: 'varchar' })) } } }), true;
        }
      }
      return false;
    } catch (e) { print('err', e.message); return true; }
  };
})();
