# Lambda Functions for RewardsPro

This directory contains AWS Lambda functions for processing Shopify webhooks, SQS order queues, and EventBridge cron jobs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Lambda Functions                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EventBridge Webhooks:                                          │
│  Shopify → EventBridge → Lambda → Aurora Database               │
│                                                                  │
│  SQS Order Processing:                                          │
│  Webhook → SQS Queue → Lambda → Aurora/Vercel API              │
│                                                                  │
│  Scheduled Cron Jobs:                                           │
│  EventBridge Schedule → Lambda → Vercel Cron Endpoints          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Files

- `process-customer-webhook.js` - EventBridge handler for customer webhooks
- `order-queue-processor.js` - SQS handler for order processing
- `cron-dispatcher.js` - EventBridge handler for scheduled cron jobs
- `package.json` - Lambda dependencies
- `test-handler.js` - Local test script

## Lambda Functions Overview

### 1. Customer Webhook Processor
- **Trigger**: EventBridge (Shopify partner events)
- **Purpose**: Process customer create/update/delete webhooks
- **Memory**: 256 MB
- **Timeout**: 30 seconds

### 2. Order Queue Processor
- **Trigger**: SQS (rewardspro-order-queue)
- **Purpose**: Process order webhooks from SQS queue
- **Features**: Batch processing, partial failure reporting, DLQ support
- **Memory**: 512 MB
- **Timeout**: 300 seconds (5 minutes)

### 3. Cron Dispatcher
- **Trigger**: EventBridge scheduled rules
- **Purpose**: Dispatch cron jobs to Vercel app endpoints
- **Features**: Distributed locking via DynamoDB, 12 scheduled jobs
- **Memory**: 256 MB
- **Timeout**: 300 seconds (5 minutes)

## Deployment

### 1. Build and Package

```bash
# From project root
npm run lambda:build  # Install production dependencies
npm run lambda:zip    # Create deployment package
```

This creates `lambda-deployment.zip` in the project root.

### 2. Create Lambda Function in AWS

1. Go to AWS Lambda console
2. Create new function:
   - Name: `rewardspro-process-customer-webhook`
   - Runtime: Node.js 20.x
   - Architecture: x86_64 (or arm64 for cost savings)
   - Permissions: Create new role with basic Lambda permissions

3. Add environment variables:
   ```
   AURORA_RESOURCE_ARN=arn:aws:rds:eu-north-1:043509841549:cluster:rewardspro-dev
   AURORA_SECRET_ARN=arn:aws:secretsmanager:eu-north-1:043509841549:secret:rds!cluster-...
   AURORA_DATABASE_NAME=rewardspro
   AWS_REGION=eu-north-1
   ```

4. Upload the deployment package:
   - Upload `lambda-deployment.zip`
   - Set handler to: `process-customer-webhook.handler`

5. Configure settings:
   - Memory: 256 MB (adjust based on usage)
   - Timeout: 30 seconds
   - Concurrency: 100 (adjust based on load)

### 3. Configure EventBridge Rule

1. Go to EventBridge console
2. Create rule:
   - Name: `shopify-customers-webhooks`
   - Event pattern:
     ```json
     {
       "source": ["aws.partner/shopify.com/{partner-id}/{event-source}"],
       "detail-type": ["shopifyWebhook"],
       "detail": {
         "metadata": {
           "X-Shopify-Topic": [
             "customers/create",
             "customers/update",
             "customers/delete"
           ]
         }
       }
     }
     ```
   - Target: Your Lambda function

### 4. IAM Permissions

Add these permissions to the Lambda execution role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds-data:ExecuteStatement",
        "rds-data:BatchExecuteStatement",
        "rds-data:BeginTransaction",
        "rds-data:CommitTransaction",
        "rds-data:RollbackTransaction"
      ],
      "Resource": "arn:aws:rds:eu-north-1:043509841549:cluster:rewardspro-dev"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:eu-north-1:043509841549:secret:*"
    }
  ]
}
```

## Testing

### Local Testing

```bash
cd lambda
node test-handler.js
```

### AWS Testing

1. Create test event in Lambda console:
```json
{
  "version": "0",
  "id": "test-event",
  "detail-type": "shopifyWebhook",
  "source": "aws.partner/shopify.com/test/webhooks",
  "detail": {
    "metadata": {
      "X-Shopify-Topic": "customers/create",
      "X-Shopify-Shop-Domain": "test-store.myshopify.com"
    },
    "payload": {
      "id": 1234567890,
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "User",
      "total_spent": "100.00",
      "orders_count": 1
    }
  }
}
```

2. Run test and check CloudWatch logs

## Monitoring

### CloudWatch Metrics to Monitor

- Invocations
- Errors
- Duration
- Throttles
- Concurrent Executions

### Alarms to Set

1. **Error Rate**: Alert if error rate > 1%
2. **Duration**: Alert if average duration > 10 seconds
3. **Throttles**: Alert if any throttles occur
4. **DLQ Messages**: Alert if messages go to dead letter queue

## Troubleshooting

### Common Issues

1. **"Task timed out"**
   - Increase timeout in Lambda configuration
   - Check database query performance

2. **"Access denied"**
   - Check IAM permissions
   - Verify resource ARNs

3. **"Secret not found"**
   - Verify secret ARN exists
   - Check AWS region

4. **"Database connection failed"**
   - Check Aurora cluster is running
   - Verify security group allows Data API

### Debug Mode

Set environment variable:
```
DEBUG=true
```

This enables verbose logging in CloudWatch.

## Cost Optimization

1. **Use ARM architecture** (Graviton2) for 20% cost savings
2. **Set appropriate memory** - Start with 256MB, adjust based on metrics
3. **Enable Lambda SnapStart** for faster cold starts
4. **Use EventBridge archive** for replay capability
5. **Set up DLQ** for failed messages

## Security Best Practices

1. **Least privilege IAM** - Only grant required permissions
2. **Encrypt environment variables** - Use AWS KMS
3. **VPC configuration** - Not needed for Data API
4. **Secrets rotation** - Enable automatic rotation
5. **Audit logging** - Enable CloudTrail for Lambda

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review this README
3. Check AWS status page
4. Contact team lead