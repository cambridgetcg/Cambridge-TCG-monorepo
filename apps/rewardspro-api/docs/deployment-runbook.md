# RewardsPro v2 deployment runbook

## Status and boundary

This runbook deploys the dark RewardsPro v2 API and worker foundation. It does
not move production traffic, change DNS, update Shopify application URLs or
webhook subscriptions, deploy a Shopify extension, or make v2 authoritative
for rewards data.

The deploy source is this monorepo. The protected path is
`.github/workflows/rewardspro-v2.yml`.

## Safety model

- Every pull request targeting `main`, and relevant pushes to `main`, run
  frozen-install, typecheck,
  build, a real migration against PostgreSQL 16, tests, API health probes, and
  a Docker build. The PR trigger is deliberately not path-filtered, so the
  required check is always reported instead of remaining pending on unrelated
  changes.
- An AWS deployment can run only on a relevant push to `main` when the
  repository variable `REWARDSPRO_V2_DEPLOY_ENABLED` is exactly `true`.
- The deploy job uses the protected `rewardspro-v2-production` GitHub
  environment. Configure required reviewers before enabling deployment.
- GitHub exchanges its OIDC identity for short-lived AWS credentials. Do not
  create GitHub secrets containing AWS access keys.
- Workflow actions are pinned to reviewed commit SHAs; update those pins as a
  reviewed dependency change rather than switching to mutable branch refs.
- ECR must enforce immutable tags. Each build is tagged with the Git commit
  SHA, resolved to an image digest, and task definitions use the digest.
- Images and ECS task definitions currently use the explicit `linux/amd64` /
  `X86_64` contract. A future Graviton change must update and validate both
  sides together.
- API, worker, and migration are separate ECS task definitions. Only the
  `migration` task may receive the RDS-admin secret. API and worker use
  separate least-privilege database login roles and secrets.
- Terraform owns distinct `*-template` task-definition families. On every
  deployment, CI reads each latest active, explicitly Terraform-tagged
  template and clones its complete roles, environment, limits, logging, and
  health configuration into a distinct CI-owned release family. The live
  service revision is used only as a rollback pointer, never as a release
  template.
- The migration task combines the RDS-managed secret's credentials with
  non-secret `DB_HOST`, `DB_PORT`, and `DB_NAME` values from Terraform. CI
  preserves that task configuration and changes only the `migration` image.
- Only while Terraform is in first-bootstrap mode, that task also receives the
  API/worker database placeholder ARNs and narrowly scoped permission to
  describe, read, and put their versions. Activation removes those environment
  values and permissions.
- The workflow reads the API service's existing `awsvpc` configuration for the
  one-off migration. It does not accept copied subnet or security-group
  variables that can drift from the service.
- Before migration, API and worker must both be completed/running at desired
  capacity or both be truly zero-capacity bootstrap. A partial bootstrap,
  external in-progress rollout, or unhealthy baseline fails closed.
- A migration must exit zero before either service changes.
- Database `RunTask` calls use phase-specific tokens containing both
  `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`. Transport retries within one
  attempt therefore return the original ECS task, while a deliberate workflow
  rerun starts a new checksum/no-op task. A discoverable unreconciled task
  receives a best-effort scoped stop request before failure; the operator still
  verifies that it stopped.
- At active capacity, deployment succeeds only after
  `node dist/worker-probe.js` publishes one typed probe message and a live
  worker deletes it from SQS and persists its acknowledgement in PostgreSQL. A
  timeout or nonzero probe exit rolls both services back.

GitHub documents the OIDC and protected-environment pattern in
[Configuring OpenID Connect in Amazon Web Services][github-oidc].

## GitHub configuration

Verify the existing `rewardspro-v2-production` environment remains restricted
to `main` and requires human approval. Prevent approval bypass where the
repository's governance permits it. Make
`Validate API, migrations, and image` a required `main` branch check so
changes to the v2 paths cannot merge around this workflow.

The environment was created on 2026-07-23 with a `main`-only deployment policy
and required approval by `cambridgetcg`. Because that is currently the only
eligible collaborator, self-review remains allowed and administrators can
bypass protection. Add a distinct eligible reviewer, enable
`prevent_self_review`, disable admin bypass, and protect `main` with the
workflow's validation check before production activation. Terraform also
constrains AWS OIDC to the immutable repository/owner IDs, `refs/heads/main`,
and the `RewardsPro v2` workflow name, so a same-named environment referenced
from another branch cannot assume the role.

Configure these names. Keep their values in GitHub settings and operator
records, not in this repository.

### Repository variable

- `REWARDSPRO_V2_DEPLOY_ENABLED`

This must be a repository variable because the job gate is evaluated before
the protected environment is entered. Leave it unset or non-`true` except for
an approved staging or deployment window.

### `rewardspro-v2-production` environment variables

- `REWARDSPRO_V2_API_SERVICE`
- `REWARDSPRO_V2_API_TASK_FAMILY`
- `REWARDSPRO_V2_API_TASK_TEMPLATE_FAMILY`
- `REWARDSPRO_V2_AWS_REGION`
- `REWARDSPRO_V2_AWS_ROLE_ARN`
- `REWARDSPRO_V2_ECR_REPOSITORY`
- `REWARDSPRO_V2_ECS_CLUSTER`
- `REWARDSPRO_V2_MIGRATION_TASK_FAMILY`
- `REWARDSPRO_V2_MIGRATION_TASK_TEMPLATE_FAMILY`
- `REWARDSPRO_V2_PUBLIC_BASE_URL`
- `REWARDSPRO_V2_WORKER_SERVICE`
- `REWARDSPRO_V2_WORKER_TASK_FAMILY`
- `REWARDSPRO_V2_WORKER_TASK_TEMPLATE_FAMILY`

Map them from these reviewed Terraform outputs:

| GitHub variable                                | Terraform output                            |
| ---------------------------------------------- | ------------------------------------------- |
| `REWARDSPRO_V2_API_SERVICE`                    | `api_service_name`                          |
| `REWARDSPRO_V2_API_TASK_FAMILY`                | `api_task_definition_family`                |
| `REWARDSPRO_V2_API_TASK_TEMPLATE_FAMILY`       | `api_task_definition_template_family`       |
| `REWARDSPRO_V2_AWS_REGION`                     | `aws_region`                                |
| `REWARDSPRO_V2_AWS_ROLE_ARN`                   | `github_deploy_role_arn`                    |
| `REWARDSPRO_V2_ECR_REPOSITORY`                 | `ecr_repository_name`                       |
| `REWARDSPRO_V2_ECS_CLUSTER`                    | `ecs_cluster_name`                          |
| `REWARDSPRO_V2_MIGRATION_TASK_FAMILY`          | `migration_task_definition_family`          |
| `REWARDSPRO_V2_MIGRATION_TASK_TEMPLATE_FAMILY` | `migration_task_definition_template_family` |
| `REWARDSPRO_V2_PUBLIC_BASE_URL`                | `api_base_url`                              |
| `REWARDSPRO_V2_WORKER_SERVICE`                 | `worker_service_name`                       |
| `REWARDSPRO_V2_WORKER_TASK_FAMILY`             | `worker_task_definition_family`             |
| `REWARDSPRO_V2_WORKER_TASK_TEMPLATE_FAMILY`    | `worker_task_definition_template_family`    |

The Terraform outputs `private_app_subnet_ids` and
`ecs_security_group_id` are useful for infrastructure review, but deliberately
are not duplicated into GitHub variables.

`api_base_url` is valid for production only after Terraform receives both the
reviewed `public_hostname` and ACM `certificate_arn`. The operator must create
and verify the DNS alias using `alb_dns_name` and `alb_zone_id`; Terraform
deliberately does not issue the certificate or manage that public DNS record.
Never construct an HTTPS URL from the raw AWS ALB hostname: ACM cannot
authenticate a hostname the application does not control. The workflow rejects
non-HTTPS production base URLs.

### Required `rewardspro-v2-production` environment secret

- `REWARDSPRO_V2_OPERATOR_TOKEN`

The workflow checks authenticated readiness after liveness. This secret must
represent the same operator token provisioned for the running API. The
workflow never prints it and fails closed when it is absent.

No other GitHub secret is required by this workflow.

## First bootstrap

Bootstrap separates creating AWS resources from starting code whose
least-privilege database credential does not exist yet.

1. Request and DNS-validate the reviewed public hostname's ACM certificate in
   the target AWS account and region. Require `ISSUED` status, retain its exact
   ARN, and do not create the ALB alias yet. Production Terraform guardrails
   require both `certificate_arn` and `public_hostname` on the first plan.
2. In `apps/rewardspro-api/infrastructure/terraform`, initialize Terraform and
   apply the reviewed environment with that certificate and
   `bootstrap_mode=true`. This is a one-shot first-creation mode; it must not be
   used as a drain control for an already active environment.
3. Confirm that API and worker services exist with zero desired/minimum
   capacity, the three Terraform `*-template` families exist and carry the
   required ownership tags, ECR is immutable, and the RDS managed admin secret
   exists.
4. Prove the dark RDS target is a fresh baseline before its first migration:
   it must contain neither legacy RewardsPro tables nor unnamespaced
   `rp_schema_migration` rows. Retain that query evidence with the release.
   The migration entrypoint also checks this condition before applying the
   pinned YUTABASE SQL and fails closed on disagreement.
5. Create the DNS alias to the Terraform ALB outputs and confirm the resulting
   `api_base_url` is HTTPS. This establishes the health-probe destination; it
   does not move Shopify traffic.
6. Populate the Shopify and operator secrets required by the API. Do not put
   their values in Terraform plans, shell history, CI logs, or this repository.
7. Configure the GitHub environment above. Temporarily set
   `REWARDSPRO_V2_DEPLOY_ENABLED` to `true`, then run the protected workflow
   for an approved `main` commit.
8. In bootstrap mode the workflow:
   - pushes the immutable SHA image;
   - clones the latest Terraform migration template into the release family;
   - registers and runs the dedicated migration task with an attempt-aware,
     idempotent ECS client token;
   - verifies its exit code;
   - revalidates unchanged zero capacity, then runs the same digest-pinned task
     with `node dist/bootstrap-database-roles.js`;
   - creates or reuses the bootstrap-owned API and worker database secrets,
     converges their exact least-privilege PostgreSQL roles, and verifies both
     real runtime connections;
   - revalidates unchanged zero capacity again;
   - clones the latest Terraform API and worker templates into digest-pinned
     release revisions;
   - updates both zero-capacity service pointers to those revisions;
   - verifies desired, running, and pending counts remain zero, then stops
     without changing capacity or claiming worker/API health.
9. While `bootstrap_mode=true` and the gate remains open, approve a deliberate
   rerun of the same commit. Require `existingCount=5` from migration,
   `reusedSecretVersions=["api","worker"]` from role bootstrap, no new secret
   versions, and unchanged zero-capacity service pointers.
10. Set `REWARDSPRO_V2_DEPLOY_ENABLED` back to a non-`true` value and retain
    both workflow runs. Verify each runtime task reads only its own connection,
    neither runtime AWS task role can read the RDS-admin secret, and the
    migration task never assumes the API or worker AWS task role. Do not
    activate if either database secret is absent. After activation removes the
    bootstrap permission, the migration task must not be able to read either
    runtime database secret.
11. Prepare a saved Terraform plan with `bootstrap_mode=false`, review its
    resource changes, and apply that exact plan. The Terraform service lifecycle
    preserves the digest task revisions staged by CI; Application Auto Scaling
    raises capacity to the configured minima.
12. Re-enable the repository gate for a short approved window and rerun the
    protected workflow for the same commit. It reuses the immutable SHA image,
    executes the idempotent migration runner, updates both services, waits for
    stability, proves the worker's queue-to-database path, and probes API
    health.
13. Disable the repository gate again and retain the workflow and Terraform
    plan records with the release evidence.

Do not make service capacity nonzero until both runtime DB secrets have tested,
least-privilege values. Do not make the first workflow change capacity to work
around bootstrap mode.

## Normal deployment

For every release:

1. Confirm the database migration is backward-compatible with the currently
   running API and worker. The workflow may apply schema before new tasks
   become healthy, and service rollback does not migrate a database down.
2. Merge only after the validation job is green.
3. Open a deployment record containing the commit, migration identifiers,
   expected health result, rollback task revisions, and approver.
4. Set `REWARDSPRO_V2_DEPLOY_ENABLED` to `true` for the approved window.
5. Push the relevant commit to `main` or rerun its relevant workflow.
6. Review the protected-environment request. Confirm it names the intended
   commit and no unrelated infrastructure or Shopify cutover is included.
7. Approve. The job will:
   - build the repository-root Docker context;
   - push/reuse the immutable SHA tag and resolve its digest;
   - retain current service task definitions only as rollback pointers and
     read the API network configuration;
   - read the latest Terraform-tagged migration template, copy its full
     configuration into the release family, and replace only the named
     container image;
   - run `node dist/migrate.js` through an ECS client token stable within the
     current attempt and distinct on deliberate GitHub reruns, then require
     exit code zero;
   - likewise clone the latest Terraform API and worker templates into their
     release families, replacing only the correctly named container image;
   - update both services and wait for ECS stability;
   - re-read both services and require the exact new task revisions, completed
     primary rollouts, and running count equal to desired count (a
     circuit-breaker rollback to an old healthy revision is not success);
   - run `node dist/worker-probe.js` under the worker task role and require a
     live worker to delete its typed SQS message and persist a PostgreSQL
     acknowledgement;
   - require `GET /health/live` to succeed;
   - require exact-Bearer `GET /health/ready`.
8. Return `REWARDSPRO_V2_DEPLOY_ENABLED` to a non-`true` value.
9. Record the workflow result, ECS deployment result, migration ledger state,
   and application observations. Do not copy database URLs, tokens, payloads,
   account IDs, ARNs, subnet IDs, or security-group IDs into the record.

## Failure and rollback

| Failure point                                                            | Expected behavior                                                                                                                                                                                           | Operator response                                                                                                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation, image build, or ECR push                                     | No task or service changes                                                                                                                                                                                  | Fix the commit or environment and rerun                                                                                                                                      |
| Migration start, ambiguous response, timeout, or nonzero exit            | API and worker remain on their prior task definitions; client-token retries within the attempt cannot duplicate the task, and an unreconciled running task or waiter timeout receives a scoped stop request | Inspect the migration task's restricted CloudWatch log and confirm it stopped; a deliberate rerun starts a new checksum/no-op task                                           |
| Manual cancellation or job timeout while a database task is running      | Service pointers remain unchanged, but the current database task can continue after the runner exits                                                                                                        | Derive the phase-specific `startedBy` marker from the run ID and attempt, list and stop only that exact task, wait for `STOPPED`, then inspect its restricted CloudWatch log |
| Initial database role bootstrap fails                                    | Both services and their task pointers remain unchanged at zero. Any bootstrap-owned secret version already written is retained for convergent retry; it is never printed or rolled back automatically       | Keep `bootstrap_mode=true`, inspect the sanitized task log, resolve the failed invariant, and rerun the same approved commit                                                 |
| Task-definition derivation                                               | Services remain unchanged                                                                                                                                                                                   | Correct template-family variables, ownership tags, or Terraform drift; never clone a live service revision or weaken the exact-one-container check                           |
| Zero-capacity pointer staging                                            | Capacity remains zero; a partial pointer change requests both prior task definitions before failing                                                                                                         | Verify both service pointers and all three capacity counts before activation                                                                                                 |
| ECS update, stability wait, worker end-to-end probe, or API health probe | Workflow requests both touched services return to their prior task definitions and waits best-effort for stability                                                                                          | Verify the rollback in ECS; if it did not stabilize, restore the recorded revisions manually. An expired probe row is removed by a later probe                               |

Automatic rollback covers service task definitions only. It cannot safely undo
SQL. Every production migration must therefore be additive or otherwise
compatible with both the old and new binaries. A destructive schema change
requires a separate expand/backfill/contract sequence over multiple releases.

If readiness returns `503`, liveness can still be healthy. Treat that as an
unready deployment, not proof that the process is dead and not permission to
bypass the readiness gate. Check RDS connectivity, secret versions, TLS,
schema state, and the restricted task logs without printing their values.

Never delete the prior task revision or immutable image during the rollback
window. Never repoint Shopify or DNS as part of a service rollback.

## What this workflow intentionally does not do

- It does not run `terraform apply`.
- It does not change desired count during bootstrap.
- It does not alter an RDS parameter group. Only the explicitly gated
  zero-capacity bootstrap writes the two runtime database secrets and converges
  their roles; normal deployments do neither.
- It does not register Shopify webhooks, deploy Shopify configuration or
  extensions, or change the public Shopify app URL.
- It does not migrate legacy Aurora data.
- It does not perform production traffic or database cutover.

Database movement and authority transfer follow
[the database migration and cutover runbook](./database-migration-cutover.md).

[github-oidc]: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
