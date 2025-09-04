import { vi } from 'vitest';

// Mock Shopify App Bridge
vi.mock('@shopify/app-bridge-react', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => children,
  useAppBridge: () => ({
    dispatch: vi.fn(),
    subscribe: vi.fn(),
    error: vi.fn()
  }),
  ResourcePicker: vi.fn(),
  Toast: vi.fn(),
  Modal: vi.fn()
}));

// Mock environment variables
vi.mock('process', () => ({
  env: {
    SHOPIFY_API_KEY: 'test-api-key',
    DATABASE_URL: 'postgresql://test'
  }
}));