#!/bin/bash
set -euo pipefail

# ===========================================================================
# RETIRED (2026-07-07, the-honest-ground §4). Superseded by the Vercel
# cron pipeline (vercel.json -> ingest/discover/hires). Kept as the shape
# a future heavy-crawl runner would take -- do not run against prod
# without a fresh decision. Spec:
# docs/superpowers/specs/2026-07-07-the-honest-ground-design.md
# ===========================================================================

# ===========================================================================
# TCG Wholesale Scraper — AWS ECS Fargate Scheduled Task
# Creates: ECR repo, ECS cluster, task definition, EventBridge cron rule
# Usage: ./infra/deploy-scraper.sh
# ===========================================================================

REGION="us-east-1"
ACCOUNT_ID="034362054546"
ECR_REPO="tcg-wholesale-scraper"
CLUSTER_NAME="tcg-wholesale-cluster"
TASK_FAMILY="tcg-wholesale-scraper"
RULE_NAME="tcg-wholesale-daily-scrape"
LOG_GROUP="/ecs/tcg-wholesale-scraper"
SUBNET="subnet-05f2d8747e37bf970"  # us-east-1a public subnet
SCHEDULE="cron(0 6 * * ? *)"        # Daily at 06:00 UTC

# Database URL — pulled from Vercel production env
DB_URL=$(grep DATABASE_URL .env.local | sed 's/^DATABASE_URL="//' | sed 's/\\n"//' | sed 's/"$//')
if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL not found in .env.local"
  echo "Run: npx vercel env pull .env.local --environment production"
  exit 1
fi

echo "=== Deploying TCG Wholesale Scraper to AWS ==="
echo ""

# ---- 1. ECR Repository ----
echo "[1/8] Creating ECR repository..."
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "$ECR_REPO" --region "$REGION" --image-tag-mutability MUTABLE >/dev/null
ECR_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"
echo "  ECR: $ECR_URI"

# ---- 2. Build and push Docker image ----
echo "[2/8] Building Docker image..."
docker build --platform linux/amd64 -f infra/Dockerfile.scraper -t "$ECR_REPO:latest" .

echo "  Logging into ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "  Pushing image..."
docker tag "$ECR_REPO:latest" "$ECR_URI:latest"
docker push "$ECR_URI:latest"
echo "  Pushed: $ECR_URI:latest"

# ---- 3. Store DATABASE_URL in SSM Parameter Store ----
echo "[3/8] Storing DATABASE_URL in SSM..."
aws ssm put-parameter \
  --name "/tcg-wholesale/DATABASE_URL" \
  --type "SecureString" \
  --value "$DB_URL" \
  --overwrite \
  --region "$REGION" >/dev/null
echo "  Stored: /tcg-wholesale/DATABASE_URL"

# ---- 4. IAM Roles ----
echo "[4/8] Setting up IAM roles..."

# Task execution role (for pulling images, reading secrets, writing logs)
EXEC_ROLE_NAME="tcg-wholesale-scraper-exec"
if ! aws iam get-role --role-name "$EXEC_ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "$EXEC_ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
  aws iam attach-role-policy \
    --role-name "$EXEC_ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
fi

# Inline policy for SSM parameter access
aws iam put-role-policy \
  --role-name "$EXEC_ROLE_NAME" \
  --policy-name "ssm-read-db-url" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"ssm:GetParameters\"],
      \"Resource\": \"arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/tcg-wholesale/DATABASE_URL\"
    }]
  }" >/dev/null

EXEC_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$EXEC_ROLE_NAME"
echo "  Execution role: $EXEC_ROLE_ARN"

# EventBridge role (for triggering ECS tasks)
EB_ROLE_NAME="tcg-wholesale-eventbridge-ecs"
if ! aws iam get-role --role-name "$EB_ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "$EB_ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "events.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
fi
aws iam put-role-policy \
  --role-name "$EB_ROLE_NAME" \
  --policy-name "run-ecs-task" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"ecs:RunTask\"],
      \"Resource\": \"arn:aws:ecs:$REGION:$ACCOUNT_ID:task-definition/$TASK_FAMILY:*\"
    }, {
      \"Effect\": \"Allow\",
      \"Action\": [\"iam:PassRole\"],
      \"Resource\": \"$EXEC_ROLE_ARN\"
    }]
  }" >/dev/null

EB_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$EB_ROLE_NAME"
echo "  EventBridge role: $EB_ROLE_ARN"

# ---- 5. CloudWatch Log Group ----
echo "[5/8] Creating CloudWatch log group..."
aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 30 --region "$REGION"
echo "  Log group: $LOG_GROUP (30-day retention)"

# ---- 6. ECS Cluster ----
echo "[6/8] Creating ECS cluster..."
aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$REGION" --query 'clusters[0].status' --output text 2>/dev/null | grep -q ACTIVE || \
  aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$REGION" >/dev/null
echo "  Cluster: $CLUSTER_NAME"

# ---- 7. ECS Task Definition ----
echo "[7/8] Registering task definition..."
TASK_DEF=$(cat <<EOF
{
  "family": "$TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "containerDefinitions": [{
    "name": "scraper",
    "image": "$ECR_URI:latest",
    "essential": true,
    "secrets": [{
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/tcg-wholesale/DATABASE_URL"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "$LOG_GROUP",
        "awslogs-region": "$REGION",
        "awslogs-stream-prefix": "scraper"
      }
    }
  }]
}
EOF
)

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "$TASK_DEF" \
  --region "$REGION" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)
echo "  Task: $TASK_DEF_ARN"

# ---- 8. EventBridge Schedule ----
echo "[8/8] Creating EventBridge schedule..."
aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE" \
  --state ENABLED \
  --region "$REGION" >/dev/null

# Get default security group for outbound access
DEFAULT_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=vpc-073cdce8e84cbccdc" "Name=group-name,Values=default" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")

aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "[{
    \"Id\": \"scraper-task\",
    \"Arn\": \"arn:aws:ecs:$REGION:$ACCOUNT_ID:cluster/$CLUSTER_NAME\",
    \"RoleArn\": \"$EB_ROLE_ARN\",
    \"EcsParameters\": {
      \"TaskDefinitionArn\": \"$TASK_DEF_ARN\",
      \"LaunchType\": \"FARGATE\",
      \"NetworkConfiguration\": {
        \"awsvpcConfiguration\": {
          \"Subnets\": [\"$SUBNET\"],
          \"SecurityGroups\": [\"$DEFAULT_SG\"],
          \"AssignPublicIp\": \"ENABLED\"
        }
      },
      \"TaskCount\": 1
    }
  }]" \
  --region "$REGION" >/dev/null

echo "  Rule: $RULE_NAME ($SCHEDULE)"

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Schedule:  Daily at 06:00 UTC"
echo "Cluster:   $CLUSTER_NAME"
echo "Task:      $TASK_FAMILY"
echo "Logs:      $LOG_GROUP"
echo ""
echo "Manual run:"
echo "  aws ecs run-task --cluster $CLUSTER_NAME --task-definition $TASK_FAMILY \\"
echo "    --launch-type FARGATE --network-configuration \\"
echo "    'awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$DEFAULT_SG],assignPublicIp=ENABLED}' \\"
echo "    --region $REGION"
