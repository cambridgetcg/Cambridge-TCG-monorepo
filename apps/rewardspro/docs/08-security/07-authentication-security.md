# Authentication Security Guide for RewardsPro

## Critical Context

Authentication vulnerabilities remain the primary attack vector in 2024-2025, with breached accounts surging from 730 million to **5.5 billion** - an 8-fold increase. Authentication-related breaches now account for **88% of system intrusions**, with the average breach costing $4.88 million and taking 204 days to identify.

## RewardsPro Authentication Architecture

```
┌─────────────────────────────────────────┐
│         Shopify OAuth 2.0 + HMAC        │
├─────────────────────────────────────────┤
│    Session Tokens (JWT) - 1 min expiry   │
├─────────────────────────────────────────┤
│      Online/Offline Token Management     │
├─────────────────────────────────────────┤
│    AES-256-GCM Token Encryption          │
├─────────────────────────────────────────┤
│     Aurora Data API Session Storage      │
├─────────────────────────────────────────┤
│        HMAC Webhook Validation           │
└─────────────────────────────────────────┘
```

> **CRITICAL**: For Shopify-specific implementation details, see [Shopify Authentication Security Guide](./08-shopify-auth-security.md)

## 1. Shopify OAuth Implementation with PKCE

### Current Implementation Enhancement

```typescript
// app/utils/shopify-auth-enhanced.ts
import { shopifyApp } from '@shopify/shopify-app-remix';
import crypto from 'crypto';

interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

class ShopifyAuthManager {
  private readonly ALLOWED_ALGORITHMS = ['ES256'] as const;
  private pkceParams = new Map<string, PKCEParams>();
  
  async initiateOAuth(shop: string): Promise<string> {
    // Generate PKCE parameters
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(32).toString('base64url');
    
    // Store PKCE params for validation
    this.pkceParams.set(state, {
      codeVerifier,
      codeChallenge,
      state
    });
    
    // Cleanup old PKCE params after 10 minutes
    setTimeout(() => this.pkceParams.delete(state), 10 * 60 * 1000);
    
    const params = new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY!,
      scope: process.env.SCOPES!,
      redirect_uri: `${process.env.SHOPIFY_APP_URL}/auth/callback`,
      state,
      grant_options: JSON.stringify({
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      })
    });
    
    return `https://${shop}/admin/oauth/authorize?${params}`;
  }
  
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
  
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }
  
  async validateCallback(
    state: string,
    code: string,
    shop: string
  ): Promise<SessionData> {
    // Validate state parameter
    const pkceParams = this.pkceParams.get(state);
    if (!pkceParams) {
      throw new AuthError('Invalid state parameter - possible CSRF attack');
    }
    
    // Validate shop domain format
    if (!this.isValidShopDomain(shop)) {
      throw new AuthError('Invalid shop domain format');
    }
    
    // Exchange code for token with PKCE
    const tokenResponse = await this.exchangeCodeForToken(
      code,
      shop,
      pkceParams.codeVerifier
    );
    
    // Clean up used PKCE params
    this.pkceParams.delete(state);
    
    return this.createSession(tokenResponse, shop);
  }
  
  private isValidShopDomain(shop: string): boolean {
    return /^[a-z0-9-]+\.myshopify\.com$/.test(shop);
  }
}
```

## 2. JWT Security Implementation

### Algorithm Confusion Prevention

```typescript
// app/utils/jwt-security.ts
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { z } from 'zod';

// Type-safe JWT payload schema
const JWTPayloadSchema = z.object({
  shop: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/),
  scopes: z.array(z.string()),
  sessionId: z.string().uuid(),
  userId: z.string().optional(),
  role: z.enum(['merchant', 'staff', 'collaborator']).optional(),
  iat: z.number(),
  exp: z.number(),
  aud: z.string(),
  iss: z.string(),
  jti: z.string().uuid(), // Unique token ID for revocation
  sessionFingerprint: z.string().optional()
});

type SecureJWTPayload = z.infer<typeof JWTPayloadSchema>;

export class SecureJWTManager {
  private readonly ALLOWED_ALGORITHMS = ['ES256'] as const;
  private readonly MAX_TOKEN_AGE = '15m';
  private readonly REFRESH_TOKEN_AGE = '7d';
  
  // Token blacklist for revocation (use Redis in production)
  private revokedTokens = new Set<string>();
  
  async signAccessToken(
    payload: Omit<SecureJWTPayload, 'iat' | 'exp' | 'jti'>
  ): Promise<string> {
    const jti = crypto.randomUUID();
    
    const token = await new SignJWT({ ...payload, jti })
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(this.MAX_TOKEN_AGE)
      .setAudience(process.env.JWT_AUDIENCE!)
      .setIssuer(process.env.JWT_ISSUER!)
      .sign(this.privateKey);
    
    return token;
  }
  
  async verifyToken(token: string): Promise<SecureJWTPayload> {
    // Check revocation list first
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: this.ALLOWED_ALGORITHMS,
      audience: process.env.JWT_AUDIENCE,
      issuer: process.env.JWT_ISSUER,
      maxTokenAge: this.MAX_TOKEN_AGE,
      clockTolerance: 5 // 5 seconds clock skew tolerance
    });
    
    // Validate payload structure
    const validatedPayload = JWTPayloadSchema.parse(payload);
    
    // Check if token is revoked
    if (this.revokedTokens.has(validatedPayload.jti)) {
      throw new AuthError('Token has been revoked');
    }
    
    return validatedPayload;
  }
  
  async revokeToken(jti: string, expiresAt: number): Promise<void> {
    this.revokedTokens.add(jti);
    
    // Schedule cleanup after token expiry
    const ttl = expiresAt * 1000 - Date.now();
    if (ttl > 0) {
      setTimeout(() => this.revokedTokens.delete(jti), ttl);
    }
  }
}
```

### Secure Token Storage

```typescript
// app/utils/token-storage.ts
export class SecureTokenStorage {
  // NEVER store tokens in localStorage - use httpOnly cookies
  
  static setAuthToken(response: Response, token: string): void {
    response.headers.append(
      'Set-Cookie',
      cookie.serialize('auth-token', token, {
        httpOnly: true,      // Prevents XSS access
        secure: true,        // HTTPS only
        sameSite: 'strict',  // CSRF protection
        maxAge: 15 * 60,     // 15 minutes
        path: '/',
        domain: process.env.COOKIE_DOMAIN
      })
    );
  }
  
  static setRefreshToken(response: Response, token: string): void {
    response.headers.append(
      'Set-Cookie',
      cookie.serialize('refresh-token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/auth/refresh',     // Restricted path
        domain: process.env.COOKIE_DOMAIN
      })
    );
  }
  
  static clearTokens(response: Response): void {
    // Clear with same attributes to ensure removal
    ['auth-token', 'refresh-token'].forEach(name => {
      response.headers.append(
        'Set-Cookie',
        cookie.serialize(name, '', {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 0,
          path: '/',
          domain: process.env.COOKIE_DOMAIN
        })
      );
    });
  }
}
```

## 3. Session Management Security

### Aurora Data API Session Storage Enhancement

```typescript
// app/utils/session-security.ts
import { DataAPISessionStorage } from './session-data-api-adapter';
import crypto from 'crypto';

interface SessionData {
  id: string;
  shop: string;
  accessToken: string; // Encrypted
  scope: string;
  userId?: string;
  fingerprint?: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

export class SecureSessionManager {
  private storage: DataAPISessionStorage;
  private readonly MAX_CONCURRENT_SESSIONS = 3;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  async createSession(
    shop: string,
    accessToken: string,
    request: Request
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const fingerprint = this.generateFingerprint(request);
    
    // Check concurrent session limit
    await this.enforceSessionLimit(shop);
    
    // Encrypt the access token before storage
    const encryptedToken = await this.encryptToken(accessToken);
    
    const session: SessionData = {
      id: sessionId,
      shop,
      accessToken: encryptedToken,
      scope: process.env.SCOPES!,
      fingerprint,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      expiresAt: new Date(Date.now() + this.SESSION_TIMEOUT)
    };
    
    await this.storage.storeSession(session);
    
    // Log session creation for audit
    await this.auditLog('SESSION_CREATED', { sessionId, shop });
    
    return sessionId;
  }
  
  async validateSession(
    sessionId: string,
    request: Request
  ): Promise<SessionData | null> {
    const session = await this.storage.getSession(sessionId);
    
    if (!session) {
      await this.auditLog('SESSION_NOT_FOUND', { sessionId });
      return null;
    }
    
    // Check expiration
    if (new Date() > session.expiresAt) {
      await this.destroySession(sessionId);
      await this.auditLog('SESSION_EXPIRED', { sessionId });
      return null;
    }
    
    // Validate fingerprint
    const currentFingerprint = this.generateFingerprint(request);
    if (session.fingerprint && session.fingerprint !== currentFingerprint) {
      await this.auditLog('SESSION_FINGERPRINT_MISMATCH', { 
        sessionId,
        expected: session.fingerprint,
        actual: currentFingerprint
      });
      await this.destroySession(sessionId);
      throw new AuthError('Session fingerprint mismatch - possible hijacking attempt');
    }
    
    // Update last activity
    session.lastActivityAt = new Date();
    session.expiresAt = new Date(Date.now() + this.SESSION_TIMEOUT);
    await this.storage.updateSession(session);
    
    return session;
  }
  
  private async enforceSessionLimit(shop: string): Promise<void> {
    const sessions = await this.storage.getSessionsByShop(shop);
    
    if (sessions.length >= this.MAX_CONCURRENT_SESSIONS) {
      // Terminate oldest session
      const oldestSession = sessions.sort((a, b) => 
        a.lastActivityAt.getTime() - b.lastActivityAt.getTime()
      )[0];
      
      await this.destroySession(oldestSession.id);
      await this.auditLog('SESSION_LIMIT_ENFORCED', { 
        shop,
        terminatedSession: oldestSession.id 
      });
    }
  }
  
  private generateFingerprint(request: Request): string {
    const headers = request.headers;
    const components = [
      headers.get('user-agent') || '',
      headers.get('accept-language') || '',
      headers.get('accept-encoding') || '',
      // Don't use IP as it may change legitimately
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }
  
  private async encryptToken(token: string): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'),
      iv
    );
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  private async auditLog(event: string, details: any): Promise<void> {
    // Implement audit logging to Aurora
    await this.storage.createAuditLog({
      event,
      details,
      timestamp: new Date(),
      requestId: crypto.randomUUID()
    });
  }
}
```

## 4. React Authentication Context Security

### Memory-Safe Authentication Context

```typescript
// app/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { Shop } from '@prisma/client';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; shop: Shop; sessionId: string; scopes: string[] }
  | { status: 'error'; error: AuthError };

interface AuthContextType {
  state: AuthState;
  login: (shop: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  checkPermission: (scope: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, { status: 'loading' });
  
  // Prevent memory leaks
  useEffect(() => {
    return () => {
      if (state.status === 'authenticated') {
        // Clear sensitive data on unmount
        dispatch({ type: 'LOGOUT' });
      }
    };
  }, []);
  
  // Disable React DevTools in production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      if (typeof window !== 'undefined' && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = () => {};
      }
    }
  }, []);
  
  // Auto-refresh token before expiry
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    
    const refreshInterval = setInterval(async () => {
      try {
        await authService.refreshToken();
      } catch (error) {
        dispatch({ type: 'LOGOUT' });
      }
    }, 14 * 60 * 1000); // Refresh every 14 minutes (token expires in 15)
    
    return () => clearInterval(refreshInterval);
  }, [state.status]);
  
  const contextValue = useMemo(() => ({
    state,
    login: async (shop: string) => {
      try {
        dispatch({ type: 'LOGIN_START' });
        const response = await authService.initiateOAuth(shop);
        window.location.href = response.authUrl;
      } catch (error) {
        dispatch({ type: 'LOGIN_ERROR', error });
      }
    },
    logout: async () => {
      await authService.logout();
      dispatch({ type: 'LOGOUT' });
    },
    refreshSession: async () => {
      const response = await authService.refreshToken();
      dispatch({ type: 'SESSION_REFRESHED', payload: response });
    },
    checkPermission: (scope: string) => {
      if (state.status !== 'authenticated') return false;
      return state.scopes.includes(scope);
    }
  }), [state]);
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Protected route component
export function RequireAuth({ 
  children,
  requiredScopes = []
}: { 
  children: React.ReactNode;
  requiredScopes?: string[];
}) {
  const { state, checkPermission } = useAuth();
  
  if (state.status === 'loading') {
    return <LoadingSpinner />;
  }
  
  if (state.status !== 'authenticated') {
    return <Navigate to="/auth/login" replace />;
  }
  
  // Check required scopes
  const hasPermission = requiredScopes.every(scope => checkPermission(scope));
  if (!hasPermission) {
    return <AccessDenied requiredScopes={requiredScopes} />;
  }
  
  return <>{children}</>;
}
```

## 5. Protected Routing Implementation

### Remix Route Protection

```typescript
// app/utils/auth.server.ts
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';

export async function requireAuth(
  request: Request,
  requiredScopes: string[] = []
) {
  const sessionId = await getSessionId(request);
  
  if (!sessionId) {
    throw redirect('/auth/login');
  }
  
  const session = await sessionManager.validateSession(sessionId, request);
  
  if (!session) {
    throw redirect('/auth/login');
  }
  
  // Check scopes
  const sessionScopes = session.scope.split(' ');
  const hasRequiredScopes = requiredScopes.every(scope => 
    sessionScopes.includes(scope)
  );
  
  if (!hasRequiredScopes) {
    throw new Response('Insufficient permissions', { status: 403 });
  }
  
  return session;
}

// Use in loaders and actions
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireAuth(request, ['read_customers']);
  
  // Loader logic here
  return json({ shop: session.shop });
}
```

## 6. RBAC Implementation for RewardsPro

```typescript
// app/utils/rbac.ts
interface Permission {
  resource: 'customers' | 'tiers' | 'credits' | 'settings' | 'billing';
  actions: ('create' | 'read' | 'update' | 'delete')[];
}

interface Role {
  id: string;
  name: 'owner' | 'admin' | 'staff' | 'viewer';
  level: number;
  permissions: Permission[];
}

const ROLES: Role[] = [
  {
    id: 'owner',
    name: 'owner',
    level: 100,
    permissions: [
      { resource: 'customers', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'tiers', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'credits', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'settings', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'billing', actions: ['create', 'read', 'update', 'delete'] }
    ]
  },
  {
    id: 'admin',
    name: 'admin',
    level: 80,
    permissions: [
      { resource: 'customers', actions: ['create', 'read', 'update'] },
      { resource: 'tiers', actions: ['create', 'read', 'update'] },
      { resource: 'credits', actions: ['create', 'read', 'update'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'billing', actions: ['read'] }
    ]
  },
  {
    id: 'staff',
    name: 'staff',
    level: 40,
    permissions: [
      { resource: 'customers', actions: ['read', 'update'] },
      { resource: 'tiers', actions: ['read'] },
      { resource: 'credits', actions: ['read', 'update'] },
      { resource: 'settings', actions: ['read'] }
    ]
  },
  {
    id: 'viewer',
    name: 'viewer',
    level: 10,
    permissions: [
      { resource: 'customers', actions: ['read'] },
      { resource: 'tiers', actions: ['read'] },
      { resource: 'credits', actions: ['read'] },
      { resource: 'settings', actions: ['read'] }
    ]
  }
];

export class RBACManager {
  async hasPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const userRole = await this.getUserRole(userId);
    const role = ROLES.find(r => r.id === userRole);
    
    if (!role) return false;
    
    const permission = role.permissions.find(p => p.resource === resource);
    if (!permission) return false;
    
    return permission.actions.includes(action as any);
  }
  
  async getUserRole(userId: string): Promise<string> {
    // Fetch from database
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    
    return user?.role || 'viewer';
  }
}
```

## 7. Authentication Monitoring

```typescript
// app/utils/auth-monitoring.ts
export class AuthenticationMonitor {
  private readonly RISK_THRESHOLDS = {
    LOW: 30,
    MEDIUM: 50,
    HIGH: 80,
    CRITICAL: 95
  };
  
  async analyzeLoginAttempt(attempt: LoginAttempt): Promise<RiskAssessment> {
    const riskFactors = await Promise.all([
      this.checkFailureRate(attempt.shop),
      this.checkLocationAnomaly(attempt.shop, attempt.location),
      this.checkTimeAnomaly(attempt.shop, attempt.timestamp),
      this.checkConcurrentAttempts(attempt.shop),
      this.checkKnownAttackPatterns(attempt)
    ]);
    
    const riskScore = this.calculateRiskScore(riskFactors);
    
    // Log high-risk attempts
    if (riskScore > this.RISK_THRESHOLDS.HIGH) {
      await this.logSecurityEvent({
        type: 'HIGH_RISK_LOGIN_ATTEMPT',
        shop: attempt.shop,
        riskScore,
        factors: riskFactors,
        timestamp: new Date()
      });
    }
    
    return {
      score: riskScore,
      action: this.determineAction(riskScore),
      factors: riskFactors
    };
  }
  
  private determineAction(riskScore: number): RiskAction {
    if (riskScore >= this.RISK_THRESHOLDS.CRITICAL) {
      return { action: 'BLOCK', reason: 'Critical risk detected' };
    }
    
    if (riskScore >= this.RISK_THRESHOLDS.HIGH) {
      return { 
        action: 'CHALLENGE',
        requireMFA: true,
        additionalVerification: 'email'
      };
    }
    
    if (riskScore >= this.RISK_THRESHOLDS.MEDIUM) {
      return { action: 'MONITOR', captchaRequired: true };
    }
    
    return { action: 'ALLOW' };
  }
  
  private async checkFailureRate(shop: string): Promise<RiskFactor> {
    const recentFailures = await db.authLog.count({
      where: {
        shop,
        success: false,
        timestamp: { gte: new Date(Date.now() - 15 * 60 * 1000) }
      }
    });
    
    return {
      name: 'failure_rate',
      score: Math.min(recentFailures * 20, 100),
      details: `${recentFailures} failed attempts in last 15 minutes`
    };
  }
}
```

## 8. Security Testing Implementation

### Jest Authentication Tests

```typescript
// app/utils/__tests__/auth-security.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SecureJWTManager } from '../jwt-security';
import { SecureSessionManager } from '../session-security';

describe('Authentication Security', () => {
  let jwtManager: SecureJWTManager;
  let sessionManager: SecureSessionManager;
  
  beforeEach(() => {
    jwtManager = new SecureJWTManager();
    sessionManager = new SecureSessionManager();
  });
  
  describe('JWT Security', () => {
    it('should reject tokens with none algorithm', async () => {
      const maliciousToken = 'eyJhbGciOiJub25lIn0.eyJzaG9wIjoidGVzdCJ9.';
      
      await expect(jwtManager.verifyToken(maliciousToken))
        .rejects.toThrow('Invalid algorithm');
    });
    
    it('should reject expired tokens', async () => {
      const expiredToken = await jwtManager.signAccessToken({
        shop: 'test.myshopify.com',
        scopes: ['read_products'],
        sessionId: 'test-session'
      });
      
      // Fast-forward time
      jest.advanceTimersByTime(16 * 60 * 1000); // 16 minutes
      
      await expect(jwtManager.verifyToken(expiredToken))
        .rejects.toThrow('Token expired');
    });
    
    it('should validate audience claim', async () => {
      const token = await jwtManager.signAccessToken({
        shop: 'test.myshopify.com',
        scopes: ['read_products'],
        sessionId: 'test-session',
        aud: 'wrong-audience'
      });
      
      await expect(jwtManager.verifyToken(token))
        .rejects.toThrow('Invalid audience');
    });
    
    it('should prevent algorithm confusion attacks', async () => {
      // Attempt to use HMAC with public key
      const maliciousToken = jwt.sign(
        { shop: 'evil.myshopify.com' },
        publicKey,
        { algorithm: 'HS256' }
      );
      
      await expect(jwtManager.verifyToken(maliciousToken))
        .rejects.toThrow();
    });
  });
  
  describe('Session Security', () => {
    it('should regenerate session ID after login', async () => {
      const session1 = await sessionManager.createSession(
        'test.myshopify.com',
        'token1',
        mockRequest
      );
      
      const session2 = await sessionManager.createSession(
        'test.myshopify.com',
        'token2',
        mockRequest
      );
      
      expect(session1).not.toBe(session2);
    });
    
    it('should enforce concurrent session limits', async () => {
      const sessions = [];
      
      for (let i = 0; i < 4; i++) {
        sessions.push(await sessionManager.createSession(
          'test.myshopify.com',
          `token${i}`,
          mockRequest
        ));
      }
      
      // First session should be terminated
      const firstSession = await sessionManager.validateSession(
        sessions[0],
        mockRequest
      );
      
      expect(firstSession).toBeNull();
    });
    
    it('should detect session hijacking attempts', async () => {
      const sessionId = await sessionManager.createSession(
        'test.myshopify.com',
        'token',
        mockRequest({ 'user-agent': 'Chrome/120' })
      );
      
      // Different fingerprint
      await expect(
        sessionManager.validateSession(
          sessionId,
          mockRequest({ 'user-agent': 'Firefox/120' })
        )
      ).rejects.toThrow('Session fingerprint mismatch');
    });
  });
  
  describe('CSRF Protection', () => {
    it('should validate state parameter in OAuth callback', async () => {
      const authManager = new ShopifyAuthManager();
      
      await expect(
        authManager.validateCallback(
          'invalid-state',
          'code',
          'test.myshopify.com'
        )
      ).rejects.toThrow('Invalid state parameter');
    });
  });
});
```

### Playwright E2E Authentication Tests

```typescript
// tests/e2e/authentication.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Security E2E', () => {
  test('should prevent authentication bypass attempts', async ({ page }) => {
    // Attempt direct navigation to protected route
    await page.goto('/app/customers', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL('/auth/login');
    
    // Verify no sensitive data in HTML
    const content = await page.content();
    expect(content).not.toContain('storeCredit');
    expect(content).not.toContain('accessToken');
  });
  
  test('should enforce secure cookie attributes', async ({ page, context }) => {
    // Complete login flow
    await page.goto('/auth/login');
    await page.fill('[name="shop"]', 'test-store');
    await page.click('[type="submit"]');
    
    // Check cookie security
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === 'auth-token');
    
    expect(authCookie?.httpOnly).toBe(true);
    expect(authCookie?.secure).toBe(true);
    expect(authCookie?.sameSite).toBe('Strict');
  });
  
  test('should handle session timeout correctly', async ({ page }) => {
    // Login
    await loginHelper(page);
    
    // Fast-forward time (mock)
    await page.evaluate(() => {
      Date.now = () => Date.now() + 31 * 60 * 1000; // 31 minutes
    });
    
    // Try to access protected route
    await page.goto('/app/customers');
    await expect(page).toHaveURL('/auth/login');
    
    // Verify session cleared
    const cookies = await page.context().cookies();
    expect(cookies.find(c => c.name === 'auth-token')).toBeUndefined();
  });
  
  test('should prevent XSS in authentication forms', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Attempt XSS injection
    await page.fill('[name="shop"]', '<script>alert("XSS")</script>');
    
    // Monitor for alerts
    let alertFired = false;
    page.on('dialog', () => { alertFired = true; });
    
    await page.click('[type="submit"]');
    await page.waitForTimeout(1000);
    
    expect(alertFired).toBe(false);
  });
});
```

## 9. Security Headers for Authentication

```typescript
// app/utils/auth-headers.ts
export function getAuthSecurityHeaders(): HeadersInit {
  return {
    // Prevent clickjacking on auth pages
    'X-Frame-Options': 'DENY',
    
    // Strict CSP for auth pages
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://cdn.shopify.com",
      "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.myshopify.com",
      "frame-ancestors 'none'", // No embedding for auth pages
      "form-action 'self'",
      "base-uri 'self'"
    ].join('; '),
    
    // Additional auth-specific headers
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    
    // Permissions Policy for WebAuthn
    'Permissions-Policy': 'publickey-credentials-get=(self)'
  };
}
```

## 10. Incident Response for Authentication Breaches

### Authentication Incident Playbook

```yaml
name: Authentication Breach Response
severity: SEV-1
trigger: >
  - Mass authentication failures
  - Session hijacking detected
  - Token compromise suspected
  - Unauthorized admin access

immediate_actions:
  - Invalidate all active sessions
  - Force password reset for affected accounts
  - Enable additional authentication factors
  - Block suspicious IPs
  - Preserve audit logs

investigation:
  - Review authentication logs
  - Analyze failed attempt patterns
  - Check for token/session anomalies
  - Identify attack vectors
  - Determine data exposure

containment:
  - Rotate all secrets and keys
  - Update JWT signing keys
  - Clear session storage
  - Enable strict mode authentication
  - Deploy emergency security patches

recovery:
  - Gradual re-authentication of users
  - Monitor for recurring attempts
  - Update security documentation
  - Conduct security training
  - Implement additional controls
```

## Security Checklist

### Immediate Priorities
- [ ] Algorithm-specific JWT validation implemented
- [ ] Tokens stored in httpOnly cookies only
- [ ] PKCE enabled for OAuth flows
- [ ] Session fingerprinting active
- [ ] Concurrent session limits enforced
- [ ] Token refresh mechanism implemented
- [ ] Session timeout configured (30 minutes)
- [ ] Audit logging for all auth events
- [ ] Rate limiting on auth endpoints
- [ ] CSRF protection via state parameter

### Testing Requirements
- [ ] JWT algorithm confusion tests
- [ ] Session hijacking prevention tests
- [ ] CSRF protection validation
- [ ] XSS prevention in auth forms
- [ ] Cookie security attribute tests
- [ ] Session timeout tests
- [ ] Concurrent session tests
- [ ] Rate limiting tests

### Monitoring Setup
- [ ] Failed login monitoring
- [ ] Session anomaly detection
- [ ] Token usage analytics
- [ ] Geographic login tracking
- [ ] Device fingerprint tracking
- [ ] Audit log aggregation
- [ ] Real-time alerts configured

---

*Last Updated: January 2025 | Security Level: CRITICAL | Classification: Internal*
*Authentication failures account for 88% of breaches - this guide is mandatory reading*