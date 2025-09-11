#!/bin/bash

# Script to apply billing schema migration to production database
# This should be run on a machine with access to the AWS Aurora database

echo "=========================================="
echo "Billing Schema Migration Script"
echo "=========================================="
echo ""
echo "This script will update the database schema to support the new billing system."
echo "It will modify the following tables:"
echo "  - BillingPlan: Add new fields for managed pricing"
echo "  - UsageRecord: Transform from order tracking to usage charges"
echo "  - Create new tables: BillingHistory, Notification"
echo ""
echo "IMPORTANT: This migration should be applied during a maintenance window."
echo ""

# Check if we have the DATABASE_URL environment variable
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    echo "Please set it to your production database URL"
    exit 1
fi

echo "Using database: $DATABASE_URL"
echo ""
read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Migration cancelled"
    exit 0
fi

echo ""
echo "Applying migration..."
echo ""

# Apply the migration using Prisma
npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Verify the billing page loads correctly"
    echo "2. Test creating usage charges"
    echo "3. Monitor for any errors in the logs"
else
    echo ""
    echo "❌ Migration failed!"
    echo "Please check the error messages above and contact support if needed."
    exit 1
fi