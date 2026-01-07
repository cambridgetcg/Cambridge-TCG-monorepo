/**
 * Progress Components - "The Journey"
 *
 * Progress bars and journey indicators for tier progression.
 * Features gemstone markers for tier milestones.
 */

import React from 'react';
import type { TierLevel } from './TierBadge';

export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  value: number;
  /** Maximum value (for displaying ratio) */
  max?: number;
  /** Color variant */
  variant?: 'default' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'gradient';
  /** Height in pixels */
  height?: number;
  /** Show percentage label */
  showLabel?: boolean;
  /** Additional CSS class */
  className?: string;
}

const variantColors: Record<string, string> = {
  default: 'var(--color-ducal-gold, #d69e2e)',
  bronze: 'var(--tier-bronze, #a0785d)',
  silver: 'var(--tier-silver, #a0aec0)',
  gold: 'linear-gradient(90deg, #ecc94b 0%, #f6e05e 100%)',
  platinum: 'linear-gradient(90deg, #a0aec0 0%, #e2e8f0 100%)',
  gradient: 'linear-gradient(90deg, #d69e2e 0%, #ed8936 100%)',
};

export function ProgressBar({
  value,
  max = 100,
  variant = 'gradient',
  height = 8,
  showLabel = false,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`progress ${className}`}>
      {showLabel && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-xs, 5px)',
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-velvet-navy, #2c5282)',
        }}>
          <span>{value.toLocaleString()}</span>
          <span>{max.toLocaleString()}</span>
        </div>
      )}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${height}px`,
          background: 'rgba(45, 55, 72, 0.08)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: variantColors[variant],
            borderRadius: '9999px',
            transition: 'width 400ms ease-out',
          }}
        />
      </div>
    </div>
  );
}

export interface TierMilestone {
  tier: TierLevel;
  label: string;
  threshold: number;
  icon?: string;
}

export interface ProgressJourneyProps {
  /** Current progress value */
  currentValue: number;
  /** Tier milestones */
  milestones: TierMilestone[];
  /** Current active tier */
  currentTier?: TierLevel;
  /** Show tier labels */
  showLabels?: boolean;
  /** Additional CSS class */
  className?: string;
}

const tierIcons: Record<TierLevel, string> = {
  bronze: '●',
  silver: '○',
  gold: '★',
  platinum: '◆',
  diamond: '◇',
};

export function ProgressJourney({
  currentValue,
  milestones,
  currentTier,
  showLabels = true,
  className = '',
}: ProgressJourneyProps) {
  // Sort milestones by threshold
  const sortedMilestones = [...milestones].sort((a, b) => a.threshold - b.threshold);
  const maxThreshold = sortedMilestones[sortedMilestones.length - 1]?.threshold || 100;

  // Calculate progress percentage
  const progressPercent = Math.min(100, (currentValue / maxThreshold) * 100);

  // Determine which milestones are complete
  const getMarkerState = (milestone: TierMilestone, index: number) => {
    if (currentValue >= milestone.threshold) return 'complete';
    if (currentTier && sortedMilestones.findIndex(m => m.tier === currentTier) === index) return 'active';
    return 'pending';
  };

  const getMarkerPosition = (threshold: number) => {
    return `${(threshold / maxThreshold) * 100}%`;
  };

  return (
    <div className={`progress-journey ${className}`} style={{ padding: '34px 0' }}>
      {/* Track */}
      <div style={{
        position: 'relative',
        height: '4px',
        background: 'rgba(45, 55, 72, 0.1)',
        borderRadius: '9999px',
      }}>
        {/* Fill */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${progressPercent}%`,
          background: 'linear-gradient(90deg, #a0785d 0%, #ecc94b 100%)',
          borderRadius: '9999px',
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />

        {/* Markers */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          transform: 'translateY(-50%)',
        }}>
          {sortedMilestones.map((milestone, index) => {
            const state = getMarkerState(milestone, index);
            const isActive = state === 'active';
            const isComplete = state === 'complete';

            return (
              <div
                key={milestone.tier}
                style={{
                  position: 'absolute',
                  left: getMarkerPosition(milestone.threshold),
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {/* Marker circle */}
                <div style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isComplete
                    ? 'var(--color-success, #276749)'
                    : isActive
                      ? 'var(--tier-gold, #ecc94b)'
                      : 'var(--color-cream, #fefcf8)',
                  border: isComplete || isActive
                    ? 'none'
                    : '2px solid rgba(45, 55, 72, 0.15)',
                  borderRadius: '50%',
                  fontSize: '14px',
                  color: isComplete
                    ? 'white'
                    : isActive
                      ? 'var(--tier-gold-dark, #d69e2e)'
                      : 'rgba(45, 55, 72, 0.5)',
                  boxShadow: isActive
                    ? '0 0 12px rgba(236, 201, 75, 0.4)'
                    : 'none',
                  transition: 'all 250ms ease-out',
                }}>
                  {isComplete ? '✓' : (milestone.icon || tierIcons[milestone.tier])}
                </div>

                {/* Label */}
                {showLabels && (
                  <div style={{
                    position: 'absolute',
                    top: '36px',
                    fontSize: '11px',
                    color: 'var(--color-velvet-navy, #2c5282)',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    fontWeight: isActive ? 600 : 400,
                  }}>
                    {milestone.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom labels with thresholds */}
      {showLabels && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '48px',
          fontSize: '10px',
          color: 'rgba(44, 82, 130, 0.6)',
        }}>
          {sortedMilestones.map((milestone) => (
            <div
              key={milestone.tier}
              style={{
                position: 'absolute',
                left: getMarkerPosition(milestone.threshold),
                transform: 'translateX(-50%)',
              }}
            >
              ${milestone.threshold.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Simple progress ring for compact displays
 */
export function ProgressRing({
  value,
  max = 100,
  size = 48,
  strokeWidth = 4,
  color = 'var(--color-ducal-gold, #d69e2e)',
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(45, 55, 72, 0.1)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
      />
    </svg>
  );
}
