#!/bin/bash

# Subscription Billing Cron Job Setup Script
# This script sets up automated billing processing for subscriptions

echo "Setting up subscription billing cron jobs..."

# Get the API endpoint URL
read -p "Enter your app URL (e.g., https://rewardspro-production-nnwf.vercel.app): " APP_URL

# Get the internal API key
read -p "Enter internal API key for cron authentication: " API_KEY

# Create the cron script
cat > /tmp/subscription-billing-cron.sh << 'EOF'
#!/bin/bash

# Subscription Billing Cron Script
# Runs daily to process subscription billing

APP_URL="REPLACE_APP_URL"
API_KEY="REPLACE_API_KEY"
LOG_FILE="/var/log/subscription-billing.log"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to process billing for a shop
process_shop_billing() {
    local shop=$1
    
    log_message "Processing billing for shop: $shop"
    
    # Process due billings
    response=$(curl -s -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "shop=$shop&action=process-due" \
        "$APP_URL/api/subscriptions/process-billing")
    
    log_message "Due billings response: $response"
    
    # Retry failed billings
    response=$(curl -s -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "shop=$shop&action=retry-failed" \
        "$APP_URL/api/subscriptions/process-billing")
    
    log_message "Retry failed response: $response"
    
    # Run health check
    response=$(curl -s -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "shop=$shop&action=health-check" \
        "$APP_URL/api/subscriptions/process-billing")
    
    log_message "Health check response: $response"
}

# Main execution
log_message "Starting subscription billing cron job"

# Get list of shops with active subscriptions
# In production, this would query your database or API
SHOPS=("your-shop.myshopify.com")

# Process each shop
for shop in "${SHOPS[@]}"; do
    process_shop_billing "$shop"
done

log_message "Subscription billing cron job completed"
EOF

# Replace placeholders
sed -i "s|REPLACE_APP_URL|$APP_URL|g" /tmp/subscription-billing-cron.sh
sed -i "s|REPLACE_API_KEY|$API_KEY|g" /tmp/subscription-billing-cron.sh

# Make the script executable
chmod +x /tmp/subscription-billing-cron.sh

# Add to crontab (runs daily at 2 AM)
echo "Adding cron job to run daily at 2 AM..."
(crontab -l 2>/dev/null; echo "0 2 * * * /tmp/subscription-billing-cron.sh") | crontab -

echo "Cron job setup complete!"
echo ""
echo "The following cron job has been added:"
echo "0 2 * * * /tmp/subscription-billing-cron.sh"
echo ""
echo "To view your cron jobs, run: crontab -l"
echo "To edit cron schedule, run: crontab -e"
echo "To remove the cron job, run: crontab -r"
echo ""
echo "Logs will be written to: /var/log/subscription-billing.log"
echo ""
echo "For production, consider using:"
echo "- AWS Lambda with EventBridge for serverless scheduling"
echo "- Vercel Cron Jobs for edge function scheduling"
echo "- GitHub Actions for scheduled workflows"