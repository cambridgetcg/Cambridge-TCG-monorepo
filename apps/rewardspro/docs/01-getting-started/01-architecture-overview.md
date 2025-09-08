# RewardsPro Architecture Guide

## 🎯 System Overview

RewardsPro is a production-grade Shopify loyalty rewards application built with modern web technologies and cloud-native architecture. The system prioritizes scalability, reliability, and developer experience while maintaining cost efficiency.

## 🏗️ Core Architecture Principles

### 1. **Serverless First**
- Zero server management overhead
- Automatic scaling based on demand
- Pay-per-use pricing model
- Global edge distribution via Vercel

### 2. **Type Safety Throughout**
- TypeScript for compile-time safety
- Prisma for database type generation
- Zod schemas for runtime validation
- Strict mode enabled across the stack

### 3. **Connection Efficiency**
- Aurora Data API for zero persistent connections
- Prevents connection pool exhaustion
- Ideal for serverless environments
- No connection warm-up delays

### 4. **Security by Design**
- HMAC webhook signature verification
- Session-based authentication
- Environment-specific secrets
- GDPR compliance built-in

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Shopify Admin                            │
│                    (Merchant Dashboard)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ OAuth 2.0 + App Bridge
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                           │
│               (Global CDN + Edge Functions)                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Preview    │  │  Production  │  │ Development  │          │
│  │ Deployments  │  │  Deployment  │  │   (Local)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                 │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │   Remix App     │                           │
│                   │                 │                           │
│                   │  ┌───────────┐  │                           │
│                   │  │  Routes   │  │                           │
│                   │  ├───────────┤  │                           │
│                   │  │  Loaders  │  │                           │
│                   │  ├───────────┤  │                           │
│                   │  │  Actions  │  │                           │
│                   │  └───────────┘  │                           │
│                   └────────┬────────┘                           │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Prisma ORM    │
                    │                 │
                    │ • Type Safety   │
                    │ • Migrations    │
                    │ • Query Builder │
                    └────────┬────────┘
                             │
                ┌────────────▼────────────┐
                │   Aurora Data API       │
                │                         │
                │ • Zero Connections      │
                │ • Auto-scaling          │
                │ • Serverless v2         │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
│  Aurora Writer  │  │ Aurora Reader  │  │ AWS Secrets   │
│   (Primary DB)  │  │  (Read Replica)│  │   Manager     │
└────────────────┘  └────────────────┘  └────────────────┘
```

## 🔄 Request Flow Architecture

### Standard Page Request Flow
```
1. User navigates to app page in Shopify Admin
2. Request hits Vercel Edge Network
3. Edge function routes to nearest region
4. Remix loader authenticates via Shopify
5. Prisma queries database via Data API
6. React components render with Polaris UI
7. Response cached at edge when applicable
```

### Webhook Processing Flow
```
1. Shopify sends webhook to endpoint
2. Vercel function receives request
3. HMAC signature verification
4. Business logic processing
5. Database updates via Data API
6. Response acknowledgment to Shopify
```

### API Request Flow
```
1. Client makes authenticated request
2. Session validation in middleware
3. Route action processes request
4. Database operations via Prisma
5. JSON response with proper headers
```

## 🏛️ Architectural Layers

### 1. **Presentation Layer**
- **Technology**: React + Remix + Polaris
- **Responsibilities**:
  - User interface rendering
  - Form handling and validation
  - Real-time UI updates
  - Responsive design
- **Key Components**:
  - Page routes (`/app/routes/*.tsx`)
  - Shared components (`/app/components/*.tsx`)
  - Polaris design system integration

### 2. **Application Layer**
- **Technology**: Remix Loaders/Actions
- **Responsibilities**:
  - Business logic implementation
  - Request/response handling
  - Authentication & authorization
  - Data transformation
- **Key Components**:
  - Route loaders (data fetching)
  - Route actions (data mutations)
  - Service classes (`/app/services/*.ts`)

### 3. **Data Access Layer**
- **Technology**: Prisma ORM
- **Responsibilities**:
  - Database abstraction
  - Query optimization
  - Type-safe database operations
  - Migration management
- **Key Components**:
  - Prisma schema (`/prisma/schema.prisma`)
  - Generated client (`@prisma/client`)
  - Custom adapters (`/app/utils/*-adapter.ts`)

### 4. **Infrastructure Layer**
- **Technology**: AWS Aurora + Vercel
- **Responsibilities**:
  - Data persistence
  - Scalability & availability
  - Security & compliance
  - Performance optimization
- **Key Components**:
  - Aurora Serverless v2 cluster
  - Data API endpoint
  - Secrets Manager
  - Vercel Edge Network

## 🔐 Security Architecture

### Authentication Flow
```typescript
// Multi-layer authentication strategy
1. OAuth 2.0 with Shopify
2. Session tokens in database
3. HMAC verification for webhooks
4. API key validation for extensions
```

### Data Protection
- **Encryption at Rest**: AWS managed keys
- **Encryption in Transit**: TLS 1.3
- **Secret Management**: AWS Secrets Manager
- **Access Control**: IAM roles and policies

### Security Headers
```typescript
// Implemented in app/utils/security-headers.ts
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security
```

## 🚀 Performance Architecture

### Optimization Strategies

#### 1. **Database Performance**
- Connection pooling via Data API
- Read replicas for query distribution
- Indexed fields for common queries
- Batch operations where possible

#### 2. **Application Performance**
- Code splitting with Remix
- Lazy loading of components
- Edge caching with Vercel
- Optimistic UI updates

#### 3. **Frontend Performance**
- Progressive enhancement
- Resource hints (preload/prefetch)
- Image optimization
- Minimal JavaScript bundles

### Caching Strategy
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Vercel CDN │────▶│  Database   │
│    Cache    │     │    Cache    │     │    Cache    │
└─────────────┘     └─────────────┘     └─────────────┘
     1 min              5 min              Query cache
```

## 🔧 Technology Decisions

### Why Remix?
- **Server-side rendering** for better SEO and performance
- **Progressive enhancement** works without JavaScript
- **Built-in data loading** patterns with loaders/actions
- **Nested routing** matches Shopify's UI patterns
- **Error boundaries** for graceful error handling

### Why Aurora Serverless?
- **Auto-scaling** from 0.5 to 1 ACU
- **Pay-per-use** pricing model
- **Data API** perfect for serverless
- **Automatic backups** and failover
- **PostgreSQL compatibility** with Prisma

### Why Vercel?
- **Global edge network** for low latency
- **Automatic deployments** from Git
- **Preview deployments** for testing
- **Built-in analytics** and monitoring
- **Seamless Remix integration**

### Why Prisma?
- **Type safety** with TypeScript
- **Intuitive schema** definition
- **Powerful migrations** system
- **Query optimization** built-in
- **Great developer experience**

## 📈 Scalability Architecture

### Horizontal Scaling
- **Vercel Functions**: Auto-scales to thousands of concurrent executions
- **Aurora Serverless**: Scales from 0.5 to 384 ACUs
- **Data API**: Handles connection pooling automatically

### Vertical Scaling
- **Database**: Can increase ACU allocation
- **Functions**: Can increase memory/timeout
- **Storage**: Unlimited with Aurora

### Load Distribution
```
        Load Balancer (Vercel)
               │
    ┌──────────┼──────────┐
    │          │          │
Function 1  Function 2  Function N
    │          │          │
    └──────────┼──────────┘
               │
         Aurora Data API
               │
         Aurora Cluster
```

## 🔄 Deployment Architecture

### Environment Strategy
1. **Development**: Local development with Shopify CLI
2. **Preview**: Automatic deployments for PRs
3. **Staging**: Pre-production testing
4. **Production**: Live merchant environment

### CI/CD Pipeline
```
Git Push → GitHub → Vercel Build → Deploy → Health Check → Live
                         ↓
                    Type Check
                         ↓
                    Lint Check
                         ↓
                    Migration Run
```

## 📊 Monitoring Architecture

### Application Monitoring
- **Vercel Analytics**: Performance metrics
- **Error Tracking**: Console logs to Vercel
- **Custom Metrics**: Business KPIs

### Database Monitoring
- **Aurora Metrics**: CloudWatch integration
- **Query Performance**: Slow query logs
- **Connection Metrics**: Data API dashboard

### Alerting Strategy
- Database connection failures
- High error rates
- Performance degradation
- Webhook processing failures

## 🎯 Architecture Best Practices

### 1. **Separation of Concerns**
- Clear layer boundaries
- Single responsibility principle
- Dependency injection where needed

### 2. **Fail-Safe Design**
- Graceful degradation
- Circuit breakers for external calls
- Retry logic with exponential backoff

### 3. **Observability**
- Comprehensive logging
- Distributed tracing
- Real-time metrics

### 4. **Documentation**
- Code comments for complex logic
- API documentation
- Architecture decision records

## 🔮 Future Architecture Considerations

### Potential Enhancements
1. **GraphQL Federation** for microservices
2. **Event-Driven Architecture** with SQS/SNS
3. **Redis Cache Layer** for session storage
4. **CDN for Static Assets** optimization
5. **WebSocket Support** for real-time features

### Scaling Preparations
- Database sharding strategy
- Multi-region deployment
- Read/write splitting
- Caching layer expansion

## 📚 Related Documentation

- [database.md](./database.md) - Database schema and operations
- [deployment.md](./deployment.md) - Deployment procedures
- [development.md](./development.md) - Development workflow
- [troubleshooting.md](./troubleshooting.md) - Common issues and solutions