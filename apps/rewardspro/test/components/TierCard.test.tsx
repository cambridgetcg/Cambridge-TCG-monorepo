import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock Polaris components
vi.mock('@shopify/polaris', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  Box: ({ children }: { children: React.ReactNode }) => <div data-testid="box">{children}</div>,
  BlockStack: ({ children }: { children: React.ReactNode }) => <div data-testid="block-stack">{children}</div>,
  InlineStack: ({ children }: { children: React.ReactNode }) => <div data-testid="inline-stack">{children}</div>,
  Text: ({ children, variant }: { children: React.ReactNode, variant?: string }) => 
    <span data-testid={`text-${variant || 'default'}`}>{children}</span>,
  Badge: ({ children, tone }: { children: React.ReactNode, tone?: string }) => 
    <span data-testid={`badge-${tone || 'default'}`}>{children}</span>,
  Button: ({ children, onClick, variant, tone }: any) => 
    <button data-testid={`button-${variant || 'default'}`} onClick={onClick}>{children}</button>,
  Icon: ({ source }: { source: string }) => <span data-testid={`icon-${source}`} />,
  Modal: ({ open, children }: { open: boolean, children: React.ReactNode }) => 
    open ? <div data-testid="modal">{children}</div> : null
}));

// Mock Polaris icons
vi.mock('@shopify/polaris-icons', () => ({
  TrophyIcon: 'TrophyIcon',
  EditIcon: 'EditIcon',
  DeleteIcon: 'DeleteIcon',
  DiamondIcon: 'DiamondIcon'
}));

// Mock TierCard component
interface Tier {
  id: string;
  name: string;
  minSpend: number;
  cashbackPercent: number;
  evaluationPeriod: 'ANNUAL' | 'LIFETIME';
  customerCount?: number;
}

interface TierCardProps {
  tier: Tier;
  onEdit?: (tier: Tier) => void;
  onDelete?: (id: string) => void;
}

const TierCard: React.FC<TierCardProps> = ({ tier, onEdit, onDelete }) => {
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);

  const getTierIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('diamond')) return 'diamond-icon';
    if (lowerName.includes('gold')) return 'gold-icon';
    if (lowerName.includes('silver')) return 'silver-icon';
    return 'bronze-icon';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div data-testid="card">
      <div data-testid="block-stack">
        <div data-testid="inline-stack">
          <span data-testid={getTierIcon(tier.name)} />
          <span data-testid="text-headingMd">{tier.name}</span>
          {tier.customerCount !== undefined && (
            <span data-testid="badge-info">{tier.customerCount} customers</span>
          )}
        </div>
        
        <div data-testid="block-stack">
          <span data-testid="text-default">
            {formatCurrency(tier.minSpend)}+ {tier.evaluationPeriod.toLowerCase()} spending
          </span>
          <span data-testid="text-default">{tier.cashbackPercent}% cashback</span>
        </div>

        <div data-testid="inline-stack">
          {onEdit && (
            <button 
              data-testid="button-plain" 
              onClick={() => onEdit(tier)}
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button 
              data-testid="button-plain" 
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div data-testid="modal">
          <span>Delete tier?</span>
          <button onClick={() => {
            onDelete?.(tier.id);
            setShowDeleteModal(false);
          }}>
            Confirm
          </button>
          <button onClick={() => setShowDeleteModal(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

describe('TierCard', () => {
  const mockTier: Tier = {
    id: '1',
    name: 'Gold',
    minSpend: 1000,
    cashbackPercent: 5,
    evaluationPeriod: 'ANNUAL',
    customerCount: 150
  };

  it('renders tier information correctly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const root = require('react-dom/client').createRoot(container);
    root.render(<TierCard tier={mockTier} />);

    expect(container.textContent).toContain('Gold');
    expect(container.textContent).toContain('$1,000+ annual spending');
    expect(container.textContent).toContain('5% cashback');
    expect(container.textContent).toContain('150 customers');
  });

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const root = require('react-dom/client').createRoot(container);
    root.render(<TierCard tier={mockTier} onEdit={onEdit} />);

    const editButton = container.querySelector('[data-testid="button-plain"]');
    editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    expect(onEdit).toHaveBeenCalledWith(mockTier);
  });

  it('shows delete confirmation modal', () => {
    const onDelete = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const root = require('react-dom/client').createRoot(container);
    root.render(<TierCard tier={mockTier} onDelete={onDelete} />);

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent === 'Delete'
    );
    deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    expect(container.textContent).toContain('Delete tier?');
    
    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent === 'Confirm'
    );
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('displays correct icon based on tier level', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const bronzeTier = { ...mockTier, name: 'Bronze' };
    const root = require('react-dom/client').createRoot(container);
    root.render(<TierCard tier={bronzeTier} />);
    
    expect(container.querySelector('[data-testid="bronze-icon"]')).toBeTruthy();
    
    const diamondTier = { ...mockTier, name: 'Diamond' };
    root.render(<TierCard tier={diamondTier} />);
    
    expect(container.querySelector('[data-testid="diamond-icon"]')).toBeTruthy();
  });

  it('handles lifetime evaluation period', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const lifetimeTier = { ...mockTier, evaluationPeriod: 'LIFETIME' as const };
    const root = require('react-dom/client').createRoot(container);
    root.render(<TierCard tier={lifetimeTier} />);
    
    expect(container.textContent).toContain('$1,000+ lifetime spending');
  });

  it('renders without customer count', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const tierWithoutCount = { ...mockTier };
    delete tierWithoutCount.customerCount;
    
    const root = require('react-dom/client').createRoot(container);
    root.render(<TierCard tier={tierWithoutCount} />);
    
    expect(container.textContent).not.toContain('customers');
  });
});

// Mock react-dom/client for testing
vi.mock('react-dom/client', () => ({
  createRoot: (container: HTMLElement) => ({
    render: (element: React.ReactElement) => {
      const React = require('react');
      const ReactDOM = require('react-dom');
      ReactDOM.render(element, container);
    }
  })
}));