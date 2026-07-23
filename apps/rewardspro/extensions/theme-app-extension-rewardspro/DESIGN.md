# RewardsPro storefront design principles

This document governs the shopper-facing widgets in the RewardsPro theme app
extension. It records the intent behind the shared foundation; the executable
source of truth is [`assets/rp-shared.css`](./assets/rp-shared.css). If this
document and that stylesheet disagree, the CSS is authoritative and this
document must be corrected.

## Quiet by default

RewardsPro lives inside a merchant's storefront. Most of the time it should
feel like part of that storefront, not an advertisement laid over it. Resting,
loading, informational, and warning states use the theme's type, semantic
surfaces, and restrained elevation.

Celebration is earned. A tier upgrade, reward claim, or mystery-box reveal may
use the merchant accent, stronger elevation, and purposeful motion, but the
experience returns to rest within three seconds. Ambient states such as expiry
reminders do not borrow the visual volume of an earn moment.

## Shopper-first voice

Write for the person using their points, not for the system processing them.
Name what happened, what remains safe, and what the shopper can do next.

- Prefer “Your points are safe — try again in a moment” to “Failed to load.”
- Prefer “Redeem your first reward” to “No history found.”
- Keep empty states inviting rather than apologetic.
- Never expose plumbing terms such as “configuration error,” “request timed
  out,” `undefined`, or `null`.
- Do not manufacture urgency with “ACT NOW,” “LAST CHANCE,” repeated
  exclamation marks, or equivalent pressure.

## Theme before brand

The merchant's theme is the host and RewardsPro is the guest.

- Inherit `font-family`; do not import or impose a typeface.
- Start with the semantic surface and text variables in `rp-shared.css`.
- Let `--rp-primary-color` inherit the merchant's configured accent.
- Respect the shopper's light/dark preference through
  `prefers-color-scheme`.
- Keep widget-specific gradients and rarity colors local to the moment that
  gives them meaning.

The extension may contribute structure, hierarchy, and accessible states. It
must not make a page look as though a second storefront has been pasted into
the first.

## One page, one rhythm

Several RewardsPro widgets can appear on one page. They must read as one
system. Compose with the shared `.rp-btn`, `.rp-card`, `.rp-pill`,
`.rp-empty-state`, typography roles, skeletons, and focus treatment before
adding widget-specific classes.

Do not recreate a button, card, status chip, retry shell, or typography
hierarchy in a widget stylesheet. A local class may add layout or meaningful
flavour, but the shared primitive owns the base shape and interaction.

## Rhythm

The shared scales make spacing and hierarchy predictable across widgets:

- `--rp-space-*` follows a 4px base harmonic from 4px through 32px.
- `--rp-font-*` runs from 0.6875rem (11px at the default root size) through
  1.5rem. Typography stays in rem so browser font preferences scale it.
- `--rp-radius-*` provides small, medium, large, and full-radius shapes.

Use spacing tokens for `padding`, `margin`, and `gap`. Use the semantic
typography roles instead of choosing a fresh size and weight:

- `.rp-section-title` opens a widget.
- `.rp-headline` is the primary text within a card.
- `.rp-label` identifies a value or category.
- `.rp-meta` carries supporting detail.

Eleven pixels is the absolute text floor, not a target. Body and action copy
normally use `--rp-font-md` or larger.

## Motion

Motion explains a change; it does not decorate a resting surface.

- Use `--rp-duration-fast`, `--rp-duration-normal`, or
  `--rp-duration-slow` with `--rp-easing`.
- Name the transitioning properties. Never use `transition: all`.
- Keep ordinary feedback brief and make celebration finite.
- Every animation or transition must have a
  `prefers-reduced-motion: reduce` path. The shared stylesheet provides a
  universal floor, and a component with meaningful motion should also define
  its own no-motion state.

## Elevation

Elevation communicates layer and moment, not importance by itself.

- `--rp-shadow-sm` is the resting card surface.
- `--rp-shadow-md` is a raised or interactive surface.
- `--rp-shadow-lg` is a temporary overlay or emphasized reveal.
- `--rp-shadow-xl` is reserved for modals and peak celebration.

Do not invent another shadow in a widget. Use borders or semantic background
contrast before increasing elevation.

## Accessibility floor

- Interactive controls have a minimum 44px touch target. The base `.rp-btn`
  provides it.
- Keyboard focus is visible. The shared root rules and `.rp-btn:focus-visible`
  provide a two-pixel outline with offset.
- Use native controls and meaningful labels; visual state is not the only
  state.
- Use `.rp-sr-only` for announcements that should remain available to
  assistive technology.
- Use `--rp-100dvh` for viewport-bound overlays so supported browsers receive
  dynamic viewport height while older browsers retain the `100vh` fallback.
- Color is semantic and must continue to work under light mode, dark mode, and
  merchant overrides.

## Implementation rule

Load `assets/rp-shared.css` once through `snippets/rp_utils_loader.liquid`.
Place widget-specific structure in its own stylesheet, and reference the
shared tokens with `var(...)`. When a value or primitive is useful to more
than one widget, promote it to the shared foundation rather than copying it.

The derived AI handoff lives at
[`claude-design/design-system.md`](./claude-design/design-system.md), and its
contract prompts live at
[`claude-design/test-prompts.md`](./claude-design/test-prompts.md). Update
those derived documents whenever the canonical foundation or these principles
change.
