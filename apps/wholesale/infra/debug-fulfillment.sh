#!/bin/bash
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="034362054546"
FUNCTION_NAME="tcg-debug-oneshot"
ROLE_NAME="tcg-migrate-oneshot-role"
SUBNET="subnet-05f2d8747e37bf970"
VPC_ID="vpc-073cdce8e84cbccdc"
TEMP_DIR=$(mktemp -d)

DB_URL=$(grep DATABASE_URL .env.local | sed 's/^DATABASE_URL="//' | sed 's/\\n"//' | sed 's/"$//')

DEFAULT_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=default" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")

echo "=== Debug Fulfillment Queries ==="

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

  // Step 1: Get orders in paid+ status (admin sees all)
  try {
    const { rows } = await client.query(
      `SELECT id FROM orders WHERE status = ANY($1)`,
      [['paid','ordered','shipped','delivered']]
    );
    results.step1_orders = { ok: true, ids: rows.map(r => r.id) };
  } catch (e) {
    results.step1_orders = { ok: false, error: e.message };
    await client.end();
    return results;
  }

  const orderIds = results.step1_orders.ids;
  if (orderIds.length === 0) {
    results.earlyReturn = "no paid orders";
    await client.end();
    return results;
  }

  // Step 2: All order items (replicating drizzle sql template)
  try {
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await client.query(
      `SELECT oi.id, oi.order_id, oi.quantity,
              coalesce(c.card_number, 'Unknown') as card_number,
              coalesce(c.sku, '—') as sku,
              c.image_url
       FROM order_items oi
       LEFT JOIN cards c ON oi.card_id = c.id
       WHERE oi.order_id IN (${placeholders}) AND oi.removed_at IS NULL`,
      orderIds
    );
    results.step2_items = { ok: true, count: rows.length };
  } catch (e) {
    results.step2_items = { ok: false, error: e.message };
  }

  // Step 3: Fulfilled aggregates
  try {
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await client.query(
      `SELECT order_item_id, sum(fulfilled_qty) as total
       FROM fulfillment_entries
       WHERE order_id IN (${placeholders})
       GROUP BY order_item_id`,
      orderIds
    );
    results.step3_fulfilled = { ok: true, count: rows.length };
  } catch (e) {
    results.step3_fulfilled = { ok: false, error: e.message };
  }

  // Step 4: Fulfilled detail rows (the complex join)
  try {
    const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await client.query(
      `SELECT fe.fulfillment_date, fe.order_id, fe.order_item_id,
              coalesce(c.card_number, 'Unknown') as card_number,
              coalesce(c.sku, '—') as sku,
              c.image_url,
              fe.fulfilled_qty
       FROM fulfillment_entries fe
       INNER JOIN order_items oi ON fe.order_item_id = oi.id
       INNER JOIN cards c ON oi.card_id = c.id
       WHERE fe.order_id IN (${placeholders})
       ORDER BY fe.fulfillment_date desc`,
      orderIds
    );
    results.step4_detail = { ok: true, count: rows.length };
  } catch (e) {
    results.step4_detail = { ok: false, error: e.message };
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

aws lambda delete-function --function-name "$FUNCTION_NAME" --region "$REGION"
aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" 2>/dev/null || true
aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || true
rm -rf "$TEMP_DIR"
echo "Done"
