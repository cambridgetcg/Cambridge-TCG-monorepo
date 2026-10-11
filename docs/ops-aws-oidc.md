# Storefront AWS access: Vercel OIDC → IAM role

This runbook moves `cambridgetcg-storefront` off the long-lived IAM user
`cambridgetcg-storefront-prod` (access key `…NWNC`) and onto short-lived
role credentials. Vercel signs an OIDC token for each function invocation;
AWS STS swaps it for one-hour credentials for the role
`vercel-cambridgetcg-storefront`. No AWS secret is stored in Vercel.

Written 2026-10-12. Every step here is an **owner action**: AWS console/CLI
with an admin identity, and Vercel project settings. The code change only
selects the role when `AWS_ROLE_ARN` is set, so merging it changes nothing
until step 3.

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
| 2 | `AWS_ROLE_ARN` is unset (or the opt-in below) | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `… (credentials=static-keys, …)` |
| 3 | Neither | none; the client factory returns `null` | `[packages/aws] S3 unavailable: …` |

An **OIDC token source** is one of these:

- a Vercel deployment: `VERCEL=1` and `VERCEL_ENV` is not `development`. The
  token comes in on each request as the `x-vercel-oidc-token` header.
- a `VERCEL_OIDC_TOKEN` env var, which `vercel env pull` writes for local
  development.

**Choice made:** if `AWS_ROLE_ARN` is set and there is no token source, the
config is an error. The code does **not** quietly fall back to static keys.
That keeps a misconfigured runtime from using long-lived keys while everyone
believes they are gone. The one way around it is `AWS_OIDC_ALLOW_STATIC_FALLBACK=1`,
which uses the static keys and logs a value-free notice. Don't set it in
Vercel. It exists for odd local setups.

Other properties:

- **Static keys are ignored on the role path.** Vercel may inject `AWS_*`
  variables into functions that are not usable credentials [doc: reserved env
  vars], so the role path never reads them.
- **The provider is lazy.** A missing token or a trust-policy mismatch fails
  on the first S3/SES request, not at startup. SES failures come back as
  `sendMail` error results. S3 failures throw from the helper.
- **Role credentials refresh 15 minutes early**
  (`ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS`). A presigned URL signed with
  role credentials dies when the role session ends, whatever its `expiresIn`
  says [doc: S3 presigned URLs]. The early refresh keeps at least 15 minutes
  of session at signing time. The storefront signs 300–600 s URLs.
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

### 2b. Role `vercel-cambridgetcg-storefront`

Save this trust policy as `trust.json`. Replace `<ACCOUNT_ID>`; everything
else is literal. It allows only the storefront project's `production` and
`preview` environments, and only tokens with the team audience. It does not
allow `development`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VercelCambridgeTcgStorefront",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.vercel.com/cambridgetcgs-projects"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/cambridgetcgs-projects:aud": "https://vercel.com/cambridgetcgs-projects",
          "oidc.vercel.com/cambridgetcgs-projects:sub": [
            "owner:cambridgetcgs-projects:project:cambridgetcg-storefront:environment:production",
            "owner:cambridgetcgs-projects:project:cambridgetcg-storefront:environment:preview"
          ]
        }
      }
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name vercel-cambridgetcg-storefront \
  --description "cambridgetcg-storefront on Vercel (OIDC, production + preview)" \
  --max-session-duration 3600 \
  --assume-role-policy-document file://trust.json
```

**Preview gets production's access.** Preview deployments run code from any
branch, so with this policy they can reach the same buckets and SES identity
as production. A tighter follow-up is a second role (for example
`vercel-cambridgetcg-storefront-preview`) that trusts only the `preview`
`sub` and grants preview-only buckets or prefixes, with `AWS_ROLE_ARN` set per
environment.

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
| `lib/auction/s3.ts` `getPresignedUploadUrl` | `AUCTION_S3_BUCKET` | PutObject (presigned) | `s3:PutObject` |
| `lib/auction/s3.ts` `getPresignedReadUrl` | `AUCTION_S3_BUCKET` | GetObject (presigned) | `s3:GetObject` |
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

Save as `storefront-least-privilege.json` and fill in the placeholders:

- `<AUCTION_S3_BUCKET>` / `<VERIFICATION_S3_BUCKET>`: the storefront's values
  of those env vars. The auction bucket's in-code default is
  `cambridgetcg-auction-images`; the verification bucket has no default.
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
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
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

---

## 3. Vercel: set `AWS_ROLE_ARN`

Set it on **Production** and **Preview** of `cambridgetcg-storefront`.
**Not** Development. With it unset there, `vercel env pull` gives local dev
no role, and dev keeps using whatever static keys it has.

```
AWS_ROLE_ARN = arn:aws:iam::<ACCOUNT_ID>:role/vercel-cambridgetcg-storefront
```

Use the dashboard (Settings → Environment Variables), or run
`vercel env add AWS_ROLE_ARN production` and then
`vercel env add AWS_ROLE_ARN preview` from the linked storefront directory.
The CLI prompts for the value. The ARN is not a secret, but keep it out of
chat logs anyway, because it contains the account ID.

**Leave `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in place for now.**
They are ignored while the role path is active, and they make rollback a
one-variable change. Keep `AWS_REGION` (`us-east-1`) set: otherwise Vercel
sets `AWS_REGION` to the function's execution region [doc].

---

## 4. Deploy and verify

Env changes and the OIDC toggle only take effect on a **new deployment**.
Don't redeploy production in the middle of another credential rotation,
because a build would pick up a half-rotated environment.

1. **Preview first.** Deploy a preview of the branch carrying this code
   (or any later `main` build), with `AWS_ROLE_ARN` set on Preview.
2. **Function logs** (Vercel → Deployment → Logs, or `vercel logs <url>`):
   after the first S3 or SES use on an instance, look for
   - `[packages/aws] S3 client ready (credentials=vercel-oidc-role, region=us-east-1)`
   - `[packages/aws] SES client ready (credentials=vercel-oidc-role, region=us-east-1)`

   `credentials=static-keys` means `AWS_ROLE_ARN` didn't reach the
   deployment. `AWS_ROLE_ARN is set but no Vercel OIDC token is available`
   means `VERCEL`/`VERCEL_ENV` are missing at runtime (see 1.4).
3. **Exercise both services:**
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
4. **CloudTrail** (us-east-1 → Event history → Event name =
   `AssumeRoleWithWebIdentity`), or:

   ```bash
   aws cloudtrail lookup-events --region us-east-1 \
     --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity \
     --max-results 20
   ```

   Expect `requestParameters.roleSessionName` =
   `cambridgetcg-production` or `cambridgetcg-preview`, the role ARN above,
   and a web-identity user from `oidc.vercel.com/cambridgetcgs-projects`.
   Expect about one call per warm instance per client (S3 and SES) every
   ~40 minutes. IAM → Roles → `vercel-cambridgetcg-storefront` → "Last
   activity" should also move.
5. Promote to **production** and repeat steps 2–4 there, including one cron
   cycle (the verification-storage sweep runs in it).
6. **The old key goes quiet:**

   ```bash
   aws iam list-access-keys --user-name cambridgetcg-storefront-prod        # find the …NWNC key ID
   aws iam get-access-key-last-used --access-key-id <AKIA…NWNC>
   ```

   `LastUsedDate` must stop advancing after the production cut-over. If it
   keeps moving, something else still uses the key: another Vercel project,
   a local script such as `apps/storefront/scripts/*`, or a preview without
   the role. Find it via CloudTrail `userIdentity.accessKeyId` before going
   further.

---

## 5. Retire the static key

Only after step 4 is clean in production:

1. Remove `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the
   storefront (all environments where they exist). Redeploy, then re-check
   the log line and one SES and one S3 action.
2. Deactivate the key, without deleting it yet:
   ```bash
   aws iam update-access-key --user-name cambridgetcg-storefront-prod \
     --access-key-id <AKIA…NWNC> --status Inactive
   ```
3. **Wait** (for example 7 days, covering a full cron/email cycle and a
   weekend). Watch for `InvalidClientTokenId` / `The security token
   included in the request is invalid` from anything that still held the
   key.
4. Delete it:
   ```bash
   aws iam delete-access-key --user-name cambridgetcg-storefront-prod --access-key-id <AKIA…NWNC>
   ```
5. Optionally, once nothing else uses the user, detach its policies and
   delete `cambridgetcg-storefront-prod`. Check resource policies (2d)
   first, because deleting a principal leaves dangling grants.

---

## Rollback

- **Before the key is deleted** (steps 3–5.3): remove `AWS_ROLE_ARN` from the
  storefront. If the static keys were already removed, restore them from the
  still-existing key, reactivating it with `--status Active` if it was
  deactivated. Then redeploy, and the log line returns to
  `credentials=static-keys`. An Instant Rollback to a deployment from before
  `AWS_ROLE_ARN` was set should also work, since env is bound per deployment
  [unverified].
- **After the key is deleted:** create a new access key for the user (that
  is a new secret, so store it the usual way and never in chat), set it as
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, remove `AWS_ROLE_ARN`,
  redeploy.
- `AWS_OIDC_ALLOW_STATIC_FALLBACK` is **not** a rollback switch. It only
  matters when there is no token source, which is never the case on a Vercel
  deployment.

---

## Unverified items (check during rollout)

- Which issuer mode the project uses today, and whether federation is
  already on. Settings weren't read for this change.
- That `VERCEL=1` is present at function runtime (documented; the heartbeat
  only proves `VERCEL_ENV`).
- That the OIDC header is present in the every-minute cron invocation and in
  `after()` work. Expected, since both are function invocations, but not
  observed.
- The bucket names, SSE-KMS use, SES identities and sandbox status, and any
  resource policy naming the IAM user.
- Whether key `…NWNC` is used by anything besides the storefront.
- That enabling OIDC only affects new deployments, and the Instant Rollback
  env behaviour.
- A full `next build` on Vercel with the new dependency
  (`@vercel/oidc-aws-credentials-provider@3.3.9` → `@vercel/oidc@3.8.9`).
  The first preview deployment proves it.
