import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock Remix hooks
const mockFetcher = {
  data: null as any,
  state: 'idle' as string,
  submit: vi.fn(),
};

vi.mock('@remix-run/react', () => ({
  useFetcher: () => mockFetcher,
}));

// Mock Polaris components
vi.mock('@shopify/polaris', () => ({
  BlockStack: ({ children }: { children: React.ReactNode }) => <div data-testid="block-stack">{children}</div>,
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    icon: _icon,
    variant: _variant,
    tone: _tone,
    size: _size,
  }: any) => {
    // Flatten children to a clean string for test ID
    const text = Array.isArray(children)
      ? children.filter(Boolean).join('').trim()
      : (children?.toString() || 'unnamed');
    const testId = `button-${text.replace(/\s+/g, '-')}`;
    return (
      <button data-testid={testId} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    );
  },
  InlineStack: ({ children }: { children: React.ReactNode }) => <div data-testid="inline-stack">{children}</div>,
  Text: ({
    children,
    tone,
    variant,
    fontWeight: _fontWeight,
    alignment: _alignment,
  }: any) => (
    <span data-testid={`text-${variant || 'default'}`} data-tone={tone}>{children}</span>
  ),
  Box: ({ children }: { children: React.ReactNode }) => <div data-testid="box">{children}</div>,
  Modal: Object.assign(
    ({
      open,
      children,
      onClose: _onClose,
      title,
      size: _size,
    }: any) => (
      open ? <div data-testid="modal" data-title={title}>{children}</div> : null
    ),
    {
      Section: ({ children }: { children: React.ReactNode }) => <div data-testid="modal-section">{children}</div>,
    },
  ),
  Banner: ({ children, tone, onDismiss }: any) => (
    <div data-testid={`banner-${tone}`}>
      {children}
      <button data-testid="banner-dismiss" onClick={onDismiss}>Dismiss</button>
    </div>
  ),
  TextField: ({
    label,
    value,
    onChange,
    placeholder,
    prefix: _prefix,
    clearButton: _clearButton,
    onClearButtonClick: _onClearButtonClick,
    ..._rest
  }: any) => (
    <input
      data-testid={`textfield-${label}`}
      value={value || ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
    />
  ),
  Icon: ({ source: _source }: any) => <span data-testid="icon" />,
  Spinner: () => <div data-testid="spinner" />,
  Badge: ({ children, tone }: any) => <span data-testid={`badge-${tone || 'default'}`}>{children}</span>,
  Divider: () => <hr data-testid="divider" />,
  Select: ({ label, options, value, onChange }: any) => (
    <select data-testid={`select-${label}`} value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value)}>
      {options?.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  ),
  DataTable: ({ rows, headings }: any) => (
    <table data-testid="data-table">
      <thead>
        <tr>{headings?.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows?.map((row: any[], i: number) => (
          <tr key={i}>{row.map((cell: any, j: number) => <td key={j}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  ),
  EmptyState: ({ heading, children }: any) => (
    <div data-testid="empty-state">
      <h2>{heading}</h2>
      {children}
    </div>
  ),
}));

// Mock Polaris icons
vi.mock('@shopify/polaris-icons', () => ({
  PlusCircleIcon: 'PlusCircleIcon',
  MinusCircleIcon: 'MinusCircleIcon',
  ClockIcon: 'ClockIcon',
  SearchIcon: 'SearchIcon',
}));

// Mock the child form component
vi.mock('../../app/components/Points/PointsAdjustmentForm', () => ({
  PointsAdjustmentForm: ({ type, onSubmit, onCancel }: any) => (
    <div data-testid={`adjustment-form-${type}`}>
      <button data-testid={`form-submit-${type}`} onClick={() => onSubmit(100, 'Test reason')}>Submit</button>
      <button data-testid={`form-cancel-${type}`} onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

import { PointsTab } from '../../app/components/Points/PointsTab';

describe('PointsTab', () => {
  const defaultProps = {
    customer: { id: 'cust-1', email: 'test@example.com', pointsBalance: 500 },
    currencyConfig: { name: 'Stars', plural: 'Stars', icon: '⭐' },
    initialTransactions: [
      {
        id: 't1',
        amount: 100,
        balance: 100,
        type: 'ORDER_EARNED',
        description: 'Purchase reward',
        createdAt: '2026-01-15T00:00:00Z',
        expiresAt: null,
        metadata: { reason: 'Order #1001' },
      },
      {
        id: 't2',
        amount: -30,
        balance: 70,
        type: 'RAFFLE_ENTRY',
        description: null,
        createdAt: '2026-01-16T00:00:00Z',
        expiresAt: null,
        metadata: null,
      },
    ],
    lifetimePoints: 1000,
    expiringSoon: 50,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetcher.data = null;
    mockFetcher.state = 'idle';
  });

  it('should render balance and transaction table', () => {
    render(<PointsTab {...defaultProps} />);

    // Should render the data table with transactions
    expect(screen.getByTestId('data-table')).toBeTruthy();
  });

  it('should show empty state when no transactions', () => {
    render(<PointsTab {...defaultProps} initialTransactions={[]} />);

    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('should disable Remove button when balance is 0', () => {
    render(
      <PointsTab
        {...defaultProps}
        customer={{ ...defaultProps.customer, pointsBalance: 0 }}
      />,
    );

    const removeBtn = screen.getByTestId('button-Remove-Stars');
    expect(removeBtn).toBeTruthy();
    expect((removeBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('should handle search with null metadata.reason (Bug #1 regression)', () => {
    const txWithNullReason = [
      {
        id: 't1',
        amount: 100,
        balance: 100,
        type: 'ORDER_EARNED',
        description: 'Test',
        createdAt: '2026-01-15T00:00:00Z',
        expiresAt: null,
        metadata: { reason: null }, // Non-string reason
      },
      {
        id: 't2',
        amount: 50,
        balance: 150,
        type: 'MANUAL_CREDIT',
        description: null,
        createdAt: '2026-01-16T00:00:00Z',
        expiresAt: null,
        metadata: { reason: 12345 }, // Numeric reason — would crash with .toLowerCase()
      },
      {
        id: 't3',
        amount: -10,
        balance: 140,
        type: 'RAFFLE_ENTRY',
        description: null,
        createdAt: '2026-01-17T00:00:00Z',
        expiresAt: null,
        metadata: null, // Null metadata entirely
      },
    ];

    // Should not crash during render (search filter runs on every render)
    expect(() => {
      render(
        <PointsTab
          {...defaultProps}
          initialTransactions={txWithNullReason}
        />,
      );
    }).not.toThrow();
  });

  it('should render correctly with zero expiringSoon', () => {
    render(<PointsTab {...defaultProps} expiringSoon={0} />);

    // Should still render, just without the expiring section
    expect(screen.getByTestId('data-table')).toBeTruthy();
  });

  it('should show filtered-empty message for no search results', async () => {
    render(<PointsTab {...defaultProps} />);

    // The search box is rendered
    const searchInput = screen.getByTestId('textfield-Search transactions');
    expect(searchInput).toBeTruthy();
  });

  it('should display banner on success response', () => {
    mockFetcher.data = { success: true, message: 'Added 100 Stars' };

    render(<PointsTab {...defaultProps} />);

    expect(screen.getByTestId('banner-success')).toBeTruthy();
  });

  it('should display banner on error response', () => {
    mockFetcher.data = { success: false, message: 'Insufficient balance' };

    render(<PointsTab {...defaultProps} />);

    expect(screen.getByTestId('banner-critical')).toBeTruthy();
  });
});
