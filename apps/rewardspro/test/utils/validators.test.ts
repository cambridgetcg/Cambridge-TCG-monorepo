import { describe, it, expect } from 'vitest';

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateTierName = (name: string): boolean => {
  if (!name || name.trim().length === 0) return false;
  if (name.length > 50) return false;
  const validNameRegex = /^[a-zA-Z0-9\s]+$/;
  return validNameRegex.test(name);
};

const validateCashbackPercent = (percent: number): boolean => {
  if (typeof percent !== 'number' || isNaN(percent)) return false;
  return percent >= 0 && percent <= 100;
};

const validateSpendingThreshold = (amount: number): boolean => {
  if (typeof amount !== 'number' || isNaN(amount)) return false;
  return amount >= 0;
};

const validateCurrency = (currency: string): boolean => {
  const validCurrencies = [
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR',
    'CHF', 'SEK', 'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'KRW'
  ];
  return validCurrencies.includes(currency);
};

describe('validateEmail', () => {
  it('validates correct emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user+tag@domain.co.uk')).toBe(true);
    expect(validateEmail('john.doe@company.org')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('user @domain.com')).toBe(false);
    expect(validateEmail('user@domain')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('a@b.c')).toBe(true);
  });
});

describe('validateTierName', () => {
  it('validates tier names', () => {
    expect(validateTierName('Gold')).toBe(true);
    expect(validateTierName('VIP Plus')).toBe(true);
    expect(validateTierName('Tier 1')).toBe(true);
  });

  it('rejects invalid tier names', () => {
    expect(validateTierName('')).toBe(false);
    expect(validateTierName('   ')).toBe(false);
    expect(validateTierName('a'.repeat(51))).toBe(false);
    expect(validateTierName('Tier@123')).toBe(false);
    expect(validateTierName('Gold!')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(validateTierName('a'.repeat(50))).toBe(true);
    expect(validateTierName('123')).toBe(true);
  });
});

describe('validateCashbackPercent', () => {
  it('validates percentages within range', () => {
    expect(validateCashbackPercent(5)).toBe(true);
    expect(validateCashbackPercent(0)).toBe(true);
    expect(validateCashbackPercent(100)).toBe(true);
    expect(validateCashbackPercent(33.33)).toBe(true);
  });

  it('rejects invalid percentages', () => {
    expect(validateCashbackPercent(-1)).toBe(false);
    expect(validateCashbackPercent(101)).toBe(false);
    expect(validateCashbackPercent(NaN)).toBe(false);
    expect(validateCashbackPercent(Infinity)).toBe(false);
  });

  it('handles type checking', () => {
    expect(validateCashbackPercent('5' as any)).toBe(false);
    expect(validateCashbackPercent(null as any)).toBe(false);
    expect(validateCashbackPercent(undefined as any)).toBe(false);
  });
});

describe('validateSpendingThreshold', () => {
  it('validates positive amounts', () => {
    expect(validateSpendingThreshold(0)).toBe(true);
    expect(validateSpendingThreshold(100)).toBe(true);
    expect(validateSpendingThreshold(999.99)).toBe(true);
    expect(validateSpendingThreshold(10000)).toBe(true);
  });

  it('rejects negative amounts', () => {
    expect(validateSpendingThreshold(-1)).toBe(false);
    expect(validateSpendingThreshold(-100)).toBe(false);
  });

  it('handles invalid inputs', () => {
    expect(validateSpendingThreshold(NaN)).toBe(false);
    expect(validateSpendingThreshold(Infinity)).toBe(false);
    expect(validateSpendingThreshold('100' as any)).toBe(false);
  });
});

describe('validateCurrency', () => {
  it('validates supported currencies', () => {
    expect(validateCurrency('USD')).toBe(true);
    expect(validateCurrency('EUR')).toBe(true);
    expect(validateCurrency('GBP')).toBe(true);
    expect(validateCurrency('JPY')).toBe(true);
  });

  it('rejects unsupported currencies', () => {
    expect(validateCurrency('XYZ')).toBe(false);
    expect(validateCurrency('usd')).toBe(false);
    expect(validateCurrency('US$')).toBe(false);
    expect(validateCurrency('')).toBe(false);
  });
});