import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";
import { Section } from "@/lib/ui/Section";
import { WhyLink } from "@/lib/ui/WhyLink";
import { THEMES, SYSTEM_THEME, themeAttr, getTheme } from "@/lib/wardrobe/themes";
import { appearanceFromCookies } from "@/lib/wardrobe/server";

export const metadata = {
  title: "Appearance — Cambridge TCG",
  description: "Choose light, dark, high contrast and reading preferences. No account required.",
};

const BACK = "/appearance";
const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4";

export default async function AppearancePage() {
  const cookieStore = await cookies();
  const appearance = appearanceFromCookies(cookieStore);
  const textMode = cookieStore.get("text-mode")?.value === "1";
  const mathLang = langModeFromCookies(cookieStore) === "math";
  const selected = themeAttr(appearance.theme);
  const light = getTheme("gallery");
  const dark = getTheme("midnight");
  const options = [
    {
      id: SYSTEM_THEME,
      label: "Follow system",
      gloss: "Use your device’s light or dark setting. This removes the theme cookie.",
      swatches: [light.swatches[0], light.swatches[3], dark.swatches[0], dark.swatches[3]],
    },
    ...THEMES,
  ];

  return (
    <PageLayout className="space-y-8">
      <PageHeader title="Appearance" size="large"
        description="Choose the display that works for you. Preferences are saved on this device. No account or payment required."
        action={<WhyLink href="/methodology/appearance" label="About these settings" />}
      />
      <Section title="Color theme" id="appearance-theme">
        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((option) => (
            <div key={option.id} className={`flex flex-col gap-3 rounded-lg border bg-surface p-5 ${selected === option.id ? "border-accent" : "border-border-subtle"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-ink">{option.label}</h3>
                {selected === option.id && <span className="text-sm font-medium text-accent">Selected</span>}
              </div>
              <div className="flex h-7 overflow-hidden rounded border border-border-subtle" aria-hidden="true">
                {option.swatches.map((hex, i) => <span key={i} className="flex-1" style={{ backgroundColor: hex }} />)}
              </div>
              <p className="text-sm leading-6 text-ink-muted">{option.gloss}</p>
              <div className="mt-auto">
                {selected === option.id ? <span className="inline-flex min-h-11 items-center text-sm text-ink-muted">Current theme</span> :
                  <a href={`/api/appearance?theme=${option.id}&back=${BACK}`} className={linkClass}>Use {option.label.toLowerCase()}</a>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Reading preferences" id="appearance-reading">
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface px-5">
          <li className="py-4">
            <a href={`/api/text-mode?on=${textMode ? "0" : "1"}&back=${BACK}`} className={linkClass}>{textMode ? "Turn off text-only layout" : "Turn on text-only layout"}</a>
            <p className="text-sm leading-6 text-ink-muted">A simple reading layout with fewer visual styles. Current setting: {textMode ? "on" : "off"}.</p>
          </li>
          <li className="py-4">
            <a href={`/api/lang-mode?mode=${mathLang ? "default" : "math"}&back=${BACK}`} className={linkClass}>{mathLang ? "Turn off math notation" : "Turn on math notation"}</a>
            <p className="text-sm leading-6 text-ink-muted">Show supported values as ratios, identifiers and timestamps. Current setting: {mathLang ? "on" : "off"}.</p>
          </li>
          <li className="py-5">
            <h3 className="text-sm font-semibold text-ink">Reduced motion</h3>
            <p className="mt-1 text-sm leading-6 text-ink-muted">Follows your device’s reduced-motion preference.</p>
          </li>
        </ul>
      </Section>

      <Section title="Wording" description="Some pages support a shorter wording option. Facts and permissions stay the same.">
        <div className="flex flex-wrap gap-3">
          {[{ id: "standard", label: "Standard wording" }, { id: "plain", label: "Plain wording" }].map((tone) =>
            appearance.tone === tone.id ?
              <span key={tone.id} className="rounded-lg border border-accent bg-accent-wash px-4 py-3 text-sm font-medium text-accent">{tone.label} · Selected</span> :
              <a key={tone.id} href={`/api/appearance?tone=${tone.id}&back=${BACK}`} className="rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm text-ink hover:border-accent">{tone.label}</a>,
          )}
        </div>
      </Section>
    </PageLayout>
  );
}
