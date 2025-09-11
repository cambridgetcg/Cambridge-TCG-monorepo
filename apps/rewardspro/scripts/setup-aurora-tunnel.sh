#!/bin/bash

# =================================================================
# AWS Aurora Database Tunnel Setup for Local Prisma Migrations
# =================================================================
# This script establishes a secure connection to your AWS Aurora
# database for running Prisma migrations locally.
#
# Prerequisites:
# 1. AWS CLI configured with appropriate credentials
# 2. Session Manager plugin installed
# 3. EC2 bastion host or AWS Systems Manager access
# =================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AURORA_CLUSTER_IDENTIFIER="${AURORA_CLUSTER_IDENTIFIER:-rewardspro-cluster}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
LOCAL_PORT="${LOCAL_PORT:-5432}"
DB_NAME="${AURORA_DATABASE_NAME:-rewardspro}"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}AWS Aurora Database Connection Setup${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI is not installed${NC}"
        echo "Please install AWS CLI: https://aws.amazon.com/cli/"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}❌ AWS credentials not configured${NC}"
        echo "Please run: aws configure"
        exit 1
    fi
    
    # Check Session Manager plugin (optional, for SSM tunnel)
    if command -v session-manager-plugin &> /dev/null; then
        echo -e "${GREEN}✓ Session Manager plugin installed${NC}"
        SSM_AVAILABLE=true
    else
        echo -e "${YELLOW}⚠ Session Manager plugin not installed${NC}"
        echo "  Install from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
        SSM_AVAILABLE=false
    fi
    
    echo -e "${GREEN}✓ Prerequisites check complete${NC}"
    echo ""
}

# Function to get Aurora endpoint
get_aurora_endpoint() {
    echo -e "${YELLOW}Fetching Aurora cluster information...${NC}"
    
    AURORA_ENDPOINT=$(aws rds describe-db-clusters \
        --db-cluster-identifier "$AURORA_CLUSTER_IDENTIFIER" \
        --region "$AWS_REGION" \
        --query 'DBClusters[0].Endpoint' \
        --output text 2>/dev/null)
    
    if [ -z "$AURORA_ENDPOINT" ] || [ "$AURORA_ENDPOINT" == "None" ]; then
        echo -e "${RED}❌ Could not find Aurora cluster: $AURORA_CLUSTER_IDENTIFIER${NC}"
        exit 1
    fi
    
    AURORA_PORT=$(aws rds describe-db-clusters \
        --db-cluster-identifier "$AURORA_CLUSTER_IDENTIFIER" \
        --region "$AWS_REGION" \
        --query 'DBClusters[0].Port' \
        --output text)
    
    echo -e "${GREEN}✓ Found Aurora cluster${NC}"
    echo "  Endpoint: $AURORA_ENDPOINT"
    echo "  Port: $AURORA_PORT"
    echo ""
}

# Function to get database credentials from Secrets Manager
get_db_credentials() {
    echo -e "${YELLOW}Retrieving database credentials...${NC}"
    
    # Try to find the secret ARN from environment or by name pattern
    if [ -n "$AURORA_SECRET_ARN" ]; then
        SECRET_ARN="$AURORA_SECRET_ARN"
    else
        # Try to find secret by cluster name
        SECRET_ARN=$(aws secretsmanager list-secrets \
            --region "$AWS_REGION" \
            --query "SecretList[?contains(Name, '$AURORA_CLUSTER_IDENTIFIER')].ARN | [0]" \
            --output text)
    fi
    
    if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
        echo -e "${RED}❌ Could not find database credentials in Secrets Manager${NC}"
        echo "Please ensure AURORA_SECRET_ARN is set or create a secret for the cluster"
        exit 1
    fi
    
    # Retrieve credentials
    CREDENTIALS=$(aws secretsmanager get-secret-value \
        --secret-id "$SECRET_ARN" \
        --region "$AWS_REGION" \
        --query 'SecretString' \
        --output text)
    
    DB_USERNAME=$(echo "$CREDENTIALS" | jq -r '.username')
    DB_PASSWORD=$(echo "$CREDENTIALS" | jq -r '.password')
    
    if [ -z "$DB_USERNAME" ] || [ -z "$DB_PASSWORD" ]; then
        echo -e "${RED}❌ Could not parse database credentials${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Retrieved database credentials${NC}"
    echo ""
}

# Option 1: Direct connection (if Aurora is publicly accessible)
setup_direct_connection() {
    echo -e "${BLUE}Option 1: Testing direct connection...${NC}"
    
    # Test if Aurora is publicly accessible
    if nc -zv "$AURORA_ENDPOINT" "$AURORA_PORT" 2>/dev/null; then
        echo -e "${GREEN}✓ Aurora is publicly accessible${NC}"
        echo ""
        echo -e "${GREEN}You can connect directly using:${NC}"
        echo "DATABASE_URL=\"postgresql://$DB_USERNAME:$DB_PASSWORD@$AURORA_ENDPOINT:$AURORA_PORT/$DB_NAME?sslmode=require\""
        return 0
    else
        echo -e "${YELLOW}Aurora is not publicly accessible. Trying other methods...${NC}"
        return 1
    fi
}

# Option 2: SSH tunnel through bastion host
setup_ssh_tunnel() {
    echo -e "${BLUE}Option 2: SSH Tunnel through Bastion Host${NC}"
    
    read -p "Enter your bastion host address (or press Enter to skip): " BASTION_HOST
    
    if [ -z "$BASTION_HOST" ]; then
        echo -e "${YELLOW}Skipping SSH tunnel setup${NC}"
        return 1
    fi
    
    read -p "Enter SSH user for bastion (default: ec2-user): " SSH_USER
    SSH_USER="${SSH_USER:-ec2-user}"
    
    echo -e "${YELLOW}Creating SSH tunnel...${NC}"
    
    # Kill any existing tunnel on the same port
    lsof -ti:$LOCAL_PORT | xargs kill -9 2>/dev/null || true
    
    # Create SSH tunnel
    ssh -f -N -L "$LOCAL_PORT:$AURORA_ENDPOINT:$AURORA_PORT" "$SSH_USER@$BASTION_HOST" \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ SSH tunnel established${NC}"
        echo ""
        echo -e "${GREEN}You can now connect using:${NC}"
        echo "DATABASE_URL=\"postgresql://$DB_USERNAME:$DB_PASSWORD@localhost:$LOCAL_PORT/$DB_NAME?sslmode=prefer\""
        return 0
    else
        echo -e "${RED}❌ Failed to create SSH tunnel${NC}"
        return 1
    fi
}

# Option 3: AWS Systems Manager Session Manager tunnel
setup_ssm_tunnel() {
    echo -e "${BLUE}Option 3: SSM Session Manager Tunnel${NC}"
    
    if [ "$SSM_AVAILABLE" != "true" ]; then
        echo -e "${YELLOW}Session Manager plugin not available${NC}"
        return 1
    fi
    
    # Find an EC2 instance in the same VPC
    echo -e "${YELLOW}Finding EC2 instances in the same VPC...${NC}"
    
    # Get VPC ID of the Aurora cluster
    VPC_ID=$(aws rds describe-db-clusters \
        --db-cluster-identifier "$AURORA_CLUSTER_IDENTIFIER" \
        --region "$AWS_REGION" \
        --query 'DBClusters[0].DBSubnetGroup.VpcId' \
        --output text)
    
    if [ -z "$VPC_ID" ] || [ "$VPC_ID" == "None" ]; then
        echo -e "${RED}Could not determine VPC ID${NC}"
        return 1
    fi
    
    # Find running EC2 instances in the same VPC
    INSTANCE_ID=$(aws ec2 describe-instances \
        --region "$AWS_REGION" \
        --filters "Name=vpc-id,Values=$VPC_ID" "Name=instance-state-name,Values=running" \
        --query 'Reservations[0].Instances[0].InstanceId' \
        --output text)
    
    if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" == "None" ]; then
        echo -e "${YELLOW}No running EC2 instances found in the VPC${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓ Found EC2 instance: $INSTANCE_ID${NC}"
    echo -e "${YELLOW}Creating SSM tunnel...${NC}"
    
    # Kill any existing tunnel on the same port
    lsof -ti:$LOCAL_PORT | xargs kill -9 2>/dev/null || true
    
    # Create SSM port forwarding session
    aws ssm start-session \
        --target "$INSTANCE_ID" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$AURORA_ENDPOINT\"],\"portNumber\":[\"$AURORA_PORT\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" \
        --region "$AWS_REGION" &
    
    SSM_PID=$!
    sleep 5
    
    if kill -0 $SSM_PID 2>/dev/null; then
        echo -e "${GREEN}✓ SSM tunnel established (PID: $SSM_PID)${NC}"
        echo ""
        echo -e "${GREEN}You can now connect using:${NC}"
        echo "DATABASE_URL=\"postgresql://$DB_USERNAME:$DB_PASSWORD@localhost:$LOCAL_PORT/$DB_NAME?sslmode=prefer\""
        return 0
    else
        echo -e "${RED}❌ Failed to create SSM tunnel${NC}"
        return 1
    fi
}

# Option 4: Use Data API for migrations
setup_data_api_migration() {
    echo -e "${BLUE}Option 4: Data API Migration Script${NC}"
    echo -e "${YELLOW}Creating Data API migration runner...${NC}"
    
    cat > /tmp/run-migration-via-data-api.js << 'EOF'
const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const fs = require("fs");
const path = require("path");

async function runMigration() {
    const client = new RDSDataClient({ region: process.env.AWS_REGION });
    
    // Read the latest migration file
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const migrations = fs.readdirSync(migrationsDir)
        .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
        .sort();
    
    if (migrations.length === 0) {
        console.log("No migrations found");
        return;
    }
    
    const latestMigration = migrations[migrations.length - 1];
    const sqlPath = path.join(migrationsDir, latestMigration, "migration.sql");
    
    if (!fs.existsSync(sqlPath)) {
        console.log("No migration.sql found in", latestMigration);
        return;
    }
    
    console.log("Running migration:", latestMigration);
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    // Split SQL statements (simple split, may need adjustment for complex migrations)
    const statements = sql.split(";").filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
        try {
            await client.send(new ExecuteStatementCommand({
                resourceArn: process.env.AURORA_RESOURCE_ARN,
                secretArn: process.env.AURORA_SECRET_ARN,
                database: process.env.AURORA_DATABASE_NAME,
                sql: statement + ";",
            }));
            console.log("✓ Executed:", statement.substring(0, 50) + "...");
        } catch (error) {
            console.error("❌ Failed:", statement.substring(0, 50) + "...");
            throw error;
        }
    }
    
    console.log("✅ Migration completed successfully");
}

runMigration().catch(console.error);
EOF
    
    echo -e "${GREEN}✓ Created Data API migration script${NC}"
    echo ""
    echo -e "${GREEN}To run migrations via Data API:${NC}"
    echo "node /tmp/run-migration-via-data-api.js"
    return 0
}

# Main script execution
main() {
    check_prerequisites
    get_aurora_endpoint
    get_db_credentials
    
    echo -e "${BLUE}Attempting connection methods...${NC}"
    echo ""
    
    # Try each connection method
    if ! setup_direct_connection; then
        if ! setup_ssh_tunnel; then
            if ! setup_ssm_tunnel; then
                setup_data_api_migration
            fi
        fi
    fi
    
    echo ""
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}Setup Complete!${NC}"
    echo -e "${BLUE}==========================================${NC}"
    echo ""
    echo -e "${YELLOW}To run Prisma migrations:${NC}"
    echo "1. Export the DATABASE_URL shown above"
    echo "2. Run: npx prisma migrate deploy"
    echo ""
    echo -e "${YELLOW}Example:${NC}"
    echo "export DATABASE_URL=\"postgresql://$DB_USERNAME:***@localhost:$LOCAL_PORT/$DB_NAME?sslmode=prefer\""
    echo "npx prisma migrate deploy"
    echo ""
    echo -e "${YELLOW}To stop the tunnel:${NC}"
    echo "lsof -ti:$LOCAL_PORT | xargs kill -9"
    echo ""
}

# Run main function
main