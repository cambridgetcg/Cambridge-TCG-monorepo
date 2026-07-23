# RewardsPro API AWS infrastructure

This stack defines a production-shaped AWS deployment for the new RewardsPro
API. It creates no resources until an operator reviews a plan and runs
`terraform apply`.

## Architecture

- A dedicated VPC spans two availability zones.
- A public Application Load Balancer occupies public subnets.
- API, worker, and one-off migration tasks run on ECS Fargate in private
  application subnets with no public IPs.
- PostgreSQL 16 runs in isolated database subnets. It is always encrypted,
  Multi-AZ, deletion-protected, backed up for point-in-time recovery, and
  configured with `rds.force_ssl=1`.
- One standard SQS queue redrives poison messages to an encrypted DLQ.
  EventBridge Scheduler can enqueue only the worker's validated
  `flush_outbox` command.
- ECR uses immutable tags, encryption, and scan-on-push. Automatic deletion is
  intentionally disabled until retention can protect every promoted and
  rollback image.
- CloudWatch receives container logs, PostgreSQL logs, VPC flow logs, Container
  Insights, and operational alarms.
- Application Auto Scaling tracks API CPU and memory and worker queue depth.
- GitHub Actions assumes a repository-and-environment-scoped OIDC role; there
  are no long-lived AWS deployment keys.

The only public entry point is the ALB. RDS has no internet route, and its
security group accepts PostgreSQL only from the Fargate task security group.

## Non-goals and ownership boundaries

This stack deliberately does not:

- issue an ACM certificate or create public DNS records;
- create the S3 state bucket or DynamoDB state-lock table inside the state they
  protect;
- write any secret value into Terraform state;
- create the least-privilege PostgreSQL runtime role;
- deploy the first container image; or
- choose or roll out live application release revisions.

Those boundaries avoid circular bootstrap dependencies and keep secret values
out of plans. Terraform owns API, worker, and migration `*-template`
task-definition families as part of the service/network/IAM envelope. The
deployment workflow clones the latest active Terraform template into a
separate CI-owned release family, changes only the named container image to an
immutable digest, and chooses the live release revision. A deployment never
clones the service's current revision, so Terraform changes to environment,
roles, limits, logging, or health configuration cannot be silently dropped.

## Prerequisites

- Terraform `>= 1.5.7`
- AWS credentials authorized to plan/apply this stack
- an ACM certificate in the target region and a DNS hostname for production
- control of DNS so that hostname can alias the ALB
- the GitHub repository Environment `rewardspro-v2-production`

The default region is `eu-west-2`.

## 1. Bootstrap remote state

Create the backend separately before initializing this directory:

1. A dedicated S3 bucket with public access blocked, versioning enabled,
   encryption enabled, and restrictive bucket policy.
2. A DynamoDB table with a string partition key named `LockID`, encryption,
   point-in-time recovery, and deletion protection appropriate to the account.

Keep this state infrastructure outside the application stack so destroying or
recovering the application cannot delete its own history.

Create an ignored local `backend.hcl`:

```hcl
bucket         = "<state-bucket>"
key            = "rewardspro-api/<environment>/terraform.tfstate"
region         = "eu-west-2"
dynamodb_table = "<state-lock-table>"
```

Then initialize:

```sh
terraform init -reconfigure -backend-config=backend.hcl
```

The committed `backend "s3"` block is intentionally partial. Do not commit
`backend.hcl`, state, plans, credentials, account IDs, or bucket/table names.

## 2. Choose GitHub OIDC ownership

Exactly one OIDC mode must be selected:

- Existing account provider: leave `create_github_oidc_provider=false` and set
  `github_oidc_provider_arn`.
- First account bootstrap: set `create_github_oidc_provider=true` and leave
  `github_oidc_provider_arn=null`.

The provider is account-global. Never set creation to true when another stack
already owns `token.actions.githubusercontent.com`. If this stack creates it,
leave it managed here or deliberately move it with Terraform state operations;
do not recreate it ad hoc.

The deployment role trusts only the checked-in repository, its immutable
repository and owner IDs, the `main` ref, the `RewardsPro v2` workflow name,
and this environment subject:

```text
repo:cambridgetcg/Cambridge-TCG-monorepo:environment:rewardspro-v2-production
```

Production validation rejects a different GitHub Environment, because it would
not match the checked-in workflow. The explicit `ref=refs/heads/main` OIDC
condition also prevents a workflow on another branch from reaching the role,
even if that branch references an unprotected environment with the same name.
Still configure the GitHub Environment's own protected-branch and reviewer
rules: OIDC protects AWS credentials, while the Environment supplies the human
deployment gate.

## 3. Plan the zero-capacity bootstrap

Start from `terraform.tfvars.example`. It intentionally contains no AWS
identifiers, hostname, or secret material. Keep environment-specific values in
an ignored file or an approved secret/configuration system.

For production, the plan will fail unless:

- `nat_gateway_count >= 2`;
- `certificate_arn` is set;
- `public_hostname` is set;
- the RDS backup window is at least seven days; and
- active capacity is at least two API tasks and one worker task.

Use `bootstrap_mode=true` for the first apply. In this mode both services and
their autoscaling minima are zero, and target-tracking policies do not exist.
An SQS backlog therefore cannot start an unconfigured worker.

This is a one-shot creation control, not a drain switch. After activation,
setting `bootstrap_mode=true` again does not scale a running service back to
zero because Terraform intentionally ignores service desired-count drift.
Use an explicit, reviewed service-drain procedure if the active stack must be
stopped.

Review without saving a plan outside the ignored Terraform directory:

```sh
terraform fmt -check -recursive
terraform validate
terraform plan -var-file="<environment>.tfvars" -out=".terraform/bootstrap.tfplan"
terraform show ".terraform/bootstrap.tfplan"
```

Only after review:

```sh
terraform apply ".terraform/bootstrap.tfplan"
```

Do not use `-auto-approve` for the first production apply.

## 4. DNS and TLS

This stack accepts an existing regional ACM `certificate_arn`; it cannot know
the certificate's validation/ownership lifecycle. Set `public_hostname` to the
hostname covered by that certificate.

After the bootstrap apply, create a DNS alias using:

- `alb_dns_name`
- `alb_zone_id`

`api_base_url` becomes `https://<public_hostname>` when a certificate is
configured. The raw AWS-generated ALB hostname is exposed separately for
diagnostics and is never claimed to be a valid HTTPS origin.

Production has an HTTP-to-HTTPS redirect and a TLS 1.2/1.3 listener. HTTP-only
forwarding is permitted only outside production.

## 5. First image and database bootstrap

Terraform registers three ownership-tagged `*-template` task-definition
families using the ECR `bootstrap_image_tag`, but bootstrap services stay at
zero. The deployment workflow then:

1. builds explicitly for `linux/amd64`;
2. pushes an immutable commit-SHA image to `ecr_repository_url`;
3. clones the latest Terraform migration template into its CI release family,
   runs `node dist/migrate.js` with an idempotent ECS client token, and requires
   exit zero;
4. clones the latest Terraform API and worker templates into their CI release
   families using the same image digest;
5. updates the zero-count API and worker service `taskDefinition` pointers to
   those digest revisions without raising desired capacity;
6. verifies desired, running, and pending counts all remain zero; and
7. exits successfully without API or worker probes while service desired counts are
   zero.

Stable containers and commands are:

| Container | Command |
| --- | --- |
| `api` | `node dist/main.js` |
| `worker` | `node dist/worker.js` |
| worker deployment probe | `node dist/worker-probe.js` |
| `migration` | `node dist/migrate.js` |

The API listens on port `3000`. The ALB checks `/health/live`; authenticated
operational readiness remains `/health/ready`.

### Database privilege separation

RDS generates and owns the administrative master secret. Only the migration
task role may read it. The API and worker cannot read it. Because an
RDS-managed secret does not reliably carry connection location/database
fields, the migration task also receives non-secret `DB_HOST`, `DB_PORT`, and
`DB_NAME` values directly from the RDS resource.

Before activation, use a controlled one-off database client inside the VPC to:

1. authenticate with the RDS-managed master secret;
2. create a distinct login role such as `rewardspro_app` with a generated
   password and no superuser, role-creation, or database-creation capability;
3. grant only `CONNECT` on the application database, `USAGE` on its schema,
   required table DML, and required sequence usage;
4. set equivalent default privileges for future tables/sequences created by
   the migration owner; and
5. put the runtime connection into `application_database_secret_arn`.

Use parameterized client variables or a secure secret handoff; never paste the
runtime password into Terraform, SQL history, shell history, a plan, or Git.
The application database secret accepts a PostgreSQL URL or JSON shaped like:

```json
{
  "host": "<private-rds-host>",
  "port": 5432,
  "dbname": "rewardspro",
  "username": "rewardspro_app",
  "password": "<generated-out-of-band>"
}
```

All three task types use `sslmode=verify-full` and the reviewed regional RDS
root bundle packaged at `/app/certs/eu-west-2-bundle.pem`. Terraform passes
that path as `DB_SSL_ROOT_CERT`; an RDS connection fails configuration rather
than silently weakening certificate verification when the path is absent.

### Runtime secrets

Terraform creates placeholders but intentionally creates no secret versions:

- `application_database_secret_arn`
- `shopify_api_secret_arn`
- `operator_token_secret_arn`

Populate all three through an approved secret-management channel before
activation. The Shopify and operator secrets can be raw strings or the JSON
shapes accepted by the application. The API role can read those three runtime
secrets. The worker can read only the application database secret.

The API still receives `SQS_QUEUE_URL` as a non-secret dispatch-mode marker,
but its IAM role has no SQS actions. It commits incoming events as pending.
The worker alone may publish pending outbox events and consume queue messages;
Scheduler alone may publish the periodic flush command.

Missing or empty secret versions prevent the processes from starting, so
production cannot become healthy until this step is complete.

### Worker health contract

The worker checks PostgreSQL and `sqs:GetQueueAttributes` before entering its
loop, and exits after its configured bound of consecutive queue/database loop
failures so ECS can replace it. Active deployments also run the bounded
`node dist/worker-probe.js` one-off task under the worker role. That probe
creates only an expiring probe row and one typed queue message; success
requires a live worker to delete the message and persist the acknowledgement,
and later probes remove the row after expiry. Keeping the acknowledged row
through its short lifetime makes delayed at-least-once SQS delivery
idempotently recognizable.

The probe is deliberately not an ECS container health check. Running it on
every task interval would create continuous queue/database writes, and another
worker could acknowledge the message without proving the particular container
healthy. Process exit plus ECS replacement covers per-container failure; the
deployment-only probe covers the fleet's IAM, queue, and database path.

## 6. Activate production capacity

Keep scheduler entries disabled through bootstrap so commands do not
accumulate. After the migration succeeds, the runtime database role exists,
all three runtime secret versions are populated, DNS resolves, and the new task
revisions are registered, enable schedules and plan. Before doing so, verify
that each zero-count ECS service already points at its expected digest task
revision; merely registering a newer family revision is not sufficient.

```sh
terraform plan \
  -var-file="<environment>.tfvars" \
  -var="bootstrap_mode=false" \
  -out=".terraform/activate.tfplan"
terraform show ".terraform/activate.tfplan"
terraform apply ".terraform/activate.tfplan"
```

ECS services ignore Terraform drift for `task_definition` and
`desired_count`. That is intentional: Terraform keeps producing reviewed
template revisions, CI produces immutable release revisions from the latest
templates, and Application Auto Scaling owns live capacity. Activation changes
autoscaling minima from zero, so it starts the CI-staged digest revision rather
than rolling back to Terraform's template image.

Verify:

- API tasks span both private application subnets;
- the running API and worker task-definition ARNs match the digest revisions
  staged during bootstrap;
- ALB targets are healthy;
- `/health/live` succeeds on `api_base_url`;
- authenticated `/health/ready` succeeds;
- `node dist/worker-probe.js` publishes a typed SQS probe that a live worker
  deletes before persisting its PostgreSQL acknowledgement;
- migration/API/worker logs arrive in CloudWatch; and
- the five-minute oldest-message and DLQ alarms are clear.

## Deployment output contract

The workflow consumes these stable outputs:

- `aws_region`
- `github_deploy_role_arn`
- `ecr_repository_name` / `ecr_repository_url`
- `ecs_cluster_name`
- `api_service_name` / `worker_service_name`
- `api_task_definition_template_family` /
  `worker_task_definition_template_family` /
  `migration_task_definition_template_family`
- `api_task_definition_template_arn` /
  `worker_task_definition_template_arn` /
  `migration_task_definition_template_arn`
- `api_task_definition_family`
- `worker_task_definition_family`
- `migration_task_definition_family`
- `api_base_url`

Network outputs are available for auditing and break-glass use, but migration
automation should read the API service's live `awsvpc` configuration to avoid
copying subnet/security-group values into GitHub.

## Security notes

- Secrets Manager values are populated outside Terraform, so plaintext does
  not enter state.
- API/worker roles never receive RDS master-secret permission.
- Security groups permit task egress only to PostgreSQL, HTTPS, and VPC DNS.
- SQS resource policies deny non-TLS requests.
- GitHub OIDC trust binds audience, repository, and exact Environment.
- The deploy role can push only to this ECR repository, update only these ECS
  services, run only the migration and worker release families on this
  cluster, and pass only this stack's task roles.
- RDS deletion protection is always enabled and final snapshots are required.
  Destruction therefore needs a deliberate reviewed code change. Choose a
  unique final snapshot identifier if a prior one exists.
- Alarms have no notification destination until `alarm_action_arns` contains
  approved SNS topic ARNs.

This baseline does not include WAF, Shield Advanced, GuardDuty configuration,
ALB access-log storage, customer-managed KMS keys, or cross-region disaster
recovery. Evaluate those controls before materially increasing exposure or
compliance scope.

## Cost notes

The main fixed costs are a Multi-AZ RDS instance, one or two NAT gateways, the
ALB, and continuously running Fargate capacity after activation. NAT data
processing, CloudWatch ingestion/retention, RDS storage/backups, and image
storage add usage costs.

The stack intentionally keeps Multi-AZ RDS, deletion protection, encryption,
and backups enabled in every environment. Non-production may use one NAT
gateway, but that sacrifices AZ-independent egress. Review current regional
pricing with the AWS Pricing Calculator before applying; do not infer a quote
from this repository.

## Validation

Static validation does not contact or mutate AWS:

```sh
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

A useful plan requires the real partial-backend configuration and read access
to the target account. Planning is read-only; applying is not. This repository
does not contain a local state file or saved plan.
