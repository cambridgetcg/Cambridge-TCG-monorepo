# RewardsPro storefront design-system handoff

Use this handoff when generating shopper-facing UI for the RewardsPro Shopify
theme app extension. The canonical implementation is
`../assets/rp-shared.css`; this file is a derived guide. If documentation and
the CSS disagree, the CSS is authoritative—the CSS wins.

## 1. Visual Theme & Atmosphere

RewardsPro is a guest inside a merchant's storefront.

- **Quiet by default.** Resting, loading, informational, and warning states
  use inherited typography, semantic surfaces, and restrained elevation.
- **Theme before brand.** Inherit the merchant's font and configured
  `--rp-primary-color`; do not introduce a standalone RewardsPro visual
  identity.
- **Earned expression.** A tier upgrade, claim, or reveal may use accent,
  motion, and stronger elevation, but it must return to rest within three
  seconds.
- **One page, one rhythm.** Multiple widgets must compose from the same
  tokens and primitives rather than looking like separate applications.
- **Shopper-first voice.** Explain what happened and what to do next without
  exposing system plumbing or creating false urgency.

## 2. Color System

Use semantic custom properties, never raw colors in generated component CSS.
The merchant-provided `--rp-primary-color` is the accent. A fallback may be
supplied inside `var(...)`, but the merchant value wins.

### Light mode

| Token | Value | Role |
|---|---|---|
| `--rp-text-color` | `#212B36` | Primary text |
| `--rp-text-secondary` | `#637381` | Supporting text |
| `--rp-background-color` | `#ffffff` | Main surface |
| `--rp-background-subtle` | `#f8f9fa` | Quiet surface |
| `--rp-card-bg` | `rgba(0, 0, 0, 0.04)` | Soft fill |
| `--rp-border-color` | `rgba(0, 0, 0, 0.08)` | Dividers and outlines |

### Dark mode

The canonical stylesheet overrides these values under
`@media (prefers-color-scheme: dark)`. Do not repeat this media query merely
to restate semantic colors; reference the tokens and let them cascade.

| Token | Value | Role |
|---|---|---|
| `--rp-text-color` | `rgba(255, 255, 255, 0.92)` | Primary text |
| `--rp-text-secondary` | `rgba(255, 255, 255, 0.65)` | Supporting text |
| `--rp-background-color` | `#1a1a1a` | Main surface |
| `--rp-background-subtle` | `#242424` | Quiet surface |
| `--rp-card-bg` | `rgba(255, 255, 255, 0.06)` | Soft fill |
| `--rp-border-color` | `rgba(255, 255, 255, 0.12)` | Dividers and outlines |

### State and rarity

| Token | Value | Role |
|---|---|---|
| `--rp-color-success` | `#22c55e` | Completed or positive state |
| `--rp-color-error` | `#ef4444` | Error state |
| `--rp-color-warning` | `#f59e0b` | Warning or expiry state |
| `--rp-rarity-common` | `#6B7280` | Common reward |
| `--rp-rarity-uncommon` | `#22c55e` | Uncommon reward |
| `--rp-rarity-rare` | `#3b82f6` | Rare reward |
| `--rp-rarity-epic` | `#a855f7` | Epic reward |
| `--rp-rarity-legendary` | `#f59e0b` | Legendary reward |

Color never carries status alone: pair it with text, an icon, or a native
state.

## 3. Typography

Always inherit `font-family`. The type scale is in rem so browser and shopper
font-size preferences continue to work.

| Token | Value at a 16px root | Use |
|---|---:|---|
| `--rp-font-xs` | 0.6875rem / 11px | Labels and compact pills |
| `--rp-font-sm` | 0.75rem / 12px | Supporting metadata |
| `--rp-font-md` | 0.875rem / 14px | Body and actions |
| `--rp-font-lg` | 1rem / 16px | Card headlines |
| `--rp-font-xl` | 1.25rem / 20px | Widget section titles |
| `--rp-font-2xl` | 1.5rem / 24px | Exceptional earned moments |

The 11px size is an absolute floor, not a default. Never generate 9px or 10px
text.

Prefer semantic roles to ad-hoc font declarations:

- `.rp-section-title` — heading that opens a widget.
- `.rp-headline` — primary text within a card.
- `.rp-label` — uppercase label above a value.
- `.rp-meta` — muted supporting detail.

## 4. Components

Compose these primitives before adding component-specific classes:

- `.rp-btn` owns the 44px base touch target, shape, type, disabled state, and
  focus ring. Add `.rp-btn--primary`, `.rp-btn--secondary`, or
  `.rp-btn--ghost`; use `.rp-btn--sm` sparingly and `.rp-btn--full` when a
  full-width action is needed.
- `.rp-btn-link` is the low-emphasis action used beside or beneath a primary
  action.
- `.rp-card` is the shared bordered, large-radius resting container.
- `.rp-pill` is the neutral status chip. Add `.rp-pill--success`,
  `.rp-pill--error`, or `.rp-pill--warning` only when the state warrants it.
- `.rp-empty-state` composes
  `.rp-empty-state__icon`, `.rp-empty-state__title`,
  `.rp-empty-state__message`, and `.rp-empty-state__actions`.
- `.rp-skel` and its size/shape modifiers provide loading placeholders.
- `.rp-sr-only` provides assistive text and live-region announcements.

Every HTML `<button>` must include `.rp-btn`. Use native buttons and links
instead of clickable generic containers.

## 5. Layout & Spacing

Spacing follows a 4px harmonic:

| Token | Value | Typical use |
|---|---:|---|
| `--rp-space-xs` | 4px | Icon or inline gap |
| `--rp-space-sm` | 8px | Compact control gap |
| `--rp-space-md` | 12px | Card content rhythm |
| `--rp-space-lg` | 16px | Card padding |
| `--rp-space-xl` | 24px | Section separation |
| `--rp-space-2xl` | 32px | Major empty-state or section space |

Use `--rp-space-*` for padding, margin, and gap instead of raw pixel values.
Let content wrap rather than truncating shopper-facing copy. The shared widget
roots provide box sizing, inherited font, line height, and semantic text
color; generated markup must live within the appropriate existing root.

Use only the canonical radius scale:

| Token | Value | Shape |
|---|---:|---|
| `--rp-radius-sm` | 4px | Small detail |
| `--rp-radius-md` | 8px | Controls |
| `--rp-radius-lg` | 12px | Cards and panels |
| `--rp-radius-full` | 999px | Pills and circular treatment |

## 6. Shadows & Elevation

Elevation marks layering or a temporary earned moment:

| Token | Value | Use |
|---|---|---|
| `--rp-shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Resting card |
| `--rp-shadow-md` | `0 4px 6px rgba(0, 0, 0, 0.10)` | Raised interaction |
| `--rp-shadow-lg` | `0 4px 12px rgba(0, 0, 0, 0.15)` | Overlay or reveal |
| `--rp-shadow-xl` | `0 8px 24px rgba(0, 0, 0, 0.20)` | Modal or peak celebration |

Do not invent shadows. Prefer a semantic background or border before moving a
resting surface higher.

## 7. Responsive Breakpoints & Touch Targets

The shared foundation deliberately defines no numeric breakpoint tokens.
Follow the host theme's established breakpoints when available; otherwise use
mobile-first, content-driven wrapping rather than inventing a global device
taxonomy.

- Start with a single-column layout.
- Add columns only when each card remains readable and actions retain their
  labels.
- Interactive controls have a minimum 44px touch target. The base `.rp-btn`
  provides this; do not shrink primary actions below it.
- Keep focus order aligned with reading order.
- Use `var(--rp-100dvh)` for viewport-bound modals and overlays. It starts
  with a `100vh` fallback and upgrades to dynamic `100dvh` where supported.
- Account for safe-area insets when pinning controls to a viewport edge.

## 8. Design Guardrails

### Token discipline

- No raw hex colors outside a fallback inside `var(...)`.
- Padding, margin, and gap use `--rp-space-*`.
- Border radii use `--rp-radius-*`.
- Motion uses `--rp-duration-fast`, `--rp-duration-normal`,
  `--rp-duration-slow`, and `--rp-easing`.
- Every `var(--rp-*)` reference must resolve in `rp-shared.css`, except the
  merchant-inherited `--rp-primary-color`.

### Accessibility

- Preserve the visible `:focus-visible` treatment.
- Keep text at or above 11px / 0.6875rem.
- Keep action targets at or above 44px.
- Provide accessible names, native semantics, and non-color state cues.
- Any animation or transition must honor
  `prefers-reduced-motion: reduce`.

### Voice and motion

- Do not expose “failed to,” “configuration error,” “request timed out,” raw
  null values, or developer terminology to shoppers.
- Do not use false urgency such as “ACT NOW,” “LAST CHANCE,” or repeated
  exclamation marks.
- Never use `transition: all`; name the properties that communicate change.
- Resting surfaces do not loop decorative motion. Celebration is finite and
  returns to rest.

## 9. Agent Prompt Guide

When generating a RewardsPro widget:

1. Identify the shopper state: resting/ambient, loading, empty, error, earned,
   or redeeming.
2. State the required content, actions, and native semantics.
3. Name the shared primitives that should compose the result.
4. Require token-only styling and inherited typography.
5. Require light/dark compatibility, 44px targets, visible focus, and a
   reduced-motion path when motion exists.
6. Ask for HTML and CSS, or a Liquid snippet plus CSS. Do not restate this
   handoff in the output.

Suggested prompt frame:

> Generate [surface] for [shopper state]. Include [content and actions].
> Compose with [shared primitives]. Use only RewardsPro tokens, inherit the
> merchant theme, and return semantic HTML plus CSS. Meet the 44px touch
> target, visible-focus, dark-mode, and reduced-motion requirements. Keep the
> voice [quiet / reassuring / celebratory] and return to rest after any earned
> moment.

Use `test-prompts.md` for the four canonical exercises and scoring rubric.

## File manifest

| File | Authority |
|---|---|
| `../assets/rp-shared.css` | Canonical tokens, primitives, focus, dark mode, and reduced-motion floor |
| `../assets/rp-utils.js` | Canonical browser-side utilities and sanitization |
| `../DESIGN.md` | Human-readable philosophy and governance |
| `design-system.md` | This derived Claude Design handoff |
| `test-prompts.md` | Canonical generation exercises and review rubric |
| `README.md` | Bundle usage instructions |

When a rule or value conflicts, `rp-shared.css` wins. Update this handoff to
match the CSS rather than teaching prompts to compensate for stale guidance.
