# 🧪 Testing Data API on Vercel

## Local Test Results ✅

The Data API connection is **working perfectly** locally:

```
✅ Connected successfully!
✅ Response time: ~1 second
✅ Database: PostgreSQL 16.6
✅ Found 7 tables (all schema present)
✅ Migrations applied: 1
✅ Transaction support: Working
```

## Testing on Vercel Deployment

### Method 1: Health Check Endpoint (Recommended)

Once deployed, visit:
```
https://your-app.vercel.app/api/health
```

This endpoint will return JSON with:
- Connection status
- Environment details
- Data API test results
- Response times
- Error details (if any)

### Method 2: Using curl

```bash
# Replace with your actual Vercel URL
curl https://your-app.vercel.app/api/health | jq '.'
```

### Method 3: Browser Console

Open your deployed app and run in browser console:
```javascript
fetch('/api/health')
  .then(r => r.json())
  .then(data => console.log(data));
```

## Expected Healthy Response

```json
{
  "status": "healthy",
  "timestamp": "2025-09-01T14:24:30.432Z",
  "environment": {
    "VERCEL_ENV": "production",
    "NODE_ENV": "production",
    "AWS_REGION": "eu-north-1"
  },
  "dataAPI": {
    "configured": true,
    "connected": true,
    "error": null,
    "responseTime": 1021,
    "testQuery": {
      "success": true,
      "result": {
        "test": 1,
        "current_time": "2025-09-01 14:24:30.432869"
      }
    },
    "schemaInfo": {
      "publicTables": 7
    }
  },
  "aurora": {
    "resourceArn": "✅ Set",
    "secretArn": "✅ Set",
    "databaseName": "rewardspro",
    "databaseVersion": "PostgreSQL 16.6"
  }
}
```

## Troubleshooting

### If you get "unhealthy" status:

1. **Check Vercel Environment Variables**
   - All AWS and Aurora variables must be set
   - Go to Vercel Dashboard → Settings → Environment Variables

2. **Check Error Details**
   - Look at `dataAPI.error` in the response
   - Common issues:
     - Wrong AWS region
     - Invalid credentials
     - Cluster is paused
     - IAM permissions

3. **Verify in Vercel Functions Logs**
   ```bash
   vercel logs --filter=api/health
   ```

### If you get 503 "unconfigured":
- Missing environment variables
- Check which ones are missing in the response

### If you get timeout:
- Aurora cluster might be paused (cold start)
- First request can take 5-10 seconds
- Retry after a moment

## Quick Verification Commands

### From your local machine:
```bash
# Test local connection
npx tsx test-data-api.ts

# Test deployed app health
curl https://your-app.vercel.app/api/health
```

### From Vercel CLI:
```bash
# View recent logs
vercel logs --environment=production

# View function logs
vercel logs --filter=api/health
```

## Success Indicators

✅ `/api/health` returns status: "healthy"
✅ Response time < 2 seconds
✅ All 7 tables visible
✅ No errors in dataAPI.error field
✅ Database version shows PostgreSQL 16.x

## Next Steps After Verification

1. **Test actual app functionality**
   - Try creating a Tier
   - View Customers page
   - Check Shopify integration

2. **Monitor performance**
   - Check AWS CloudWatch for Data API metrics
   - Monitor Vercel Analytics for response times

3. **Set up monitoring**
   - Add uptime monitoring to `/api/health`
   - Set up alerts for failures

---

**Note**: The first request after Aurora auto-pause may take 5-10 seconds (cold start). Subsequent requests will be fast (~100-500ms).