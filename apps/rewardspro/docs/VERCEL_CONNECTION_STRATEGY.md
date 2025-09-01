# Vercel Deployment Connection Strategy

## 🚨 The Problem

### Connection Exhaustion Scenario
```
Aurora Serverless (1 ACU) = 90 max connections

Typical Vercel deployment pattern:
- 1 Production deployment
- 5-10 Preview deployments (PRs)
- 5-10 Old deployments (not cleaned up)

If each uses 5 connections:
20 deployments × 5 connections = 100 connections needed
Result: CONNECTION POOL EXHAUSTED ❌
```

### Real-World Impact
1. **Production Outages**: New production deployment can't connect
2. **Preview Failures**: PR previews fail randomly
3. **Cost Increase**: Aurora can't scale down with open connections
4. **Performance Issues**: Connection timeout errors

## ✅ The Solution: Environment-Based Connection Strategy

### Strategy Overview
```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Deployments                    │
├───────────────┬────────────────┬────────────────────────┤
│  Production   │    Preview      │     Development        │
│  (Latest)     │    (PRs)        │     (Local)           │
└───────┬───────┴────────┬───────┴────────┬───────────────┘
        │                │                 │
        ▼                ▼                 ▼
   RDS Proxy        Data API          Direct Connection
   (Pooled)         (No Pool)         (Local DB)
        │                │                 │
        └────────────────┴─────────────────┘
                         │
                         ▼
                 Aurora Serverless
                  (eu-north-1)
```

## 🔧 Implementation Plan

### Phase 1: Environment Detection
```typescript
// app/utils/connection-strategy.ts
export function getConnectionStrategy() {
  const env = process.env.VERCEL_ENV;
  
  switch(env) {
    case 'production':
      return {
        type: 'rds-proxy',
        maxConnections: 5,
        idleTimeout: 60
      };
    
    case 'preview':
      return {
        type: 'data-api',
        maxConnections: 0,  // No persistent connections
        fallback: true
      };
    
    default:  // development
      return {
        type: 'direct',
        maxConnections: 10,
        url: process.env.DATABASE_URL
      };
  }
}
```

### Phase 2: Prisma Configuration
```typescript
// app/db.server.ts
import { PrismaClient } from "@prisma/client";
import { getAuroraClient } from "./utils/aurora-data-api";
import { getConnectionStrategy } from "./utils/connection-strategy";

function createPrismaClient() {
  const strategy = getConnectionStrategy();
  
  if (strategy.type === 'data-api') {
    // Use Data API adapter for preview deployments
    return createDataAPIPrismaClient();
  }
  
  // Use direct connection for production/development
  return new PrismaClient({
    datasources: {
      db: {
        url: strategy.type === 'rds-proxy' 
          ? process.env.DATABASE_URL_PROXY 
          : process.env.DATABASE_URL
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  });
}

// Singleton pattern
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### Phase 3: Data API Adapter for Prisma
```typescript
// app/utils/prisma-data-api-adapter.ts
import { getAuroraClient } from "./aurora-data-api";

export function createDataAPIPrismaClient() {
  const aurora = getAuroraClient();
  
  // Create a Prisma-compatible interface using Data API
  return {
    $executeRaw: async (query: string, ...params: any[]) => {
      const result = await aurora.executeStatement(query, params);
      return result.numberOfRecordsUpdated || 0;
    },
    
    $queryRaw: async (query: string, ...params: any[]) => {
      const result = await aurora.executeStatement(query, params);
      return result.records;
    },
    
    // Implement model proxies
    customer: createModelProxy('Customer'),
    tier: createModelProxy('Tier'),
    // ... other models
  };
}

function createModelProxy(modelName: string) {
  return {
    findMany: async (args?: any) => {
      // Convert Prisma query to SQL
      const sql = prismaToSQL('SELECT', modelName, args);
      return await executeQuery(sql);
    },
    
    create: async (args: any) => {
      const sql = prismaToSQL('INSERT', modelName, args);
      return await executeQuery(sql);
    },
    
    // ... other operations
  };
}
```

### Phase 4: RDS Proxy Configuration (AWS)
```json
{
  "DBProxyName": "rewardspro-proxy",
  "EngineFamily": "POSTGRESQL",
  "Auth": [
    {
      "AuthScheme": "SECRETS",
      "SecretArn": "arn:aws:secretsmanager:eu-north-1:043509841549:secret:rds!cluster-xxx"
    }
  ],
  "RoleArn": "arn:aws:iam::043509841549:role/rds-proxy-role",
  "DBProxyTargets": [
    {
      "DBClusterIdentifiers": ["rewardspro-dev"]
    }
  ],
  "MaxConnectionsPercent": 100,
  "MaxIdleConnectionsPercent": 50,
  "ConnectionBorrowTimeout": 120,
  "IdleClientTimeout": 1800
}
```

### Phase 5: Vercel Environment Variables
```bash
# Production Environment
VERCEL_ENV=production
DATABASE_URL_PROXY=postgresql://username:password@proxy.proxy-xyz.eu-north-1.rds.amazonaws.com:5432/rewardspro
CONNECTION_LIMIT=5

# Preview Environment
VERCEL_ENV=preview
AURORA_RESOURCE_ARN=arn:aws:rds:eu-north-1:xxx
AURORA_SECRET_ARN=arn:aws:secretsmanager:xxx
USE_DATA_API=true
CONNECTION_LIMIT=0

# Both Environments
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=eu-north-1
```

## 📊 Monitoring & Alerts

### CloudWatch Metrics
```typescript
// app/utils/monitoring.ts
export async function trackConnectionMetrics() {
  const cloudWatch = new CloudWatchClient({ region: 'eu-north-1' });
  
  await cloudWatch.send(new PutMetricDataCommand({
    Namespace: 'RewardsPro/Database',
    MetricData: [
      {
        MetricName: 'ActiveConnections',
        Value: getActiveConnectionCount(),
        Unit: 'Count',
        Dimensions: [
          { Name: 'Environment', Value: process.env.VERCEL_ENV },
          { Name: 'DeploymentId', Value: process.env.VERCEL_DEPLOYMENT_ID }
        ]
      }
    ]
  }));
}
```

### Alarms
- Alert when connections > 70 (77% of max)
- Alert when Data API latency > 1 second
- Alert when connection timeouts > 1%

## 💰 Cost Analysis

### Without Strategy
- Aurora always running: $86/month (1 ACU continuous)
- Connection failures: Lost revenue
- Manual intervention: Developer time

### With Strategy
- Aurora auto-pauses: $43/month (0.5 ACU average)
- RDS Proxy: $15/month
- Zero connection failures
- **Total Savings: ~$28/month + prevented outages**

## 🚀 Rollout Plan

### Week 1: Development & Testing
1. Implement connection strategy logic
2. Test Data API adapter
3. Verify preview deployments work

### Week 2: RDS Proxy Setup
1. Create RDS Proxy in AWS
2. Test connection pooling
3. Update production environment

### Week 3: Production Rollout
1. Deploy to production with feature flag
2. Monitor metrics for 48 hours
3. Remove feature flag if stable

## ⚠️ Rollback Plan

If issues occur:
1. Set `FORCE_DIRECT_CONNECTION=true` in Vercel
2. All deployments use direct connection
3. Debug and fix issues
4. Re-enable strategy

## 📋 Checklist

- [ ] Environment detection implemented
- [ ] Data API adapter created
- [ ] RDS Proxy configured
- [ ] Vercel environments updated
- [ ] Monitoring enabled
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained on new approach

## 🎯 Success Criteria

1. **Zero connection pool exhaustion errors**
2. **Preview deployments work 100% of time**
3. **Production latency unchanged (<50ms)**
4. **Aurora auto-pauses when idle**
5. **Cost reduction of 30%+**

---

*This strategy ensures scalability, reliability, and cost-effectiveness for the RewardsPro application on Vercel with Aurora Serverless.*