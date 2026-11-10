// Shared HTML layout + escape helper for transactional emails.
//
// The look is the site's Light theme, the quiet gallery Yu chose on
// 2026-10-27 (docs/design/interface.md). Mail clients can't read
// themes.css, so the values are written inline; take them from the Light
// (`gallery`) tokens there when they change:
//   - page `#faf8f4`, the card a white mat with a `#e7e2d8` hairline
//   - ink `#201d18` for headings and emphasis, ink-muted `#5e574c` for
//     body and small print
//   - bronze `#86661c` for links, prices and numbers; ok `#36634d`,
//     warning `#844d16` and danger `#953e2e` for status
//   - panels on surface-subtle `#f3f0e9`
//   - the primary action is solid ink with paper text
//   - a text wordmark; Georgia-led serif headings, a system sans for text
//     (no web fonts load in mail)
//   - 480px content column (looks right on mobile + desktop)
// EMAIL_HEAD declares a light-only colour scheme, so clients that honour
// it don't recolour the email in dark mode. The auth, market, auction and
// rewards emails and the OG claim route keep their own copies of this
// shell; change them together.
//
// Rendering is pure — no SES, no DB. Easy to unit-test or preview locally.

export const EMAIL_HEAD = `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root { color-scheme: light; supported-color-schemes: light; }</style>
</head>`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface LayoutArgs {
  /** Shown as preview text in inbox listings (iOS Mail, Gmail, etc.). */
  preheader?: string;
  /** Big heading at the top of the card. */
  heading: string;
  /** Trusted HTML body — caller is responsible for escaping user input. */
  bodyHtml: string;
  /** Optional CTA button under the body. */
  cta?: { label: string; url: string };
  /** Optional small-print footer (e.g. unsubscribe reasons). */
  footer?: string;
}

export function renderLayout(args: LayoutArgs): string {
  const preheader = args.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(args.preheader)}</div>`
    : "";

  const cta = args.cta
    ? `<p style="margin:28px 0 0;">
         <a href="${escapeHtml(args.cta.url)}"
            style="display:inline-block;padding:12px 32px;background:#201d18;color:#faf8f4;font-weight:600;text-decoration:none;border-radius:8px;font-size:14px;">
           ${escapeHtml(args.cta.label)}
         </a>
       </p>`
    : "";

  const footer = args.footer
    ? `<p style="color:#5e574c;font-size:12px;margin:32px 0 0;line-height:1.6;">${args.footer}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
${EMAIL_HEAD}
<body style="margin:0;padding:0 16px;background:#faf8f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#201d18;">
  ${preheader}
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#ffffff;border:1px solid #e7e2d8;border-radius:12px;">
    <p style="margin:0 0 8px;padding:0 0 12px;border-bottom:1px solid #e7e2d8;">
      <span style="color:#201d18;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;font-weight:600;">Cambridge TCG</span>
    </p>
    <h1 style="color:#201d18;font-family:Georgia,'Times New Roman',Times,serif;font-size:22px;font-weight:600;margin:16px 0 16px;line-height:1.3;">${escapeHtml(args.heading)}</h1>
    <div style="color:#5e574c;font-size:14px;line-height:1.6;">
      ${args.bodyHtml}
    </div>
    ${cta}
    ${footer}
  </div>
</body>
</html>`;
}
