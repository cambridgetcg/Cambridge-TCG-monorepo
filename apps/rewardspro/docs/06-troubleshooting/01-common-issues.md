# RewardsPro Troubleshooting Guide

## 🚨 Common Issues & Solutions

### 🔴 Critical Issues

#### Application Won't Start

**Symptoms:**
- `npm run dev` fails
- Port already in use error
- Module not found errors

**Solutions:**
```bash
# 1. Clear all caches and reinstall
rm -rf node_modules .cache build
npm install
npx prisma generate

# 2. Check port conflicts
lsof -i :3000  # Find process using port
kill -9 <PID>  # Kill the process

# 3. Verify environment variables
cp .env.example .env.local
# Edit .env.local with correct values

# 4. Reset Prisma client
npx prisma generate --force
```

#### Database Connection Failed

**Symptoms:**
- "Can't reach database server" error
- Timeout errors
- "ECONNREFUSED" errors

**Solutions:**
```bash
# 1. Test database connection
npx prisma db pull

# 2. Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:5432/dbname

# 3. For Aurora Data API issues
export FORCE_DATA_API=true
npm run dev

# 4. Verify AWS credentials
aws sts get-caller-identity

# 5. Check network/firewall
curl -I https://your-database-host.amazonaws.com
```

#### Authentication Errors

**Symptoms:**
- "Invalid shop domain" error
- OAuth redirect fails
- Session not found

**Solutions:**
```typescript
// 1. Clear sessions
await db.session.deleteMany({
  where: { shop: session.shop }
});

// 2. Verify Shopify credentials
console.log({
  apiKey: process.env.SHOPIFY_API_KEY?.substring(0, 5) + '...',
  hasSecret: !!process.env.SHOPIFY_API_SECRET,
  appUrl: process.env.SHOPIFY_APP_URL
});

// 3. Check callback URLs in Partner Dashboard
// Should match: https://your-app.com/auth/callback

// 4. Force re-authentication
return redirect(`/auth/login?shop=${shop}`);
```

### 🟡 Performance Issues

#### Slow Page Loads

**Diagnosis:**
```typescript
// Add timing logs
const startTime = Date.now();
const data = await db.customer.findMany();
console.log(`Query took ${Date.now() - startTime}ms`);
```

**Solutions:**
```typescript
// 1. Add pagination
const customers = await db.customer.findMany({
  take: 20,
  skip: page * 20,
  orderBy: { createdAt: 'desc' }
});

// 2. Use select to limit fields
const customers = await db.customer.findMany({
  select: {
    id: true,
    email: true,
    storeCredit: true
  }
});

// 3. Add database indexes
// In schema.prisma:
@@index([shop, createdAt])

// 4. Implement caching
const cached = cache.get(key);
if (cached) return cached;
```

#### High Memory Usage

**Symptoms:**
- Function timeout errors
- Out of memory errors
- Slow response times

**Solutions:**
```typescript
// 1. Process in batches
async function processBatch(items: any[], batchSize = 100) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processItems(batch);
    
    // Allow garbage collection
    if (global.gc) global.gc();
  }
}

// 2. Stream large datasets
const stream = db.customer.findMany({
  cursor: { id: lastId },
  take: 100
});

// 3. Clear unnecessary data
delete largeObject.unnecessaryField;
largeArray.length = 0;
```

### 🟢 Development Issues

#### TypeScript Errors

**Common Errors & Fixes:**

```typescript
// Error: Type 'string | null' is not assignable to type 'string'
// Fix: Use nullish coalescing
const value = possiblyNull ?? 'default';

// Error: Property doesn't exist on type
// Fix: Add type assertion or guard
if ('property' in object) {
  console.log(object.property);
}

// Error: Cannot find module
// Fix: Check import paths and install types
npm install --save-dev @types/package-name

// Error: Parameter implicitly has 'any' type
// Fix: Add explicit types
function process(data: DataType): ResultType {
  // ...
}
```

#### Prisma Issues

**Schema Sync Problems:**
```bash
# 1. Force regenerate client
npx prisma generate --force

# 2. Reset and pull schema
npx prisma db pull --force

# 3. Clear Prisma engine cache
rm -rf node_modules/.prisma

# 4. Introspect database
npx prisma db pull
npx prisma generate
```

**Migration Failures:**
```bash
# 1. Check migration status
npx prisma migrate status

# 2. Resolve failed migration
npx prisma migrate resolve --applied "20240101000000_failed_migration"

# 3. Create manual migration
npx prisma migrate dev --create-only

# 4. Reset database (CAUTION: Data loss!)
npx prisma migrate reset
```

### 🔵 Webhook Issues

#### Webhook Not Triggering

**Diagnosis:**
```typescript
// Add webhook debug logging
export const action = async ({ request }: ActionFunctionArgs) => {
  console.log('Webhook received:', {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    url: request.url
  });
  
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log('Webhook authenticated:', { topic, shop });
  
  // Process webhook...
};
```

**Solutions:**
```bash
# 1. Verify webhook registration
curl -X GET "https://${SHOP}/admin/api/2024-01/webhooks.json" \
  -H "X-Shopify-Access-Token: ${TOKEN}"

# 2. Test webhook manually
curl -X POST http://localhost:3000/webhooks/orders.paid \
  -H "X-Shopify-Topic: orders/paid" \
  -H "X-Shopify-Hmac-Sha256: ${HMAC}" \
  -H "X-Shopify-Shop-Domain: ${SHOP}" \
  -d '{"id":"123","total_price":"100.00"}'

# 3. Check ngrok/tunnel
ngrok http 3000
# Use the HTTPS URL for webhooks
```

#### HMAC Verification Failed

**Solutions:**
```typescript
// 1. Verify secret is correct
const secret = process.env.SHOPIFY_API_SECRET;
console.log('Secret exists:', !!secret);

// 2. Manual HMAC verification
import crypto from 'crypto';

function verifyWebhook(rawBody: string, hmacHeader: string) {
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  return hash === hmacHeader;
}

// 3. Check request body handling
// Ensure raw body is preserved
export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
  
  if (!verifyWebhook(rawBody, hmac!)) {
    throw new Response('Unauthorized', { status: 401 });
  }
  
  const payload = JSON.parse(rawBody);
  // Process webhook...
};
```

### ⚡ Aurora Data API Issues

#### "Cannot read properties of undefined"

**Issue:** Prisma client not initialized for Data API

**Solution:**
```typescript
// app/db.server.ts
import { getPrismaClient } from './utils/aurora-data-api-adapter';

let db: PrismaClient;

if (process.env.FORCE_DATA_API || !process.env.DATABASE_URL) {
  db = getPrismaClient(); // Use Data API adapter
} else {
  db = new PrismaClient(); // Use direct connection
}

export default db;
```

#### "Field 'id' doesn't have a default value"

**Issue:** Aurora Data API doesn't support auto-generated UUIDs

**Solution:**
```typescript
import { v4 as uuidv4 } from 'uuid';

// Always provide explicit IDs
await db.customer.create({
  data: {
    id: uuidv4(), // Explicit UUID
    shop: session.shop,
    email: customer.email,
    createdAt: new Date(), // Explicit timestamp
    updatedAt: new Date()
  }
});
```

### 🔍 Debugging Techniques

#### Enable Detailed Logging

```typescript
// 1. Prisma query logging
const db = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

// 2. Request/Response logging
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('Request:', {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers)
  });
  
  const data = await getData();
  
  console.log('Response:', {
    dataCount: data.length,
    status: 'success'
  });
  
  return json(data);
};

// 3. Performance timing
console.time('operation');
await expensiveOperation();
console.timeEnd('operation');
```

#### Use Debug Mode

```bash
# Enable Node.js debugging
NODE_OPTIONS='--inspect' npm run dev

# Enable Remix debugging
DEBUG='remix:*' npm run dev

# Enable Prisma debugging  
DEBUG='prisma:*' npm run dev
```

#### Browser DevTools

```javascript
// Add breakpoints in browser
debugger; // Execution will pause here

// Console debugging
console.table(data); // Display data in table format
console.trace(); // Show call stack
console.group('Group'); // Group related logs
console.groupEnd();
```

### 📊 Monitoring & Alerts

#### Set Up Health Checks

```typescript
// app/routes/health.tsx
export const loader = async () => {
  const checks = {
    database: 'unknown',
    shopify: 'unknown',
    redis: 'unknown'
  };
  
  // Check database
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }
  
  // Check Shopify API
  try {
    await fetch('https://shopify.dev/api/health');
    checks.shopify = 'healthy';
  } catch {
    checks.shopify = 'unhealthy';
  }
  
  const allHealthy = Object.values(checks).every(s => s === 'healthy');
  
  return json(checks, { 
    status: allHealthy ? 200 : 503 
  });
};
```

#### Error Tracking

```typescript
// Global error handler
export function ErrorBoundary() {
  const error = useRouteError();
  
  // Log to monitoring service
  if (process.env.NODE_ENV === 'production') {
    logErrorToService(error);
  }
  
  return <ErrorPage error={error} />;
}

// Async error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  // Send to monitoring
});
```

### 🛠️ Recovery Procedures

#### Database Recovery

```bash
# 1. Backup current state
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 2. Restore from backup
psql $DATABASE_URL < backup.sql

# 3. Restore specific tables
pg_dump -t customers $DATABASE_URL > customers.sql
psql $DATABASE_URL < customers.sql

# 4. Point-in-time recovery (Aurora)
aws rds restore-db-cluster-to-point-in-time \
  --restore-to-time 2024-01-01T03:00:00.000Z \
  --source-db-cluster-identifier prod-cluster \
  --db-cluster-identifier restored-cluster
```

#### Session Recovery

```typescript
// Clear corrupted sessions
await db.session.deleteMany({
  where: {
    OR: [
      { expires: { lt: new Date() } },
      { accessToken: null }
    ]
  }
});

// Force re-authentication
return redirect('/auth/login?shop=' + shop);
```

### 🔒 Security Incident Response

#### Suspected Breach

1. **Immediate Actions:**
```bash
# Rotate all secrets
SHOPIFY_API_SECRET=new_secret
DATABASE_URL=new_connection_string

# Invalidate sessions
await db.session.deleteMany();

# Check access logs
grep "suspicious-pattern" /var/log/access.log
```

2. **Investigation:**
```sql
-- Check for unusual database activity
SELECT * FROM pg_stat_activity;

-- Review recent changes
SELECT * FROM customers 
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;
```

3. **Recovery:**
```bash
# Restore from clean backup
psql $DATABASE_URL < clean_backup.sql

# Re-deploy clean code
git checkout last-known-good
vercel --prod
```

### 📝 Troubleshooting Checklist

#### Initial Diagnosis
- [ ] Check error logs
- [ ] Verify environment variables
- [ ] Test database connection
- [ ] Check API credentials
- [ ] Review recent changes
- [ ] Check system resources

#### Resolution Steps
- [ ] Identify root cause
- [ ] Test fix locally
- [ ] Deploy to preview
- [ ] Verify in preview
- [ ] Deploy to production
- [ ] Monitor for recurrence

#### Post-Incident
- [ ] Document issue
- [ ] Update runbook
- [ ] Add monitoring
- [ ] Share learnings
- [ ] Implement prevention

## 🆘 Getting Help

### Internal Resources
- Check this troubleshooting guide
- Review error logs in Vercel
- Check AWS CloudWatch metrics
- Search previous incidents

### External Resources
- [Remix Troubleshooting](https://remix.run/docs/en/main/guides/debugging)
- [Prisma Debugging](https://www.prisma.io/docs/concepts/components/prisma-client/debugging)
- [Shopify Community](https://community.shopify.com)
- [Vercel Support](https://vercel.com/support)

## 📚 Related Documentation

- [development.md](./development.md) - Development setup
- [database.md](./database.md) - Database operations
- [deployment.md](./deployment.md) - Deployment procedures
- [architecture.md](./architecture.md) - System design