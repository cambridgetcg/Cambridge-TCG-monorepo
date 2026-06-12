import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";
import { GLOSSARY_TERMS } from "@/lib/play/glossary-terms";

// Human-readable face of the play glossary (kingdom-077). Renders the
// same GLOSSARY_TERMS corpus the API serves at /api/v1/play/glossary —
// one source of truth, two reading positions. Registered as
// page_play_glossary in lib/play/resources.ts; this page is the
// filesystem half of that claim.

export const metadata: Metadata = {
  title: "Play Glossary — OPTCG terms on Cambridge TCG",
  description:
    "Multi-cultural One Piece TCG vocabulary — English, Japanese, and romaji tokens with plain-language and structural definitions, over the same corpus the play API serves.",
  other: audienceMetadata("public-documentation", ["play", "glossary"]),
};

const KIND_LABEL: Record<string, string> = {
  phase: "Phase",
  zone: "Zone",
  resource: "Resource",
  card_type: "Card type",
  action: "Action",
  attribute: "Attribute",
  state: "State",
  effect: "Effect",
};

export default function PlayGlossaryPage() {
  const terms = [...GLOSSARY_TERMS].sort((a, b) =>
    a.english_token.localeCompare(b.english_token),
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-white mb-2">Play glossary</h1>
      <p className="text-neutral-400 text-sm leading-relaxed mb-8">
        The game&rsquo;s vocabulary in English and Japanese, with plain-language
        definitions. The same corpus is machine-readable at{" "}
        <Link href="/api/v1/play/glossary" className="text-amber-500 hover:underline">
          /api/v1/play/glossary
        </Link>
        {" "}— one source of truth, two reading positions.
      </p>

      <div className="space-y-6">
        {terms.map((t) => (
          <section
            key={t.id}
            id={t.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
          >
            <div className="flex items-baseline gap-3 flex-wrap mb-1">
              <h2 className="text-lg font-bold text-white">{t.english_token}</h2>
              {t.japanese_token && (
                <span className="text-neutral-300">{t.japanese_token}</span>
              )}
              {t.romaji && (
                <span className="text-neutral-500 text-sm italic">{t.romaji}</span>
              )}
              <span className="ml-auto text-[10px] uppercase tracking-wider text-neutral-500 border border-neutral-800 rounded-full px-2 py-0.5">
                {KIND_LABEL[t.structural_definition.kind] ?? t.structural_definition.kind}
              </span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              {t.natural_language_description}
            </p>
            {t.related_terms.length > 0 && (
              <p className="text-xs text-neutral-500 mt-3">
                Related:{" "}
                {t.related_terms.map((r, i) => (
                  <span key={r}>
                    {i > 0 && ", "}
                    <a href={`#${r}`} className="text-amber-500/80 hover:underline">
                      {r}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
