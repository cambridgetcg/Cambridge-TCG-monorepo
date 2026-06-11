import { describe, it, expect } from 'vitest';

const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatter.format(amount);
};

const formatPercentage = (value: number, decimals: number = 2): string => {
  return `${value.toFixed(decimals)}%`;
};

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d);
};

const calculateTierProgress = (current: number, threshold: number): number => {
  if (threshold === 0) return 100;
  const progress = (current / threshold) * 100;
  return Math.min(progress, 100);
};

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(100, 'USD')).toBe('$100.00');
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('formats EUR correctly', () => {
    expect(formatCurrency(100, 'EUR')).toBe('€100.00');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-50, 'USD')).toBe('-$50.00');
  });

  it('handles zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  it('rounds to two decimal places', () => {
    expect(formatCurrency(99.999, 'USD')).toBe('$100.00');
    expect(formatCurrency(99.994, 'USD')).toBe('$99.99');
  });
});

describe('formatPercentage', () => {
  it('formats whole numbers', () => {
    expect(formatPercentage(50)).toBe('50.00%');
  });

  it('formats decimals', () => {
    expect(formatPercentage(33.33)).toBe('33.33%');
  });

  it('rounds to specified decimals', () => {
    expect(formatPercentage(33.3333, 2)).toBe('33.33%');
    expect(formatPercentage(33.3367, 2)).toBe('33.34%');
  });

  it('handles zero decimals', () => {
    expect(formatPercentage(33.7, 0)).toBe('34%');
  });
});

describe('formatDate', () => {
  it('formats Date objects', () => {
    const date = new Date('2024-01-15');
    expect(formatDate(date)).toBe('Jan 15, 2024');
  });

  it('formats date strings', () => {
    expect(formatDate('2024-12-25')).toBe('Dec 25, 2024');
  });

  it('handles different date formats', () => {
    expect(formatDate('2024-06-01T12:00:00Z')).toBe('Jun 1, 2024');
  });
});

describe('calculateTierProgress', () => {
  it('calculates progress correctly', () => {
    expect(calculateTierProgress(500, 1000)).toBe(50);
    expect(calculateTierProgress(750, 1000)).toBe(75);
  });

  it('caps progress at 100%', () => {
    expect(calculateTierProgress(1500, 1000)).toBe(100);
    expect(calculateTierProgress(2000, 1000)).toBe(100);
  });

  it('handles zero threshold', () => {
    expect(calculateTierProgress(100, 0)).toBe(100);
    expect(calculateTierProgress(0, 0)).toBe(100);
  });

  it('handles decimal values', () => {
    expect(calculateTierProgress(333.33, 1000)).toBeCloseTo(33.33, 1);
  });
});