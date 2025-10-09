# RewardsPro Membership Page Extension

## Overview

This is a **full-page** Customer Account UI Extension that displays comprehensive loyalty program information on a dedicated "Membership" page in the customer account.

**URL**: `/account/extensions/rewardspro-membership`
**Navigation**: Automatically appears as "Membership" in customer account menu

---

## Features

- ✅ Full-page dedicated loyalty view
- ✅ Welcome message with customer name
- ✅ Expanded tier details with benefits list
- ✅ Progress bar to next tier with detailed messaging
- ✅ Store credit balance with pending credit alerts
- ✅ Comprehensive lifetime statistics
- ✅ "How It Works" educational section
- ✅ Not-enrolled state with signup CTA

---

## Relationship to Other Extensions

This extension works alongside the **ProfileBlock** extension:

| Extension | Target | Location | Purpose |
|-----------|--------|----------|---------|
| **ProfileBlock** | `customer-account.profile.block.render` | `/account/profile` | Quick summary on profile page |
| **MembershipPage** | `customer-account.page.render` | `/account/membership` | Full detailed view |

**Why Separate Extensions?**

Shopify does not allow mixing `customer-account.page.render` (full page) with other targets in the same extension. Therefore, we have:
- `rewardspro-customer-account-ui` - ProfileBlock only
- `rewardspro-membership-page` - MembershipPage only

---

## Files

```
extensions/rewardspro-membership-page/
├── src/
│   └── MembershipPage.tsx        # Main component (300+ lines)
├── locales/
│   ├── en.default.json           # English translations
│   └── fr.json                   # French translations
├── shopify.extension.toml        # Extension configuration
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── README.md                     # This file
```

---

## Development

```bash
# Navigate to app root
cd /Users/alex/rewardspro-production

# Start dev server (will include both extensions)
shopify app dev
```

---

## Deployment

```bash
# Deploy both extensions (unreleased)
shopify app deploy --no-release

# After testing, release to production
shopify app deploy --message "Deploy ProfileBlock and MembershipPage extensions"
```

---

## Configuration

### shopify.extension.toml

```toml
api_version = "2025-07"

[[extensions]]
name = "RewardsPro Membership"
handle = "rewardspro-membership"
type = "ui_extension"

[[extensions.targeting]]
module = "./src/MembershipPage.tsx"
target = "customer-account.page.render"

[extensions.capabilities]
api_access = true
network_access = true
```

**Key Points**:
- Uses `customer-account.page.render` target (full page)
- Cannot be combined with other targets
- Appears as "Membership" in navigation menu

---

## API Integration

### Backend Endpoint

**URL**: `POST /api/customer-account/loyalty`

**Location**: `app/routes/api.customer-account.loyalty.tsx`

**Authentication**: Session token via `authenticate.public.customerAccount(request)`

**Response**: Same format as ProfileBlock (see main extension docs)

---

## Testing Checklist

- [ ] Extension builds without errors
- [ ] "Membership" appears in customer account navigation
- [ ] Page loads on `/account/extensions/rewardspro-membership`
- [ ] All sections render correctly (tier, progress, credit, stats)
- [ ] Loading states work
- [ ] Error state + retry button work
- [ ] Not-enrolled state displays correctly
- [ ] Currency formatting is correct
- [ ] Analytics events fire (`rewardspro:membership_page_viewed`)
- [ ] Mobile responsive
- [ ] Works in multiple locales

---

## Analytics Events

**Event**: `rewardspro:membership_page_viewed`

**Payload**:
```typescript
{
  enrolled: boolean;
  tier: string; // Tier name or 'none'
}
```

---

## Troubleshooting

### Extension doesn't appear in navigation

1. Verify extension is deployed: `shopify app versions list`
2. Check new customer accounts are enabled
3. Hard refresh browser (Cmd+Shift+R)
4. Check browser console for errors

### "Membership" menu item missing

1. Ensure target is `customer-account.page.render`
2. Verify extension is released (not just deployed)
3. Clear browser cache
4. Check Shopify CLI output for build errors

### Page shows 404

1. Verify URL: `/account/extensions/rewardspro-membership`
2. Check extension handle matches in toml file
3. Ensure extension is active in Partner Dashboard

---

## Future Enhancements

Potential additions for future versions:

- [ ] Transaction history table
- [ ] Tier comparison chart
- [ ] Referral program section
- [ ] Redemption marketplace
- [ ] Achievement badges
- [ ] Social sharing
- [ ] Export data functionality

---

**Last Updated**: January 2025
**Status**: ✅ Ready for Testing
**Extension Type**: Customer Account UI Extension (Full Page)
