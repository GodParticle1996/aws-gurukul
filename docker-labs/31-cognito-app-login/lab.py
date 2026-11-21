"""Lab31: app login -- Cognito user pool, asli JWT decode + JWKS verify, chhota authorizer, identity pool ki kamiyan.

Sirf local: apna 127.0.0.1 Moto server (OS ka port), dummy keys, lab ki apni config. Asli AWS, Docker, shared 4566
server ya ~/.aws nahi. Moto Cognito asli RS256 JWT banata hai (apni test key se), password policy aur temporary
password ka challenge bhi maanta hai. Par SECRET_HASH, client ke auth flows, identity pool roles aur
bina-login wali rok nahi jaanchta; Rekognition moderation bana hi nahi. Woh hisse "GAP" mein likhe hain, aur
authorizer, policy variable aur moderation threshold "HOST CHECK" mein Python se jaanche jaate hain. Sab data TEST hai.
"""
import base64, fnmatch, hashlib, hmac, json, logging, os, socket, subprocess, time, urllib.request
from pathlib import Path
from moto.server import ThreadedMotoServer
import boto3
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers

APP = Path(__file__).resolve().parents[2]
RUN = APP / '.overhaul-evidence/lab31-runs' / ('run-' + str(time.time_ns()))
RUN.mkdir(parents=True)
for k in ['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_SESSION_TOKEN', 'AWS_ENDPOINT_URL']:
    os.environ.pop(k, None)
os.environ.update(AWS_ACCESS_KEY_ID='test', AWS_SECRET_ACCESS_KEY='test', AWS_DEFAULT_REGION='ap-south-1',
                  AWS_EC2_METADATA_DISABLED='true', AWS_SHARED_CREDENTIALS_FILE=str(RUN / 'credentials'),
                  AWS_CONFIG_FILE=str(RUN / 'config'), AWS_PAGER='', AWS_MAX_ATTEMPTS='1', AWS_RETRY_MODE='standard')
(RUN / 'credentials').write_text('[default]\naws_access_key_id = test\naws_secret_access_key = test\n')
(RUN / 'config').write_text('[default]\nregion = ap-south-1\noutput = json\n')
logging.getLogger('werkzeug').setLevel(logging.CRITICAL)

server = ThreadedMotoServer(ip_address='127.0.0.1', port=0, verbose=False)
server.start()
host, port = server.get_host_and_port()
END = f'http://{host}:{port}'
TAG = 'lab31-' + str(time.time_ns())
kw = dict(endpoint_url=END, region_name='ap-south-1', aws_access_key_id='test', aws_secret_access_key='test')
idp, cid_api, iam, rek, tex = (boto3.client(x, **kw) for x in ('cognito-idp', 'cognito-identity', 'iam', 'rekognition', 'textract'))
made = {'pool': None, 'ipool': None, 'role': False}
checks = 0
GOOD_PW, TEMP_PW = 'TEST-Passw0rd!x', 'Temp-Pass-12!'


def cli(service, *args, ok=True, show=True):
    cmd = [str(APP / 'docker-labs/.venv/bin/aws'), '--endpoint-url', END, '--region', 'ap-south-1', service, *args]
    print('$ aws', service, *[('***' if a in (GOOD_PW, TEMP_PW) or 'PASSWORD=' in a else a) for a in args], flush=True)
    r = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
    out = (r.stdout or '') + (r.stderr or '')
    if show and out.strip():
        print(out.strip()[:700], flush=True)
    if ok and r.returncode:
        raise AssertionError('CLI exit ' + str(r.returncode))
    return r


def check(v, text):
    global checks
    assert v, text
    checks += 1
    print('PASS', checks, text, flush=True)


def b64d(x):
    return base64.urlsafe_b64decode(x + '=' * (-len(x) % 4))


def decode(tok):
    h, b, _ = tok.split('.')
    return json.loads(b64d(h)), json.loads(b64d(b))


def login(pool, client, pw):
    r = cli('cognito-idp', 'admin-initiate-auth', '--user-pool-id', pool, '--client-id', client, '--auth-flow', 'ADMIN_USER_PASSWORD_AUTH',
            '--auth-parameters', f'USERNAME=TEST-priya,PASSWORD={pw}', show=False)
    return json.loads(r.stdout)


def authorize(tok, issuer, audience, now):
    """Wahi jaanch jo HTTP API ka JWT authorizer karta hai (signature alag se, neeche JWKS se)."""
    _, c = decode(tok)
    if c.get('iss') != issuer:
        return 401, 'issuer match nahi'
    if c.get('exp', 0) <= now:
        return 401, 'token expire'
    aud = c.get('aud') if c.get('token_use') == 'id' else c.get('client_id')
    return (200, 'ok') if aud in audience else (401, f'{aud} audience mein nahi')


try:
    print('OWNED MOTO', END, 'WORKDIR', RUN, flush=True)

    # ---------- ex1: user pool, mobile client, test user ----------
    (RUN / 'password-policy.json').write_text(json.dumps({'PasswordPolicy': {'MinimumLength': 10, 'RequireNumbers': True, 'RequireSymbols': True, 'RequireUppercase': True, 'RequireLowercase': True}}))
    r = cli('cognito-idp', 'create-user-pool', '--pool-name', TAG + '-customers', '--policies', 'file://' + str(RUN / 'password-policy.json'),
            '--mfa-configuration', 'OPTIONAL', '--user-pool-tier', 'ESSENTIALS', '--auto-verified-attributes', 'email', show=False)
    pool = json.loads(r.stdout)['UserPool']
    made['pool'] = POOL = pool['Id']
    print('USER POOL', POOL, 'MFA', pool.get('MfaConfiguration'), 'TIER', pool.get('UserPoolTier'), flush=True)
    r = cli('cognito-idp', 'create-user-pool-client', '--user-pool-id', POOL, '--client-name', 'mobile-app', '--no-generate-secret',
            '--explicit-auth-flows', 'ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_ADMIN_USER_PASSWORD_AUTH', show=False)
    MOBILE = json.loads(r.stdout)['UserPoolClient']['ClientId']
    check('ClientSecret' not in json.loads(r.stdout)['UserPoolClient'], 'mobile-app client bina secret bana')
    cli('cognito-idp', 'admin-create-user', '--user-pool-id', POOL, '--username', 'TEST-priya', '--message-action', 'SUPPRESS', '--temporary-password', TEMP_PW, show=False)
    first = login(POOL, MOBILE, TEMP_PW)
    print('LOGIN WITH TEMP PASSWORD ->', first.get('ChallengeName'), flush=True)
    weak = cli('cognito-idp', 'admin-set-user-password', '--user-pool-id', POOL, '--username', 'TEST-priya', '--password', 'NoSymbolPass1', '--permanent', ok=False)
    cli('cognito-idp', 'admin-set-user-password', '--user-pool-id', POOL, '--username', 'TEST-priya', '--password', GOOD_PW, '--permanent')
    check(first.get('ChallengeName') == 'NEW_PASSWORD_REQUIRED' and weak.returncode and 'InvalidPasswordException' in weak.stderr,
          'temporary password par NEW_PASSWORD_REQUIRED; bina symbol wala password policy ne roka')

    # ---------- ex2: tokens decode + verify ----------
    tok = login(POOL, MOBILE, GOOD_PW)['AuthenticationResult']
    (hid, cid), (_, cac) = decode(tok['IdToken']), decode(tok['AccessToken'])
    ISS = f'https://cognito-idp.ap-south-1.amazonaws.com/{POOL}'
    print('TOKEN ID     header', hid, 'claims', {k: cid.get(k) for k in ('token_use', 'aud', 'client_id', 'cognito:username', 'iss')}, flush=True)
    print('TOKEN ACCESS claims', {k: cac.get(k) for k in ('token_use', 'aud', 'client_id', 'username', 'iss')}, 'expiry', cac['exp'] - cac['iat'], 's', flush=True)
    check(cid['token_use'] == 'id' and cid['aud'] == MOBILE and 'client_id' not in cid and cac['token_use'] == 'access'
          and cac['client_id'] == MOBILE and 'aud' not in cac and cid['iss'] == ISS, 'ID token mein aud, access token mein client_id; issuer = user pool')
    jwks = json.loads(urllib.request.urlopen(f'{END}/{POOL}/.well-known/jwks.json', timeout=10).read())
    key = next(k for k in jwks['keys'] if k['kid'] == hid['kid'])
    pub = RSAPublicNumbers(int.from_bytes(b64d(key['e']), 'big'), int.from_bytes(b64d(key['n']), 'big')).public_key()

    def verified(t):
        h, b, s = t.split('.')
        try:
            pub.verify(b64d(s), (h + '.' + b).encode(), padding.PKCS1v15(), hashes.SHA256())
            return True
        except Exception:
            return False
    h, b, s = tok['IdToken'].split('.')
    forged = h + '.' + base64.urlsafe_b64encode(json.dumps({**cid, 'cognito:username': 'TEST-admin'}).encode()).decode().rstrip('=') + '.' + s
    print('JWKS kid', key['kid'], '| asli token verify:', verified(tok['IdToken']), '| badla hua payload verify:', verified(forged), flush=True)
    me = idp.get_user(AccessToken=tok['AccessToken'])['Username']
    try:
        idp.get_user(AccessToken=tok['IdToken'])
        id_refused = False
    except ClientError as e:
        id_refused = e.response['Error']['Code'] == 'NotAuthorizedException'
    check(verified(tok['IdToken']) and not verified(forged) and me == 'TEST-priya' and id_refused,
          'JWKS se signature sahi, badla payload fail; GetUser access token maanta hai, ID token nahi')

    # ---------- ex3: chhota authorizer: audience ka 401 ----------
    r = cli('cognito-idp', 'create-user-pool-client', '--user-pool-id', POOL, '--client-name', 'web', '--no-generate-secret',
            '--explicit-auth-flows', 'ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_ADMIN_USER_PASSWORD_AUTH', show=False)
    WEB = json.loads(r.stdout)['UserPoolClient']['ClientId']
    web = login(POOL, WEB, GOOD_PW)['AuthenticationResult']['IdToken']
    now = int(time.time())
    before = [authorize(t, ISS, [WEB], now) for t in (web, tok['IdToken'], tok['AccessToken'])]
    after = [authorize(t, ISS, [WEB, MOBILE], now) for t in (web, tok['IdToken'], tok['AccessToken'])]
    late = authorize(web, ISS, [WEB, MOBILE], now + 7200)
    print('HOST CHECK authorizer audience=[web]       web/mobile-id/mobile-access ->', before, flush=True)
    print('HOST CHECK authorizer audience=[web,mobile] web/mobile-id/mobile-access ->', after, '| 2 ghante baad ->', late, flush=True)
    check([x[0] for x in before] == [200, 401, 401] and [x[0] for x in after] == [200, 200, 200] and late[0] == 401,
          'audience mein mobile nahi toh 401; jodne par teeno 200; expire token 401')

    # ---------- ex4: Moto ki client kamiyan ----------
    r = cli('cognito-idp', 'create-user-pool-client', '--user-pool-id', POOL, '--client-name', 'server', '--generate-secret',
            '--explicit-auth-flows', 'ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH', show=False)
    srv = json.loads(r.stdout)['UserPoolClient']
    no_hash = 'AuthenticationResult' in login(POOL, srv['ClientId'], GOOD_PW)
    plain = idp.initiate_auth(ClientId=MOBILE, AuthFlow='USER_PASSWORD_AUTH', AuthParameters={'USERNAME': 'TEST-priya', 'PASSWORD': GOOD_PW})
    tier = idp.describe_user_pool(UserPoolId=POOL)['UserPool'].get('UserPoolTier')
    secret_hash = base64.b64encode(hmac.new(srv['ClientSecret'].encode(), ('TEST-priya' + srv['ClientId']).encode(), hashlib.sha256).digest()).decode()
    print('GAP secret wale client par SECRET_HASH ke bina bhi login mila:', no_hash, '(asli Cognito: NotAuthorizedException)', flush=True)
    print('GAP mobile-app mein ALLOW_USER_PASSWORD_AUTH nahi, phir bhi USER_PASSWORD_AUTH chala:', 'AuthenticationResult' in plain, '(asli: Auth flow not enabled)', flush=True)
    print('FACT describe-user-pool: UserPoolTier =', tier, '(plan save hua)', flush=True)
    print('HOST CHECK SECRET_HASH = base64(HMAC-SHA256(client secret, username + client id)) ->', secret_hash[:8] + '...', len(secret_hash), 'chars', flush=True)
    check(no_hash and 'AuthenticationResult' in plain and tier == 'ESSENTIALS' and len(base64.b64decode(secret_hash)) == 32, 'Moto ki client kamiyan pakdi; SECRET_HASH ka formula host par')

    # ---------- ex5: identity pool ----------
    role = iam.create_role(RoleName=TAG + '-app-user', AssumeRolePolicyDocument=json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Federated': 'cognito-identity.amazonaws.com'}, 'Action': 'sts:AssumeRoleWithWebIdentity'}]}))['Role']['Arn']
    made['role'] = True
    r = cli('cognito-identity', 'create-identity-pool', '--identity-pool-name', TAG.replace('-', '_') + '_app', '--no-allow-unauthenticated-identities',
            '--cognito-identity-providers', f'ProviderName=cognito-idp.ap-south-1.amazonaws.com/{POOL},ClientId={MOBILE}', show=False)
    made['ipool'] = IPOOL = json.loads(r.stdout)['IdentityPoolId']
    roles = cli('cognito-identity', 'set-identity-pool-roles', '--identity-pool-id', IPOOL, '--roles', 'authenticated=' + role, ok=False, show=False)
    print('GAP set-identity-pool-roles: exit', roles.returncode, '| Moto ka internal error (HTTP 500), role mapping save nahi', flush=True)
    login_map = {f'cognito-idp.ap-south-1.amazonaws.com/{POOL}': tok['IdToken']}
    ident = cid_api.get_id(IdentityPoolId=IPOOL, Logins=login_map)['IdentityId']
    creds = cid_api.get_credentials_for_identity(IdentityId=ident, Logins=login_map)['Credentials']
    guest = cid_api.get_id(IdentityPoolId=IPOOL)['IdentityId']
    print('GAP identity id region:', ident.split(':')[0], '(pool ap-south-1 mein) | AccessKeyId', creds['AccessKeyId'], '| bina login (guest band) bhi id mili:', guest.split(':')[0] + ':...', flush=True)
    sub = ident
    resource = 'arn:aws:s3:::shopkaro-uploads/private/${cognito-identity.amazonaws.com:sub}/*'

    def allowed(identity, key):
        return fnmatch.fnmatchcase('arn:aws:s3:::shopkaro-uploads/' + key, resource.replace('${cognito-identity.amazonaws.com:sub}', identity))
    own, other = allowed(sub, f'private/{sub}/invoice.jpg'), allowed(sub, 'private/ap-south-1:someone-else/invoice.jpg')
    print('HOST CHECK policy variable: apna folder', own, '| doosre ka folder', other, flush=True)
    check(roles.returncode != 0 and creds['AccessKeyId'].startswith('TEST') and own and not other,
          'identity pool ki kamiyan pakdi (roles 500, static creds, guest rok nahi); ${sub} rok host par sahi')

    # ---------- ex6: AI services ----------
    try:
        rek.detect_moderation_labels(Image={'Bytes': b'TEST-not-an-image'})
        rek_gap = 'chala'
    except ClientError as e:
        rek_gap = 'error ' + str(e.response['Error'].get('Code'))[:20]
    tx = tex.detect_document_text(Document={'Bytes': b'TEST-not-a-document'})
    print('GAP Rekognition DetectModerationLabels:', rek_gap, '| Textract: Blocks', len(tx['Blocks']), '(nakli jawaab; Pages ka number random, text kuch nahi)', flush=True)
    UNSAFE = [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 88, 87, 85, 83, 80, 78, 74, 66, 58, 52]
    SAFE = [[55, 61, 64, 70, 72, 76, 82, 86][i] if i < 8 else (i * 37) % 50 for i in range(180)]
    rej, rev = 80, 50
    fn, fp = sum(c < rev for c in UNSAFE), sum(c >= rej for c in SAFE)
    review = sum(rev <= c < rej for c in UNSAFE + SAFE)
    print('HOST CHECK moderation (app wala sample) block>=80, review>=50: unsafe publish', fn, '| achhi block', fp, '| review queue', review, flush=True)
    check(rek_gap != 'chala' and tx['Blocks'] == [] and fn == 0 and fp == 2 and review == 11, 'AI APIs ki kamiyan pakdi; threshold ka hisaab host par app jaisa')
    print('BEHAVIOR CHECKS', checks, flush=True)
finally:
    try:
        if made['ipool']:
            cid_api.delete_identity_pool(IdentityPoolId=made['ipool'])
        if made['pool']:
            for c in idp.list_user_pool_clients(UserPoolId=made['pool'], MaxResults=60)['UserPoolClients']:
                idp.delete_user_pool_client(UserPoolId=made['pool'], ClientId=c['ClientId'])
            idp.delete_user_pool(UserPoolId=made['pool'])
        if made['role']:
            iam.delete_role(RoleName=TAG + '-app-user')
        left = {'user_pools': [p['Name'] for p in idp.list_user_pools(MaxResults=60)['UserPools'] if p['Name'].startswith(TAG)],
                'identity_pools': [p['IdentityPoolName'] for p in cid_api.list_identity_pools(MaxResults=60)['IdentityPools'] if p['IdentityPoolName'].startswith(TAG.replace('-', '_'))],
                'roles': [r['RoleName'] for r in iam.list_roles()['Roles'] if r['RoleName'].startswith(TAG)]}
        print('CLEANUP READBACK', json.dumps(left), flush=True)
        check(not any(left.values()), 'apne user pool, clients, identity pool aur role saaf')
    finally:
        server.stop()
        server._server.server_close()
        try:
            with socket.create_connection((host, port), timeout=.5):
                raise AssertionError('listener still open')
        except OSError:
            pass
        print('OWNED MOTO STOPPED / LISTENER CLOSED', flush=True)
