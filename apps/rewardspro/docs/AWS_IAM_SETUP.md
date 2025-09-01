# AWS IAM Setup for RewardsPro Aurora Data API

## 🎯 Overview
This guide explains how to configure IAM permissions for Aurora Data API access from both local development and Vercel production.

---

## 🏠 Local Development Setup

### Method 1: AWS CLI Profile (Simplest)
```bash
# Configure AWS CLI with your credentials
aws configure --profile rewardspro

# Set these in your .env file
AWS_PROFILE=rewardspro
AWS_REGION=eu-north-1
```

### Method 2: IAM User with Access Keys
1. Create an IAM user in AWS Console
2. Attach the policy from `aws-iam-policy.json`
3. Generate access keys
4. Add to `.env`:
```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-north-1
```

---

## 🚀 Vercel Production Setup

### Option A: Using AWS Access Keys (Quick Setup)

1. **Create IAM User**:
   - Go to AWS IAM Console
   - Create user: `rewardspro-vercel-prod`
   - Attach policy from `aws-iam-policy.json`

2. **Generate Access Keys**:
   - Security credentials → Create access key
   - Choose "Application running outside AWS"

3. **Add to Vercel Environment Variables**:
   ```
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=eu-north-1
   AURORA_RESOURCE_ARN=arn:aws:rds:eu-north-1:043509841549:cluster:rewardspro-dev
   AURORA_SECRET_ARN=arn:aws:secretsmanager:eu-north-1:043509841549:secret:rds!cluster-65ca2aee-0536-4745-b04d-0eec72e31363-yO7eLo
   AURORA_DATABASE_NAME=rewardspro
   ```

### Option B: Using IAM Role (More Secure - Advanced)

1. **Create IAM Role**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::043509841549:root"
         },
         "Action": "sts:AssumeRole",
         "Condition": {
           "StringEquals": {
             "sts:ExternalId": "vercel-project-id"
           }
         }
       }
     ]
   }
   ```

2. **Use AWS STS in Code**:
   ```typescript
   // This would require modifying aurora-data-api.ts
   import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
   ```

---

## 🔍 Verify Permissions

### Test from Local:
```bash
# Copy .env.aurora to .env
cp .env.aurora .env

# Add AWS credentials to .env
echo "AWS_ACCESS_KEY_ID=your-key" >> .env
echo "AWS_SECRET_ACCESS_KEY=your-secret" >> .env

# Run test
npx tsx test-aurora-connection.ts
```

### Test IAM Permissions:
```bash
# Test Data API access
aws rds-data execute-statement \
  --resource-arn "arn:aws:rds:eu-north-1:043509841549:cluster:rewardspro-dev" \
  --secret-arn "arn:aws:secretsmanager:eu-north-1:043509841549:secret:rds!cluster-65ca2aee-0536-4745-b04d-0eec72e31363-yO7eLo" \
  --database "rewardspro" \
  --sql "SELECT 1" \
  --region eu-north-1

# Test Secrets Manager access
aws secretsmanager get-secret-value \
  --secret-id "arn:aws:secretsmanager:eu-north-1:043509841549:secret:rds!cluster-65ca2aee-0536-4745-b04d-0eec72e31363-yO7eLo" \
  --region eu-north-1
```

---

## 🛡️ Security Best Practices

### For Production:
1. **Use separate IAM users** for dev/staging/prod
2. **Rotate access keys** every 90 days
3. **Enable MFA** on IAM users
4. **Use least privilege** - only grant required permissions
5. **Monitor with CloudTrail** for API usage

### Access Key Rotation:
```bash
# Create new keys before deleting old ones
aws iam create-access-key --user-name rewardspro-vercel-prod

# Update Vercel environment variables

# Delete old keys
aws iam delete-access-key --user-name rewardspro-vercel-prod --access-key-id OLD_KEY_ID
```

---

## ⚠️ Common Issues

### "AccessDeniedException" Error
- Check IAM policy is attached to user/role
- Verify ARNs match exactly
- Ensure secret exists and is accessible

### "ResourceNotFoundException" Error
- Data API must be enabled on cluster
- Cluster must be running (not paused)
- Check region is correct (eu-north-1)

### "InvalidParameterException" Error
- Secret must contain `username` and `password` fields
- Database name must exist in cluster

---

## 📊 Monitoring

### CloudWatch Metrics to Watch:
- `DataAPIRequests` - Request count
- `DataAPIErrors` - Error rate
- `DataAPILatency` - Response time

### Set Up Alarms:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "DataAPI-HighErrorRate" \
  --alarm-description "Alert when Data API errors exceed 1%" \
  --metric-name DataAPIErrors \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔗 Useful Links

- [AWS Data API Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)