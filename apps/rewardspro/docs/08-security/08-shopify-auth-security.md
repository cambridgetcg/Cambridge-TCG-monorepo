# Shopify Embedded App Authentication Security Guide for RewardsPro

## Critical Context

Building a secure Shopify embedded public app requires managing multiple authentication stages: OAuth installation flow, ongoing API access, and merchant sessions within the app. This guide provides RewardsPro-specific implementation patterns for each stage, with a focus on defense-in-depth and zero-trust principles.

## Security Mindset for RewardsPro

### Core Principles

1. **Never trust client input** - Every request parameter could be forged
2. **Tenant isolation** - One shop must never access another shop's data
3. **Least privilege** - Request only minimum required API scopes
4. **Defense in depth** - Multiple authentication layers (OAuth, session tokens, HMAC)
5. **Explicit verification** - Verify everything, assume nothing

## 1. Shopify OAuth 2.0 Implementation

### OAuth Flow with HMAC Verification

```typescript
// app/routes/auth.tsx
import crypto from 'crypto';
import { redirect } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const hmac = url.searchParams.get('hmac');
  const timestamp = url.searchParams.get('timestamp');
  
  // CRITICAL: Verify HMAC before proceeding
  if (!verifyHMAC(url.searchParams)) {
    console.error('HMAC verification failed for shop:', shop);
    throw new Response('Invalid request signature', { status: 400 });
  }
  
  // Check timestamp to prevent replay attacks (within 1 minute)
  const requestTime = parseInt(timestamp || '0');
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - requestTime > 60) {
    throw new Response('Request expired', { status: 400 });
  }
  
  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString('base64url');
  
  // Store state in secure session for verification
  const session = await getSession(request.headers.get('Cookie'));
  session.set('oauth-state', state);
  session.set('shop', shop);
  
  // Build OAuth URL with required parameters
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', process.env.SHOPIFY_API_KEY!);
  authUrl.searchParams.set('scope', process.env.SCOPES!);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', `${process.env.SHOPIFY_APP_URL}/auth/callback`);
  
  return redirect(authUrl.toString(), {
    headers: {
      'Set-Cookie': await commitSession(session)
    }
  });
}

function verifyHMAC(params: URLSearchParams): boolean {
  const hmac = params.get('hmac');
  if (!hmac) return false;
  
  // Remove hmac and signature from params
  const filteredParams = new URLSearchParams();
  for (const [key, value] of params) {
    if (key !== 'hmac' && key !== 'signature') {
      filteredParams.append(key, value);
    }
  }
  
  // Sort params lexicographically
  const sortedParams = Array.from(filteredParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // Compute HMAC
  const computedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
    .update(sortedParams)
    .digest('hex');
  
  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(computedHmac),
    Buffer.from(hmac.toLowerCase())
  );
}
```

### OAuth Callback with State Validation

```typescript
// app/routes/auth.callback.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const hmac = url.searchParams.get('hmac');
  
  // Verify HMAC first
  if (!verifyHMAC(url.searchParams)) {
    throw new Response('Invalid HMAC', { status: 400 });
  }
  
  // Verify CSRF state
  const session = await getSession(request.headers.get('Cookie'));
  const storedState = session.get('oauth-state');
  const storedShop = session.get('shop');
  
  if (!state || state !== storedState) {
    console.error('State mismatch - possible CSRF attack');
    throw new Response('Invalid state parameter', { status: 403 });
  }
  
  if (shop !== storedShop) {
    console.error('Shop mismatch during OAuth');
    throw new Response('Shop mismatch', { status: 403 });
  }
  
  // Exchange code for access token
  try {
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_API_KEY,
          client_secret: process.env.SHOPIFY_API_SECRET,
          code
        })
      }
    );
    
    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }
    
    const { access_token, scope } = await tokenResponse.json();
    
    // Store token securely (encrypted) in Aurora
    await storeAccessToken(shop, access_token, scope);
    
    // Clear OAuth session data
    session.unset('oauth-state');
    session.unset('shop');
    
    // Redirect to app with shop context
    return redirect(`/?shop=${shop}&host=${url.searchParams.get('host')}`, {
      headers: {
        'Set-Cookie': await commitSession(session)
      }
    });
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw new Response('Authentication failed', { status: 500 });
  }
}
```

### Secure Token Storage

```typescript
// app/utils/token-storage.ts
import { encrypt, decrypt } from './encryption';
import { db } from '~/db.server';

export async function storeAccessToken(
  shop: string,
  accessToken: string,
  scope: string
): Promise<void> {
  // Validate shop domain format
  if (!isValidShopDomain(shop)) {
    throw new Error('Invalid shop domain');
  }
  
  // Encrypt token before storage
  const encryptedToken = await encrypt(accessToken);
  
  // Store in Aurora via Data API
  await db.session.upsert({
    where: { shop },
    create: {
      id: crypto.randomUUID(),
      shop,
      accessToken: encryptedToken,
      scope,
      isOnline: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    update: {
      accessToken: encryptedToken,
      scope,
      updatedAt: new Date()
    }
  });
  
  // Audit log
  await logSecurityEvent('ACCESS_TOKEN_STORED', { shop });
}

export async function getAccessToken(shop: string): Promise<string | null> {
  const session = await db.session.findUnique({
    where: { shop }
  });
  
  if (!session || !session.accessToken) {
    return null;
  }
  
  // Decrypt token
  return await decrypt(session.accessToken);
}

function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}
```

## 2. Session Token Implementation (JWT)

### Session Token Verification Middleware

```typescript
// app/utils/session-token.server.ts
import jwt from 'jsonwebtoken';
import type { JWTPayload } from 'jsonwebtoken';

interface ShopifySessionToken extends JWTPayload {
  iss: string;  // https://{shop}.myshopify.com/admin
  dest: string; // https://{shop}.myshopify.com
  aud: string;  // API key
  sub: string;  // User ID
  exp: number;  // Expiry (typically 1 minute)
  nbf: number;  // Not before
  iat: number;  // Issued at
  jti: string;  // JWT ID
  sid: string;  // Session ID
}

export async function verifySessionToken(
  token: string
): Promise<ShopifySessionToken> {
  if (!token) {
    throw new Error('No session token provided');
  }
  
  try {
    // Verify signature and standard claims
    const payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET!, {
      algorithms: ['HS256'], // Shopify uses HS256 for session tokens
      audience: process.env.SHOPIFY_API_KEY,
      clockTolerance: 5 // Allow 5 seconds clock skew
    }) as ShopifySessionToken;
    
    // Additional validation
    validateTokenClaims(payload);
    
    return payload;
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Session token expired - refresh required');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid session token signature');
    }
    throw error;
  }
}

function validateTokenClaims(payload: ShopifySessionToken): void {
  // Verify issuer format
  if (!payload.iss || !payload.iss.match(/^https:\/\/[a-z0-9-]+\.myshopify\.com\/admin$/)) {
    throw new Error('Invalid token issuer');
  }
  
  // Verify destination format
  if (!payload.dest || !payload.dest.match(/^https:\/\/[a-z0-9-]+\.myshopify\.com$/)) {
    throw new Error('Invalid token destination');
  }
  
  // Extract and validate shop domain consistency
  const issuerShop = payload.iss.match(/https:\/\/([^\/]+)\.myshopify\.com/)?.[1];
  const destShop = payload.dest.match(/https:\/\/([^\/]+)\.myshopify\.com/)?.[1];
  
  if (issuerShop !== destShop) {
    throw new Error('Token issuer and destination shop mismatch');
  }
  
  // Verify token is not used before issued
  const now = Math.floor(Date.now() / 1000);
  if (payload.nbf && payload.nbf > now + 5) {
    throw new Error('Token not yet valid');
  }
  
  // Verify reasonable token age (max 2 minutes old)
  if (payload.iat && now - payload.iat > 120) {
    throw new Error('Token too old');
  }
}

export function extractShopFromToken(token: ShopifySessionToken): string {
  const shop = token.dest.replace(/^https:\/\//, '').replace(/\/$/, '');
  if (!isValidShopDomain(shop)) {
    throw new Error('Invalid shop domain in token');
  }
  return shop;
}
```

### Protected API Route Pattern

```typescript
// app/utils/require-session-token.ts
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { verifySessionToken, extractShopFromToken } from './session-token.server';

export async function requireSessionToken(
  request: Request
): Promise<{ shop: string; userId: string; sessionId: string }> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw json(
      { error: 'No session token provided' },
      { status: 401 }
    );
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const payload = await verifySessionToken(token);
    const shop = extractShopFromToken(payload);
    
    // Verify shop is still installed
    const session = await db.session.findUnique({
      where: { shop }
    });
    
    if (!session) {
      throw json(
        { error: 'Shop not found or app uninstalled' },
        { status: 401 }
      );
    }
    
    return {
      shop,
      userId: payload.sub,
      sessionId: payload.sid
    };
    
  } catch (error) {
    console.error('Session token verification failed:', error);
    throw json(
      { error: 'Invalid or expired session token' },
      { status: 401 }
    );
  }
}

// Example usage in a loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop, userId } = await requireSessionToken(request);
  
  // Now safely fetch shop-specific data
  const customers = await db.customer.findMany({
    where: { shop }
  });
  
  return json({ customers });
}
```

## 3. Multi-Tenant Data Isolation

### Secure Data Access Patterns

```typescript
// app/utils/shop-context.ts
export class ShopContext {
  constructor(private shop: string) {
    if (!isValidShopDomain(shop)) {
      throw new Error('Invalid shop domain');
    }
  }
  
  // Always scope queries to current shop
  async getCustomers() {
    return db.customer.findMany({
      where: { shop: this.shop }
    });
  }
  
  async getCustomer(customerId: string) {
    // CRITICAL: Include shop in WHERE clause
    return db.customer.findFirst({
      where: {
        id: customerId,
        shop: this.shop // Prevents cross-tenant access
      }
    });
  }
  
  async updateCustomer(customerId: string, data: any) {
    // Verify ownership before update
    const existing = await this.getCustomer(customerId);
    if (!existing) {
      throw new Error('Customer not found or access denied');
    }
    
    return db.customer.update({
      where: { id: customerId },
      data: {
        ...data,
        shop: this.shop, // Ensure shop never changes
        updatedAt: new Date()
      }
    });
  }
  
  async deleteCustomer(customerId: string) {
    // Use updateMany with shop filter for extra safety
    const result = await db.customer.deleteMany({
      where: {
        id: customerId,
        shop: this.shop
      }
    });
    
    if (result.count === 0) {
      throw new Error('Customer not found or access denied');
    }
    
    return result;
  }
}

// Usage in routes
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireSessionToken(request);
  const context = new ShopContext(shop);
  
  const formData = await request.formData();
  const customerId = formData.get('customerId') as string;
  
  // Shop isolation is enforced by ShopContext
  const customer = await context.getCustomer(customerId);
  // ...
}
```

## 4. Webhook Security

### HMAC Verification for Webhooks

```typescript
// app/routes/webhooks.$.tsx
import crypto from 'crypto';
import type { ActionFunctionArgs } from '@remix-run/node';

export async function action({ request, params }: ActionFunctionArgs) {
  const topic = params['*']; // e.g., "orders/create"
  
  // Get raw body for HMAC computation
  const rawBody = await request.text();
  
  // Verify webhook HMAC
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('Webhook HMAC verification failed for topic:', topic);
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Parse verified body
  const data = JSON.parse(rawBody);
  
  // Extract shop from webhook headers
  const shop = request.headers.get('X-Shopify-Shop-Domain');
  if (!shop || !isValidShopDomain(shop)) {
    return new Response('Invalid shop', { status: 400 });
  }
  
  // Process webhook based on topic
  try {
    switch (topic) {
      case 'app/uninstalled':
        await handleAppUninstalled(shop, data);
        break;
      case 'orders/paid':
        await handleOrderPaid(shop, data);
        break;
      case 'customers/update':
        await handleCustomerUpdate(shop, data);
        break;
      default:
        console.warn('Unhandled webhook topic:', topic);
    }
    
    return new Response('OK', { status: 200 });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return 200 to prevent retries for processing errors
    return new Response('OK', { status: 200 });
  }
}

function verifyWebhookHMAC(request: Request, body: string): boolean {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  if (!hmacHeader) return false;
  
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET!)
    .update(body, 'utf8')
    .digest('base64');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  );
}

async function handleAppUninstalled(shop: string, data: any) {
  // Clean up shop data
  await db.session.delete({ where: { shop } });
  
  // Mark as uninstalled (soft delete)
  await db.shopSettings.update({
    where: { shop },
    data: {
      uninstalledAt: new Date(),
      active: false
    }
  });
  
  // Audit log
  await logSecurityEvent('APP_UNINSTALLED', { shop });
}
```

## 5. App Proxy Security

```typescript
// app/routes/app-proxy.$.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  
  // Verify signature for app proxy requests
  if (!verifyAppProxySignature(url.searchParams)) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  const shop = url.searchParams.get('shop');
  if (!shop || !isValidShopDomain(shop)) {
    return new Response('Invalid shop', { status: 400 });
  }
  
  // Handle proxy request with shop context
  // ...
}

function verifyAppProxySignature(params: URLSearchParams): boolean {
  const signature = params.get('signature');
  if (!signature) return false;
  
  // Remove signature from params
  const filteredParams = new URLSearchParams();
  for (const [key, value] of params) {
    if (key !== 'signature') {
      filteredParams.append(key, value);
    }
  }
  
  // Sort and compute signature
  const message = Array.from(filteredParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('');
  
  const computed = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
    .update(message)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );
}
```

## 6. Online vs Offline Token Management

```typescript
// app/utils/token-manager.ts
interface TokenSet {
  offlineToken: string;
  onlineToken?: string;
  onlineTokenExpiresAt?: Date;
  userId?: string;
}

export class TokenManager {
  // Get offline token for background operations
  async getOfflineToken(shop: string): Promise<string | null> {
    const session = await db.session.findUnique({
      where: { shop, isOnline: false }
    });
    
    if (!session?.accessToken) return null;
    return decrypt(session.accessToken);
  }
  
  // Exchange session token for online access token
  async getOnlineToken(sessionToken: string): Promise<string> {
    const payload = await verifySessionToken(sessionToken);
    const shop = extractShopFromToken(payload);
    
    // Check if we have a valid cached online token
    const existing = await db.session.findFirst({
      where: {
        shop,
        isOnline: true,
        userId: payload.sub,
        expiresAt: { gt: new Date() }
      }
    });
    
    if (existing?.accessToken) {
      return decrypt(existing.accessToken);
    }
    
    // Perform token exchange
    const response = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token-Purpose': 'online'
        },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_API_KEY,
          client_secret: process.env.SHOPIFY_API_SECRET,
          subject_token: sessionToken,
          subject_token_type: 'urn:x-shopify:oauth:token-type:session-token',
          requested_token_type: 'urn:x-shopify:oauth:token-type:online-access-token'
        })
      }
    );
    
    if (!response.ok) {
      throw new Error('Online token exchange failed');
    }
    
    const { access_token, expires_in, associated_user } = await response.json();
    
    // Store online token
    await db.session.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        accessToken: encrypt(access_token),
        isOnline: true,
        userId: associated_user.id,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    return access_token;
  }
  
  // Use appropriate token based on context
  async getToken(shop: string, options?: { online?: boolean; userId?: string }): Promise<string | null> {
    if (options?.online && options?.userId) {
      // Get online token for user-specific operations
      const session = await db.session.findFirst({
        where: {
          shop,
          isOnline: true,
          userId: options.userId,
          expiresAt: { gt: new Date() }
        }
      });
      return session ? decrypt(session.accessToken) : null;
    }
    
    // Default to offline token for background operations
    return this.getOfflineToken(shop);
  }
}
```

## 7. Authorization and Staff Permissions

```typescript
// app/utils/authorization.ts
interface StaffPermissions {
  canEditProducts: boolean;
  canEditCustomers: boolean;
  canEditOrders: boolean;
  canManageSettings: boolean;
}

export class AuthorizationService {
  constructor(private shop: string, private userId: string) {}
  
  // Check if user has specific permission
  async hasPermission(resource: string, action: string): Promise<boolean> {
    // For online tokens, Shopify enforces permissions
    // We can check the associated_user_scope from token exchange
    const session = await db.session.findFirst({
      where: {
        shop: this.shop,
        userId: this.userId,
        isOnline: true
      }
    });
    
    if (!session?.scope) return false;
    
    const requiredScope = this.getRequiredScope(resource, action);
    return session.scope.includes(requiredScope);
  }
  
  private getRequiredScope(resource: string, action: string): string {
    const scopeMap: Record<string, Record<string, string>> = {
      customers: {
        read: 'read_customers',
        write: 'write_customers'
      },
      orders: {
        read: 'read_orders',
        write: 'write_orders'
      },
      products: {
        read: 'read_products',
        write: 'write_products'
      }
    };
    
    return scopeMap[resource]?.[action] || '';
  }
  
  // Handle 403 from Shopify API gracefully
  async callShopifyAPI(endpoint: string, options: RequestInit): Promise<Response> {
    const token = await this.getToken();
    
    const response = await fetch(
      `https://${this.shop}/admin/api/2024-01/${endpoint}`,
      {
        ...options,
        headers: {
          ...options.headers,
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.status === 403) {
      // User lacks permission
      throw new Error('Insufficient permissions for this operation');
    }
    
    return response;
  }
}
```

## 8. Security Testing Checklist

### Authentication Tests

```typescript
// tests/auth-security.test.ts
describe('Shopify Authentication Security', () => {
  describe('OAuth Flow', () => {
    it('rejects requests without valid HMAC', async () => {
      const response = await request('/auth?shop=test.myshopify.com&hmac=invalid');
      expect(response.status).toBe(400);
    });
    
    it('validates CSRF state parameter', async () => {
      const response = await request('/auth/callback?state=wrong');
      expect(response.status).toBe(403);
    });
    
    it('rejects expired timestamps', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 120;
      const response = await request(`/auth?timestamp=${oldTimestamp}`);
      expect(response.status).toBe(400);
    });
  });
  
  describe('Session Token Verification', () => {
    it('rejects requests without session token', async () => {
      const response = await fetch('/api/customers');
      expect(response.status).toBe(401);
    });
    
    it('rejects expired session tokens', async () => {
      const expiredToken = createExpiredToken();
      const response = await fetch('/api/customers', {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      expect(response.status).toBe(401);
    });
    
    it('validates token signature', async () => {
      const tamperedToken = validToken.replace('a', 'b');
      const response = await fetch('/api/customers', {
        headers: { Authorization: `Bearer ${tamperedToken}` }
      });
      expect(response.status).toBe(401);
    });
    
    it('validates token claims (aud, iss, dest)', async () => {
      const wrongAudToken = createTokenWithWrongAudience();
      const response = await fetch('/api/customers', {
        headers: { Authorization: `Bearer ${wrongAudToken}` }
      });
      expect(response.status).toBe(401);
    });
  });
  
  describe('Multi-Tenant Isolation', () => {
    it('prevents cross-shop data access', async () => {
      const shop1Token = await getTokenForShop('shop1.myshopify.com');
      const shop2CustomerId = 'customer-from-shop2';
      
      const response = await fetch(`/api/customers/${shop2CustomerId}`, {
        headers: { Authorization: `Bearer ${shop1Token}` }
      });
      
      expect(response.status).toBe(404);
    });
    
    it('scopes all queries to authenticated shop', async () => {
      const token = await getTokenForShop('test.myshopify.com');
      const response = await fetch('/api/customers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const customers = await response.json();
      customers.forEach(customer => {
        expect(customer.shop).toBe('test.myshopify.com');
      });
    });
  });
  
  describe('Webhook Security', () => {
    it('rejects webhooks without HMAC header', async () => {
      const response = await fetch('/webhooks/orders/create', {
        method: 'POST',
        body: JSON.stringify({ id: 'order-123' })
      });
      expect(response.status).toBe(401);
    });
    
    it('validates webhook HMAC signature', async () => {
      const body = JSON.stringify({ id: 'order-123' });
      const invalidHmac = 'invalid-hmac';
      
      const response = await fetch('/webhooks/orders/create', {
        method: 'POST',
        headers: { 'X-Shopify-Hmac-Sha256': invalidHmac },
        body
      });
      
      expect(response.status).toBe(401);
    });
  });
});
```

## 9. Security Monitoring

```typescript
// app/utils/security-monitoring.ts
export class SecurityMonitor {
  async trackAuthEvent(event: {
    type: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'PERMISSION_DENIED';
    shop: string;
    userId?: string;
    details?: any;
  }): Promise<void> {
    await db.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        eventType: event.type,
        shop: event.shop,
        userId: event.userId,
        details: JSON.stringify(event.details),
        timestamp: new Date(),
        ipAddress: event.details?.ip,
        userAgent: event.details?.userAgent
      }
    });
    
    // Alert on suspicious patterns
    if (event.type === 'PERMISSION_DENIED') {
      const recentDenials = await db.auditLog.count({
        where: {
          shop: event.shop,
          eventType: 'PERMISSION_DENIED',
          timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) }
        }
      });
      
      if (recentDenials > 10) {
        await this.alertSecurity({
          level: 'HIGH',
          message: 'Multiple permission denials detected',
          shop: event.shop
        });
      }
    }
  }
  
  async detectAnomalies(shop: string): Promise<void> {
    // Check for unusual access patterns
    const recentAccess = await db.auditLog.findMany({
      where: {
        shop,
        timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) }
      },
      orderBy: { timestamp: 'desc' }
    });
    
    // Detect rapid token refreshes (possible token theft)
    const tokenRefreshes = recentAccess.filter(e => e.eventType === 'TOKEN_REFRESH');
    if (tokenRefreshes.length > 100) {
      await this.alertSecurity({
        level: 'CRITICAL',
        message: 'Excessive token refreshes detected',
        shop,
        count: tokenRefreshes.length
      });
    }
  }
}
```

## 10. Complete Security Checklist

### OAuth Implementation
- [ ] HMAC verification on all OAuth endpoints
- [ ] State parameter for CSRF protection
- [ ] Timestamp validation to prevent replay attacks
- [ ] Shop domain format validation
- [ ] Secure token storage (encrypted in database)
- [ ] Token cleanup on app uninstall

### Session Token Security
- [ ] JWT signature verification using app secret
- [ ] Expiry time validation (max 1-2 minutes)
- [ ] Not-before time validation
- [ ] Audience claim matches app key
- [ ] Issuer and destination validation
- [ ] Shop consistency check between claims
- [ ] Token refresh mechanism implemented

### API Route Protection
- [ ] All routes require session token
- [ ] Centralized verification middleware
- [ ] No unprotected sensitive endpoints
- [ ] Proper 401/403 error responses
- [ ] Request context includes verified shop

### Multi-Tenant Isolation
- [ ] All queries scoped to authenticated shop
- [ ] No cross-shop data leakage possible
- [ ] Delete/update operations verify ownership
- [ ] Shop domain included in all data models
- [ ] Tested with multiple shops

### Webhook Security
- [ ] HMAC verification on all webhooks
- [ ] Raw body used for HMAC computation
- [ ] Timing-safe comparison
- [ ] Shop domain validation
- [ ] Idempotent webhook processing

### App Proxy Security
- [ ] Signature verification on proxy requests
- [ ] Query parameter sorting and signing
- [ ] Shop validation
- [ ] Rate limiting on proxy endpoints

### Token Management
- [ ] Offline tokens for background operations
- [ ] Online tokens for user-specific actions
- [ ] Token expiry tracking
- [ ] Secure token exchange implementation
- [ ] No tokens exposed to client

### Authorization
- [ ] Staff permission checks
- [ ] Scope validation
- [ ] Graceful handling of 403 responses
- [ ] Role-based access if applicable

### Monitoring & Logging
- [ ] Authentication event logging
- [ ] Failed attempt tracking
- [ ] Anomaly detection
- [ ] Security alerts configured
- [ ] Audit trail maintained

### Testing
- [ ] Automated auth flow tests
- [ ] Cross-tenant access tests
- [ ] Token expiry tests
- [ ] HMAC validation tests
- [ ] Permission denial tests

## Common Vulnerabilities to Avoid

1. **Missing HMAC Verification**: Never skip HMAC checks on OAuth or webhooks
2. **Trusting Client-Supplied Shop**: Always derive shop from verified token
3. **Token Storage in Frontend**: Never expose access tokens to client
4. **Missing Tenant Isolation**: Always scope queries to authenticated shop
5. **Ignoring Token Expiry**: Always validate exp and nbf claims
6. **Weak Session Management**: Use short-lived tokens, refresh frequently
7. **Missing Webhook Verification**: Always verify webhook signatures
8. **Insufficient Authorization**: Check permissions, not just authentication

---

*Last Updated: January 2025 | Security Level: CRITICAL | Classification: Internal*
*This guide is specific to Shopify embedded apps and complements general authentication security*