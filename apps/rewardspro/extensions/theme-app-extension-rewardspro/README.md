# RewardsPro Theme Extension

This is a Shopify Theme App Extension that provides both app blocks and app embed blocks for the RewardsPro membership program.

## Features

### 1. Star Rating Block (Section)
- Displays star ratings for products
- Configurable star color
- Shows recommendation text for highly-rated products

### 2. Membership Widget (App Embed)
- 🌟 Displays customer membership tier
- 💰 Shows available store credit balance
- 🎨 Beautiful, modern UI with gradient header
- 📱 Fully responsive (mobile & desktop)
- ♿ Accessible (WCAG compliant)
- 🌗 Dark mode support
- ⚡ Collapsible widget to save screen space
- 🎯 Positioned floating widget (customizable via theme editor)

## Structure

```
extensions/theme-app-extension-rewardspro/
├── assets/                          # Compiled assets
│   ├── membership-widget.js         # Bundled React app (448KB)
│   ├── membership-widget.css        # Widget styles (3.7KB)
│   └── thumbs-up.png               # Star rating image
├── blocks/
│   ├── star_rating.liquid          # Star rating section block
│   └── membership_widget.liquid    # Membership widget app embed
├── src/                            # Source files for widget
│   ├── main.tsx                    # Entry point
│   ├── MembershipWidget.tsx        # Main React component
│   ├── types.ts                    # TypeScript definitions
│   └── styles.css                  # Component styles
├── snippets/
│   └── stars.liquid                # Star rating snippet
├── locales/
│   └── en.default.json             # Translations
├── shopify.extension.toml          # Extension configuration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
└── vite.config.ts                  # Build configuration
```

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup

1. Install dependencies:
```bash
cd extensions/theme-app-extension-rewardspro
npm install
```

2. Build the widget:
```bash
npm run build
```

This compiles the TypeScript/React code into:
- `assets/membership-widget.js` - Main JavaScript bundle
- `assets/membership-widget.css` - Styles

### Development Commands

```bash
npm run dev       # Start development server with hot reload
npm run build     # Build for production
npm run typecheck # Check TypeScript types
```

## How It Works

### Membership Widget Data Flow

1. **Liquid reads customer metafields** (server-side):
   - `customer.metafields.rewards_pro.membership_tier` - Tier name (e.g., "Gold", "Silver")
   - `customer.metafields.rewards_pro.store_credit` - Balance amount
   - `customer.metafields.rewards_pro.store_currency` - Currency code

2. **Liquid outputs HTML container** with data attributes:
```liquid
<div id="membership-widget-root"
     data-tier="Gold"
     data-balance="50.00"
     data-currency="USD">
</div>
```

3. **React app mounts** and reads data from attributes
4. **Widget renders** with the membership information

### Required Metafields

The widget requires these customer metafields to be set:

| Namespace | Key | Type | Example |
|-----------|-----|------|---------|
| `rewards_pro` | `membership_tier` | `single_line_text_field` | "Gold" |
| `rewards_pro` | `store_credit` | `number_decimal` | 50.00 |
| `rewards_pro` | `store_currency` | `single_line_text_field` | "USD" |

## Enabling the App Embed

After installing the app:

1. Go to **Online Store > Themes > Customize**
2. Click **Theme Settings** (gear icon)
3. Navigate to **App embeds**
4. Find "Membership Widget" and toggle it **ON**
5. Click **Save**

The widget will now appear for logged-in customers who have membership data.

## Customization

### Theme Editor Settings

Merchants can customize the widget via the Theme Editor:

- **Widget Position**: Bottom Right, Bottom Left, Top Right, Top Left
- **Show on Mobile**: Toggle mobile visibility
- **Make Collapsible**: Allow users to minimize the widget

### Developer Customization

**Styling**: Edit `src/styles.css` and rebuild

**Component Logic**: Modify `src/MembershipWidget.tsx` and rebuild

**Position & Behavior**: Update the Liquid schema in `blocks/membership_widget.liquid`

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Supports ES2020+ features

## Accessibility Features

- ✅ Keyboard navigation
- ✅ ARIA labels and roles
- ✅ Focus indicators
- ✅ Screen reader friendly
- ✅ Reduced motion support

## Performance

- **Bundle Size**:
  - JavaScript: 448KB (138KB gzipped)
  - CSS: 3.7KB (1.17KB gzipped)
- **Load Time**: Async loading (non-blocking)
- **Runtime**: React 18 with optimized rendering

## Troubleshooting

### Widget not appearing?

1. Check if customer is logged in
2. Verify customer has `membership_tier` metafield set
3. Check browser console for errors
4. Ensure app embed is enabled in Theme Editor

### Build errors?

```bash
# Clean and rebuild
rm -rf node_modules assets
npm install
npm run build
```

### Metafield not found?

Ensure the metafield definition exists in the store:
```graphql
mutation {
  metafieldDefinitionCreate(definition: {
    name: "Membership Tier"
    namespace: "rewards_pro"
    key: "membership_tier"
    type: "single_line_text_field"
    ownerType: CUSTOMER
  }) {
    createdDefinition {
      id
    }
  }
}
```

## License

Proprietary - RewardsPro App
