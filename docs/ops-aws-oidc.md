# Storefront AWS access: Vercel OIDC → IAM role

This runbook moves `cambridgetcg-storefront` production off the long-lived
IAM user `cambridgetcg-storefront-prod` (access key `…NWNC`) and onto
short-lived role credentials. Vercel signs an OIDC token for each function
invocation; AWS STS swaps it for one-hour credentials for the role
`vercel-cambridgetcg-storefront`. No AWS secret is stored in Vercel.

Written 2026-10-12. Every step here is an **owner action**: AWS console/CLI
with an admin identity, and Vercel project settings. The code change only
selects the role when `AWS_ROLE_ARN` is set, so merging it changes no
credentials until step 3. The one visible difference before then is a
value-free info line each time an S3 or SES client is created
(`… client ready (credentials=static-keys, …)`).

Evidence tags:

- **[doc]** comes from Vercel or AWS documentation.
- **[code]** was read in this repo or in the package source.
- **[unverified]** has not been checked against the live account or project.
  Check these items as you go.

---

## 0. What the code does

`packages/aws/src/credentials.ts` → `resolveAwsConfig()` picks one source in
this order. The first match wins.

| # | Condition | Credentials | Log line on client creation |
|---|---|---|---|
| 1 | `AWS_ROLE_ARN` is set and an OIDC token source exists | `@vercel/oidc-aws-credentials-provider@3.3.9` assumes the role (session name `cambridgetcg-<VERCEL_ENV>`, STS region = `AWS_REGION`) | `[packages/aws] S3 client ready (credentials=vercel-oidc-role, region=us-east-1)` (same for `SES`) |
| 2 | `AWS_ROLE_ARN` is unset (or the local-only opt-in below) | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `… (credentials=static-keys, …)` |
| 3 | Neither | none; the client factory returns `null` | `[packages/aws] S3 unavailable: …` |

An **OIDC token source** is one of these:

- a Vercel deployment: `VERCEL=1` and `VERCEL_ENV` is not `development`. The
  token comes in on each request as the `x-vercel-oidc-token` header.
- a `VERCEL_OIDC_TOKEN` env var (Vercel builds, and `vercel env pull` for
  local development). A pulled token is a **development** token, and the
  role below trusts only production, so it cannot assume this role (see 2f).

**Choice made:** if `AWS_ROLE_ARN` is set and there is no token source, the
config is an error. The code does **not** quietly fall back to static keys.
That keeps a misconfigured runtime from using long-lived keys while everyone
believes they are gone.

`AWS_OIDC_ALLOW_STATIC_FALLBACK=1` is a **local-only** escape hatch for that
error case. The code enforces "local only":

- It is **refused** (the result stays an error) whenever the process shows
  any sign of a deployment: `VERCEL_ENV` other than `development`, a
  `VERCEL_REGION` other than `vercel dev`'s `dev1`, `AWS_LAMBDA_FUNCTION_NAME`,
  or the Vercel request context. A production function whose `VERCEL`
  variable is missing therefore fails loudly instead of using `…NWNC`.
- It is **ignored**, with a warning, when a token source exists, so it can
  never override the role.
- Runtime errors never suggest it. Don't set it in Vercel.

A local process that loads a pulled production/preview env file (one that
carries `AWS_ROLE_ARN`, `VERCEL=1`, `VERCEL_ENV=production`) looks like a
deployment by env alone. There, the opt-in is ignored and the first AWS call
fails for lack of a request token. To use static keys in that process, unset
`AWS_ROLE_ARN` in it.

Other properties:

- **Static keys are ignored on the role path.** Vercel may inject `AWS_*`
  variables into functions that are not usable credentials [doc: reserved env
  vars], so the role path never reads them.
- **The provider is lazy.** Building the config makes no network call and
  loads no provider code. `@vercel/oidc-aws-credentials-provider` (with
  `@vercel/oidc` and its CLI helpers) is imported on the first credential
  request on the role path, so static-key processes such as tcg-wholesale
  and scripts never load it. A missing token or a trust-policy mismatch fails
  on the first S3/SES request, not at startup. SES failures come back as
  `sendMail` error results. S3 failures throw from the helper.
- **Role credentials refresh 15 minutes early**
  (`ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS`). A presigned URL signed with
  role credentials dies when the role session ends, whatever its `expiresIn`
  says [doc: S3 presigned URLs]. With the SDK's own 5-minute refresh window,
  cached credentials are used only while at least 20 minutes of session
  remain. The storefront signs 300–600 s URLs. A fake-clock test on a real
  `S3Client` checks this.
- **No `audience` is passed.** The token keeps its default
  `aud = https://vercel.com/cambridgetcgs-projects`, which is the audience
  registered below. There is no extra exchange call to Vercel.
- **Errors and logs never contain** a key, a secret, a token or the role ARN.
- **Keep AWS calls out of `proxy.ts`/middleware.** The OIDC header is
  reported missing there (community report). Route handlers, server actions,
  SSR and the `/api/cron/maintenance` cron are the supported places. The cron
  case is [unverified]: it is an ordinary function invocation, so the header
  should be present.

**tcg-wholesale stays on static keys.** It is frozen at `b4386471` and
deploys separately, so this change doesn't reach it. Even if it were rebuilt
from `main`, it has no `AWS_ROLE_ARN` and would keep using its keys.

---

## 1. Vercel: enable OIDC federation (team issuer)

1. Open Vercel → team `cambridgetcgs-projects` → project
   `cambridgetcg-storefront` → **Settings → Security → Secure backend
   access with OIDC Federation**.
2. Turn it on and choose **Team** issuer mode, not Global. [doc]
   - The issuer becomes `https://oidc.vercel.com/cambridgetcgs-projects`.
     Its discovery document was live on 2026-10-12 and serves RS256 keys.
   - Global mode is a shared issuer. AWS then requires extra conditions, and
     tokens exchanged for a custom audience never match it.
3. Save. Enabling it is expected to apply to **new deployments**, so the
   redeploy in step 4 is what activates it [unverified].
4. Check that system environment variables are exposed (Settings →
   Environment Variables → "Automatically expose System Environment
   Variables"). The code needs `VERCEL` and `VERCEL_ENV` at runtime.
   - Quick check: `GET https://<storefront>/api/v1/heartbeat` should show a
     deployment `env` of `production`, not `unknown`.
   - The heartbeat reads `VERCEL_ENV` but not `VERCEL`. That `VERCEL=1` is
     set at function runtime comes from the docs and is [unverified] here.
     If it is missing, the role path is not selected and S3/SES report
     `AWS_ROLE_ARN is set but no Vercel OIDC token is available … looks like
     a Vercel deployment (VERCEL_ENV)`. They do not fall back to the key.

The token `sub` is
`owner:cambridgetcgs-projects:project:cambridgetcg-storefront:environment:<production|preview|development>`
[doc]. **Renaming the team or the project changes `sub` and breaks the
trust policy.** Before any rename, add the new `sub` values to the trust
policy.

---

## 2. AWS: identity provider, role, permissions

Use the account that owns the storefront's us-east-1 buckets and SES
identity. Confirm it before creating anything:

```bash
aws sts get-caller-identity                                  # which account am I in?
aws s3api get-bucket-location --bucket <AUCTION_S3_BUCKET>    # bucket in this account?
aws s3api get-bucket-location --bucket <VERIFICATION_S3_BUCKET>
aws sesv2 list-email-identities --region us-east-1           # sending identities
aws iam list-open-id-connect-providers                       # provider already there?
```

### 2a. OIDC identity provider

**Console:** IAM → Identity providers → Add provider → OpenID Connect.

- Provider URL: `https://oidc.vercel.com/cambridgetcgs-projects` (exact,
  case-sensitive, no trailing slash)
- Audience: `https://vercel.com/cambridgetcgs-projects`

**CLI equivalent:**

```bash
aws iam create-open-id-connect-provider \
  --url https://oidc.vercel.com/cambridgetcgs-projects \
  --client-id-list https://vercel.com/cambridgetcgs-projects
```

You don't need a thumbprint. `ThumbprintList` is optional, and AWS checks
the JWKS host's certificate against its trusted root CAs. [doc:
CreateOpenIDConnectProvider]

### 2b. Role `vercel-cambridgetcg-storefront` (production only)

Save this trust policy as `trust.json`. Replace `<ACCOUNT_ID>`; everything
else is literal. It allows **only** the storefront project's `production`
environment, and only tokens with the team audience. Preview and
development tokens are rejected.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VercelCambridgeTcgStorefrontProduction",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.vercel.com/cambridgetcgs-projects"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/cambridgetcgs-projects:aud": "https://vercel.com/cambridgetcgs-projects",
          "oidc.vercel.com/cambridgetcgs-projects:sub": "owner:cambridgetcgs-projects:project:cambridgetcg-storefront:environment:production"
        }
      }
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name vercel-cambridgetcg-storefront \
  --description "cambridgetcg-storefront production on Vercel (OIDC)" \
  --max-session-duration 3600 \
  --assume-role-policy-document file://trust.json
```

**Why not preview too.** Preview deployments run code from any branch, and
anyone with deploy rights can create one with `vercel deploy`. Trusting the
`preview` `sub` here would give every preview this role's production access:
the auction bucket, identity documents under `verifications/` (PII), and the
production SES identity. Previews get their own role, scoped to preview-only
resources, or no AWS access (2e).

### 2c. Permissions: pick one

**Option 1 (simplest): copy what the IAM user has today.** List every
permission path, including group membership, and replay it onto the role.

```bash
aws iam list-attached-user-policies --user-name cambridgetcg-storefront-prod
aws iam list-user-policies          --user-name cambridgetcg-storefront-prod   # inline
aws iam list-groups-for-user        --user-name cambridgetcg-storefront-prod   # group policies apply too

# For each managed policy ARN:
aws iam attach-role-policy --role-name vercel-cambridgetcg-storefront --policy-arn <POLICY_ARN>
# For each inline policy:
aws iam get-user-policy --user-name cambridgetcg-storefront-prod --policy-name <NAME>   # save PolicyDocument as <NAME>.json
aws iam put-role-policy --role-name vercel-cambridgetcg-storefront --policy-name <NAME> --policy-document file://<NAME>.json
```

The user may hold more than the storefront needs today, so option 2 is the
better end state.

**Option 2 (least privilege): derived from the code.** The storefront calls
only these AWS operations [code]:

| Code path | Bucket / service | SDK command | IAM action needed |
|---|---|---|---|
| `lib/auction/s3.ts` `getPresignedUploadUrl` (auction images, avatars, dispute evidence) | `AUCTION_S3_BUCKET` | PutObject (presigned) | `s3:PutObject` |
| `lib/auction/s3.ts` `deleteS3Object` | `AUCTION_S3_BUCKET` | DeleteObject | `s3:DeleteObject` |
| `lib/market/photos.ts` (`trade-photos/…`) | `AUCTION_S3_BUCKET` | PutObject (presigned), DeleteObject | `s3:PutObject`, `s3:DeleteObject` |
| `lib/trust/verification-storage.ts` `prepareVerificationUpload` | `VERIFICATION_S3_BUCKET`, `verifications/…` | PutObject (presigned, with `x-amz-tagging`) | `s3:PutObject` + `s3:PutObjectTagging` |
| `…` `getVerificationReadUrl` | same | GetObject (presigned) | `s3:GetObject` |
| `…` `inspectVerificationObject` | same | HeadObject | `s3:GetObject` (HEAD has no separate action) |
| `…` `markVerificationObjectLinked` | same | PutObjectTagging | `s3:PutObjectTagging` |
| `…` `getVerificationUploadState` | same | GetObjectTagging | `s3:GetObjectTagging` |
| `…` `deleteVerificationObject` (also used by the sweep) | same | DeleteObject | `s3:DeleteObject` |
| `packages/email/src/ses.ts` (every `sendMail` on the `ses` transport) | SES us-east-1 | SendRawEmail | `ses:SendRawEmail` |

Presigned URLs are authorised **when the browser uses them**, with the role
session's permissions. The role therefore needs the action even though the
storefront never sends that request itself.

**No `s3:GetObject` on the auction bucket.** `lib/auction/s3.ts` exports
`getPresignedReadUrl`, but nothing in `apps/storefront` calls it [code]. The
auction bucket also holds `disputes/` evidence and older `verifications/`
keys, so a bucket-wide read grant would let the role read private files it
never needs. Images are shown through their plain object URL
(`publicUrl` / `getStoredObjectUrl`), which is unsigned and so never uses the
role's permissions; whether those URLs load depends only on the bucket's own
policy. If a caller of `getPresignedReadUrl` is added later, grant
`s3:GetObject` on the prefix it reads, not the whole bucket.

Save as `storefront-least-privilege.json` and fill in the placeholders:

- `<AUCTION_S3_BUCKET>` / `<VERIFICATION_S3_BUCKET>`: the storefront's
  production values of those env vars. The auction bucket's in-code default
  is `cambridgetcg-auction-images`; the verification bucket has no default.
- `<SES_IDENTITY>`: each verified identity the storefront sends from. Senders
  in code are `AUTH_FROM_EMAIL` (default `noreply@cambridgetcg.com`),
  `BOUNTY_FROM_EMAIL` (default `bounty@cambridgetcg.com`) and `EMAIL_FROM`.
  This is usually the domain identity `cambridgetcg.com` [unverified]. List
  one ARN per identity.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AuctionMediaObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<AUCTION_S3_BUCKET>/*"
    },
    {
      "Sid": "VerificationDocumentObjects",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectTagging",
        "s3:PutObjectTagging"
      ],
      "Resource": "arn:aws:s3:::<VERIFICATION_S3_BUCKET>/verifications/*"
    },
    {
      "Sid": "SendMail",
      "Effect": "Allow",
      "Action": "ses:SendRawEmail",
      "Resource": "arn:aws:ses:us-east-1:<ACCOUNT_ID>:identity/<SES_IDENTITY>"
    }
  ]
}
```

```bash
aws iam put-role-policy \
  --role-name vercel-cambridgetcg-storefront \
  --policy-name storefront-least-privilege \
  --policy-document file://storefront-least-privilege.json
```

Things to check that the code can't tell you [unverified]:

- **SSE-KMS.** If either bucket uses a customer-managed KMS key, add
  `kms:GenerateDataKey` and `kms:Decrypt` on that key. Then add the role to
  the key policy if the key policy names principals.
- **SES sandbox.** If the account is still in the sandbox, recipients must be
  verified identities too.
- **No `s3:ListBucket`.** Without it, a HEAD/GET on a missing key returns 403
  instead of 404. The storefront doesn't branch on 404 [code: no
  `NotFound`/`NoSuchKey` handling in these modules], so this is harmless.

### 2d. Resource policies that name the IAM user

Identity policies are only half of it. Find every resource policy that
grants the **user** and add the **role** next to it before retiring the
key:

```bash
aws s3api get-bucket-policy --bucket <AUCTION_S3_BUCKET>        # look for user/cambridgetcg-storefront-prod
aws s3api get-bucket-policy --bucket <VERIFICATION_S3_BUCKET>
aws sesv2 get-email-identity --email-identity <SES_IDENTITY> --region us-east-1   # Policies (sending authorization)
aws kms get-key-policy --key-id <KEY_ID> --policy-name default   # only if SSE-KMS
```

Add `arn:aws:iam::<ACCOUNT_ID>:role/vercel-cambridgetcg-storefront`
wherever `arn:aws:iam::<ACCOUNT_ID>:user/cambridgetcg-storefront-prod`
appears.

### 2e. Preview deployments

First find out what previews can reach **today**. Check whether the
storefront's **Preview** environment holds `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` (Settings → Environment Variables, filtered to
Preview, or `vercel env ls preview`, which lists names only) [unverified].

- **If it does**, previews already run with the production IAM user, so
  every branch already has production access. That exposure ends when the
  key is retired (step 5), and previews then lose AWS unless they get a role
  below.
- **If it does not**, previews have no AWS access now. Keep it that way
  unless previews need S3 or email.

When previews need AWS, give them their own role and resources. Don't add
the preview `sub` to the production role.

1. Create preview-only buckets (or use dedicated test buckets), and set
   `AUCTION_S3_BUCKET` / `VERIFICATION_S3_BUCKET` on **Preview** to them.
2. Create `vercel-cambridgetcg-storefront-preview` with the 2b trust policy,
   changing only the `sub` to
   `…:project:cambridgetcg-storefront:environment:preview` (and the `Sid` and
   description).
3. Grant the 2c option 2 statements on the **preview** buckets only. For
   SES, either grant nothing (previews then report email as unavailable) or
   scope `ses:SendRawEmail` to a test identity. Never use option 1 here.
4. Set `AWS_ROLE_ARN` on **Preview** to the preview role's ARN.

### 2f. Local development (optional)

The production role rejects the development token that `vercel env pull`
writes. Local AWS access today rests on whatever static keys local env
holds; if that is `…NWNC` (through the Development environment or a local
`.env`), it **ends when the key is deactivated in step 5**.

If local development needs S3 or SES after that, choose one:

- a development role (for example `vercel-cambridgetcg-storefront-dev`)
  trusting only the `development` `sub`, with permissions on dev-only
  buckets, and `AWS_ROLE_ARN` set on **Development** to it. Pulled tokens
  are short-lived; run `vercel env pull` again when it expires.
- a separate dev-only IAM user and key, scoped to dev-only buckets, in local
  env only.

---

## 3. Vercel: set `AWS_ROLE_ARN` on Production

Set it on **Production** of `cambridgetcg-storefront` only. **Not** Preview
(unless it gets the separate preview role in 2e) and **not** Development.

```
AWS_ROLE_ARN = arn:aws:iam::<ACCOUNT_ID>:role/vercel-cambridgetcg-storefront
```

Use the dashboard (Settings → Environment Variables), or run
`vercel env add AWS_ROLE_ARN production` from the linked storefront
directory. The CLI prompts for the value. The ARN is not a secret, but keep
it out of chat logs anyway, because it contains the account ID.

**Leave `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in place for now.**
They are ignored while the role path is active, and they keep rollback a
one-variable change until step 5. Keep `AWS_REGION` (`us-east-1`) set:
otherwise Vercel sets `AWS_REGION` to the function's execution region [doc].

---

## 4. Deploy and verify

Env changes and the OIDC toggle only take effect on a **new deployment**.
Don't redeploy production in the middle of another credential rotation,
because a build would pick up a half-rotated environment.

1. **Optional rehearsal on Preview.** If you set up the preview role (2e),
   deploy a preview first. It proves the issuer mode, the token header, the
   trust-policy shape and the log line with preview-only permissions. Run
   steps 3–4 below against it (session name `cambridgetcg-preview`).
2. **Production.** Deploy `main` (carrying this code) to production after
   step 3, in a quiet window. Rollback stays one variable: remove
   `AWS_ROLE_ARN` and redeploy (see Rollback).
3. **Function logs** (Vercel → Deployment → Logs, or `vercel logs <url>`):
   after the first S3 or SES use on an instance, look for
   - `[packages/aws] S3 client ready (credentials=vercel-oidc-role, region=us-east-1)`
   - `[packages/aws] SES client ready (credentials=vercel-oidc-role, region=us-east-1)`

   `credentials=static-keys` means `AWS_ROLE_ARN` didn't reach the
   deployment. `AWS_ROLE_ARN is set but no Vercel OIDC token is available`
   means `VERCEL`/`VERCEL_ENV` are missing at runtime (see 1.4).
4. **Exercise both services:**
   - SES: request a magic-link sign-in to your own address, or let the
     every-minute `/api/cron/maintenance` drain the email queue. A
     `sendMail` failure such as `Not authorized to perform
     sts:AssumeRoleWithWebIdentity` means the trust policy (`sub`/`aud`) or
     the issuer mode doesn't match. `AccessDenied` on `SendRawEmail` means a
     permission is missing.
   - S3: start an avatar or verification-document upload. In the browser
     devtools, the presigned URL's `X-Amz-Credential` starts with **`ASIA`**
     (temporary credentials) instead of `AKIA` (IAM user key), and the URL
     carries `X-Amz-Security-Token`. Don't paste these URLs anywhere: they
     are short-lived capabilities.
5. **CloudTrail** (us-east-1 → Event history → Event name =
   `AssumeRoleWithWebIdentity`), or:

   ```bash
   aws cloudtrail lookup-events --region us-east-1 \
     --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity \
     --max-results 20
   ```

   Expect `requestParameters.roleSessionName` = `cambridgetcg-production`,
   the role ARN above, and a web-identity user from
   `oidc.vercel.com/cambridgetcgs-projects`. Expect about one call per warm
   instance per client (S3 and SES) every ~40 minutes. IAM → Roles →
   `vercel-cambridgetcg-storefront` → "Last activity" should also move.
   Include one cron cycle (the verification-storage sweep runs in it).
6. **The old key goes quiet:**

   ```bash
   aws iam list-access-keys --user-name cambridgetcg-storefront-prod        # find the …NWNC key ID
   aws iam get-access-key-last-used --access-key-id <AKIA…NWNC>
   ```

   `LastUsedDate` must stop advancing after the production cut-over. If it
   keeps moving, something else still uses the key: previews holding it
   (2e), another Vercel project, local development (2f), or a script such as
   `apps/storefront/scripts/*`. Find it via CloudTrail
   `userIdentity.accessKeyId` and decide for each before going further.

---

## 5. Retire the static key

Only after step 4 is clean in production. The order keeps the key's secret
in Vercel until the end, so every rollback before deletion is a switch, not
a new secret.

1. **Deactivate** the key, without deleting it and without touching the
   Vercel env vars (the role path doesn't read them):
   ```bash
   aws iam update-access-key --user-name cambridgetcg-storefront-prod \
     --access-key-id <AKIA…NWNC> --status Inactive
   ```
   Then re-check the log line and one SES and one S3 action in production.
   From here, previews and local development that used this key have no
   AWS access unless they have their own role or key (2e, 2f).
2. **Wait** (for example 7 days, covering a full cron/email cycle and a
   weekend). Watch for `InvalidClientTokenId` / `The security token
   included in the request is invalid` from anything that still held the
   key.
3. **Remove** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the
   storefront in every environment where they exist (Production, Preview,
   Development). Redeploy production and re-check the log line. After this
   step the secret exists nowhere you can read it back: IAM never shows a
   secret again, and Vercel doesn't return deleted values.
4. **Delete** the key:
   ```bash
   aws iam delete-access-key --user-name cambridgetcg-storefront-prod --access-key-id <AKIA…NWNC>
   ```
5. Optionally, once nothing else uses the user, detach its policies and
   delete `cambridgetcg-storefront-prod`. Check resource policies (2d)
   first, because deleting a principal leaves dangling grants.

---

## Rollback

- **Up to and including 5.2** (key deactivated at most, env vars still in
  Vercel): reactivate the key if it was deactivated
  (`aws iam update-access-key … --status Active`), remove `AWS_ROLE_ARN` from
  Production, and redeploy. The log line returns to
  `credentials=static-keys`. No secret is handled. An Instant Rollback to a
  deployment from before `AWS_ROLE_ARN` was set should also work, since env
  is bound per deployment [unverified]; the key must still be active for it.
- **After 5.3** (env vars removed, key not yet deleted, or deleted): the old
  secret can't be recovered. Create a new access key for the user (a new
  secret: store it the usual way and never in chat), set it as
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, remove `AWS_ROLE_ARN`,
  redeploy. Delete or deactivate the old key if it still exists.
- `AWS_OIDC_ALLOW_STATIC_FALLBACK` is **not** a rollback switch. The code
  refuses it whenever the process looks deployed (`VERCEL_ENV` other than
  `development`, a deployed `VERCEL_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, or
  the Vercel request context) and ignores it when a token source exists.
  Production carries `VERCEL_ENV=production` at runtime once system
  variables are exposed (1.4 checks it through the heartbeat), so the flag
  does nothing there.

---

## Unverified items (check during rollout)

- Which issuer mode the project uses today, and whether federation is
  already on. Settings weren't read for this change.
- That `VERCEL=1` is present at function runtime (documented; the heartbeat
  only proves `VERCEL_ENV`). If it is missing, the role path fails with a
  clear error, never the key.
- Whether the Preview and Development environments hold the `…NWNC` key
  today, and so what previews and local development can reach (2e, 2f).
- That the OIDC header is present in the every-minute cron invocation and in
  `after()` work. Expected, since both are function invocations, but not
  observed.
- The bucket names, SSE-KMS use, SES identities and sandbox status, and any
  resource policy naming the IAM user. Whether the auction bucket is
  public-read (it decides whether plain image URLs load; the role is not
  involved).
- Whether key `…NWNC` is used by anything besides the storefront.
- That enabling OIDC only affects new deployments, and the Instant Rollback
  env behaviour.
- A full `next build` on Vercel with the new dependency
  (`@vercel/oidc-aws-credentials-provider@3.3.9` → `@vercel/oidc@3.8.9`).
  The first deployment proves it.
- A real STS call. The role flow was tested only against a local fake STS
  (`packages/aws/src/role-sts.test.ts`); nothing has assumed the real role.
