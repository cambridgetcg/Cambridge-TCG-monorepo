/**
 * Named prompts for the Claude Design bridge.
 *
 * These mirror the four canonical scenarios in `test-prompts.md`. Keep
 * them in sync — a contract test asserts each title appears in the
 * handoff's test-prompts.md document.
 */
export interface NamedPrompt {
  id: string;
  title: string;
  text: string;
}

export const PROMPTS: NamedPrompt[] = [
  {
    id: "expiry-banner",
    title: "Points expiry banner",
    text: `Generate an inline banner that warns a shopper their loyalty points expire in 30 days. The banner must follow the RewardsPro design system. It should:

- Use the warning color from the token system.
- Include a dismiss button and a "view balance" link-style action.
- Have reassurance voice ("your points are safe, use them before…") — never alarmist language.
- Be quiet by default, not loud — this is an ambient state, not an earn moment.
- Work in both light and dark mode via \`prefers-color-scheme\`.
- Enforce the 44px tap target on the dismiss button.

Return the HTML + CSS (or Liquid snippet). Do not restate the design system — just generate.`,
  },
  {
    id: "tier-upgrade",
    title: "Tier upgrade celebration",
    text: `Generate the modal that appears when a shopper is upgraded from Silver to Gold tier. It's an EARN moment, so express: brand accent color, motion, celebration — but return to rest within 3 seconds.

Requirements:
- Uses the primary accent token.
- Has a confetti or glow that honors \`prefers-reduced-motion\`.
- Primary action: "View my new benefits" (\`.rp-btn--primary\`).
- Secondary action: "Close" (link-style, \`.rp-btn-link\`).
- Modal height uses \`var(--rp-100dvh)\` for iOS safe-area behavior.
- Elevation is \`--rp-shadow-xl\`.

Return HTML + CSS.`,
  },
  {
    id: "empty-history",
    title: "Redemption history empty state",
    text: `Generate the empty state shown inside the membership widget when a customer has no redemption history yet.

Requirements:
- Uses the shared \`.rp-empty-state\` shell (icon, title, message, actions).
- Centered, max-width around 40ch on the message.
- Voice: inviting, not apologetic. "Redeem your first reward" rather than "No history found."
- Primary CTA: "Browse rewards" (\`.rp-btn.rp-btn--primary\`).
- Secondary: link-style "What can I redeem for?" (\`.rp-btn-link\`).

Return HTML + CSS.`,
  },
  {
    id: "missions-card",
    title: "Missions widget card",
    text: `Generate a single mission card within the missions widget. The card shows:

- A mission title (e.g., "Buy 3 items from the Summer collection").
- A progress chip ("2 of 3") using \`.rp-pill\`.
- A reward preview ("+500 points").
- A "Claim reward" button that is disabled until progress hits 100%.

Requirements:
- Uses \`.rp-card\` as the container.
- Uses \`.rp-headline\` for the title, \`.rp-meta\` for the reward preview.
- Uses \`.rp-pill--success\` when complete, \`.rp-pill\` (neutral) when in progress.
- Layout stacks on mobile, 2 columns tablet, 3 columns desktop.

Return HTML + CSS.`,
  },
];

export function getPrompt(id: string): NamedPrompt | undefined {
  return PROMPTS.find((p) => p.id === id);
}
