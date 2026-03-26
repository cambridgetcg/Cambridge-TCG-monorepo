/**
 * Email Template Builders
 *
 * Centralized HTML email templates for transactional notifications.
 * Each function returns { subject, html } for a specific email type.
 *
 * Keeps email-notifications.server.ts focused on orchestration
 * (check limits, call provider, log events) while templates live here.
 */

// ============================================
// POINTS EARNED
// ============================================

export interface PointsEarnedTemplateData {
  customerName: string;
  storeName: string;
  pointsEarned: number;
  totalBalance: number;
  orderNumber?: string;
  bonusInfo: string;
  currencyName: string;
  currencyIcon: string;
}

export function buildPointsEarnedEmail(data: PointsEarnedTemplateData): { subject: string; html: string } {
  const subject = `You earned ${data.pointsEarned} ${data.currencyName}! ${data.currencyIcon}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Great news, ${data.customerName}!</h2>
      <p style="font-size: 16px; color: #666;">
        You just earned <strong style="color: #2ecc71; font-size: 24px;">${data.pointsEarned} ${data.currencyName}</strong>
        ${data.orderNumber ? `from your order #${data.orderNumber}` : ""}!
      </p>
      ${data.bonusInfo ? `<p style="color: #8e44ad; font-size: 14px;">${data.bonusInfo}</p>` : ""}
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Your Current Balance</p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">
          ${data.currencyIcon} ${data.totalBalance.toLocaleString()} ${data.currencyName}
        </p>
      </div>
      <p style="color: #666;">Keep shopping to earn more ${data.currencyName.toLowerCase()} and unlock exclusive rewards!</p>
      <p style="color: #999; font-size: 12px;">- The ${data.storeName} Team</p>
    </div>
  `;
  return { subject, html };
}

// ============================================
// POINTS EXPIRING
// ============================================

export interface PointsExpiringTemplateData {
  customerName: string;
  storeName: string;
  pointsExpiring: number;
  daysUntilExpiry: number;
  currencyName: string;
  currencyIcon: string;
}

export function buildPointsExpiringEmail(data: PointsExpiringTemplateData): { subject: string; html: string } {
  const urgencyColor = data.daysUntilExpiry <= 7 ? "#e74c3c" : "#f39c12";
  const subject = `Don't lose your ${data.pointsExpiring} ${data.currencyName}! Expires in ${data.daysUntilExpiry} days`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${urgencyColor};">Act now, ${data.customerName}!</h2>
      <div style="background-color: ${urgencyColor}; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Points Expiring Soon</p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">
          ${data.currencyIcon} ${data.pointsExpiring.toLocaleString()} ${data.currencyName}
        </p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">
          in ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? "s" : ""}
        </p>
      </div>
      <p style="font-size: 16px; color: #666;">
        Your ${data.currencyName.toLowerCase()} are about to expire! Use them before they're gone to get
        exclusive rewards and discounts.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="#" style="background-color: ${urgencyColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Redeem My ${data.currencyName}
        </a>
      </div>
      <p style="color: #999; font-size: 12px;">- The ${data.storeName} Team</p>
    </div>
  `;
  return { subject, html };
}

// ============================================
// POINTS REDEEMED
// ============================================

export interface PointsRedeemedTemplateData {
  customerName: string;
  storeName: string;
  pointsSpent: number;
  remainingBalance: number;
  discountCode: string;
  discountText: string;
  expiryDate: string;
  currencyName: string;
  currencyIcon: string;
}

export function buildPointsRedeemedEmail(data: PointsRedeemedTemplateData): { subject: string; html: string } {
  const subject = `Your ${data.discountText} discount code is ready! ${data.currencyIcon}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Congratulations, ${data.customerName}! ${data.currencyIcon}</h2>
      <p style="font-size: 16px; color: #666;">
        You've successfully redeemed <strong>${data.pointsSpent.toLocaleString()} ${data.currencyName}</strong>
        for an exclusive discount!
      </p>
      <div style="background-color: #2ecc71; padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Your Discount Code</p>
        <p style="color: white; margin: 10px 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; font-family: monospace;">
          ${data.discountCode}
        </p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">
          ${data.discountText}
        </p>
      </div>
      <p style="text-align: center; color: #e74c3c; font-size: 14px;">
        ⏰ Valid until: ${data.expiryDate}
      </p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 0; color: #666;">
          <strong>Remaining Balance:</strong> ${data.currencyIcon} ${data.remainingBalance.toLocaleString()} ${data.currencyName}
        </p>
      </div>
      <p style="color: #999; font-size: 12px;">- The ${data.storeName} Team</p>
    </div>
  `;
  return { subject, html };
}

// ============================================
// STREAK MILESTONE
// ============================================

export interface StreakMilestoneTemplateData {
  customerName: string;
  storeName: string;
  streakDays: number;
  bonusPercent: number;
  currencyName: string;
  currencyIcon: string;
}

export function buildStreakMilestoneEmail(data: StreakMilestoneTemplateData): { subject: string; html: string } {
  const subject = `${data.currencyIcon} ${data.streakDays}-Day Streak! You're on fire!`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e67e22; text-align: center;">
        🔥 Amazing Streak, ${data.customerName}! 🔥
      </h2>
      <div style="background: linear-gradient(135deg, #f39c12 0%, #e74c3c 100%); padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 48px; font-weight: bold;">
          ${data.streakDays} Days
        </p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">
          Consecutive Activity Streak
        </p>
      </div>
      <div style="background-color: #27ae60; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Your Current Bonus</p>
        <p style="color: white; margin: 5px 0 0 0; font-size: 28px; font-weight: bold;">
          +${data.bonusPercent}% Extra ${data.currencyName}
        </p>
        <p style="color: white; margin: 5px 0 0 0; font-size: 14px;">on every purchase!</p>
      </div>
      <p style="text-align: center; color: #666; font-size: 16px;">
        Keep the streak alive! Shop today to maintain your bonus.
      </p>
      <p style="color: #999; font-size: 12px; text-align: center;">- The ${data.storeName} Team</p>
    </div>
  `;
  return { subject, html };
}

// ============================================
// TIER EXPIRATION WARNING
// ============================================

export interface TierExpirationWarningTemplateData {
  customerName: string;
  storeName: string;
  tierName: string;
  tierBenefits: string[];
  daysUntilExpiry: number;
  expiryDate: string;
  renewalUrl?: string;
}

export function buildTierExpirationWarningEmail(data: TierExpirationWarningTemplateData): { subject: string; html: string } {
  const urgencyColor = data.daysUntilExpiry <= 3 ? "#e74c3c" : "#f39c12";
  const urgencyText = data.daysUntilExpiry === 1 ? "tomorrow" : `in ${data.daysUntilExpiry} days`;

  const benefitsHtml = data.tierBenefits.length > 0
    ? `
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Benefits you'll lose:</p>
        <ul style="margin: 0; padding-left: 20px; color: #666;">
          ${data.tierBenefits.map(b => `<li style="margin: 5px 0;">${b}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const subject = `⚠️ Your ${data.tierName} membership expires ${urgencyText}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${urgencyColor};">Don't lose your ${data.tierName} benefits, ${data.customerName}!</h2>

      <div style="background-color: ${urgencyColor}; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Membership Expiring</p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 28px; font-weight: bold;">
          ${data.tierName}
        </p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">
          ${urgencyText} • ${data.expiryDate}
        </p>
      </div>

      <p style="font-size: 16px; color: #666; line-height: 1.6;">
        Your ${data.tierName} membership is about to expire. Act now to keep enjoying your exclusive benefits!
      </p>

      ${benefitsHtml}

      ${data.renewalUrl ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.renewalUrl}" style="background-color: ${urgencyColor}; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
          Renew My Membership
        </a>
      </div>
      ` : ''}

      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
        Questions? Reply to this email or contact our support team.
        <br>- The ${data.storeName} Team
      </p>
    </div>
  `;
  return { subject, html };
}

// ============================================
// TIER EXPIRED
// ============================================

export interface TierExpiredTemplateData {
  customerName: string;
  storeName: string;
  expiredTierName: string;
  newTierText: string;
  renewalUrl?: string;
}

export function buildTierExpiredEmail(data: TierExpiredTemplateData): { subject: string; html: string } {
  const subject = `Your ${data.expiredTierName} membership has expired`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #666;">We miss you, ${data.customerName}!</h2>

      <div style="background-color: #95a5a6; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Membership Expired</p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 28px; font-weight: bold;">
          ${data.expiredTierName}
        </p>
      </div>

      <p style="font-size: 16px; color: #666; line-height: 1.6;">
        Your ${data.expiredTierName} membership has expired. ${data.newTierText}
      </p>

      <p style="font-size: 16px; color: #666; line-height: 1.6;">
        Don't worry - you can renew anytime to get back your exclusive benefits!
      </p>

      ${data.renewalUrl ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.renewalUrl}" style="background-color: #3498db; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
          Renew My Membership
        </a>
      </div>
      ` : ''}

      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
        - The ${data.storeName} Team
      </p>
    </div>
  `;
  return { subject, html };
}
