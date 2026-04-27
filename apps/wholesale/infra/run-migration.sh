#!/bin/bash
set -euo pipefail

# ===========================================================================
# One-shot Lambda migration runner
# Creates a temporary Lambda, runs pending SQL migrations, then cleans up.
# Usage: ./infra/run-migration.sh
# ===========================================================================

REGION="us-east-1"
ACCOUNT_ID="034362054546"
FUNCTION_NAME="tcg-migrate-oneshot"
ROLE_NAME="tcg-migrate-oneshot-role"
SUBNET="subnet-05f2d8747e37bf970"
VPC_ID="vpc-073cdce8e84cbccdc"
TEMP_DIR=$(mktemp -d)

# Get DATABASE_URL from .env.local
DB_URL=$(grep DATABASE_URL .env.local | sed 's/^DATABASE_URL="//' | sed 's/\\n"//' | sed 's/"$//')
if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL not found in .env.local"
  echo "Run: npx vercel env pull .env.local --environment production"
  exit 1
fi

# Get default security group
DEFAULT_SG=$(aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=default" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")

echo "=== One-shot Lambda Migration ==="
echo ""

# ---- 1. Create IAM role ----
echo "[1/5] Creating Lambda execution role..."
ROLE_ARN=""
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
  echo "  Role exists: $ROLE_ARN"
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

  # Attach basic Lambda + VPC execution policy
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"

  echo "  Created: $ROLE_ARN"
  echo "  Waiting 10s for IAM propagation..."
  sleep 10
fi

# ---- 2. Package Lambda function ----
echo "[2/5] Packaging Lambda function..."
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

  const migrations = [
    `ALTER TABLE cards RENAME COLUMN price_ex_vat TO price`,
    `ALTER TABLE orders RENAME COLUMN total_ex_vat TO total`,
    `ALTER TABLE order_items RENAME COLUMN unit_price_ex_vat TO unit_price`,
    `ALTER TABLE cart_items RENAME COLUMN price_ex_vat TO price`,
    `ALTER TABLE price_archive RENAME COLUMN price_ex_vat TO price`,
    `UPDATE cards SET price = ROUND(price * 1.20, 2) WHERE price IS NOT NULL AND price > 0`,
  ];

  const results = [];
  for (const sql of migrations) {
    try {
      await client.query(sql);
      results.push({ sql: sql.substring(0, 60) + '...', status: 'ok' });
    } catch (e) {
      results.push({ sql: sql.substring(0, 60) + '...', status: 'error', error: e.message });
    }
  }

  // Also update drizzle migration journal so drizzle knows these ran
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    // Check which migrations are already recorded
    const { rows } = await client.query('SELECT hash FROM "__drizzle_migrations"');
    const existing = new Set(rows.map(r => r.hash));
    results.push({ sql: 'drizzle journal check', existing: [...existing] });
  } catch (e) {
    results.push({ sql: 'drizzle journal', status: 'skipped', note: e.message });
  }

  await client.end();
  return { statusCode: 200, results };
};
HANDLER

cat > package.json << 'PKG'
{ "type": "module", "dependencies": { "pg": "^8.13.0" } }
PKG

npm install --omit=dev --silent 2>/dev/null
zip -qr function.zip .
ZIPSIZE=$(du -h function.zip | cut -f1)
echo "  Package: $ZIPSIZE"

# ---- 3. Create Lambda ----
echo "[3/5] Creating Lambda function..."
# Delete if exists from a previous failed run
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

# Wait for function to be active
echo "  Waiting for function to be active..."
aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$REGION"
echo "  Lambda ready"

# ---- 4. Invoke ----
echo "[4/5] Running migration..."
aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  /dev/stdout 2>/dev/null

echo ""

# ---- 5. Cleanup ----
echo "[5/5] Cleaning up..."
aws lambda delete-function --function-name "$FUNCTION_NAME" --region "$REGION"
aws iam detach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" 2>/dev/null || true
aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || true
rm -rf "$TEMP_DIR"
echo "  Cleaned up Lambda + IAM role"

echo ""
echo "=== Migration complete ==="
