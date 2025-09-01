# RewardsPro Architecture Documentation

## 🏗️ Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Shopify Admin                        │
│                    (Merchant Interface)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ Embedded App
┌─────────────────────▼───────────────────────────────────────┐
│                      Vercel Edge Network                     │
│                    (Global CDN + Functions)                  │
├─────────────────────────────────────────────────────────────┤
│                    Vercel Serverless Functions               │
│                        (Node.js Runtime)                     │
│                      ┌──────────────────┐                   │
│                      │   Remix App      │                   │
│                      │  - Routes        │                   │
│                      │  - Loaders       │                   │
│                      │  - Actions       │                   │
│                      └────────┬─────────┘                   │
│                               │                              │
│                      ┌────────▼─────────┐                   │
│                      │   Prisma ORM     │                   │
│                      │  - Type Safety   │                   │
│                      │  - Migrations    │                   │
│                      └────────┬─────────┘                   │
└───────────────────────────────┼─────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    AWS RDS Proxy      │
                    │  (Connection Pooling) │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │                                               │
┌───────▼────────┐                          ┌──────────▼────────┐
│ Aurora Writer  │                          │  Aurora Reader    │
│   (Primary)    │◄─────Replication─────────│   (Read Replica)  │
└────────────────┘                          └───────────────────┘
        │
┌───────▼────────┐
│  AWS Secrets   │
│    Manager     │
└────────────────┘
```

## 🌐 Vercel Deployment Architecture

### Function Configuration
```javascript
// vercel.json
{
  "functions": {
    "app/routes/*.tsx": {
      "maxDuration": 30,        // 30 seconds max
      "memory": 1024,           // 1GB RAM
      "runtime": "nodejs20.x"
    }
  },
  "regions": ["iad1"],          // us-east-1 (same as Aurora)
  "env": {
    "DATABASE_URL": "@database-url-pooled",
    "DIRECT_URL": "@database-url-direct"
  }
}
```

### Serverless Function Lifecycle
1. **Cold Start** (5-10 seconds first time)
   - Function container initialization
   - Node.js runtime boot
   - Remix app initialization
   - Prisma client creation
   - Aurora wake-up (if auto-paused)

2. **Warm Invocation** (<100ms)
   - Reuse existing container
   - Reuse Prisma connection
   - Direct query execution

3. **Container Recycling**
   - After ~5 minutes idle
   - Connection cleanup
   - Memory release

## 🗄️ AWS Aurora Serverless v2 Architecture

### Cluster Configuration
```yaml
Engine: Aurora PostgreSQL 15.4
Capacity Range: 0.5 - 1 ACU
Auto Pause: Enabled (5 minutes)
Backup Retention: 7 days
Multi-AZ: Enabled for production
Encryption: AWS KMS
```

### Aurora Capacity Units (ACU)
- **1 ACU** = 2 GB RAM + corresponding CPU
- **0.5 ACU** = 1 GB RAM (minimum)
- **Scaling time**: ~15 seconds
- **Cost**: $0.12 per ACU-hour

### Connection Management Strategy

#### Problem: Serverless Connection Exhaustion
```
Vercel Functions (100 concurrent) × Direct Connections (5 each) 
= 500 connections needed
Aurora Serverless max = 90 connections @ 1 ACU
Result: Connection pool exhaustion! ❌
```

#### Solution: RDS Proxy
```
Vercel Functions → RDS Proxy → Aurora
- Proxy maintains persistent connection pool
- Functions use lightweight proxy connections
- Multiplexing reduces actual database connections
```

## 🔌 Database Connection Patterns

### 1. Singleton Pattern (Current Implementation)
```typescript
// app/db.server.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { 
  prisma: PrismaClient 
};

export const prisma = globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL_POOLED
      }
    }
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

### 2. Read/Write Splitting (Recommended)
```typescript
// app/db.server.ts
export const writeDb = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_WRITER }
  }
});

export const readDb = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_READER }
  }
});

// Usage in routes
export const loader = async () => {
  const data = await readDb.customer.findMany();
  return json(data);
};

export const action = async () => {
  const result = await writeDb.customer.create({...});
  return json(result);
};
```

### 3. With Connection Retry (Production Ready)
```typescript
// app/utils/database.ts
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Check for Aurora pause or connection errors
      if (error.code === 'P1002' || error.code === 'P1001') {
        // Wait with exponential backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}

// Usage
export const loader = async () => {
  return withRetry(async () => {
    return await readDb.customer.findMany();
  });
};
```

## 🔐 Security Architecture

### Network Security
```yaml
VPC Configuration:
  - Private Subnets: Aurora cluster
  - Public Subnets: RDS Proxy (optional)
  - Security Groups:
    - Ingress: Port 5432 from RDS Proxy only
    - Egress: HTTPS to AWS services

IAM Roles:
  - Vercel Function Role: Read Secrets Manager
  - RDS Proxy Role: Connect to Aurora
  - Aurora Role: S3 access for imports/exports
```

### Secrets Management
```typescript
// AWS Secrets Manager Integration
import { SecretsManager } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManager({ region: "us-east-1" });

async function getDatabaseUrl(): Promise<string> {
  const secret = await client.getSecretValue({
    SecretId: "prod/rewardspro/database"
  });
  
  const { username, password, host, port, database } = 
    JSON.parse(secret.SecretString!);
    
  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
}
```

## 📊 Performance Optimization

### Query Optimization
```typescript
// Bad: N+1 Query Problem
const customers = await db.customer.findMany();
for (const customer of customers) {
  const tier = await db.tier.findUnique({
    where: { id: customer.tierId }
  });
}

// Good: Single Query with Relations
const customers = await db.customer.findMany({
  include: { 
    currentTier: true,
    _count: {
      select: { creditLedger: true }
    }
  }
});
```

### Caching Strategy
```typescript
// In-memory cache for frequently accessed data
const tierCache = new Map();

export async function getTier(id: string) {
  if (tierCache.has(id)) {
    return tierCache.get(id);
  }
  
  const tier = await db.tier.findUnique({ where: { id } });
  tierCache.set(id, tier);
  
  // Clear cache after 5 minutes
  setTimeout(() => tierCache.delete(id), 5 * 60 * 1000);
  
  return tier;
}
```

### Connection Pooling Settings
```ini
# Optimal for Aurora Serverless + Vercel
connection_limit=1      # Per function instance
pool_timeout=30        # Wait for connection
connect_timeout=30     # Initial connection
statement_timeout=20000 # 20 second query timeout
idle_in_transaction_session_timeout=30000
```

## 🚀 Deployment Pipeline

### Development → Staging → Production

#### Development (Local)
```bash
# .env.development
DATABASE_URL=postgresql://localhost:5432/rewardspro_dev
npm run dev
```

#### Staging (Vercel Preview)
```bash
# Automatic on PR
git push origin feature-branch
# Vercel creates preview deployment
# Uses staging Aurora cluster
```

#### Production (Vercel Production)
```bash
# Automatic on main branch
git push origin main
# Triggers production deployment
# Blue-green deployment with instant rollback
```

### Database Migration Strategy
```bash
# Safe migration process
1. Create migration: npx prisma migrate dev
2. Test locally: npm run dev
3. Deploy to staging: git push (PR)
4. Test on staging
5. Merge to main
6. Run migration: npx prisma migrate deploy
7. Monitor for issues
8. Rollback if needed: git revert && deploy
```

## 📈 Monitoring & Observability

### Key Metrics to Track
```typescript
// Datadog or CloudWatch Metrics
- Database connection pool usage
- Query execution time (P50, P95, P99)
- Aurora ACU consumption
- Vercel function duration
- Cold start frequency
- Error rates by route
- Webhook processing time
```

### Alerting Thresholds
```yaml
Critical:
  - Connection pool > 80% utilized
  - Query time > 10 seconds
  - Error rate > 1%
  - Aurora ACU at maximum

Warning:
  - Connection pool > 60% utilized
  - Query time > 5 seconds
  - Cold starts > 10% of requests
  - Database storage > 80%
```

## 🔄 Disaster Recovery

### Backup Strategy
- **Automated Backups**: Daily, 7-day retention
- **Manual Snapshots**: Before major changes
- **Point-in-Time Recovery**: Up to 5 minutes ago
- **Cross-Region Backup**: For critical data

### Failure Scenarios

#### Aurora Failure
```typescript
// Automatic failover to read replica
// RDS Proxy handles connection routing
// ~30 second failover time
```

#### Region Failure
```typescript
// Vercel Edge Network routes to another region
// Database requires manual failover to backup region
// RPO: 1 hour, RTO: 2 hours
```

## 💰 Cost Optimization

### Estimated Monthly Costs
```yaml
Aurora Serverless (0.5-1 ACU): $43-86
RDS Proxy: $15
Secrets Manager: $0.40
Backup Storage (100GB): $2.30
Data Transfer: ~$10
Vercel Pro: $20
Total: ~$90-133/month
```

### Cost Reduction Strategies
1. **Auto-pause Aurora** after 5 minutes idle
2. **Use Reserved Capacity** for predictable workloads
3. **Optimize queries** to reduce ACU consumption
4. **Cache aggressively** to reduce database hits
5. **Use Edge Functions** for non-database routes

## 📚 References

- [AWS Aurora Serverless v2 Guide](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [Vercel Functions Documentation](https://vercel.com/docs/functions)
- [Prisma Connection Management](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [RDS Proxy Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html)
- [Shopify App Architecture](https://shopify.dev/docs/apps/build/architecture)

---

*Last Updated: September 1, 2025*