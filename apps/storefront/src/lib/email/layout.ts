// Shared HTML layout + escape helper for transactional emails.
//
// Design anchors (matches existing auth + tradein templates):
//   - dark background (#0a0a0a), card on #171717
//   - amber CTA (#f59e0b), emerald accent (#34d399)
//   - sans-serif system stack
//   - 480px content column (looks right on mobile + desktop)
//
// Rendering is pure — no SES, no DB. Easy to unit-test or preview locally.

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
            style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">
           ${escapeHtml(args.cta.label)}
         </a>
       </p>`
    : "";

  const footer = args.footer
    ? `<p style="color:#525252;font-size:12px;margin:32px 0 0;line-height:1.6;">${args.footer}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#ededed;">
  ${preheader}
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <p style="margin:0 0 8px;">
      <span style="color:#fff;font-size:16px;font-weight:700;">Cambridge</span>
      <span style="color:#34d399;font-size:16px;font-weight:700;"> TCG</span>
    </p>
    <h1 style="color:#fff;font-size:22px;margin:16px 0 16px;line-height:1.3;">${escapeHtml(args.heading)}</h1>
    <div style="color:#a3a3a3;font-size:14px;line-height:1.6;">
      ${args.bodyHtml}
    </div>
    ${cta}
    ${footer}
  </div>
</body>
</html>`;
}
