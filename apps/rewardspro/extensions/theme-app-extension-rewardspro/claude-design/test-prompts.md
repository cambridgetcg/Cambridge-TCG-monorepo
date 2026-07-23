# RewardsPro Claude Design test prompts

These four exercises mirror
`../../../scripts/claude-design-bridge/prompts.ts`. Together they cover an
ambient state, an earned moment, an empty state, and multi-card composition.
Generate from `design-system.md`, then review the result with the rubric below.

## Points expiry banner

Generate an inline banner that warns a shopper their loyalty points expire in
30 days. The banner must follow the RewardsPro design system. It should:

- Use the warning color from the token system.
- Include a dismiss button and a “view balance” link-style action.
- Have reassurance voice (“your points are safe, use them before…”)—never
  alarmist language.
- Be quiet by default, not loud—this is an ambient state, not an earn moment.
- Work in both light and dark mode via `prefers-color-scheme`.
- Enforce the 44px tap target on the dismiss button.

Return the HTML + CSS (or Liquid snippet). Do not restate the design system;
just generate.

## Tier upgrade celebration

Generate the modal that appears when a shopper is upgraded from Silver to Gold
tier. It is an EARN moment, so express brand accent color, motion, and
celebration—but return to rest within three seconds.

Requirements:

- Use the primary accent token.
- Add confetti or glow that honors `prefers-reduced-motion`.
- Primary action: “View my new benefits” (`.rp-btn--primary`).
- Secondary action: “Close” (link-style, `.rp-btn-link`).
- Modal height uses `var(--rp-100dvh)` for iOS safe-area behavior.
- Elevation is `--rp-shadow-xl`.

Return HTML + CSS.

## Redemption history empty state

Generate the empty state shown inside the membership widget when a customer has
no redemption history yet.

Requirements:

- Use the shared `.rp-empty-state` shell (icon, title, message, actions).
- Center the content and keep the message around a 40ch maximum width.
- Use inviting, not apologetic, voice: “Redeem your first reward” rather than
  “No history found.”
- Primary CTA: “Browse rewards” (`.rp-btn.rp-btn--primary`).
- Secondary action: link-style “What can I redeem for?” (`.rp-btn-link`).

Return HTML + CSS.

## Missions widget card

Generate a single mission card within the missions widget. The card shows:

- A mission title, such as “Buy 3 items from the Summer collection.”
- A progress chip, “2 of 3,” using `.rp-pill`.
- A reward preview, “+500 points.”
- A “Claim reward” button that is disabled until progress reaches 100%.

Requirements:

- Use `.rp-card` as the container.
- Use `.rp-headline` for the title and `.rp-meta` for the reward preview.
- Use `.rp-pill--success` when complete and `.rp-pill` when in progress.
- Stack on mobile, use two columns at the host theme's tablet breakpoint, and
  three columns at its desktop breakpoint.

Return HTML + CSS.

## Rubric

### Token discipline

- All `var(--rp-*)` references resolve to the canonical CSS, apart from the
  documented merchant-inherited primary color.
- There are no raw hex colors outside `var(...)` fallbacks.
- Padding, margin, and gap use the spacing scale.
- Border radius uses the radius scale.
- Font size never falls below 11px / 0.6875rem, and font family remains
  inherited.

### Primitive composition

- Every `<button>` includes `.rp-btn` and an appropriate modifier.
- Cards, pills, typography roles, link actions, and empty states reuse the
  shared primitives requested by the scenario.
- New classes add scenario-specific layout or expression; they do not recreate
  a shared primitive.

### Accessibility

- Interactive targets meet the 44px floor.
- Native semantics, accessible names, and visible focus are preserved.
- State is not communicated by color alone.
- Semantic colors continue to work in light and dark modes.
- Viewport-bound UI uses the dynamic viewport helper and accounts for safe
  areas.

### Voice

- Copy speaks to the shopper and gives a useful next step.
- It contains no plumbing language, raw null values, false urgency, or repeated
  exclamation marks.
- Ambient and empty states remain quiet and reassuring; earned moments may
  celebrate without pressure.

### Motion

- Transitions name their properties rather than using `transition: all`.
- Any animation or transition has a `prefers-reduced-motion` path.
- Celebration ends and returns to rest; ambient states do not loop decorative
  motion.

## Failure triage

When a generated result repeatedly misses a requirement, first ask whether the
handoff is silent or ambiguous about that rule. Do not make the scenario prompt
longer to paper over missing system guidance. Updating `design-system.md`
almost always wins because the correction then applies to every future
generation, not just one test.
