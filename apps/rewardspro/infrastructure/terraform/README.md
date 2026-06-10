# RewardsPro AWS Infrastructure

Terraform configuration for deploying production-grade AWS infrastructure for RewardsPro.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AWS Infrastructure                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐              │
│  │   Vercel      │    │    Aurora     │    │   DynamoDB    │              │
│  │   (App Host)  │◄──►│  (Database)   │    │   (Locks)     │              │
│  └───────┬───────┘    └───────────────┘    └───────────────┘              │
│          │                                                                   │
│  ┌───────▼───────┐    ┌───────────────┐    ┌───────────────┐              │
│  │  SQS Queue    │───►│    Lambda     │───►│   S3 Bucket   │              │
│  │  (Orders)     │    │  (Processor)  │    │   (Exports)   │              │
│  └───────────────┘    └───────┬───────┘    └───────────────┘              │
│                               │                                             │
│  ┌───────────────┐    ┌───────▼───────┐                                    │
│  │  EventBridge  │───►│    Lambda     │                                    │
│  │   (Cron)      │    │ (Dispatcher)  │                                    │
│  └───────────────┘    └───────────────┘                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### SQS Order Queue
- **Purpose**: Reliable order processing queue
- **Features**: Dead Letter Queue, visibility timeout, message retention
- **Cost**: ~$0.40/month for 1M messages

### DynamoDB Cron Locks
- **Purpose**: Distributed locking for cron jobs
- **Features**: TTL auto-expiry, conditional writes
- **Cost**: ~$5-10/month (pay-per-request)

### Lambda Functions
- **Order Queue Processor**: Processes SQS messages
- **Cron Dispatcher**: Handles EventBridge scheduled events
- **Cost**: ~$2-5/month for 100K invocations

### EventBridge Rules
- **Purpose**: Scheduled cron job triggers
- **Jobs**: 12 scheduled rules for various maintenance tasks
- **Cost**: ~$1/month

### S3 Exports Bucket
- **Purpose**: Data exports and file storage
- **Features**: Server-side encryption, lifecycle policies
- **Cost**: ~$0.25/month for 10GB

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.5.0
3. Existing Aurora cluster ARN and Secret ARN

## Quick Start

1. Copy the example variables file:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit `terraform.tfvars` with your values:
   ```hcl
   aws_region           = "eu-north-1"
   environment          = "prod"
   aurora_resource_arn  = "arn:aws:rds:..."
   aurora_secret_arn    = "arn:aws:secretsmanager:..."
   vercel_app_url       = "https://your-app.vercel.app"
   cron_secret          = "your-secure-secret"
   internal_api_secret  = "your-api-secret"
   ```

3. Initialize Terraform:
   ```bash
   terraform init
   ```

4. Plan the deployment:
   ```bash
   terraform plan
   ```

5. Apply the configuration:
   ```bash
   terraform apply
   ```

6. Get the outputs for Vercel environment variables:
   ```bash
   terraform output vercel_environment_variables
   ```

## Environment Variables

After deployment, add these environment variables to Vercel:

```env
# SQS Configuration
AWS_SQS_ORDER_QUEUE_URL=<from terraform output>
AWS_SQS_DLQ_URL=<from terraform output>

# DynamoDB Configuration
AWS_DYNAMODB_LOCKS_TABLE=<from terraform output>

# S3 Configuration
AWS_S3_EXPORTS_BUCKET=<from terraform output>

# Feature Flags (enable gradually)
USE_SQS_QUEUE=true
USE_DYNAMODB_LOCKS=true

# AWS Credentials (from terraform output)
AWS_ACCESS_KEY_ID=<from terraform output>
AWS_SECRET_ACCESS_KEY=<from terraform output>
```

## Feature Flags

Enable services gradually using feature flags:

| Flag | Description |
|------|-------------|
| `USE_SQS_QUEUE=true` | Enable SQS order queue |
| `USE_DYNAMODB_LOCKS=true` | Enable DynamoDB cron locks |
| `USE_ELASTICACHE=true` | Enable ElastiCache Redis |
| `USE_SES_EMAIL=true` | Enable SES for emails |

## Lambda Deployment

After Terraform creates the Lambda functions:

1. Build the Lambda code:
   ```bash
   cd lambda
   npm install --production
   ```

2. Package the code:
   ```bash
   npm run package
   ```

3. Deploy to AWS:
   ```bash
   aws lambda update-function-code \
     --function-name rewardspro-prod-order-queue-processor \
     --zip-file fileb://lambda-functions.zip
   ```

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| SQS (1M messages) | ~$0.40 |
| DynamoDB (on-demand) | ~$5-10 |
| Lambda (100K invocations) | ~$2-5 |
| EventBridge | ~$1 |
| S3 (10GB) | ~$0.25 |
| **Total** | **~$10-20** |

## Troubleshooting

### SQS Messages Not Processing
1. Check Lambda CloudWatch logs
2. Verify IAM permissions
3. Check DLQ for failed messages

### Cron Jobs Not Running
1. Check EventBridge rule is enabled
2. Verify Lambda has permission to be invoked
3. Check DynamoDB lock table for stale locks

### High DynamoDB Costs
- Switch to provisioned capacity mode if traffic is predictable
- Review TTL settings for lock expiry

## Security

- All data encrypted at rest (S3 SSE, DynamoDB encryption)
- IAM roles follow least-privilege principle
- VPC endpoints recommended for production
- Secrets stored in AWS Secrets Manager

## Cleanup

To destroy all resources:
```bash
terraform destroy
```

**Warning**: This will delete all queues, tables, and buckets. Ensure data is backed up first.
