#!/bin/bash

# Development script that skips database migrations
# Use this instead of "shopify app dev" when using Aurora Data API

echo "🚀 Starting Shopify app development (skipping database migrations)..."
echo "💡 Using Aurora Data API - no direct database connection needed"

# Set environment variable to skip migrations
export SKIP_DB_CHECKS=1

# Run Shopify CLI dev without triggering migrations
npx shopify app dev --skip-dependencies-installation 2>&1 | grep -v "npx prisma migrate deploy" || true

