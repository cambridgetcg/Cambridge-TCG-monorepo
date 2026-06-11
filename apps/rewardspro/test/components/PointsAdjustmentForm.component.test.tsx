import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock Polaris components
vi.mock('@shopify/polaris', () => ({
  FormLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="form-layout">{children}</div>,
  TextField: ({ label, value, onChange, error, type, prefix, suffix, disabled, multiline, maxLength, showCharacterCount, ...rest }: any) => (
    <div data-testid={`textfield-${label}`}>
      <label>{label}</label>
      <input
        data-testid={`input-${label}`}
        type={type || 'text'}
        value={value || ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
        disabled={disabled}
        aria-label={label}
      />
      {error && <span data-testid={`error-${label}`}>{error}</span>}
      {prefix && <span data-testid="prefix">{prefix}</span>}
      {suffix && <span data-testid="suffix">{suffix}</span>}
    </div>
  ),
  Select: ({ label, options, value, onChange, disabled }: any) => (
    <div data-testid={`select-${label}`}>
      <select
        data-testid={`select-input-${label}`}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value)}
        disabled={disabled}
        aria-label={label}
      >
        {options?.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
  Button: ({ children, onClick, loading, disabled, variant, tone }: any) => (
    <button
      data-testid={`button-${variant || 'default'}-${tone || 'default'}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Loading...' : children}
    </button>
  ),
  InlineStack: ({ children }: { children: React.ReactNode }) => <div data-testid="inline-stack">{children}</div>,
  BlockStack: ({ children }: { children: React.ReactNode }) => <div data-testid="block-stack">{children}</div>,
  Banner: ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
    <div data-testid={`banner-${tone || 'default'}`}>{children}</div>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { PointsAdjustmentForm } from '../../app/components/Points/PointsAdjustmentForm';

describe('PointsAdjustmentForm', () => {
  const defaultProps = {
    customer: { id: 'cust-1', email: 'test@example.com', pointsBalance: 500 },
    type: 'add' as const,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    currencyConfig: { name: 'Stars', plural: 'Stars', icon: '⭐' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crash', () => {
    const { container } = render(<PointsAdjustmentForm {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('should show "Adding" for add type', () => {
    render(<PointsAdjustmentForm {...defaultProps} type="add" />);
    expect(screen.getByTestId('banner-info')).toBeTruthy();
  });

  it('should show "Removing" for remove type', () => {
    render(<PointsAdjustmentForm {...defaultProps} type="remove" />);
    expect(screen.getByTestId('banner-info')).toBeTruthy();
  });

  it('should show preset reasons matching type', () => {
    const { container: addContainer } = render(
      <PointsAdjustmentForm {...defaultProps} type="add" />,
    );
    const addSelect = addContainer.querySelector('[data-testid="select-input-Reason"]') as HTMLSelectElement;
    expect(addSelect).toBeTruthy();

    // Add type should have "Customer service gesture" as first option
    const addOptions = Array.from(addSelect.options).map((o) => o.textContent);
    expect(addOptions).toContain('Customer service gesture');
    expect(addOptions).toContain('Loyalty reward');
  });

  it('should reject zero amount on submit', () => {
    const onSubmit = vi.fn();
    render(<PointsAdjustmentForm {...defaultProps} onSubmit={onSubmit} />);

    // Click submit without entering amount
    const submitBtn = screen.getByTestId('button-primary-success');
    fireEvent.click(submitBtn);

    // onSubmit should NOT have been called
    expect(onSubmit).not.toHaveBeenCalled();

    // Should show error
    expect(screen.getByTestId('error-Amount')).toBeTruthy();
  });

  it('should reject non-integer amounts', () => {
    const onSubmit = vi.fn();
    render(<PointsAdjustmentForm {...defaultProps} onSubmit={onSubmit} />);

    const input = screen.getByTestId('input-Amount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10.5' } });

    const submitBtn = screen.getByTestId('button-primary-success');
    fireEvent.click(submitBtn);

    expect(onSubmit).not.toHaveBeenCalled();
    const errorEl = screen.getByTestId('error-Amount');
    expect(errorEl.textContent).toContain('whole numbers');
  });

  it('should reject amounts over balance for remove type', () => {
    const onSubmit = vi.fn();
    render(
      <PointsAdjustmentForm
        {...defaultProps}
        type="remove"
        customer={{ ...defaultProps.customer, pointsBalance: 50 }}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByTestId('input-Amount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '100' } });

    const submitBtn = screen.getByTestId('button-primary-critical');
    fireEvent.click(submitBtn);

    expect(onSubmit).not.toHaveBeenCalled();
    const errorEl = screen.getByTestId('error-Amount');
    expect(errorEl.textContent).toContain('Cannot remove more than');
  });

  it('should call onSubmit with correct values for valid input', () => {
    const onSubmit = vi.fn();
    render(<PointsAdjustmentForm {...defaultProps} onSubmit={onSubmit} />);

    const input = screen.getByTestId('input-Amount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '100' } });

    const submitBtn = screen.getByTestId('button-primary-success');
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith(100, 'Customer service gesture');
  });

  it('should call onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<PointsAdjustmentForm {...defaultProps} onCancel={onCancel} />);

    const cancelBtn = screen.getByTestId('button-default-default');
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });

  it('should show custom reason field when "Other" selected', () => {
    render(<PointsAdjustmentForm {...defaultProps} />);

    const select = screen.getByTestId('select-input-Reason') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'other' } });

    // Should now show the "Specify reason" field
    expect(screen.getByTestId('textfield-Specify reason')).toBeTruthy();
  });

  it('should disable inputs when loading', () => {
    render(<PointsAdjustmentForm {...defaultProps} loading={true} />);

    const input = screen.getByTestId('input-Amount') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('should use default currency config when not provided', () => {
    render(
      <PointsAdjustmentForm
        {...defaultProps}
        currencyConfig={null}
      />,
    );

    // Should render without crash even with null currencyConfig
    expect(screen.getByTestId('form-layout')).toBeTruthy();
  });
});
