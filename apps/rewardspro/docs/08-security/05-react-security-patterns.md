# React & TypeScript Security Patterns for RewardsPro

## Overview

This guide provides React and TypeScript-specific security patterns and best practices for the RewardsPro application, focusing on preventing common vulnerabilities in modern React applications.

## React Security Architecture

```
┌─────────────────────────────────────────┐
│         Browser Security (CSP)          │
├─────────────────────────────────────────┤
│      React Component Boundaries         │
├─────────────────────────────────────────┤
│         Props Validation Layer          │
├─────────────────────────────────────────┤
│        State Management Security        │
├─────────────────────────────────────────┤
│          API Communication              │
└─────────────────────────────────────────┘
```

## 1. Preventing XSS in React Components

### Safe Rendering Patterns

```typescript
// ❌ DANGEROUS: Never use dangerouslySetInnerHTML with user input
export function UnsafeComponent({ userContent }: { userContent: string }) {
  return (
    <div dangerouslySetInnerHTML={{ __html: userContent }} />
  );
}

// ✅ SAFE: React automatically escapes content
export function SafeComponent({ userContent }: { userContent: string }) {
  return (
    <div>{userContent}</div>
  );
}

// ✅ SAFE: When HTML is necessary, sanitize first
import DOMPurify from 'dompurify';

export function SafeHtmlComponent({ htmlContent }: { htmlContent: string }) {
  const sanitizedContent = DOMPurify.sanitize(htmlContent, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
  
  return (
    <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
  );
}
```

### RewardsPro Component Examples

```typescript
// app/components/CustomerName.tsx
import { Text } from '@shopify/polaris';
import DOMPurify from 'dompurify';

interface CustomerNameProps {
  name: string;
  allowFormatting?: boolean;
}

// ✅ SAFE: Customer name display with XSS prevention
export function CustomerName({ name, allowFormatting }: CustomerNameProps) {
  if (allowFormatting) {
    // Only allow basic formatting tags
    const sanitized = DOMPurify.sanitize(name, {
      ALLOWED_TAGS: ['strong', 'em'],
      ALLOWED_ATTR: []
    });
    
    return (
      <Text as="span">
        <span dangerouslySetInnerHTML={{ __html: sanitized }} />
      </Text>
    );
  }
  
  // Default: Plain text (automatically escaped by React)
  return <Text as="span">{name}</Text>;
}
```

```typescript
// app/components/StoreCreditDisplay.tsx
import { Text } from '@shopify/polaris';
import { formatCurrency } from '~/utils/currency';

interface StoreCreditDisplayProps {
  amount: number | string;
  shopSettings: ShopSettings;
}

// ✅ SAFE: Numeric display with type validation
export function StoreCreditDisplay({ amount, shopSettings }: StoreCreditDisplayProps) {
  // Validate and sanitize amount
  const numAmount = typeof amount === 'string' 
    ? parseFloat(amount.replace(/[^0-9.-]/g, ''))
    : amount;
  
  if (isNaN(numAmount) || numAmount < 0 || numAmount > Number.MAX_SAFE_INTEGER) {
    console.error('Invalid store credit amount:', amount);
    return <Text as="span">$0.00</Text>;
  }
  
  return (
    <Text as="span">
      {formatCurrency(numAmount, shopSettings)}
    </Text>
  );
}
```

## 2. URL and Link Security

### Safe URL Handling

```typescript
// ❌ DANGEROUS: Unvalidated URLs
export function UnsafeLink({ url }: { url: string }) {
  return <a href={url}>Click here</a>;
}

// ✅ SAFE: Validated and sanitized URLs
export function SafeLink({ url }: { url: string }) {
  const isValidUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      // Only allow http(s) protocols
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  };
  
  if (!isValidUrl(url)) {
    console.error('Invalid URL attempted:', url);
    return null;
  }
  
  // Prevent javascript: and data: protocols
  const sanitizedUrl = url.replace(/^(javascript|data|vbscript|file):/i, '');
  
  return (
    <a 
      href={sanitizedUrl} 
      target="_blank" 
      rel="noopener noreferrer"
    >
      Click here
    </a>
  );
}
```

### RewardsPro Safe Navigation

```typescript
// app/components/ShopifyResourceLink.tsx
import { Link } from '@shopify/polaris';

interface ShopifyResourceLinkProps {
  resourceType: 'customer' | 'order' | 'product';
  resourceId: string;
  shopDomain: string;
}

// ✅ SAFE: Controlled Shopify admin links
export function ShopifyResourceLink({ 
  resourceType, 
  resourceId, 
  shopDomain 
}: ShopifyResourceLinkProps) {
  // Validate shop domain
  if (!shopDomain.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
    console.error('Invalid shop domain:', shopDomain);
    return null;
  }
  
  // Validate resource ID (Shopify GID format)
  if (!resourceId.match(/^gid:\/\/shopify\/\w+\/\d+$/)) {
    console.error('Invalid resource ID:', resourceId);
    return null;
  }
  
  const adminUrl = `https://admin.shopify.com/store/${shopDomain.replace('.myshopify.com', '')}`;
  const resourcePath = {
    customer: `/customers/${resourceId.split('/').pop()}`,
    order: `/orders/${resourceId.split('/').pop()}`,
    product: `/products/${resourceId.split('/').pop()}`
  }[resourceType];
  
  return (
    <Link
      url={`${adminUrl}${resourcePath}`}
      external
      monochrome
    >
      View in Shopify Admin
    </Link>
  );
}
```

## 3. Form Security

### Input Validation with Zod

```typescript
// app/schemas/customer.schema.ts
import { z } from 'zod';

// Customer input validation schema
export const customerInputSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform(val => val.toLowerCase().trim()),
    
  name: z.string()
    .min(1, 'Name required')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z\s\-']+$/, 'Invalid characters in name')
    .transform(val => val.trim()),
    
  storeCredit: z.number()
    .min(0, 'Credit cannot be negative')
    .max(999999.99, 'Credit exceeds maximum')
    .multipleOf(0.01, 'Invalid precision'),
    
  tierId: z.string()
    .uuid('Invalid tier ID')
    .optional(),
    
  tags: z.array(z.string()
    .max(50, 'Tag too long')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Invalid tag format'))
    .max(10, 'Too many tags')
    .optional()
});

// Type inference
export type CustomerInput = z.infer<typeof customerInputSchema>;
```

### Secure Form Component

```typescript
// app/components/CustomerEditForm.tsx
import { Form, FormLayout, TextField, Button } from '@shopify/polaris';
import { useState } from 'react';
import { customerInputSchema } from '~/schemas/customer.schema';
import type { CustomerInput } from '~/schemas/customer.schema';

export function CustomerEditForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<CustomerInput>>({});
  
  const handleSubmit = async () => {
    try {
      // Validate input
      const validatedData = customerInputSchema.parse(formData);
      
      // Submit validated data
      await fetch('/app/customers/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken() // CSRF protection
        },
        body: JSON.stringify(validatedData)
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Display validation errors
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
    }
  };
  
  return (
    <Form onSubmit={handleSubmit}>
      <FormLayout>
        <TextField
          label="Email"
          type="email"
          value={formData.email || ''}
          onChange={(value) => {
            // Basic client-side validation
            if (value.includes('<') || value.includes('>')) {
              setErrors({ ...errors, email: 'Invalid characters' });
              return;
            }
            setFormData({ ...formData, email: value });
          }}
          error={errors.email}
          autoComplete="email"
        />
        
        <TextField
          label="Name"
          value={formData.name || ''}
          onChange={(value) => setFormData({ ...formData, name: value })}
          error={errors.name}
          autoComplete="name"
        />
        
        <TextField
          label="Store Credit"
          type="number"
          value={formData.storeCredit?.toString() || ''}
          onChange={(value) => {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              setFormData({ ...formData, storeCredit: num });
            }
          }}
          error={errors.storeCredit}
          prefix="$"
          min={0}
          max={999999.99}
          step={0.01}
        />
        
        <Button submit primary>Save Customer</Button>
      </FormLayout>
    </Form>
  );
}
```

## 4. State Management Security

### Secure Redux/Context Pattern

```typescript
// app/context/AuthContext.tsx
import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  shop: string | null;
  scopes: string[];
  // Never store sensitive tokens in state
}

type AuthAction = 
  | { type: 'LOGIN'; shop: string; scopes: string[] }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_SCOPES'; scopes: string[] };

// ✅ SAFE: Immutable state updates
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      // Validate shop domain
      if (!action.shop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
        console.error('Invalid shop domain in auth');
        return state;
      }
      
      return {
        ...state,
        isAuthenticated: true,
        shop: action.shop,
        scopes: action.scopes.filter(scope => 
          // Validate scope format
          scope.match(/^(read|write)_[a-z_]+$/)
        )
      };
      
    case 'LOGOUT':
      // Clear all auth state
      return {
        isAuthenticated: false,
        shop: null,
        scopes: []
      };
      
    case 'UPDATE_SCOPES':
      return {
        ...state,
        scopes: action.scopes.filter(scope => 
          scope.match(/^(read|write)_[a-z_]+$/)
        )
      };
      
    default:
      // Prevent unauthorized state modifications
      console.error('Unknown auth action:', action);
      return state;
  }
}

const AuthContext = createContext<{
  state: AuthState;
  dispatch: React.Dispatch<AuthAction>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    isAuthenticated: false,
    shop: null,
    scopes: []
  });
  
  // Prevent state tampering
  Object.freeze(state);
  
  return (
    <AuthContext.Provider value={{ state, dispatch }}>
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
```

## 5. API Communication Security

### Secure Fetch Wrapper

```typescript
// app/utils/secure-fetch.ts
interface SecureFetchOptions extends RequestInit {
  timeout?: number;
  retry?: number;
}

export async function secureFetch(
  url: string, 
  options: SecureFetchOptions = {}
): Promise<Response> {
  // Validate URL
  if (!url.startsWith('/') && !url.startsWith('https://')) {
    throw new Error('Invalid URL: must be relative or HTTPS');
  }
  
  // Add security headers
  const headers = new Headers(options.headers);
  
  // CSRF token for state-changing operations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method || 'GET')) {
    headers.set('X-CSRF-Token', getCsrfToken());
  }
  
  // Add request ID for tracing
  headers.set('X-Request-ID', generateRequestId());
  
  // Timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(), 
    options.timeout || 30000
  );
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'same-origin', // Include cookies for same-origin requests
    });
    
    clearTimeout(timeoutId);
    
    // Check for security headers in response
    if (!response.headers.get('X-Content-Type-Options')) {
      console.warn('Missing X-Content-Type-Options header');
    }
    
    return response;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Retry logic for network errors
    if (options.retry && options.retry > 0 && error.name === 'AbortError') {
      return secureFetch(url, { ...options, retry: options.retry - 1 });
    }
    
    throw error;
  }
}
```

### GraphQL Security

```typescript
// app/utils/graphql-client.ts
import { GraphQLClient } from 'graphql-request';
import { z } from 'zod';

// Validate GraphQL variables
const graphqlVariablesSchema = z.record(z.unknown()).refine(
  (obj) => {
    // Check for injection attempts in variables
    const suspicious = JSON.stringify(obj);
    return !suspicious.includes('__schema') && 
           !suspicious.includes('__type') &&
           !suspicious.includes('mutation {');
  },
  { message: 'Invalid GraphQL variables' }
);

export class SecureGraphQLClient extends GraphQLClient {
  async request<T>(
    query: string,
    variables?: Record<string, any>
  ): Promise<T> {
    // Validate variables
    if (variables) {
      graphqlVariablesSchema.parse(variables);
    }
    
    // Check query complexity (basic check)
    const depth = this.calculateQueryDepth(query);
    if (depth > 5) {
      throw new Error('Query too complex');
    }
    
    // Add security headers
    this.setHeader('X-Request-ID', generateRequestId());
    
    return super.request<T>(query, variables);
  }
  
  private calculateQueryDepth(query: string): number {
    // Simple depth calculation
    let depth = 0;
    let maxDepth = 0;
    
    for (const char of query) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth;
  }
}
```

## 6. Component Security Boundaries

### Error Boundaries for Security

```typescript
// app/components/SecurityErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';
import { Banner } from '@shopify/polaris';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SecurityErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error): State {
    // Check for security-related errors
    const isSecurityError = 
      error.message.includes('CSP') ||
      error.message.includes('XSS') ||
      error.message.includes('injection') ||
      error.message.includes('unauthorized');
    
    if (isSecurityError) {
      // Log security incident
      console.error('Security error caught:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      // Alert security team
      fetch('/api/security/alert', {
        method: 'POST',
        body: JSON.stringify({
          type: 'SECURITY_ERROR_BOUNDARY',
          error: error.message
        })
      });
    }
    
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service
    console.error('Error boundary caught:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <Banner
          title="Security Error"
          status="critical"
          onDismiss={() => this.setState({ hasError: false, error: null })}
        >
          <p>A security error has occurred. This incident has been reported.</p>
        </Banner>
      );
    }
    
    return this.props.children;
  }
}
```

## 7. React Hook Security

### Secure Custom Hooks

```typescript
// app/hooks/useSecureStorage.ts
import { useState, useCallback } from 'react';
import CryptoJS from 'crypto-js';

export function useSecureStorage(key: string) {
  const [error, setError] = useState<string | null>(null);
  
  const setItem = useCallback((value: any) => {
    try {
      // Never store sensitive data in localStorage
      if (typeof value === 'object' && 
          (value.password || value.token || value.apiKey)) {
        throw new Error('Cannot store sensitive data in localStorage');
      }
      
      // Encrypt before storing
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(value),
        process.env.VITE_ENCRYPTION_KEY!
      ).toString();
      
      localStorage.setItem(key, encrypted);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Secure storage error:', err);
    }
  }, [key]);
  
  const getItem = useCallback(() => {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      
      // Decrypt
      const decrypted = CryptoJS.AES.decrypt(
        encrypted,
        process.env.VITE_ENCRYPTION_KEY!
      ).toString(CryptoJS.enc.Utf8);
      
      return JSON.parse(decrypted);
    } catch (err) {
      setError('Failed to decrypt data');
      console.error('Secure storage error:', err);
      return null;
    }
  }, [key]);
  
  const removeItem = useCallback(() => {
    localStorage.removeItem(key);
    setError(null);
  }, [key]);
  
  return { setItem, getItem, removeItem, error };
}
```

### Secure Data Fetching Hook

```typescript
// app/hooks/useSecureQuery.ts
import { useState, useEffect } from 'react';
import { secureFetch } from '~/utils/secure-fetch';
import { z } from 'zod';

export function useSecureQuery<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options?: RequestInit
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await secureFetch(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const json = await response.json();
        
        // Validate response data
        const validatedData = schema.parse(json);
        
        if (!cancelled) {
          setData(validatedData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          console.error('Secure query error:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    
    fetchData();
    
    return () => {
      cancelled = true;
    };
  }, [url]);
  
  return { data, loading, error };
}
```

## 8. TypeScript Security Patterns

### Type-Safe Security Guards

```typescript
// app/types/guards.ts

// User input type guards
export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && 
         /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidShopDomain(value: unknown): value is string {
  return typeof value === 'string' && 
         /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' &&
         /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Numeric guards with bounds checking
export function isValidStoreCredit(value: unknown): value is number {
  return typeof value === 'number' &&
         value >= 0 &&
         value <= 999999.99 &&
         Number.isFinite(value);
}

// Object structure guards
export function isValidCustomerData(value: unknown): value is CustomerData {
  if (typeof value !== 'object' || value === null) return false;
  
  const obj = value as any;
  return isValidEmail(obj.email) &&
         typeof obj.name === 'string' &&
         obj.name.length > 0 &&
         obj.name.length <= 100 &&
         isValidStoreCredit(obj.storeCredit);
}
```

### Branded Types for Security

```typescript
// app/types/branded.ts

// Branded types prevent type confusion
type Brand<K, T> = K & { __brand: T };

export type SanitizedHTML = Brand<string, 'SanitizedHTML'>;
export type ValidatedEmail = Brand<string, 'ValidatedEmail'>;
export type ShopifyGID = Brand<string, 'ShopifyGID'>;
export type EncryptedToken = Brand<string, 'EncryptedToken'>;

// Type-safe sanitization functions
export function sanitizeHTML(html: string): SanitizedHTML {
  const cleaned = DOMPurify.sanitize(html);
  return cleaned as SanitizedHTML;
}

export function validateEmail(email: string): ValidatedEmail | null {
  if (!isValidEmail(email)) return null;
  return email.toLowerCase().trim() as ValidatedEmail;
}

export function parseShopifyGID(gid: string): ShopifyGID | null {
  if (!/^gid:\/\/shopify\/\w+\/\d+$/.test(gid)) return null;
  return gid as ShopifyGID;
}
```

## 9. Security Testing for React Components

### Component Security Tests

```typescript
// app/components/__tests__/CustomerName.security.test.tsx
import { render, screen } from '@testing-library/react';
import { CustomerName } from '../CustomerName';

describe('CustomerName Security', () => {
  it('should prevent XSS attacks', () => {
    const maliciousName = '<script>alert("XSS")</script>';
    
    const { container } = render(
      <CustomerName name={maliciousName} />
    );
    
    // Check that script tags are not rendered
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert("XSS")</script>')).toBeInTheDocument();
  });
  
  it('should sanitize HTML when formatting allowed', () => {
    const htmlName = '<strong>John</strong><script>alert(1)</script>';
    
    const { container } = render(
      <CustomerName name={htmlName} allowFormatting />
    );
    
    // Strong tag should be rendered
    expect(container.querySelector('strong')).toBeInTheDocument();
    // Script tag should not be rendered
    expect(container.querySelector('script')).toBeNull();
  });
});
```

## 10. Security Checklist for React Development

### Component Development Checklist
- [ ] Never use `dangerouslySetInnerHTML` with user input
- [ ] Validate all props with TypeScript or PropTypes
- [ ] Sanitize HTML content with DOMPurify
- [ ] Use `rel="noopener noreferrer"` on external links
- [ ] Validate URLs before rendering
- [ ] Implement error boundaries
- [ ] Avoid inline event handlers with user data
- [ ] Use CSP-compatible styles (no inline styles)

### State Management Checklist
- [ ] Never store sensitive data in React state
- [ ] Never store tokens in localStorage
- [ ] Validate state updates
- [ ] Use immutable state updates
- [ ] Implement proper cleanup in useEffect

### API Communication Checklist
- [ ] Always use HTTPS
- [ ] Include CSRF tokens
- [ ] Validate response data
- [ ] Implement request timeouts
- [ ] Handle errors gracefully
- [ ] Log security events

### Testing Checklist
- [ ] Test XSS prevention
- [ ] Test input validation
- [ ] Test error boundaries
- [ ] Test authentication flows
- [ ] Test authorization checks

---

*Last Updated: January 2025 | Security Level: HIGH | Classification: Internal*