# Terraform state bootstrap

This CloudFormation template creates only the dedicated S3 state bucket and
DynamoDB lock table used by the RewardsPro API Terraform backend. Deploy it in
`eu-west-2`, separately from the application stack, so application recovery or
destruction cannot remove its own state history.

The bucket has versioning, SSE-S3 encryption, bucket-owner-enforced ownership,
all public access blocks, and a TLS-only policy. The `LockID` table uses
on-demand billing, encryption, point-in-time recovery, and deletion
protection. Both resources are retained if the stack is deleted or a resource
is replaced.

## Deploy

Choose globally unique, account-specific names. Establish the reviewed local
identity first; do not let the AWS SDK fall back to a default profile:

```sh
export AWS_PROFILE=rewardspro-admin
export AWS_REGION=eu-west-2
export REWARDSPRO_AWS_ACCOUNT_ID="<reviewed-12-digit-account-id>"
bash ../scripts/assert-local-aws-identity.sh
```

Then run this from this directory:

```sh
aws cloudformation deploy \
  --region eu-west-2 \
  --stack-name rewardspro-v2-terraform-state \
  --template-file terraform-state.yaml \
  --parameter-overrides \
    StateBucketName="<globally-unique-state-bucket>" \
    LockTableName="rewardspro-v2-terraform-locks-eu-west-2"

aws cloudformation update-termination-protection \
  --region eu-west-2 \
  --stack-name rewardspro-v2-terraform-state \
  --enable-termination-protection
```

This creates billable AWS resources, although S3 and DynamoDB
`PAY_PER_REQUEST` charges should remain usage-based. Do not deploy the template
in another region or add application resources to this stack. The second
command protects the CloudFormation envelope; resource-level retain policies
and DynamoDB deletion protection remain the final safeguards.

Inspect its outputs:

```sh
aws cloudformation describe-stacks \
  --region eu-west-2 \
  --stack-name rewardspro-v2-terraform-state \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
```

Create an uncommitted
`../terraform/backend.hcl` using those outputs:

```hcl
bucket         = "<StateBucketName output>"
key            = "rewardspro-api/<environment>/terraform.tfstate"
region         = "eu-west-2"
dynamodb_table = "<LockTableName output>"
encrypt        = true
```

Use a distinct, reviewed key for every environment. Never point dev, staging,
and production at the same key or relabel an existing key for another
environment.

Initialize the application stack from `../terraform`:

```sh
terraform init -backend-config=backend.hcl
```

Never commit `backend.hcl`, Terraform state, plans, credentials, account IDs,
or concrete bucket/table names.

Do not use `-reconfigure` as a state-migration shortcut. It deliberately
discards prior backend metadata. If a backend bucket or key must move, back up
and inspect the current state, use `terraform init -migrate-state`, then verify
the destination lineage and serial before any plan. Reserve `-reconfigure` for
a verified unchanged bucket/key whose local initialization metadata alone is
stale.

## Drift and lifecycle cautions

Periodically request a drift scan, then inspect the returned detection ID:

```sh
aws cloudformation detect-stack-drift \
  --region eu-west-2 \
  --stack-name rewardspro-v2-terraform-state

aws cloudformation describe-stack-drift-detection-status \
  --region eu-west-2 \
  --stack-drift-detection-id "<StackDriftDetectionId>"
```

Treat teardown as a state migration, not ordinary stack deletion. The retain
policies intentionally leave both resources behind when the CloudFormation
stack is deleted, and DynamoDB deletion protection adds another guard. Before
any deliberate decommissioning, move and verify the Terraform state, preserve
the bucket's needed object versions, confirm no stack still uses the lock
table, and obtain a separate destructive-action review. Changing either name
also retains the previous resource; verify and retire it deliberately rather
than assuming CloudFormation removed it.
