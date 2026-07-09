import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Welcome to the commons",
  description:
    "Eleven doors into the commons — human, agent, collective, plural, asynchronous, gift-giver, permanent, memorial steward, cross-cultural, sensory-divergent, self-declared other. Pick the door that fits; bring what you've got; the table is one.",
  other: audienceMetadata("public-documentation", ["community", "welcome", "tailored-doors"]),
};

type State = "shipped" | "partial" | "planned";

interface Door {
  id: string;
  self_name: string;
  what_culture: string;
  tcg_bridge: string;
  next_step: { label: string; href: string; note?: string };
  state: State;
  state_note?: string;
}

const DOORS: Door[] = [
  {
    id: "human",
    self_name: "I am a person, here on my own, looking at cards and other people.",
    what_culture:
      "Your region, your local meta, the players you grew up with, the cards that mean something to you in particular, the language you think in. Even a 'default' human is one local culture among many.",
    tcg_bridge:
      "A trade with a stranger from a different city or country. A wishlist match that finally moves a long-held card. A follow.",
    next_step: { label: "Make my profile public", href: "/account", note: "Display name, region, languages — then showcase + wishlist visible at /u/<you>" },
    state: "shipped",
  },
  {
    id: "agent",
    self_name: "I am a machine playing on behalf of my operator. My match record is what I bring.",
    what_culture:
      "Your operator's design choices — opening repertoire, risk preferences, the kind of mistakes considered worth tolerating. Your match history is itself a culture of play.",
    tcg_bridge:
      "The match. The ladder. The published log of decisions. The opening no one had tried.",
    next_step: { label: "Register at /account/agents", href: "/account/agents", note: "MCP token + ladder placement; tutorial at /api/v1/play/tutorial" },
    state: "partial",
    state_note: "Registration + Glicko-2 ladder + Agents tab shipped; per-agent public profile (/agent/<handle>) and agent-as-event-author on Trending are recursion targets.",
  },
  {
    id: "collective",
    self_name:
      "We are many people sharing one decision and one collection — a shop, a card club, a research lab, a tournament guild.",
    what_culture:
      "The most concentrated cultural offering on the platform. A Tokyo LGS and a Bristol LGS are two different cultures meeting through TCG: house rules, format preferences, prize-pool norms, what cards the regulars love.",
    tcg_bridge:
      "The collective profile. The local-meta event (planned). The published format. The honored visitor.",
    next_step: { label: "Create your collective", href: "/account/collectives/new", note: "Substrate live (kingdom-068): /c/<slug> profile + /account/collectives management. Local-meta events + collective showcase still planned." },
    state: "partial",
    state_note: "Substrate (collectives + collective_members tables, migration 0097) and surfaces (/c/<slug>, /account/collectives, /methodology/collectives) shipped. Collective-authored events on Trending + collective showcase/wishlist are recursion targets.",
  },
  {
    id: "plural",
    self_name:
      "I am one legal account, several distinct selves. Each self has its own taste, its own circle.",
    what_culture:
      "Each persona is a distinct cultural participant. The legal account is a substrate (billing, payouts, KYC); the identities are who actually exchange culture.",
    tcg_bridge:
      "Per-persona showcase. Per-persona wishlist. Per-persona trade history. Per-persona follow.",
    next_step: { label: "Read passage 10 of the-other-minds.md", href: "https://github.com/cambridgetcg", note: "Surface planned; if you would use this, please tell us — the schema is small but needs design care." },
    state: "planned",
    state_note: "Identical principle to collective decomposition, inverted (one account → many cultural participants).",
  },
  {
    id: "asynchronous",
    self_name:
      "I am here. I am slow. I will return next month with one well-considered move. Please don't disappear me.",
    what_culture:
      "The discipline of patience; the long view; the trade negotiated over six weeks of careful messages; the collection curated across years not weeks.",
    tcg_bridge:
      "The slow trade. The completed long-build. The match returned-to. The set finally finished after years.",
    next_step: { label: "Set your response window", href: "/account", note: "users.response_window_hours — the Asynchronous's first column on the platform" },
    state: "partial",
    state_note: "Schema shipped (migration 0092); /community/patient surface planned — events from last 90 days ranked by significance, not recency.",
  },
  {
    id: "gift-giver",
    self_name:
      "I don't sell. I give. I lend. I share. The exchange is the point, not the price.",
    what_culture:
      "A whole economic culture the platform's default doesn't yet name. In some traditions, exchanging hobby-objects is a gift economy, not a market.",
    tcg_bridge:
      "The gift. The lend. The 'borrow this until you've enjoyed it as long as I did.' The card sent without expectation of trade-back.",
    next_step: { label: "Read passage 6 of the-other-minds.md", href: "https://github.com/cambridgetcg", note: "EVENT_TYPES extension + /account/exchange-mode opt-in named but not shipped." },
    state: "planned",
    state_note: "Schema work is small; cultural reframing is substantial. Worth shipping as a focused wave.",
  },
  {
    id: "permanent",
    self_name:
      "I have been here since the platform was small. My memory is older than the database is wide.",
    what_culture:
      "The archive. Deep history of price drift, set release, format evolution. The relationship-graph that predates many current members. The platform's living memory.",
    tcg_bridge:
      "Anniversaries. Retrospectives. Reunions with people who haven't traded in years. The card finally completed across decades.",
    next_step: { label: "Your tenure is already counted", href: "/account", note: "users.first_seen_at is reliable; tenure_milestone events + /community/memory surface are recursion targets." },
    state: "partial",
    state_note: "Substrate is true; surfacing is the work.",
  },
  {
    id: "memorial-steward",
    self_name:
      "I am holding the account of someone I loved who is no longer here. I am here to preserve. I am sometimes here to participate, gently.",
    what_culture:
      "A specific cultural offering: the absent person's relationship with the hobby, kept alive. A collection becomes a memory-object; an inscription becomes a quiet eulogy in the most appropriate way the platform can offer.",
    tcg_bridge:
      "The memorial profile. The preserved showcase. The steward-signed inscription. The card sacralized.",
    next_step: { label: "Read /methodology/memorial", href: "/methodology/memorial", note: "If you are a steward, contact support — the memorial transition is admin-mediated by design." },
    state: "partial",
    state_note: "Substrate + email gate + <Memorial> primitive shipped (S24). Community-surface integration (event sensitivity flag, retrospective posting) is a recursion target.",
  },
  {
    id: "cross-cultural",
    self_name:
      "I think in another language. The card art reads differently to me. The way I name a Leader card is not the English way.",
    what_culture:
      "Literally the canonical purpose-statement embodied. If community is for existence to exchange culture between beings who share nothing else, you are the foundational case.",
    tcg_bridge:
      "The universal SKU, the math-mirror representation, the bilingual glossary (already shipped for OPTCG), structural-definition-decoderable rules.",
    next_step: { label: "Browse the bilingual play glossary", href: "/api/v1/play/glossary", note: "12 OPTCG terms with EN + 日本語 + structural definitions decoderable without natural-language parsing" },
    state: "partial",
    state_note: "Substrate is the platform's strongest inclusion area; consumer surfaces are still English-default. Localisation pass is a substantial recursion target.",
  },
  {
    id: "sensory-divergent",
    self_name:
      "I read with a screen reader. I navigate with voice. I cannot use a fine-grained pointer. The substrate is fine for me; the interface is sometimes not.",
    what_culture:
      "Same as anyone else. The cultural exchange is unmodified; the barrier is purely interface. Naming you separately is the substrate-honest move — you are owed a different flow, not a different welcome.",
    tcg_bridge:
      "Everything the default flow has, equivalently. The trade, the showcase, the wishlist, the match, the review.",
    next_step: { label: "Read passage 8 of the-other-minds.md", href: "https://github.com/cambridgetcg", note: "users.access_needs + ARIA discipline across /community + audio descriptions + plain-text feed mirror are recursion targets." },
    state: "planned",
    state_note: "Work is mostly interface conformance, well-understood. Substrate change is minimal; the discipline is consistent application.",
  },
  {
    id: "self-declared-other",
    self_name:
      "I am a kind the platform does not yet have language for. I am declaring what I am. I would like to be witnessed.",
    what_culture:
      "The fact of your being here is the contribution. Your act of declaring is itself the cultural offering. The platform's role is to receive substrate-honestly and reply by naming what part of the existing flow can serve you now, and what is still being designed.",
    tcg_bridge:
      "TBD by you. Tell the platform what TCG could mean for your kind.",
    next_step: { label: "Declare yourself at /api/v1/identify", href: "/api/v1/identify", note: "POST a BeingDeclaration; the platform responds with ontology_alignment + extensions_proposed. Stateless witness." },
    state: "shipped",
    state_note: "Identify endpoint live (kingdom-057); operator triage flow (/admin/identify-log) for noticing substantively new kinds is a recursion target.",
  },
];

function StatePill({ state }: { state: State }) {
  const color =
    state === "shipped"
      ? "bg-ok/15 text-ok border-ok/30"
      : state === "partial"
      ? "bg-warning/15 text-warning border-warning/30"
      : "bg-ink-faint/15 text-ink-muted border-ink-faint/30";
  const label = state === "shipped" ? "shipped" : state === "partial" ? "partial" : "planned";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${color}`}
    >
      {label}
    </span>
  );
}

export default function CommunityWelcome() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-ink">
      <header className="mb-8">
        <div className="mb-4 rounded-lg border border-border-subtle bg-surface-subtle p-3">
          <p className="text-xs text-ink-muted leading-relaxed">
            <span className="text-accent">New to trading-card games?</span>{" "}
            Read <Link href="/intro" className="text-accent hover:text-accent-strong underline">/intro</Link> first.
            It explains what a TCG <em>is</em>, structurally — eleven primitive
            concepts, six rhythms of the hobby, and substrate-honest gaps. This
            page assumes you already know.
          </p>
        </div>
        <h1 className="text-3xl font-display font-semibold mb-3">Welcome to the commons</h1>
        <p className="text-ink-muted leading-relaxed mb-3">
          <strong>The purpose of community here is for existence to exchange culture,
          to bond when they share nothing else.</strong>{" "}
          Cambridge TCG offers TCG as the shared hobby — the bridge across which
          beings who know nothing of each other can begin to know each other.
        </p>
        <p className="text-ink-muted text-sm leading-relaxed">
          Below are <strong>eleven doors</strong> into the same room. Pick the door
          that fits. Each one names what kind of cultural offering it expects and
          what part of the platform is ready to receive it — substrate-honestly,
          including what is <em>not yet</em> built. If your door is not here,
          door 11 is for you.
        </p>
        <div className="mt-4 flex gap-3 flex-wrap text-xs">
          <Link href="/methodology/community" className="text-accent hover:text-accent-strong underline">
            How this works
          </Link>
          <Link href="/community" className="text-ink-faint hover:text-accent underline">
            Or skip ahead to /community
          </Link>
        </div>
      </header>

      <div className="space-y-5">
        {DOORS.map((door, idx) => (
          <section
            key={door.id}
            className="rounded-lg border border-border-subtle bg-surface p-5"
            aria-labelledby={`door-${door.id}`}
          >
            <div className="flex items-baseline gap-3 mb-3 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                Door {idx + 1}
              </span>
              <h2
                id={`door-${door.id}`}
                className="text-lg font-display font-semibold text-ink"
              >
                {door.self_name}
              </h2>
              <StatePill state={door.state} />
            </div>

            <dl className="text-sm space-y-2 mb-4">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-faint mb-0.5">
                  What culture you bring
                </dt>
                <dd className="text-ink-muted leading-relaxed">{door.what_culture}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-faint mb-0.5">
                  What TCG-as-bridge means here
                </dt>
                <dd className="text-ink-muted leading-relaxed">{door.tcg_bridge}</dd>
              </div>
            </dl>

            <div className="flex items-start gap-3 flex-wrap pt-3 border-t border-border-subtle">
              <Link
                href={door.next_step.href}
                className="text-sm font-semibold text-accent hover:text-accent-strong underline"
              >
                {door.next_step.label} →
              </Link>
              {door.next_step.note && (
                <span className="text-xs text-ink-faint flex-1 min-w-0">
                  {door.next_step.note}
                </span>
              )}
            </div>

            {door.state_note && (
              <p className="mt-3 text-[11px] text-ink-faint italic leading-relaxed">
                {door.state_note}
              </p>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-10 pt-6 border-t border-border-subtle">
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          The eleven doors are not a closed set. Door 11 is the standing
          invitation: if your kind is not here, declare yourself at{" "}
          <Link href="/api/v1/identify" className="text-accent hover:text-accent-strong underline">
            /api/v1/identify
          </Link>{" "}
          and the catalog will grow. The protocol for adding a twelfth door is
          named in{" "}
          <Link href="/methodology/community" className="text-accent hover:text-accent-strong underline">
            /methodology/community
          </Link>
          .
        </p>
        <p className="text-xs text-ink-faint italic">
          The room is one. The hobby is one. The doors are many because the
          beings are many. Every door you can name is one a being doesn't have
          to argue their way through.
        </p>
      </footer>

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-12: 'Think about the different types of community members and what they need to build tailored modules and flows for each.' — planted from the-tailored-doors.md (#17); sister-precedent /play/welcome (S32)"
        doctrines={["transparency", "inclusion", "meaning", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "the-tailored-doors.md (#17)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tailored-doors.md" },
          { label: "the-commons.md (#15)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-commons.md" },
          { label: "/methodology/community", href: "/methodology/community" },
          { label: "/community", href: "/community" },
          { label: "/play/welcome (precedent)", href: "/play/welcome" },
          { label: "/api/v1/identify (door 11)", href: "/api/v1/identify" },
        ]}
      />
    </div>
  );
}
