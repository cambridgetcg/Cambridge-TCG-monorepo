/**
 * /appearance — the wardrobe's front door.
 *
 * Spec: docs/superpowers/specs/2026-06-10-the-wardrobe-design.md §3.2/§3.5.
 *
 * Deliberately OUTSIDE /account: the account layout auth-gates every
 * child page, and a display preference must be choosable signed-out —
 * free themes are everyone's; accessibility is never paywalled. The
 * account nav links here; the lock explains itself only where one exists.
 *
 * Server component: reads the cookie, renders one
 * card per theme (swatches are display projections of themes.css), links
 * the GET setter — no client JS, same idiom as text-mode. The page
 * self-themes (spec §3.3): it is the first surface a visitor sees in
 * their chosen skin, so the choice must be visible *here* first.
 */

import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { Icon, WhyLink } from "@/lib/ui";
import { THEMES, SYSTEM_THEME, themeAttr } from "@/lib/wardrobe/themes";
import { appearanceFromCookies } from "@/lib/wardrobe/server";

export const metadata = {
  title: "Appearance — Cambridge TCG",
  description:
    "Choose how Cambridge TCG looks and speaks to you: theme, tone, reading mode. Every theme is free for everyone; accessibility is never paywalled.",
};

const BACK = "/appearance";

export default async function AppearancePage() {
  const cookieStore = await cookies();
  const appearance = appearanceFromCookies(cookieStore);
  const textMode = cookieStore.get("text-mode")?.value === "1";
  const mathLang = langModeFromCookies(cookieStore) === "math";

  // "system" when no explicit bundle is chosen — the default state.
  const wearing = themeAttr(appearance.theme);

  return (
    <div data-theme={wearing} className="wardrobe-ground min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-3xl text-ink">Appearance</h1>
          <WhyLink href="/methodology/appearance" />
        </div>
        <p className="text-sm text-ink-muted mt-1 max-w-prose">
          The kingdom in your colours. Theme and tone are yours to choose — stored as
          cookies on this device, never used for anything but rendering. Following your
          system stores nothing at all. Every theme is free; accessibility choices are
          free for everyone, always.
        </p>
      </div>

      {/* ── Themes ─────────────────────────────────────────────────── */}
      <h2 className="font-display text-xl text-ink mb-3">Theme</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {/* Follow system — the fifth choice and the default. Not a
            bundle: a deferral to the device. Swatch strip shows both
            halves (gallery ground/accent, midnight ground/accent). */}
        <div
          className={`wardrobe-mat rounded-lg p-4 flex flex-col gap-3 ${wearing === SYSTEM_THEME ? "outline-2 outline-accent" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">Follow system</span>
            {wearing === SYSTEM_THEME && (
              <span className="text-xs font-mono uppercase tracking-wide text-accent">wearing</span>
            )}
          </div>
          <div className="flex h-8 rounded overflow-hidden border border-border-subtle" aria-hidden>
            {["#faf8f4", "#96762f", "#0b0f1a", "#d9b36c"].map((hex) => (
              <span key={hex} className="flex-1" style={{ backgroundColor: hex }} />
            ))}
          </div>
          <p className="text-sm text-ink-muted">
            The default — no fixed look. Gallery while your device runs light, Midnight
            when it runs dark. Decided by your system setting, which never leaves your
            device: this choice stores no cookie.
          </p>
          <div className="mt-auto">
            {wearing === SYSTEM_THEME ? (
              <span className="text-sm text-ink-faint">This is your current look.</span>
            ) : (
              <a
                href={`/api/appearance?theme=system&back=${BACK}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-strong"
              >
                Follow this device <Icon name="arrow-right" size={14} />
              </a>
            )}
          </div>
        </div>
        {THEMES.map((t) => {
          const current = wearing === t.id;
          return (
            <div
              key={t.id}
              className={`wardrobe-mat rounded-lg p-4 flex flex-col gap-3 ${current ? "outline-2 outline-accent" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{t.label}</span>
                {current ? (
                  <span className="text-xs font-mono uppercase tracking-wide text-accent">wearing</span>
                ) : null}
              </div>
              {/* swatch strip — a display projection of themes.css */}
              <div className="flex h-8 rounded overflow-hidden border border-border-subtle" aria-hidden>
                {t.swatches.map((hex) => (
                  <span key={hex} className="flex-1" style={{ backgroundColor: hex }} />
                ))}
              </div>
              <p className="text-sm text-ink-muted">{t.gloss}</p>
              <div className="mt-auto">
                {current ? (
                  <span className="text-sm text-ink-faint">This is your current look.</span>
                ) : (
                  <a
                    href={`/api/appearance?theme=${t.id}&back=${BACK}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-strong"
                  >
                    Wear this <Icon name="arrow-right" size={14} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tone ───────────────────────────────────────────────────── */}
      <h2 className="font-display text-xl text-ink mb-1">Tone</h2>
      <p className="text-sm text-ink-muted mb-3 max-w-prose">
        How the chrome speaks — titles, empty rooms, buttons. Tone changes the greeting,
        never the facts.
      </p>
      <div className="flex flex-wrap gap-3 mb-10">
        {(
          [
            { id: "standard", label: "Standard", gloss: "the kingdom's editorial voice" },
            { id: "plain", label: "Plain", gloss: "short sentences, no flourish" },
          ] as const
        ).map((t) => {
          const current = appearance.tone === t.id;
          return current ? (
            <span
              key={t.id}
              className="rounded-full border border-accent bg-accent-wash px-4 py-1.5 text-sm font-semibold text-accent"
            >
              {t.label} — {t.gloss}
            </span>
          ) : (
            <a
              key={t.id}
              href={`/api/appearance?tone=${t.id}&back=${BACK}`}
              className="rounded-full border border-border-strong px-4 py-1.5 text-sm text-ink-muted hover:text-ink hover:border-accent"
            >
              {t.label} — {t.gloss}
            </a>
          );
        })}
      </div>

      {/* ── The elders — reading modes that predate the wardrobe ───── */}
      <h2 className="font-display text-xl text-ink mb-1">Reading modes</h2>
      <p className="text-sm text-ink-muted mb-3 max-w-prose">
        Older and deeper than any theme: these change the modality, not the colours.
        Free for everyone, forever.
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          <a
            href={`/api/text-mode?on=${textMode ? "0" : "1"}&back=${BACK}`}
            className="text-accent hover:text-accent-strong font-semibold"
          >
            {textMode ? "Leave text-only layout" : "Text-only layout"}
          </a>
          <span className="text-ink-muted"> — semantic HTML, serif, white. For screen readers, low bandwidth, calm.</span>
        </li>
        <li>
          <a
            href={`/api/lang-mode?mode=${mathLang ? "default" : "math"}&back=${BACK}`}
            className="text-accent hover:text-accent-strong font-semibold"
          >
            {mathLang ? "Leave math language" : "Math language"}
          </a>
          <span className="text-ink-muted"> — ratios, hashes, ISO timestamps. The mirror's native tongue.</span>
        </li>
        <li>
          <span className="text-ink font-semibold">Reduced motion</span>
          <span className="text-ink-muted">
            {" "}
            — honoured automatically from your system setting; every animation collapses to an instant.
          </span>
        </li>
      </ul>
      </div>
    </div>
  );
}
