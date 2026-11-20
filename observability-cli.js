/* Observability fixture (Advanced 8): CloudWatch Logs metric filters, retention, a small Logs Insights subset
   and composite alarms. Metric alarms themselves stay in capacity-cli.js (AG.capacityAlarmSnapshot).
   Bounded teaching model: seeded events and metric points only. No live ingestion, no real query engine,
   no notification delivery and no claim about real CloudWatch timing. Active only when account.obsMode is true. */
(() => {
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const copy = x => JSON.parse(JSON.stringify(x));
  const canon = v => Array.isArray(v) ? v.map(canon) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const RETENTION = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653];

  /* ---------- filter patterns (metric filters, filter-log-events, test-metric-filter) ----------
     Supported: "" (everything), term patterns (ERROR, "payment timeout", ?A ?B, -word),
     JSON patterns: { $.field = "value" }, { $.n > 5000 }, && / || and parentheses. */
  function jsonField(msg, path) {
    let v; try { v = JSON.parse(msg); } catch (e) { return undefined; }
    for (const part of path.split('.')) { if (!object(v) || !(part in v)) return undefined; v = v[part]; }
    return v;
  }
  function parseJsonPattern(src) {
    const s = src.trim();
    if (!s.startsWith('{') || !s.endsWith('}')) throw Error('InvalidParameterException: JSON filter pattern { ... } braces ke andar likho');
    const text = s.slice(1, -1); let i = 0;
    const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
    function primary() {
      ws();
      if (text[i] === '(') { i++; const e = or(); ws(); if (text[i] !== ')') throw Error('InvalidParameterException: filter pattern mein ")" missing'); i++; return e; }
      const m = text.slice(i).match(/^\$\.([A-Za-z0-9_.]+)\s*(=|!=|>=|<=|>|<)\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?)/);
      if (!m) throw Error('InvalidParameterException: simulator JSON pattern subset: { $.field = "value" } ya { $.n > 100 }');
      i += m[0].length;
      const [, field, op, raw] = m, str = raw.startsWith('"'), val = str ? JSON.parse(raw) : Number(raw);
      if (str && !['=', '!='].includes(op)) throw Error('InvalidParameterException: text value ke saath sirf = ya != chalta hai');
      return msg => {
        const v = jsonField(msg, field); if (v === undefined) return false;
        if (str) { const re = new RegExp('^' + val.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); const hit = re.test(String(v)); return op === '=' ? hit : !hit; }
        if (typeof v !== 'number') return false;
        return { '=': v === val, '!=': v !== val, '>': v > val, '<': v < val, '>=': v >= val, '<=': v <= val }[op];
      };
    }
    function and() { let l = primary(); for (;;) { ws(); if (text.startsWith('&&', i)) { i += 2; const r = primary(), a = l; l = m => a(m) && r(m); } else return l; } }
    function or() { let l = and(); for (;;) { ws(); if (text.startsWith('||', i)) { i += 2; const r = and(), a = l; l = m => a(m) || r(m); } else return l; } }
    const fn = or(); ws(); if (i !== text.length) throw Error('InvalidParameterException: filter pattern ke end mein extra text: ' + text.slice(i));
    return fn;
  }
  AG.obsPattern = pattern => {
    const p = String(pattern == null ? '' : pattern).trim();
    if (p === '') return () => true;
    if (p.startsWith('{')) return parseJsonPattern(p);
    const terms = p.match(/[?-]?"[^"]*"|[?-]?\S+/g) || [];
    const any = [], all = [], none = [];
    for (const t of terms) { const v = t.replace(/^[?-]/, '').replace(/^"|"$/g, ''); if (t.startsWith('?')) any.push(v); else if (t.startsWith('-')) none.push(v); else all.push(v); }
    return msg => all.every(t => msg.includes(t)) && (!any.length || any.some(t => msg.includes(t))) && !none.some(t => msg.includes(t));
  };

  /* ---------- Logs Insights subset ----------
     fields a, b | filter <cond> [and <cond>] | stats agg[, agg] [by f[, f]] | sort f [asc|desc] | limit N
     cond: @message like /re/ | @message like "text" | field = "v" | field = n | field > n ...
     agg: count(*) | count() | avg(f) | max(f) | min(f) | sum(f) | pct(f, N), each with optional "as name". */
  function insights(events, qs) {
    const parts = String(qs).split('|').map(x => x.trim()).filter(Boolean);
    if (!parts.length) throw Error('MalformedQueryException: query string khaali hai');
    let rows = events.map(e => { let j = {}; try { j = JSON.parse(e.m); } catch (x) { j = {}; } return { '@timestamp': e.t, '@message': e.m, ...(object(j) ? j : {}), __id: e.id }; });
    let projected = null, aggregated = false;
    const value = (r, f) => r[f];
    for (const part of parts) {
      const cmd = part.split(/\s+/)[0], rest = part.slice(cmd.length).trim();
      if (cmd === 'fields') { projected = rest.split(',').map(x => x.trim()).filter(Boolean); if (!projected.length) throw Error('MalformedQueryException: fields ke baad field names do'); continue; }
      if (cmd === 'filter') {
        const conds = rest.split(/\s+and\s+/i).map(c => {
          const like = c.match(/^(@?[A-Za-z0-9_.]+)\s+like\s+(\/(.+)\/([i]*)|"([^"]*)")$/);
          if (like) { const re = like[3] !== undefined ? new RegExp(like[3], like[4]) : null, txt = like[5]; return r => { const v = String(value(r, like[1]) ?? ''); return re ? re.test(v) : v.includes(txt); }; }
          const cmp = c.match(/^(@?[A-Za-z0-9_.]+)\s*(=|!=|>=|<=|>|<)\s*("([^"]*)"|-?\d+(?:\.\d+)?)$/);
          if (!cmp) throw Error('MalformedQueryException: simulator filter subset: field like /re/, field = "v", field > n');
          const [, f, op, raw, sv] = cmp, num = sv === undefined, want = num ? Number(raw) : sv;
          return r => { const v = value(r, f); if (v === undefined) return false; if (num) { if (typeof v !== 'number') return false; return { '=': v === want, '!=': v !== want, '>': v > want, '<': v < want, '>=': v >= want, '<=': v <= want }[op]; } return op === '=' ? String(v) === want : op === '!=' ? String(v) !== want : false; };
        });
        rows = rows.filter(r => conds.every(c => c(r))); continue;
      }
      if (cmd === 'stats') {
        const m = rest.match(/^(.*?)(?:\s+by\s+(.+))?$/i), by = m[2] ? m[2].split(',').map(x => x.trim()) : [];
        const aggs = m[1].split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean).map(a => {
          const am = a.match(/^(count|avg|max|min|sum|pct)\(\s*([^,)]*?)\s*(?:,\s*(\d{1,2}(?:\.\d+)?))?\s*\)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/i);
          if (!am) throw Error('MalformedQueryException: simulator stats subset: count(*), avg(f), max(f), min(f), sum(f), pct(f, 99)');
          const [, fn0, f, pctN, alias] = am, fn = fn0.toLowerCase();
          if (fn !== 'count' && !f) throw Error('MalformedQueryException: ' + fn + '() ko field chahiye');
          if (fn === 'pct' && pctN === undefined) throw Error('MalformedQueryException: pct(field, 99) jaisa percentile do');
          return { fn, f, pctN: Number(pctN), name: alias || a.replace(/\s+/g, '') };
        });
        if (!aggs.length) throw Error('MalformedQueryException: stats ko kam se kam ek function chahiye');
        const groups = new Map();
        for (const r of rows) { const key = JSON.stringify(by.map(f => value(r, f) ?? null)); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
        rows = [...groups.entries()].map(([key, rs]) => {
          const out = Object.fromEntries(by.map((f, i) => [f, JSON.parse(key)[i]]));
          for (const a of aggs) {
            const nums = rs.map(r => value(r, a.f)).filter(v => typeof v === 'number').sort((x, y) => x - y);
            out[a.name] = a.fn === 'count' ? (a.f && a.f !== '*' ? rs.filter(r => value(r, a.f) !== undefined).length : rs.length)
              : !nums.length ? null : a.fn === 'avg' ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length * 100) / 100
              : a.fn === 'max' ? nums[nums.length - 1] : a.fn === 'min' ? nums[0] : a.fn === 'sum' ? nums.reduce((s, v) => s + v, 0)
              : nums[Math.min(nums.length - 1, Math.ceil(a.pctN / 100 * nums.length) - 1)];
          }
          out.__ids = rs.map(r => r.__id); return out;
        });
        aggregated = true; projected = [...by, ...aggs.map(a => a.name)]; continue;
      }
      if (cmd === 'sort') { const m = rest.match(/^(@?[A-Za-z0-9_.]+)(?:\s+(asc|desc))?$/i); if (!m) throw Error('MalformedQueryException: sort field [asc|desc]'); const dir = (m[2] || 'asc').toLowerCase() === 'desc' ? -1 : 1; rows = rows.slice().sort((a, b) => (a[m[1]] > b[m[1]] ? 1 : a[m[1]] < b[m[1]] ? -1 : 0) * dir); continue; }
      if (cmd === 'limit') { const n = Number(rest); if (!Number.isInteger(n) || n < 1 || n > 10000) throw Error('MalformedQueryException: limit 1..10000'); rows = rows.slice(0, n); continue; }
      throw Error('MalformedQueryException: simulator Insights subset: fields | filter | stats | sort | limit (got "' + cmd + '")');
    }
    const cols = projected || ['@timestamp', '@message'];
    const matched = aggregated ? rows.flatMap(r => r.__ids) : rows.map(r => r.__id);
    return { matched, results: rows.slice(0, 1000).map(r => cols.filter(c => r[c] !== undefined && r[c] !== null).map(c => ({ field: c, value: String(r[c]) }))) };
  }

  /* ---------- composite alarm rules ---------- */
  function parseRule(rule) {
    const toks = String(rule).match(/ALARM\(\s*"[^"]+"\s*\)|OK\(\s*"[^"]+"\s*\)|INSUFFICIENT_DATA\(\s*"[^"]+"\s*\)|TRUE|FALSE|AND|OR|NOT|\(|\)|\S+/g) || [];
    let i = 0;
    const refs = [];
    function primary() {
      const t = toks[i++];
      if (t === undefined) throw Error('ValidationError: AlarmRule adhoora hai');
      if (t === '(') { const e = or(); if (toks[i++] !== ')') throw Error('ValidationError: AlarmRule mein ")" missing'); return e; }
      if (t === 'NOT') { const e = primary(); return s => !e(s); }
      if (t === 'TRUE') return () => true; if (t === 'FALSE') return () => false;
      const m = t.match(/^(ALARM|OK|INSUFFICIENT_DATA)\(\s*"([^"]+)"\s*\)$/);
      if (!m) throw Error('ValidationError: AlarmRule token samajh nahi aaya: ' + t + ' (ALARM("name") AND/OR/NOT use karo)');
      refs.push(m[2]); return s => s(m[2]) === m[1];
    }
    function and() { let l = primary(); while (toks[i] === 'AND') { i++; const r = primary(), a = l; l = s => a(s) && r(s); } return l; }
    function or() { let l = and(); while (toks[i] === 'OR') { i++; const r = and(), a = l; l = s => a(s) || r(s); } return l; }
    const fn = or(); if (i !== toks.length) throw Error('ValidationError: AlarmRule ke end mein extra text: ' + toks.slice(i).join(' '));
    return { fn, refs: [...new Set(refs)] };
  }
  AG.obsCompositeState = (account, c) => {
    const { fn } = parseRule(c.rule), seen = new Set();
    const state = name => {
      const m = (account.alarms || []).find(a => a.name === name);
      if (m) return AG.capacityAlarmSnapshot(account, m).state;
      const k = (account.compositeAlarms || []).find(x => x.name === name);
      if (!k || seen.has(name)) return 'INSUFFICIENT_DATA';
      seen.add(name); const v = AG.obsCompositeState(account, k); seen.delete(name); return v;
    };
    return fn(state) ? 'ALARM' : 'OK';
  };
  AG.obsRuleOf = rule => parseRule(rule);

  /* What the final "current read" must cover. */
  AG.obsAlarmSignature = account => JSON.stringify(canon({
    metric: (account.alarms || []).map(a => ({ name: a.name, revision: a.revision || 0, def: a.definition || null })),
    composite: (account.compositeAlarms || []).map(c => ({ name: c.name, revision: c.revision, rule: c.rule, actions: c.actions }))
  }));
  AG.obsCurrentRead = account => !!account.obsAlarmRead && account.obsAlarmRead === AG.obsAlarmSignature(account);

  /* ---------- CLI ---------- */
  const specs = {
    logs: {
      'describe-log-groups': ['log-group-name-prefix', 'log-group-name-pattern'],
      'put-retention-policy': ['log-group-name', 'retention-in-days'],
      'delete-retention-policy': ['log-group-name'],
      'put-metric-filter': ['log-group-name', 'filter-name', 'filter-pattern', 'metric-transformations*'],
      'describe-metric-filters': ['log-group-name', 'filter-name-prefix', 'metric-name', 'metric-namespace'],
      'delete-metric-filter': ['log-group-name', 'filter-name'],
      'test-metric-filter': ['filter-pattern', 'log-event-messages*'],
      'filter-log-events': ['log-group-name', 'filter-pattern', 'start-time', 'end-time', 'limit'],
      'start-query': ['log-group-name', 'log-group-names*', 'start-time', 'end-time', 'query-string', 'limit'],
      'get-query-results': ['query-id']
    },
    cloudwatch: {
      'put-composite-alarm': ['alarm-name', 'alarm-rule', 'alarm-description', 'alarm-actions*', 'actions-enabled!', 'no-actions-enabled!'],
      'describe-alarms': ['alarm-names*', 'alarm-name-prefix', 'alarm-types*', 'state-value'],
      'delete-alarms': ['alarm-names*']
    }
  };
  AG.obsCLI = ({ service, op, toks, flag, flags, sim, list, print, resultJson }) => {
    const a = sim.account;
    if (!a.obsMode || !specs[service] || !Object.prototype.hasOwnProperty.call(specs[service], op)) return false;
    try {
      const allowed = specs[service][op].concat(['query', 'output', 'region', 'no-cli-pager!']), seen = new Set();
      for (let i = 3; i < toks.length;) {
        const n = toks[i].startsWith('--') ? toks[i].slice(2) : '', spec = allowed.find(x => x.replace(/[*!]$/, '') === n);
        if (!spec) throw Error('Unknown options: ' + toks[i]);
        if (seen.has(n)) throw Error('Duplicate option --' + n); seen.add(n);
        if (spec.endsWith('!')) { i++; continue; }
        if (toks[i + 1] === undefined || /^--[a-z]/i.test(toks[i + 1])) throw Error('aws: error: argument --' + n + ': expected one argument');
        i += 2; if (spec.endsWith('*')) while (i < toks.length && !/^--[a-z]/i.test(toks[i])) i++;
      }
      const region = a.region || 'us-east-1';
      if (flag('region') && flag('region') !== region) throw Error('Simulator scope: is fixture ke resources ' + region + ' mein hain');
      const required = n => { const v = flag(n); if (v === null || v === '' && n !== 'filter-pattern') throw Error('aws: error: the following arguments are required: --' + n); return v; };
      const group = name => { const g = list('logGroups').find(x => x.name === name); if (!g) throw Error('ResourceNotFoundException: The specified log group does not exist.'); return g; };
      const events = g => (g.events || []).map((m, i) => ({ id: g.name + '#' + i, m, t: (g.eventTimes || [])[i] || a.now }));

      if (service === 'logs') {
        if (op === 'describe-log-groups') {
          const prefix = flag('log-group-name-prefix'), pat = flag('log-group-name-pattern');
          if (prefix && pat) throw Error('InvalidParameterException: prefix aur pattern ek saath nahi');
          const rows = list('logGroups').filter(g => (!prefix || g.name.startsWith(prefix)) && (!pat || g.name.includes(pat)));
          return resultJson({ logGroups: rows.map(g => ({ logGroupName: g.name, creationTime: g.creationTime || 1767225600000, ...(g.retention ? { retentionInDays: g.retention } : {}), metricFilterCount: (g.metricFilters || []).length, arn: `arn:aws:logs:${region}:${a.callerIdentity?.Account || '123456789012'}:log-group:${g.name}:*`, storedBytes: g.storedBytes || 0, logGroupClass: g.logGroupClass || 'STANDARD' })) }), true;
        }
        if (op === 'put-retention-policy') {
          const g = group(required('log-group-name')), raw = required('retention-in-days'), days = Number(raw);
          if (!/^\d+$/.test(raw) || !RETENTION.includes(days)) throw Error('InvalidParameterException: 1 validation error detected: Value \'' + raw + '\' at \'retentionInDays\' failed to satisfy constraint: Member must satisfy enum value set: [' + RETENTION.join(', ') + ']');
          g.retention = days; a.obsRevision = (a.obsRevision || 0) + 1; return print('ok', ''), true;
        }
        if (op === 'delete-retention-policy') { const g = group(required('log-group-name')); g.retention = null; a.obsRevision = (a.obsRevision || 0) + 1; print('ok', ''); print('sys', 'Retention hat gayi: yeh log group ab kabhi expire nahi hoga (never expire), aur storage bill badhta rahega.'); return true; }
        if (op === 'put-metric-filter') {
          const g = group(required('log-group-name')), name = required('filter-name'), pattern = flag('filter-pattern');
          if (pattern === null) throw Error('aws: error: the following arguments are required: --filter-pattern');
          if (!/^[^:*]{1,512}$/.test(name)) throw Error('InvalidParameterException: filter name 1..512 characters, ":" aur "*" ke bina');
          AG.obsPattern(pattern);
          let tr = flags('metric-transformations');
          if (!tr.length) throw Error('aws: error: the following arguments are required: --metric-transformations');
          if (tr.length === 1 && tr[0].trim().startsWith('[')) { try { tr = JSON.parse(tr[0]); } catch (e) { throw Error('Error parsing parameter --metric-transformations: invalid JSON'); } }
          else tr = tr.map(s => Object.fromEntries(s.split(',').map(p => { const i = p.indexOf('='); if (i < 1) throw Error('Error parsing parameter --metric-transformations: use metricName=..,metricNamespace=..,metricValue=..'); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; })));
          if (!Array.isArray(tr) || tr.length !== 1) throw Error('InvalidParameterException: ek metric filter mein ek metric transformation');
          const t = tr[0], ok = ['metricName', 'metricNamespace', 'metricValue', 'defaultValue', 'unit'];
          if (Object.keys(t).some(k => !ok.includes(k))) throw Error('Simulator subset: metricName, metricNamespace, metricValue, defaultValue, unit (dimensions modeled nahi)');
          for (const k of ['metricName', 'metricNamespace', 'metricValue']) if (!t[k]) throw Error('InvalidParameterException: metricTransformations.' + k + ' required');
          if (!/^(\d+(\.\d+)?|\$\.[A-Za-z0-9_.]+)$/.test(String(t.metricValue))) throw Error('InvalidParameterException: metricValue number ya $.field ho');
          const out = { metricName: t.metricName, metricNamespace: t.metricNamespace, metricValue: String(t.metricValue) };
          if (t.defaultValue !== undefined && t.defaultValue !== '') { const d = Number(t.defaultValue); if (!Number.isFinite(d)) throw Error('InvalidParameterException: defaultValue number ho'); out.defaultValue = d; }
          if (t.unit) out.unit = t.unit;
          g.metricFilters = (g.metricFilters || []).filter(f => object(f));
          const old = g.metricFilters.find(f => f.filterName === name);
          if (!old && g.metricFilters.length >= 100) throw Error('LimitExceededException: ek log group par 100 metric filters tak');
          const row = { filterName: name, filterPattern: pattern, metricTransformations: [out], creationTime: Date.parse(a.now || '2026-11-20T10:30:00Z'), logGroupName: g.name };
          if (old) Object.assign(old, row); else g.metricFilters.push(row);
          a.obsRevision = (a.obsRevision || 0) + 1; print('ok', '');
          print('sys', 'Metric filter save hua. CloudWatch sirf is waqt ke baad aane wale log events ko ginta hai; purane events ka backfill nahi hota.');
          return true;
        }
        if (op === 'describe-metric-filters') {
          const name = flag('log-group-name'), prefix = flag('filter-name-prefix'), mn = flag('metric-name'), ns = flag('metric-namespace');
          if (prefix && !name) throw Error('InvalidParameterException: filter-name-prefix ke saath log-group-name do');
          if (!!mn !== !!ns) throw Error('InvalidParameterException: metric-name aur metric-namespace saath do');
          if (name) group(name);
          const rows = list('logGroups').filter(g => !name || g.name === name).flatMap(g => (g.metricFilters || []).filter(f => object(f)))
            .filter(f => (!prefix || f.filterName.startsWith(prefix)) && (!mn || f.metricTransformations.some(t => t.metricName === mn && t.metricNamespace === ns)));
          return resultJson({ metricFilters: copy(rows) }), true;
        }
        if (op === 'delete-metric-filter') {
          const g = group(required('log-group-name')), name = required('filter-name'), before = (g.metricFilters || []).length;
          g.metricFilters = (g.metricFilters || []).filter(f => !object(f) || f.filterName !== name);
          if (g.metricFilters.length === before) throw Error('ResourceNotFoundException: The specified resource does not exist.');
          a.obsRevision = (a.obsRevision || 0) + 1; return print('ok', ''), true;
        }
        if (op === 'test-metric-filter') {
          const pattern = flag('filter-pattern'); if (pattern === null) throw Error('aws: error: the following arguments are required: --filter-pattern');
          const msgs = flags('log-event-messages'); if (!msgs.length) throw Error('aws: error: the following arguments are required: --log-event-messages');
          const hit = AG.obsPattern(pattern);
          return resultJson({ matches: msgs.map((m, i) => ({ eventNumber: i + 1, eventMessage: m, extractedValues: {} })).filter(x => hit(x.eventMessage)) }), true;
        }
        if (op === 'filter-log-events') {
          const g = group(required('log-group-name')), hit = AG.obsPattern(flag('filter-pattern') || '');
          const lim = flag('limit') === null ? 10000 : Number(flag('limit'));
          if (!Number.isInteger(lim) || lim < 1 || lim > 10000) throw Error('InvalidParameterException: limit 1..10000');
          return resultJson({ events: events(g).filter(e => hit(e.m)).slice(0, lim).map(e => ({ logStreamName: g.stream || 'app', timestamp: Date.parse(e.t), message: e.m })), searchedLogStreams: [] }), true;
        }
        if (op === 'start-query') {
          const names = flag('log-group-name') !== null ? [flag('log-group-name')] : flags('log-group-names');
          if (!names.length) throw Error('InvalidParameterException: --log-group-name ya --log-group-names do');
          if (flag('log-group-name') !== null && flags('log-group-names').length) throw Error('InvalidParameterException: log-group-name aur log-group-names ek saath nahi');
          const gs = names.map(group), st = Number(required('start-time')), en = Number(required('end-time')), qs = required('query-string');
          if (!Number.isInteger(st) || !Number.isInteger(en) || st < 0 || en <= st) throw Error('InvalidParameterException: start-time aur end-time epoch seconds hain, aur end > start');
          const inRange = gs.flatMap(events).filter(e => { const t = Date.parse(e.t) / 1000; return t >= st && t <= en; });
          const r = insights(inRange, qs), seq = (a.obsQuerySeq || 0) + 1; a.obsQuerySeq = seq;
          const id = '8f2c1a3e-0000-4a6b-9c1d-' + String(seq).padStart(12, '0');
          const bytes = inRange.reduce((s, e) => s + e.m.length + 40, 0);
          (a.obsQueries || (a.obsQueries = [])).push({ queryId: id, groups: names, queryString: qs, matched: r.matched, results: r.results, scanned: inRange.length, bytes, read: false });
          return resultJson({ queryId: id }), true;
        }
        if (op === 'get-query-results') {
          const q = (a.obsQueries || []).find(x => x.queryId === required('query-id'));
          if (!q) throw Error('ResourceNotFoundException: query id nahi mila; start-query ka diya queryId use karo');
          q.read = true;
          return resultJson({ results: copy(q.results), statistics: { recordsMatched: q.matched.length, recordsScanned: q.scanned, bytesScanned: q.bytes }, status: 'Complete' }), true;
        }
      }

      if (service === 'cloudwatch') {
        const composites = list('compositeAlarms');
        const metricView = m => { const snap = AG.capacityAlarmSnapshot(a, m), d = m.definition || {}; return { AlarmName: m.name, AlarmArn: `arn:aws:cloudwatch:${region}:${a.callerIdentity?.Account || '123456789012'}:alarm:${m.name}`, ...copy(d), StateValue: snap.state, StateReason: snap.reason }; };
        const compView = c => ({ AlarmName: c.name, AlarmArn: `arn:aws:cloudwatch:${region}:${a.callerIdentity?.Account || '123456789012'}:alarm:${c.name}`, AlarmRule: c.rule, ...(c.description ? { AlarmDescription: c.description } : {}), ActionsEnabled: c.actionsEnabled, AlarmActions: copy(c.actions), StateValue: AG.obsCompositeState(a, c) });
        if (op === 'put-composite-alarm') {
          const name = required('alarm-name'), rule = required('alarm-rule');
          if (name.length > 255) throw Error('ValidationError: AlarmName 255 characters tak');
          if (rule.length > 10240) throw Error('ValidationError: AlarmRule 10240 characters tak');
          const { refs } = parseRule(rule);
          if (!refs.length) throw Error('ValidationError: AlarmRule mein kam se kam ek ALARM("name") jaisa reference chahiye');
          if (refs.includes(name)) throw Error('ValidationError: composite alarm apne aap ko reference nahi kar sakta');
          for (const r of refs) if (!(a.alarms || []).some(x => x.name === r) && !composites.some(x => x.name === r)) throw Error('ValidationError: Could not save the composite alarm as alarms [' + r + '] in the alarm rule do not exist');
          if ((a.alarms || []).some(x => x.name === name)) throw Error('ValidationError: is naam ka metric alarm pehle se hai; composite ko alag naam do');
          const actions = flags('alarm-actions');
          if (actions.length > 5 || actions.some(x => !/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/.test(x))) throw Error('Simulator subset: up to 5 SNS topic ARNs');
          for (const x of actions) if (!list('topics').some(t => t.arn === x)) throw Error('ValidationError: SNS topic nahi mila: ' + x);
          if (toks.includes('--actions-enabled') && toks.includes('--no-actions-enabled')) throw Error('ValidationError: conflicting actions-enabled flags');
          const old = composites.find(c => c.name === name);
          const row = { name, rule, description: flag('alarm-description') || undefined, actions, actionsEnabled: !toks.includes('--no-actions-enabled'), revision: (old ? old.revision : 0) + 1 };
          if (old) Object.assign(old, row); else composites.push(row);
          return resultJson({}), true;
        }
        if (op === 'describe-alarms') {
          const names = flags('alarm-names'), prefix = flag('alarm-name-prefix'), types = flags('alarm-types'), state = flag('state-value');
          if (names.length && prefix) throw Error('ValidationError: alarm-names aur alarm-name-prefix ek saath nahi');
          if (types.some(t => !['MetricAlarm', 'CompositeAlarm'].includes(t))) throw Error('ValidationError: alarm-types MetricAlarm ya CompositeAlarm');
          if (state && !['OK', 'ALARM', 'INSUFFICIENT_DATA'].includes(state)) throw Error('ValidationError: valid StateValue required');
          const want = types.length ? types : ['MetricAlarm'], pick = n => (!names.length || names.includes(n)) && (!prefix || n.startsWith(prefix));
          const metric = want.includes('MetricAlarm') ? (a.alarms || []).filter(m => pick(m.name)).map(metricView).filter(v => !state || v.StateValue === state) : [];
          const comp = want.includes('CompositeAlarm') ? composites.filter(c => pick(c.name)).map(compView).filter(v => !state || v.StateValue === state) : [];
          const out = { MetricAlarms: metric, CompositeAlarms: comp };
          if (resultJson(out) && !flag('query') && !state && !prefix) {
            const coversMetric = want.includes('MetricAlarm') && (a.alarms || []).every(m => pick(m.name));
            const coversComp = want.includes('CompositeAlarm') || !composites.length;
            if (coversMetric && coversComp && (!names.length || [...(a.alarms || []), ...composites].every(x => names.includes(x.name)))) a.obsAlarmRead = AG.obsAlarmSignature(a);
          }
          if (!types.length && composites.length) print('sys', 'Note: --alarm-types na dene par sirf MetricAlarms aate hain. Composite dekhne ke liye --alarm-types MetricAlarm CompositeAlarm do.');
          return true;
        }
        if (op === 'delete-alarms') {
          const names = flags('alarm-names'); if (!names.length) throw Error('aws: error: the following arguments are required: --alarm-names');
          if (names.length > 100) throw Error('ValidationError: ek call mein 100 alarms tak');
          a.alarms = (a.alarms || []).filter(m => !names.includes(m.name));
          a.compositeAlarms = composites.filter(c => !names.includes(c.name));
          return resultJson({}), true;
        }
      }
      return false;
    } catch (e) { print('err', e.message); return true; }
  };
})();
