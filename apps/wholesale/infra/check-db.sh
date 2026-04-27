#!/bin/bash
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="034362054546"
FUNCTION_NAME="tcg-check-oneshot"
ROLE_NAME="tcg-migrate-oneshot-role"
SUBNET="subnet-05f2d8747e37bf970"
VPC_ID="vpc-073cdce8e84cbccdc"
TEMP_DIR=$(mktemp -d)

DB_URL=$(grep DATABASE_URL .env.local | sed 's/^DATABASE_URL="//' | sed 's/\\n"//' | sed 's/"$//')

DEFAULT_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=default" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")

echo "=== DB Check ==="

# Create role
ROLE_ARN=""
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
else
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' \
    --query 'Role.Arn' --output text)
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  echo "Waiting 10s for IAM..."
  sleep 10
fi

cd "$TEMP_DIR"
cat > index.mjs << 'HANDLER'
import pg from 'pg';
const { Client } = pg;

export const handler = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const results = {};

  // Check columns exist
  const { rows: cols } = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE (table_name = 'order_items' AND column_name = 'removed_at')
       OR (table_name = 'order_status_history' AND column_name = 'items_snapshot')
  `);
  results.columns = cols;

  // Check what tables exist
  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  results.tables = tables.map(t => t.table_name);

  // Check orders in paid+ status
  const { rows: orderCounts } = await client.query(`
    SELECT status, count(*) as cnt FROM orders
    WHERE status IN ('paid','ordered','shipped','delivered')
    GROUP BY status
  `);
  results.paidOrders = orderCounts;

  // Try the exact query the fulfillment page runs (first query)
  try {
    const { rows } = await client.query(`
      SELECT id FROM orders WHERE status = ANY($1)
    `, [['paid','ordered','shipped','delivered']]);
    results.fulfillmentQuery1 = { ok: true, count: rows.length };
  } catch (e) {
    results.fulfillmentQuery1 = { ok: false, error: e.message };
  }

  // Try a query with removed_at
  try {
    const { rows } = await client.query(`
      SELECT count(*) as cnt FROM order_items WHERE removed_at IS NULL
    `);
    results.removedAtQuery = { ok: true, count: rows[0].cnt };
  } catch (e) {
    results.removedAtQuery = { ok: false, error: e.message };
  }

  await client.end();
  return results;
};
HANDLER

cat > package.json << 'PKG'
{ "type": "module", "dependencies": { "pg": "^8.13.0" } }
PKG

npm install --omit=dev --silent 2>/dev/null
zip -qr function.zip .

aws lambda delete-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || true

aws lambda create-function \
  --function-name "$FUNCTION_NAME" \
  --runtime "nodejs20.x" \
  --handler "index.handler" \
  --zip-file "fileb://function.zip" \
  --role "$ROLE_ARN" \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={DATABASE_URL=$DB_URL,NODE_TLS_REJECT_UNAUTHORIZED=0}" \
  --vpc-config "SubnetIds=$SUBNET,SecurityGroupIds=$DEFAULT_SG" \
  --region "$REGION" \
  --query 'FunctionArn' --output text

aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$REGION"

echo "Invoking..."
aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  /dev/stdout 2>/dev/null

echo ""

# Cleanup
aws lambda delete-function --function-name "$FUNCTION_NAME" --region "$REGION"
aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" 2>/dev/null || true
aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || true
rm -rf "$TEMP_DIR"
echo "Done"
