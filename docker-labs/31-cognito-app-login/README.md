# Lab31 — app login: Cognito user pool, asli JWT, authorizer ka 401 aur identity pool

**Pain:** ShopKaro ka naya mobile app login toh kar leta hai, par orders API 401 deti hai. Ravi app mein ek IAM access key daalna chahta hai. Yeh lab dikhati hai ki tokens kaise bante hain, API unhe kaise jaanchti hai, aur local emulator kya sach dikhata hai aur kya nahi.

**Scope:** sirf local Moto 5.2.4. Asli AWS, Docker, shared 4566 server ya `~/.aws` nahi. Sab users aur data TEST hain. Moto Cognito asli RS256 JWT banata hai (apni test key se), password policy aur temporary password ka challenge maanta hai. Par SECRET_HASH, client ke auth flows, identity pool roles aur "guest band" ki rok nahi jaanchta, aur Rekognition moderation bana hi nahi. Woh **GAP** lines mein likhe hain. Authorizer, `${sub}` policy variable aur moderation threshold **HOST CHECK** mein Python se jaanche jaate hain.

## Chalao — app ke root folder se

```bash
./docker-labs/.venv/bin/python -I docker-labs/31-cognito-app-login/lab.py
```

Runner apna naya `127.0.0.1` Moto server OS ke diye port par chalata hai, dummy `test` keys, lab ki apni config aur `AWS_MAX_ATTEMPTS=1` use karta hai. Resources ka naam `lab31-<number>` se shuru hota hai. Password output mein `***` dikhta hai. Evidence `.overhaul-evidence/lab31-runs/` mein jaata hai (git mein nahi).

## ex1 — user pool, mobile client, test user

Password policy file (10+ characters, number, symbol, bada aur chhota letter), MFA OPTIONAL, plan ESSENTIALS. Mobile client **bina secret**. Test user `TEST-priya` temporary password ke saath. Asli output (2026-11-20):

```text
PASS 1 mobile-app client bina secret bana
PASS 2 temporary password par NEW_PASSWORD_REQUIRED; bina symbol wala password policy ne roka
```

👉 Temporary password se login par token nahi, `NEW_PASSWORD_REQUIRED` challenge aata hai. Policy todne wala password (`NoSymbolPass1`) `InvalidPasswordException` deta hai.

## ex2 — tokens decode karo, JWKS se verify karo

```text
TOKEN ID     header {'typ': 'JWT', 'kid': 'dummy', 'alg': 'RS256'} claims {'token_use': 'id', 'aud': '<mobile-client>', 'client_id': None, 'cognito:username': 'TEST-priya', 'iss': 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_<pool>'}
TOKEN ACCESS claims {'token_use': 'access', 'aud': None, 'client_id': '<mobile-client>', 'username': 'TEST-priya', 'iss': 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_<pool>'} expiry 3600 s
PASS 3 ID token mein aud, access token mein client_id; issuer = user pool
JWKS kid dummy | asli token verify: True | badla hua payload verify: False
PASS 4 JWKS se signature sahi, badla payload fail; GetUser access token maanta hai, ID token nahi
```

👉 JWT ka beech wala hissa sirf base64 hai: koi bhi padh sakta hai. ID token mein `aud` = client ID, access token mein `client_id`. Bharosa sirf signature verify karne ke baad: payload badla toh signature fail. Cognito ki user APIs (jaise GetUser) access token maangti hain, ID token nahi.

## ex3 — chhota authorizer: audience ka 401

Ek doosra client `web` banta hai. Host par wahi jaanch chalti hai jo HTTP API ka JWT authorizer karta hai: issuer, expiry, aur ID token ka `aud` ya access token ka `client_id`.

```text
HOST CHECK authorizer audience=[web]       web/mobile-id/mobile-access -> [(200, 'ok'), (401, '<mobile-client> audience mein nahi'), (401, '<mobile-client> audience mein nahi')]
HOST CHECK authorizer audience=[web,mobile] web/mobile-id/mobile-access -> [(200, 'ok'), (200, 'ok'), (200, 'ok')] | 2 ghante baad -> (401, 'token expire')
PASS 5 audience mein mobile nahi toh 401; jodne par teeno 200; expire token 401
```

👉 Same user pool ka token bhi galat client ke liye 401 khata hai. Naya app client banao toh authorizer ki audience list bhi update karo. Level ke interview mein yahi fix hai.

## ex4 — Moto ki client kamiyan

```text
GAP secret wale client par SECRET_HASH ke bina bhi login mila: True (asli Cognito: NotAuthorizedException)
GAP mobile-app mein ALLOW_USER_PASSWORD_AUTH nahi, phir bhi USER_PASSWORD_AUTH chala: True (asli: Auth flow not enabled)
FACT describe-user-pool: UserPoolTier = ESSENTIALS (plan save hua)
HOST CHECK SECRET_HASH = base64(HMAC-SHA256(client secret, username + client id)) -> <hash>... 44 chars
PASS 6 Moto ki client kamiyan pakdi; SECRET_HASH ka formula host par
```

👉 Asli Cognito mein secret wale client ko har call par `SECRET_HASH` dena padta hai, aur jo flow client par allow nahi woh mana hota hai. Moto dono nahi jaanchta, isliye in par local test se bharosa mat karo. Mobile app mein secret nahi hota; secret sirf server-side client ke liye.

## ex5 — identity pool aur `${sub}` rok

Identity pool sirf is user pool + mobile client se, guest band. Phir authenticated role jodne ki koshish, identity id, credentials aur policy variable ki jaanch.

```text
GAP set-identity-pool-roles: exit 255 | Moto ka internal error (HTTP 500), role mapping save nahi
GAP identity id region: us-east-1 (pool ap-south-1 mein) | AccessKeyId TESTACCESSKEY12345 | bina login (guest band) bhi id mili: us-east-1:...
HOST CHECK policy variable: apna folder True | doosre ka folder False
PASS 7 identity pool ki kamiyan pakdi (roles 500, static creds, guest rok nahi); ${sub} rok host par sahi
```

👉 Asli identity pool role mapping save karta hai, guest band ho toh bina login id nahi deta, aur thodi der ke asli STS credentials deta hai. Moto yahan teeno mein kamzor hai. `${cognito-identity.amazonaws.com:sub}` wali rok host par jaanchi: apna folder haan, doosre ka nahi.

## ex6 — AI services

```text
GAP Rekognition DetectModerationLabels: error 500 | Textract: Blocks 0 (nakli jawaab; Pages ka number random, text kuch nahi)
HOST CHECK moderation (app wala sample) block>=80, review>=50: unsafe publish 0 | achhi block 2 | review queue 11
PASS 8 AI APIs ki kamiyan pakdi; threshold ka hisaab host par app jaisa
BEHAVIOR CHECKS 8
```

👉 Moto mein Rekognition moderation bana hi nahi, aur Textract nakli jawaab deta hai. Moderation ka asli sabak threshold ka hai: app ke flowlab wale sample par "80 se upar block, 50–80 insaan dekhe" se koi unsafe photo publish nahi hui, 2 achhi photos block hui, aur 11 photos review mein gayi.

## Cleanup — sirf apne resources

```text
CLEANUP READBACK {"user_pools": [], "identity_pools": [], "roles": []}
PASS 9 apne user pool, clients, identity pool aur role saaf
OWNED MOTO STOPPED / LISTENER CLOSED
```

## Emulator ki limits (imaandar list)

- SECRET_HASH nahi jaanchta; client par jo auth flow allow nahi, woh bhi chal jaata hai.
- `set-identity-pool-roles` par HTTP 500; role mapping save nahi hoti.
- Guest band hone par bhi bina login identity id deta hai; identity id `us-east-1` ki aati hai; credentials static TEST values hain.
- Signing key Moto ki apni test key hai (`kid: dummy`); asli Cognito ki keys har user pool ki alag hoti hain.
- Rekognition DetectModerationLabels 500 deta hai; Textract nakli jawaab deta hai. Managed login, SRP, social login aur MFA ka asli flow yahan nahi.

Asli AWS par Cognito aur AI APIs chalana optional, alag manzoori wala aur bill hone wala kaam hai; level ka homework steps aur cleanup batata hai.

Sources: [user pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html), [feature plans](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html), [Cognito pricing](https://aws.amazon.com/cognito/pricing/), [verifying JWTs](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html), [SECRET_HASH](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html#cognito-user-pools-computing-secret-hash), [HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), [Kendra availability](https://docs.aws.amazon.com/kendra/latest/dg/kendra-availability-change.html), [Rekognition availability](https://docs.aws.amazon.com/rekognition/latest/dg/rekognition-availability-changes.html), [Comprehend availability](https://docs.aws.amazon.com/comprehend/latest/dg/comprehend-availability-change.html).
