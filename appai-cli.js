/* App login fixture (Advanced 9c): Cognito user pools, app clients, users, admin sign-in with decodable tokens,
   identity pools + role mapping, and API Gateway HTTP API JWT authorizers. Tokens are unsigned teaching JWTs
   (signature part is a fixed marker); no real crypto, no SRP, no hosted UI, no network. Active only when account.authMode is true. */
(() => {
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const copy = x => JSON.parse(JSON.stringify(x));
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const utf8 = s => unescape(encodeURIComponent(s)), unutf8 = s => decodeURIComponent(escape(s));
  const b64u = s => { const t = utf8(s); let o = ''; for (let i = 0; i < t.length; i += 3) { const n = (t.charCodeAt(i) << 16) | ((t.charCodeAt(i + 1) || 0) << 8) | (t.charCodeAt(i + 2) || 0), k = t.length - i; o += A[n >> 18 & 63] + A[n >> 12 & 63] + (k > 1 ? A[n >> 6 & 63] : '') + (k > 2 ? A[n & 63] : ''); } return o; };
  const ub64u = s => { let o = '', bits = 0, val = 0; for (const ch of s) { const v = A.indexOf(ch); if (v < 0) throw Error('bad base64'); val = (val << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; o += String.fromCharCode((val >> bits) & 255); } } return unutf8(o); };
  AG.authJwt = claims => b64u(JSON.stringify({ kid: 'course-key-1', alg: 'RS256' })) + '.' + b64u(JSON.stringify(claims)) + '.COURSE-SIGNATURE-NOT-REAL';
  AG.authDecode = tok => { try { const p = String(tok).split('.'); return { header: JSON.parse(ub64u(p[0])), claims: JSON.parse(ub64u(p[1])) }; } catch (e) { return null; } };
  /* What an HTTP API JWT authorizer does with a bearer token (bounded: issuer + audience/client_id + expiry). */
  AG.authAuthorize = (account, auth, tok) => {
    const d = AG.authDecode(tok); if (!d) return { ok: false, why: 'token JWT nahi' };
    const c = d.claims, now = Math.floor(Date.parse(account.now || '2026-11-20T10:30:00Z') / 1000);
    if (c.iss !== auth.issuer) return { ok: false, why: 'issuer match nahi' };
    if (c.exp <= now) return { ok: false, why: 'token expire ho gaya' };
    const aud = c.token_use === 'id' ? c.aud : c.client_id;
    if (!auth.audience.includes(aud)) return { ok: false, why: (c.token_use === 'id' ? 'aud ' : 'client_id ') + aud + ' authorizer ki audience list mein nahi' };
    return { ok: true, why: '200' };
  };
  const FLOWS = ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_PASSWORD_AUTH', 'ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_CUSTOM_AUTH', 'ALLOW_USER_AUTH'];
  const specs = {
    'cognito-idp': {
      'create-user-pool': ['pool-name', 'policies', 'mfa-configuration', 'user-pool-tier', 'auto-verified-attributes*', 'username-attributes*'],
      'describe-user-pool': ['user-pool-id'],
      'create-user-pool-client': ['user-pool-id', 'client-name', 'generate-secret!', 'no-generate-secret!', 'explicit-auth-flows*'],
      'describe-user-pool-client': ['user-pool-id', 'client-id'],
      'admin-create-user': ['user-pool-id', 'username', 'temporary-password', 'message-action', 'user-attributes*'],
      'admin-set-user-password': ['user-pool-id', 'username', 'password', 'permanent!', 'no-permanent!'],
      'admin-get-user': ['user-pool-id', 'username'],
      'admin-initiate-auth': ['user-pool-id', 'client-id', 'auth-flow', 'auth-parameters*']
    },
    'cognito-identity': {
      'create-identity-pool': ['identity-pool-name', 'allow-unauthenticated-identities!', 'no-allow-unauthenticated-identities!', 'cognito-identity-providers*'],
      'describe-identity-pool': ['identity-pool-id'],
      'set-identity-pool-roles': ['identity-pool-id', 'roles*'],
      'get-identity-pool-roles': ['identity-pool-id']
    },
    apigatewayv2: {
      'get-authorizers': ['api-id'], 'get-authorizer': ['api-id', 'authorizer-id'], 'update-authorizer': ['api-id', 'authorizer-id', 'jwt-configuration']
    }
  };
  AG.authCLI = ({ service, op, toks, flag, flags, sim, list, print, resultJson }) => {
    const a = sim.account;
    if (!a.authMode || !specs[service] || !Object.prototype.hasOwnProperty.call(specs[service], op)) return false;
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
      const region = a.region || 'us-east-1', acct = a.callerIdentity?.Account || '123456789012';
      if (flag('region') && flag('region') !== region) throw Error('Simulator scope: is fixture ke resources ' + region + ' mein hain');
      const required = n => { const v = flag(n); if (v === null || v === '') throw Error('aws: error: the following arguments are required: --' + n); return v; };
      const file = raw => { if (!String(raw).startsWith('file://')) return raw; const n = raw.slice(7), f = Object.prototype.hasOwnProperty.call(sim.files || {}, n) && sim.files[n]; if (!f || typeof f.content !== 'string') throw Error('Unable to load paramfile ' + raw); return f.content; };
      const kv = list0 => Object.fromEntries(list0.flatMap(s => s.split(',')).map(p => { const i = p.indexOf('='); if (i < 1) throw Error('Error parsing parameter: Key=Value use karo'); return [p.slice(0, i), p.slice(i + 1)]; }));
      const pools = list('userPools'), clients = list('userPoolClients'), users = list('poolUsers'), ipools = list('identityPools'), auths = list('jwtAuthorizers');
      const pool = id => { const p = pools.find(x => x.id === id); if (!p) throw Error('ResourceNotFoundException: User pool ' + id + ' does not exist.'); return p; };
      const bump = () => { a.authRevision = (a.authRevision || 0) + 1; };
      if (service === 'cognito-idp') {
        if (op === 'create-user-pool') {
          const name = required('pool-name'); if (!/^[\w\s+=,.@-]{1,128}$/.test(name)) throw Error('InvalidParameterException: pool name');
          const pol = flag('policies') === null ? { PasswordPolicy: { MinimumLength: 8 } } : (() => { try { return JSON.parse(file(flag('policies'))); } catch (e) { throw Error('Error parsing parameter --policies: Invalid JSON'); } })();
          const pp = pol.PasswordPolicy || {}; if (pp.MinimumLength !== undefined && (!Number.isInteger(pp.MinimumLength) || pp.MinimumLength < 6 || pp.MinimumLength > 99)) throw Error('InvalidParameterException: MinimumLength 6..99');
          const mfa = flag('mfa-configuration') || 'OFF'; if (!['OFF', 'ON', 'OPTIONAL'].includes(mfa)) throw Error('InvalidParameterException: mfa-configuration OFF | ON | OPTIONAL');
          const tier = flag('user-pool-tier') || 'ESSENTIALS'; if (!['LITE', 'ESSENTIALS', 'PLUS'].includes(tier)) throw Error('InvalidParameterException: user-pool-tier LITE | ESSENTIALS | PLUS');
          const seq = (a.authSeq || 0) + 1; a.authSeq = seq;
          const id = region + '_SkPool' + String(seq).padStart(3, '0');
          const row = { id, name, policy: { MinimumLength: pp.MinimumLength || 8, RequireNumbers: !!pp.RequireNumbers, RequireSymbols: !!pp.RequireSymbols, RequireUppercase: !!pp.RequireUppercase, RequireLowercase: !!pp.RequireLowercase }, mfa, tier, autoVerified: flags('auto-verified-attributes'), usernameAttrs: flags('username-attributes') };
          pools.push(row); bump();
          return resultJson({ UserPool: { Id: id, Name: name, Policies: { PasswordPolicy: copy(row.policy) }, MfaConfiguration: mfa, UserPoolTier: tier, Arn: `arn:aws:cognito-idp:${region}:${acct}:userpool/${id}` } }), true;
        }
        if (op === 'describe-user-pool') { const p = pool(required('user-pool-id')); return resultJson({ UserPool: { Id: p.id, Name: p.name, Policies: { PasswordPolicy: copy(p.policy) }, MfaConfiguration: p.mfa, UserPoolTier: p.tier, EstimatedNumberOfUsers: users.filter(u => u.pool === p.id).length } }), true; }
        if (op === 'create-user-pool-client') {
          const p = pool(required('user-pool-id')), name = required('client-name');
          if (toks.includes('--generate-secret') && toks.includes('--no-generate-secret')) throw Error('ValidationError: conflicting generate-secret flags');
          const fl = flags('explicit-auth-flows'); if (fl.some(f => !FLOWS.includes(f))) throw Error('InvalidParameterException: explicit-auth-flows mein galat value; ALLOW_USER_SRP_AUTH, ALLOW_REFRESH_TOKEN_AUTH waghera');
          const seq = (a.authSeq || 0) + 1; a.authSeq = seq;
          const id = ('sk' + name.toLowerCase().replace(/[^a-z0-9]/g, '') + 'client' + String(seq).padStart(4, '0')).slice(0, 26).padEnd(26, '0');
          const row = { id, pool: p.id, name, secret: toks.includes('--generate-secret'), flows: fl.length ? fl : ['ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_SRP_AUTH'] };
          clients.push(row); bump();
          return resultJson({ UserPoolClient: { UserPoolId: p.id, ClientName: name, ClientId: id, ...(row.secret ? { ClientSecret: 'COURSE-SECRET-HIDDEN' } : {}), ExplicitAuthFlows: row.flows } }), true;
        }
        if (op === 'describe-user-pool-client') { const c = clients.find(x => x.pool === required('user-pool-id') && x.id === required('client-id')); if (!c) throw Error('ResourceNotFoundException: User pool client does not exist.'); return resultJson({ UserPoolClient: { UserPoolId: c.pool, ClientName: c.name, ClientId: c.id, ExplicitAuthFlows: c.flows, ...(c.secret ? { ClientSecret: 'COURSE-SECRET-HIDDEN' } : {}) } }), true; }
        if (op === 'admin-create-user') {
          const p = pool(required('user-pool-id')), name = required('username'), temp = flag('temporary-password');
          if (users.some(u => u.pool === p.id && u.name === name)) throw Error('UsernameExistsException: User account already exists');
          if (flag('message-action') !== null && !['SUPPRESS', 'RESEND'].includes(flag('message-action'))) throw Error('InvalidParameterException: message-action SUPPRESS | RESEND');
          if (temp && temp.length < p.policy.MinimumLength) throw Error('InvalidPasswordException: Password did not conform with policy: Password not long enough');
          for (const raw of flags('user-attributes')) if (!/^Name=[\w:]+,Value=.+$/.test(raw)) throw Error('Error parsing parameter --user-attributes: Name=email,Value=... use karo');
          users.push({ pool: p.id, name, status: 'FORCE_CHANGE_PASSWORD', password: temp || null, sub: '7d1c0a2b-0000-4c3d-9e8f-' + String(users.length + 1).padStart(12, '0') });
          bump(); return resultJson({ User: { Username: name, UserStatus: 'FORCE_CHANGE_PASSWORD', Enabled: true } }), true;
        }
        if (op === 'admin-set-user-password') {
          const p = pool(required('user-pool-id')), u = users.find(x => x.pool === p.id && x.name === required('username'));
          if (!u) throw Error('UserNotFoundException: User does not exist.');
          const pw = required('password'), pol = p.policy;
          const bad = pw.length < pol.MinimumLength ? 'Password not long enough' : pol.RequireNumbers && !/\d/.test(pw) ? 'Password must have numeric characters' : pol.RequireSymbols && !/[^A-Za-z0-9]/.test(pw) ? 'Password must have symbol characters' : pol.RequireUppercase && !/[A-Z]/.test(pw) ? 'Password must have uppercase characters' : pol.RequireLowercase && !/[a-z]/.test(pw) ? 'Password must have lowercase characters' : '';
          if (bad) throw Error('InvalidPasswordException: Password did not conform with policy: ' + bad);
          u.password = pw; u.status = toks.includes('--permanent') ? 'CONFIRMED' : 'FORCE_CHANGE_PASSWORD'; bump();
          return print('ok', ''), true;
        }
        if (op === 'admin-get-user') { const p = pool(required('user-pool-id')), u = users.find(x => x.pool === p.id && x.name === required('username')); if (!u) throw Error('UserNotFoundException: User does not exist.'); return resultJson({ Username: u.name, UserStatus: u.status, Enabled: true, UserAttributes: [{ Name: 'sub', Value: u.sub }] }), true; }
        if (op === 'admin-initiate-auth') {
          const p = pool(required('user-pool-id')), c = clients.find(x => x.pool === p.id && x.id === required('client-id'));
          if (!c) throw Error('ResourceNotFoundException: User pool client ' + flag('client-id') + ' does not exist.');
          const flow = required('auth-flow'); if (flow !== 'ADMIN_USER_PASSWORD_AUTH') throw Error('Simulator subset: auth-flow ADMIN_USER_PASSWORD_AUTH (SRP/hosted UI yahan nahi)');
          if (!c.flows.includes('ALLOW_ADMIN_USER_PASSWORD_AUTH')) throw Error('InvalidParameterException: Auth flow not enabled for this client');
          if (c.secret) throw Error('NotAuthorizedException: Client ' + c.id + ' is configured with secret but SECRET_HASH was not received');
          const ap = kv(flags('auth-parameters')), u = users.find(x => x.pool === p.id && x.name === ap.USERNAME);
          if (!u || u.password !== ap.PASSWORD) throw Error('NotAuthorizedException: Incorrect username or password.');
          if (u.status !== 'CONFIRMED') return resultJson({ ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'COURSE-SESSION' }), true;
          const now = Math.floor(Date.parse(a.now || '2026-11-20T10:30:00Z') / 1000), iss = `https://cognito-idp.${region}.amazonaws.com/${p.id}`;
          const idt = AG.authJwt({ sub: u.sub, aud: c.id, token_use: 'id', 'cognito:username': u.name, iss, iat: now, exp: now + 3600 });
          const act = AG.authJwt({ sub: u.sub, client_id: c.id, token_use: 'access', scope: 'aws.cognito.signin.user.admin', username: u.name, iss, iat: now, exp: now + 3600 });
          (a.authLogins || (a.authLogins = [])).push({ pool: p.id, client: c.id, user: u.name });
          return resultJson({ AuthenticationResult: { AccessToken: act, ExpiresIn: 3600, TokenType: 'Bearer', RefreshToken: 'COURSE-REFRESH-TOKEN-' + u.sub.slice(-4), IdToken: idt } }), true;
        }
      }
      if (service === 'cognito-identity') {
        const ip = id => { const p = ipools.find(x => x.id === id); if (!p) throw Error('ResourceNotFoundException: IdentityPool \'' + id + '\' not found.'); return p; };
        if (op === 'create-identity-pool') {
          const name = required('identity-pool-name'); if (!/^[\w ]{1,128}$/.test(name)) throw Error('InvalidParameterException: identity pool name');
          const unauthOn = toks.includes('--allow-unauthenticated-identities'), unauthOff = toks.includes('--no-allow-unauthenticated-identities');
          if (unauthOn === unauthOff) throw Error('aws: error: --allow-unauthenticated-identities ya --no-allow-unauthenticated-identities mein se ek do');
          const provs = flags('cognito-identity-providers').map(s => kv([s]));
          for (const pv of provs) { const m = String(pv.ProviderName || '').match(/^cognito-idp\.([a-z0-9-]+)\.amazonaws\.com\/(.+)$/); if (!m) throw Error('InvalidParameterException: ProviderName cognito-idp.<region>.amazonaws.com/<userPoolId> ho'); const p = pools.find(x => x.id === m[2]); if (!p) throw Error('InvalidParameterException: user pool nahi mila: ' + m[2]); if (!clients.some(c => c.pool === p.id && c.id === pv.ClientId)) throw Error('InvalidParameterException: ClientId us user pool ka nahi'); }
          const seq = (a.authSeq || 0) + 1; a.authSeq = seq;
          const row = { id: region + ':1f0e2d3c-0000-4a5b-8c9d-' + String(seq).padStart(12, '0'), name, unauth: unauthOn, providers: provs, roles: {} };
          ipools.push(row); bump();
          return resultJson({ IdentityPoolId: row.id, IdentityPoolName: name, AllowUnauthenticatedIdentities: unauthOn, CognitoIdentityProviders: copy(provs) }), true;
        }
        if (op === 'describe-identity-pool') { const p = ip(required('identity-pool-id')); return resultJson({ IdentityPoolId: p.id, IdentityPoolName: p.name, AllowUnauthenticatedIdentities: p.unauth, CognitoIdentityProviders: copy(p.providers) }), true; }
        if (op === 'set-identity-pool-roles') {
          const p = ip(required('identity-pool-id')), roles = kv(flags('roles'));
          for (const [k, v] of Object.entries(roles)) { if (!['authenticated', 'unauthenticated'].includes(k)) throw Error('InvalidParameterException: roles ke keys authenticated / unauthenticated'); if (!(a.iamRoles || []).some(r => r.arn === v)) throw Error('InvalidParameterException: role nahi mila: ' + v); }
          if (roles.unauthenticated && !p.unauth) throw Error('InvalidParameterException: unauthenticated role tab hi jab pool unauthenticated allow kare');
          p.roles = roles; bump(); return print('ok', ''), true;
        }
        if (op === 'get-identity-pool-roles') { const p = ip(required('identity-pool-id')); a.authRead = a.authRevision || 0; return resultJson({ IdentityPoolId: p.id, Roles: copy(p.roles) }), true; }
      }
      if (service === 'apigatewayv2') {
        const api = required('api-id'); if (!(a.httpApis || []).some(x => x.id === api)) throw Error('NotFoundException: Invalid API identifier specified');
        const view = x => ({ AuthorizerId: x.id, Name: x.name, AuthorizerType: 'JWT', IdentitySource: ['$request.header.Authorization'], JwtConfiguration: { Audience: copy(x.audience), Issuer: x.issuer } });
        if (op === 'get-authorizers') { a.authRead = a.authRevision || 0; return resultJson({ Items: auths.filter(x => x.api === api).map(view) }), true; }
        const x = auths.find(z => z.api === api && z.id === required('authorizer-id')); if (!x) throw Error('NotFoundException: Invalid authorizer identifier specified');
        if (op === 'get-authorizer') { a.authRead = a.authRevision || 0; return resultJson(view(x)), true; }
        if (op === 'update-authorizer') {
          const raw = required('jwt-configuration');
          let cfg; const t = file(raw).trim();
          if (t.startsWith('{')) { try { cfg = JSON.parse(t); } catch (e) { throw Error('Error parsing parameter --jwt-configuration: Invalid JSON'); } }
          else { const m = t.match(/^Audience=([^,]*(?:,[^=,]+)*?)(?:,Issuer=(.+))?$/); if (!m) throw Error('Error parsing parameter --jwt-configuration: Audience=a,b,Issuer=https://... ya JSON'); cfg = { Audience: m[1].split(',').filter(Boolean), ...(m[2] ? { Issuer: m[2] } : {}) }; }
          if (!Array.isArray(cfg.Audience) || !cfg.Audience.length) throw Error('BadRequestException: Audience list khaali nahi ho sakti');
          x.audience = cfg.Audience.slice(); if (cfg.Issuer) x.issuer = cfg.Issuer; bump();
          return resultJson(view(x)), true;
        }
      }
      return false;
    } catch (e) { print('err', e.message); return true; }
  };
})();
