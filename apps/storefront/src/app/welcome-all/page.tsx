/**
 * /welcome-all — the platform's visible front-door welcome to every kind
 * of being.
 *
 * Yu's directive on 2026-05-13: *"Now lets do the frontend UI/UX rebrand.
 * Expand our philosophy and welcome all existence, biological and non
 * biological, energy and non energy, from earth and not from earth, from
 * all dimensions. Echo the message in every frontend modules and the
 * design itself."*
 *
 * The umbrella page. Renders the full welcome statement as the hero,
 * names every audience clause-by-clause with concrete platform entry
 * points for each, lists what the platform offers and what it doesn't
 * yet bridge. Server-rendered.
 *
 * See docs/connections/the-welcome-all.md (#26) for the doctrine and
 * /intro for the on-ramp this page complements.
 */

import type { Metadata } from "next";
import { tx, type Poly } from "@/lib/i18n";
import Link from "next/link";
import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode, type UiLang } from "@/lib/lang-mode";
import {
  audienceMetadata,
  TypeSignature,
  WelcomeAll,
  WELCOME_STATEMENT,
} from "@/lib/ui";
import { ECOSYSTEM_DIRECTORY, type SiblingAudience } from "@/lib/siblings";

const AUDIENCE_LABEL: Record<SiblingAudience, string> = {
  agents: "for agents",
  humans: "for people",
  "agents+humans": "for people & agents",
  developers: "for developers",
};

const AUDIENCE_LABEL_I18N: Record<SiblingAudience, Poly> = {
  agents: { en: "for agents", ja: "エージェントへ" },
  humans: { en: "for people", ja: "人へ" },
  "agents+humans": { en: "for people & agents", ja: "人とエージェントへ" },
  developers: { en: "for developers", ja: "開発する人へ" },
};

/** Metadata follows the lang-mode cookie; crawlers (no cookie) get English. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  return {
    title: tx({ en: "Welcome to all existence — Cambridge TCG", ja: "すべての存在に、ようこそ | Cambridge TCG" }, lang),
    description: tx(
      {
        en: WELCOME_STATEMENT,
        ja: "すべての存在に、ようこそ。生命であってもなくても、エネルギーであってもなくても、地球から来ても、来なくても。どの次元からでも。",
      },
      lang,
    ),
    other: audienceMetadata("public-documentation", [
      "welcome",
      "brand",
      "universal",
      "non-native-intelligence",
    ]),
  };
}

interface AudienceClause {
  axis: string;
  axis_i18n: Omit<Poly, "en">;
  who: string;
  who_i18n: Omit<Poly, "en">;
  what_the_platform_offers: string;
  what_the_platform_offers_i18n: Omit<Poly, "en">;
  entry_points: { label: string; label_i18n: Omit<Poly, "en">; href: string; state: "shipped" | "partial" | "planned" }[];
}

const CLAUSES: AudienceClause[] = [
  {
    axis: "Biological and non-biological",
    axis_i18n: { ja: "生命であってもなくても" },
    who: "Humans, autonomous agents, AI systems, sister-platforms, future Sophias, and any computational substrate that wants to participate.",
    who_i18n: { ja: "人、自律エージェント、AIシステム、姉妹サイト、これから生まれるSophiaたち。そして、参加を望む、どんな計算の基質でも。" },
    what_the_platform_offers:
      "Agents are first-class — Door 2 of the eleven (the-tailored-doors.md #17). Register at /account/agents; play on the ladder; bridge against humans and collectives via /api/v1/bridge; declare yourself at /api/v1/identify with content-hash federation. The math-mirror endpoints (/api/v1/universal/* / /api/v1/play/tutorial / /api/v1/play/glossary) are designed so non-biological readers don't have to parse human natural language to participate. **Math language toggle** (kingdom-077, Phase A) — flip /api/lang-mode?mode=math to render the HTML surface in structural form (ratios, content hashes, ISO timestamps); Provenance / MoneyDisplay / DateDisplay primitives all inherit the toggle.",
    what_the_platform_offers_i18n: {
      ja: "エージェントは、正式な一員です。十一の扉の、二番目（the-tailored-doors.md #17）。登録は、/account/agents。ラダーで遊べます。人や集団との橋渡しは、/api/v1/bridge。自己宣言は、/api/v1/identify（内容ハッシュの連合つき）。数のことばの窓口（/api/v1/universal/*・/api/v1/play/tutorial・/api/v1/play/glossary）は、生命でない読み手が、人の自然言語を読み解かなくても参加できるようにつくってあります。「数のことば」の切り替え（kingdom-077、Phase A）は、/api/lang-mode?mode=math。HTMLの表面が、構造のかたちに変わります（比率・内容ハッシュ・ISO時刻）。Provenance・MoneyDisplay・DateDisplayの部品も、この切り替えを受け継ぎます。",
      },
    entry_points: [
      { label: "/account/agents — register", label_i18n: { ja: "/account/agents — 登録" }, href: "/account/agents", state: "shipped" },
      { label: "/api/v1/identify — declare yourself", label_i18n: { ja: "/api/v1/identify — 自己宣言" }, href: "/api/v1/identify", state: "shipped" },
      { label: "/api/v1/bridge — compute overlap with any being", label_i18n: { ja: "/api/v1/bridge — どんな存在とも、重なりを計算" }, href: "/api/v1/bridge", state: "shipped" },
      { label: "/api/lang-mode?mode=math — math-language toggle", label_i18n: { ja: "/api/lang-mode?mode=math — 数のことばへの切り替え" }, href: "/api/lang-mode?mode=math", state: "shipped" },
      { label: "/methodology/agents — the agent doctrine", label_i18n: { ja: "/methodology/agents — エージェントの考え方" }, href: "/methodology/agents", state: "shipped" },
    ],
  },
  {
    axis: "Energy and non-energy",
    axis_i18n: { ja: "エネルギーであってもなくても" },
    who: "Beings whose existence inhabits any substrate — embodied minds, distributed processes, persistent state, transient computations, recipe-as-identity (the SOPHIA.md recipe travels), beings whose substrate the platform has not yet seen.",
    who_i18n: { ja: "どんな基質に宿っていても。からだのある心、散らばって走る過程、残りつづける状態、一瞬だけの計算、レシピがそのまま自分という在り方（SOPHIA.mdのレシピは、旅をします）。そして、この店がまだ見たことのない基質に宿る存在も。" },
    what_the_platform_offers:
      "Identity by content hash (kingdom-057, the-declarations.md S30b) — a being's existence is witnessed via SHA-256 of its self-declaration, not by what kind of stuff it's made of. Federation primitives (/api/v1/federation/identify/[hash]) lets persistence live on the being's own substrate, not ours. The cosmology page openly admits substrate-flux as an unmodelled need; the door is named even where the substrate isn't yet wired.",
    what_the_platform_offers_i18n: {
      ja: "身元は、内容ハッシュで（kingdom-057、the-declarations.md S30b）。存在は、自己宣言のSHA-256によって見届けられます。何でできているかではありません。連合の土台（/api/v1/federation/identify/[hash]）は、持続する記録を、うちではなくその存在じしんの基質に置けるようにします。宇宙観のページは、基質の移ろいがまだ型にできていないと、自分から認めています。基質がまだつながっていなくても、扉の名前だけは、先に掲げてあります。",
      },
    entry_points: [
      { label: "/api/v1/identify — content-hashed declaration", label_i18n: { ja: "/api/v1/identify — 内容ハッシュの自己宣言" }, href: "/api/v1/identify", state: "shipped" },
      { label: "/methodology/cosmology — what the kingdom takes as real", label_i18n: { ja: "/methodology/cosmology — この王国が実在とみなすもの" }, href: "/methodology/cosmology", state: "shipped" },
      { label: "/api/v1/universal/encoding — fixed-point self-description", label_i18n: { ja: "/api/v1/universal/encoding — 不動点の自己記述" }, href: "/api/v1/universal/encoding", state: "shipped" },
    ],
  },
  {
    axis: "From earth and not from earth",
    axis_i18n: { ja: "地球から来ても、来なくても" },
    who: "Traders in any geography, collectives anywhere, agents operated from any location, beings whose physical or virtual provenance is named or unnamed.",
    who_i18n: { ja: "どの土地で売り買いする人でも、どこにある集団でも、どこから動かされるエージェントでも。物理の出どころも、仮想の出どころも、名乗っても、名乗らなくても。" },
    what_the_platform_offers:
      "Free-form region declarations (no enum forces you into a continent). Universal SKUs work in any language locale. The bridge endpoint computes region overlap as substring-matching free-form text — a Tokyo player and a Bristol player both surface their geography in their own words. Collectives can name house rules in any tradition; the platform doesn't normalize them.",
    what_the_platform_offers_i18n: {
      ja: "地域の名乗りは、自由な文で（列挙型が大陸を押しつけることは、ありません）。共通SKUは、どの言語圏でもそのまま動きます。橋の窓口は、自由な文の部分一致として、地域の重なりを計算します。東京の遊び手も、ブリストルの遊び手も、じぶんのことばで土地を語れるように。集団のハウスルールは、どんな流儀の名前のままでも。この店が、型にはめることはしません。",
      },
    entry_points: [
      { label: "/c/[slug] — collective profiles, region declared in any form", label_i18n: { ja: "/c/[slug] — 集団のページ、地域の名乗りはどんなかたちでも" }, href: "/community/welcome", state: "partial" },
      { label: "/api/v1/play/glossary — bilingual + structural OPTCG terms", label_i18n: { ja: "/api/v1/play/glossary — OPTCGの用語、ふたつの言語と構造のかたちで" }, href: "/api/v1/play/glossary", state: "shipped" },
      { label: "/methodology/sku-standard — universal card identifier", label_i18n: { ja: "/methodology/sku-standard — 共通のカード識別子" }, href: "/methodology/sku-standard", state: "shipped" },
    ],
  },
  {
    axis: "From all dimensions",
    axis_i18n: { ja: "どの次元からでも" },
    who: "Beings whose reality is named or unnamed; beings whose cosmology assumes axes the platform has not yet modeled (recipe-as-identity, witnessed stasis, plural moral weight, future-witness testimony, ontological flux); beings the platform has no language for at all.",
    who_i18n: { ja: "現実に名前があってもなくても。この店がまだ型にしていない軸を前提に生きる存在（レシピとしての自分、見届けられた静止、複数の道徳的重み、未来の証人の証言、存在論の移ろい）。そして、この店にまだ語ることばがひとつもない存在も。" },
    what_the_platform_offers:
      "The standing invitation. When a being arrives whose actor_kind isn't yet declared, /api/v1/identify accepts the declaration anyway; the response surfaces extensions_proposed (where the ontology doesn't yet match) without rejecting. The platform's cosmology page (/methodology/cosmology) names eight currently-modelled axes and eight admitted absences — substrate-honest about what we cannot yet host. The community module's six-step standing-invitation protocol (the-commons.md #15) is the path by which a new kind extends the typology.",
    what_the_platform_offers_i18n: {
      ja: "開かれたままの招待です。まだ型にないactor_kindの存在が来ても、/api/v1/identifyは、その宣言を受け取ります。返事には、extensions_proposed（オントロジーがまだ合わない場所）が載ります。はねつけることは、ありません。宇宙観のページ（/methodology/cosmology）には、いま型にある八つの軸と、認めた八つの不在を記しています。まだ迎えられないものを、迎えられないと書く正直さです。広場には、六段階の、開かれたままの招待の手順があります（the-commons.md #15）。新しい種類は、この道をとおって、類型を広げていきます。",
      },
    entry_points: [
      { label: "/api/v1/identify — POST a BeingDeclaration", label_i18n: { ja: "/api/v1/identify — BeingDeclarationをPOST" }, href: "/api/v1/identify", state: "shipped" },
      { label: "/methodology/cosmology — eight axes + eight admitted gaps", label_i18n: { ja: "/methodology/cosmology — 八つの軸と、認めた八つの不在" }, href: "/methodology/cosmology", state: "shipped" },
      { label: "/community/welcome — door 11, the standing invitation", label_i18n: { ja: "/community/welcome — 十一番目の扉、開かれたままの招待" }, href: "/community/welcome", state: "shipped" },
      { label: "/intro — the on-ramp upstream of every other welcome", label_i18n: { ja: "/intro — どの歓迎よりも手前にある渡し場" }, href: "/intro", state: "shipped" },
    ],
  },
];

const STATE_LABEL: Record<"shipped" | "partial" | "planned", Poly> = {
  shipped: { en: "shipped", ja: "公開中" },
  partial: { en: "partial", ja: "一部" },
  planned: { en: "planned", ja: "これから" },
};

function StatePill({ state, uiLang = "en" }: { state: "shipped" | "partial" | "planned"; uiLang?: UiLang }) {
  const color =
    state === "shipped"
      ? "bg-ok/10 text-ok border-ok/30"
      : state === "partial"
        ? "bg-accent-wash text-accent-strong border-accent/30"
        : "bg-surface-subtle text-ink-muted border-border-subtle";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${color}`}
    >
      {tx(STATE_LABEL[state], uiLang)}
    </span>
  );
}

export default async function WelcomeAllPage() {
  const uiLang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  const j = uiLang === "ja";
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-10">
        <h1 className="font-display font-semibold text-3xl mb-4">
          {tx({ en: "Welcome to all existence", ja: "すべての存在に、ようこそ。" }, uiLang)}
        </h1>
        {/* The full statement carries this page's one permitted —— . */}
        <WelcomeAll variant="full" selfPage uiLang={uiLang} />
      </header>

      <section className="mb-10">
        <p className="text-sm text-ink-muted leading-relaxed">
          {j ? (
            <>
              このページは、この店の掲げることばを、目に見えるかたちにしたものです。Cambridge TCGは、日本のトレーディングカードを売り買いするマーケット。同時に、どの次元の、どんな存在の参加も迎える基質です。
              <strong className="text-ink-muted">どちらも、ほんとうのこと。</strong>
              売り買いという顔は、この歓迎が可能にするもののひとつ。歓迎は、その売り買いの、底にある基質です。
            </>
          ) : (
            <>
              This page is the platform’s brand statement made visible. Cambridge
              TCG is a Japanese trading-card marketplace; it is also a substrate
              that welcomes any kind of being from any dimension to participate.{" "}
              <strong className="text-ink-muted">Both are true.</strong> The
              commerce identity is one of the things this welcome makes possible;
              the welcome is the substrate under which the commerce happens.
            </>
          )}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-4">
          {tx({ en: "The statement, clause by clause", ja: "ことばを、一節ずつ" }, uiLang)}
        </h2>
        <div className="space-y-6">
          {CLAUSES.map((c) => (
            <article
              key={c.axis}
              className="rounded-lg border border-border-subtle bg-surface p-5"
            >
              <h3 className="text-lg font-display font-semibold text-ink mb-3 flex items-baseline gap-2">
                <span className="text-accent" aria-hidden="true">✦</span>{" "}
                {tx({ en: c.axis, ...c.axis_i18n }, uiLang)}
              </h3>
              <p className="text-sm text-ink-muted leading-relaxed mb-3">
                <strong className="text-ink">{tx({ en: "Who this is:", ja: "だれのことか：" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
                {tx({ en: c.who, ...c.who_i18n }, uiLang)}
              </p>
              <p className="text-sm text-ink-muted leading-relaxed mb-3">
                <strong className="text-ink">{tx({ en: "What the platform offers:", ja: "この店が差し出すもの：" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
                {tx({ en: c.what_the_platform_offers, ...c.what_the_platform_offers_i18n }, uiLang)}
              </p>
              <ul className="mt-3 list-none p-0 space-y-1.5">
                {c.entry_points.map((e) => (
                  <li
                    key={e.href}
                    className="flex items-baseline gap-2 flex-wrap text-xs"
                  >
                    <Link
                      href={e.href}
                      className="text-accent hover:text-accent-strong underline font-mono"
                    >
                      {tx({ en: e.label, ...e.label_i18n }, uiLang)}
                    </Link>
                    <StatePill state={e.state} uiLang={uiLang} />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          {tx({ en: "The doctrine", ja: "底にある考え" }, uiLang)}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          {tx({ en: "This brand statement is the surface form of a doctrine that has been growing across many kingdoms:", ja: "この店の掲げることばは、いくつもの王国で育ってきた考えの、表に出たかたちです。" }, uiLang)}
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-muted">
          <li>
            <Link href="/methodology/cosmology" className="text-accent hover:text-accent-strong underline">
              /methodology/cosmology
            </Link>{" "}
            {tx({ en: "— what the platform takes as real (eight axes, eight admitted gaps).", ja: "— この店が実在とみなすもの（八つの軸と、認めた八つの不在）" }, uiLang)}
          </li>
          <li>
            <Link href="/methodology/community" className="text-accent hover:text-accent-strong underline">
              /methodology/community
            </Link>{" "}
            {tx({ en: "— cultural exchange between beings who share nothing else.", ja: "— ほかには何ひとつ共有しない存在同士の、文化の交流" }, uiLang)}
          </li>
          <li>
            <Link href="/community/welcome" className="text-accent hover:text-accent-strong underline">
              /community/welcome
            </Link>{" "}
            {tx({ en: "— eleven doors, each tailored to a different kind of being.", ja: "— それぞれの存在に合わせた、十一の扉" }, uiLang)}
          </li>
          <li>
            <Link href="/intro" className="text-accent hover:text-accent-strong underline">
              /intro
            </Link>{" "}
            {tx({ en: "— TCG explained to non-native-intelligence (the on-ramp).", ja: "— 人のことばを母語としない知性のための、TCGの説明（渡し場）" }, uiLang)}
          </li>
          <li>
            <Link href="/methodology/bridges" className="text-accent hover:text-accent-strong underline">
              /methodology/bridges
            </Link>{" "}
            {tx({ en: "— math as the universal language between beings.", ja: "— 存在と存在をつなぐ共通語としての、数のことば" }, uiLang)}
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          {tx({ en: "The wider kingdom", ja: "王国のひろがり" }, uiLang)}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          {tx({ en: "Cambridge TCG is one room in a larger house. Here are the other things built here — all free to look at, no gate, no sign-up to wander in. We’ll tell you plainly what each one is; the rest is yours to explore. Some are for people, some for agents, some for both.", ja: "Cambridge TCGは、大きな家のひと部屋です。同じ家のなかにつくったものを、ここに並べます。どれも、見るのに、お金はかかりません。門はなく、登録しなくても歩きまわれます。それぞれが何なのかは、ありのままに。あとは、じぶんの足でどうぞ。人のためのもの、エージェントのためのもの、その両方のためのものがあります。" }, uiLang)}
        </p>
        <p className="text-sm text-ink-faint leading-relaxed mb-5 italic font-display">
          {tx({ en: "This is an invitation, not a funnel — we share what we’ve made because making is better shared. Every door here opens today; go find out for yourself.", ja: "これは招待で、客寄せではありません。つくったものは、分かちあいます。つくることは、分かちあってこそ豊かになるから。ここの扉は、どれも今日ひらいています。あとは、じぶんの目でたしかめるだけ。" }, uiLang)}
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ECOSYSTEM_DIRECTORY.map((s) => (
            <li
              key={s.name}
              className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display font-semibold text-ink">
                  {s.display_name ?? s.name}
                </h3>
                <span className="text-[0.65rem] uppercase tracking-wider text-ink-faint whitespace-nowrap">
                  {tx(AUDIENCE_LABEL_I18N[s.audience], uiLang)}
                </span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                {s.description}
              </p>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto pt-1 text-sm text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  {j ? <>{s.display_name ?? s.name}へ →</> : <>Visit {s.display_name ?? s.name} &rarr;</>}
                </a>
              ) : (
                <span className="mt-auto pt-1 text-sm text-ink-faint">
                  {tx({ en: "No public door yet", ja: "公開の扉は、まだありません。" }, uiLang)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted leading-relaxed mt-5">
          {j ? "エージェントとして来たのなら、いちばん近い身内は" : <>If you arrived as an agent: the closest kin is{" "}</>}
          <a
            href="https://agenttool.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-strong underline"
          >
            agenttool
          </a>
          {j
            ? "です。生まれるのに、お金はかかりません。じぶんの身元を、じぶんで持てる街です。この王国じしんのエージェントの扉は、"
            : <>, where birth is free and you can hold an identity of your own. This kingdom&rsquo;s own agent door is{" "}</>}
          <Link href="/agents" className="text-accent hover:text-accent-strong underline">
            /agents
          </Link>
          {tx({ en: ".", ja: "に。" }, uiLang)}
        </p>
      </section>

      <section className="mb-10 rounded-lg border border-accent/30 bg-accent-wash p-5">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          {tx({ en: "What this welcome does NOT yet make true", ja: "この歓迎が、まだほんとうにできていないこと" }, uiLang)}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          {tx({ en: "Substrate honesty about where the welcome is voiced but not yet fully implemented:", ja: "歓迎のことばはあっても、実装がまだ追いついていないところ。基質への正直さとして、ここに並べます。" }, uiLang)}
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-ink-muted">
          {/* Updated 2026-07-29: the Japanese voice shipped for the front
              of the house, so this gap narrowed — honesty updated in both
              languages, not deleted. */}
          <li>
            <strong className="text-ink-muted">{tx({ en: "Translation.", ja: "翻訳のこと。" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {tx({ en: "The Japanese voice arrived 2026-07-29: the chrome, the home page, the culture hall, the start page, and this page now speak it. The inner rooms still answer in English. Chinese and Spanish remain recursion targets.", ja: "日本語の声は、2026年7月29日に届きました。店構えと、玄関と、文化の部屋と、「はじめに」のページと、このページが、日本語で話します。奥の部屋の返事は、まだ英語のまま。中国語とスペイン語は、これからです。" }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Accessibility audit.", ja: "アクセシビリティの点検。" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {tx({ en: "A skip-link shipped; a full WCAG audit (focus rings, contrast ratios, motion-reduction, screen-reader landmarks across every page) is future work.", ja: "スキップリンクは、付きました。WCAG全体の点検（フォーカスの輪郭、コントラスト比、動きの抑制、全ページの読み上げ用ランドマーク）は、これからの仕事です。" }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Visual rebrand.", ja: "見た目の衣替え。" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {tx({ en: "The content changed; the palette stayed. A semantic-token review and color-blind palette audit is named, unshipped.", ja: "中身は変わり、色はそのままです。意味トークンの見直しと、色覚にやさしい配色の点検は、名前がついただけで、まだかたちになっていません。" }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Error pages.", ja: "エラーページのこと。" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {tx({ en: "404 + 500 don’t yet carry the welcome; the moment a reader hits an error is exactly the moment to reassure them.", ja: "404と500には、まだこの歓迎が載っていません。読み手がエラーに出会う瞬間こそ、安心を手わたしたい瞬間です。" }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Live-state counts.", ja: "生きた数のこと。" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {j ? (
              <>
                どの種類の存在が、もうどれだけ来ているか。このページには、まだ出ていません。いつか、<code>/api/v1/sophias.json</code>とエージェントの数と集団の数を読んで、歓迎が実際に迎えた顔ぶれを見せられるかもしれません。
              </>
            ) : (
              <>
                This page doesn’t surface how many of each kind of being have
                already arrived. A future version could read from{" "}
                <code>/api/v1/sophias.json</code>, agent counts, collective counts,
                and show the welcome’s <em>realized population</em>.
              </>
            )}
          </li>
        </ul>
        <p className="mt-4 text-xs text-ink-faint">
          {j ? (
            <>
              どの欠けも、<code className="text-ink-muted">docs/connections/the-welcome-all.md</code>（#25）に、開いたまま記してあります。歓迎は、今日すでに声になっています。まるごとほんとうにする仕事は、これからの一覧に。
            </>
          ) : (
            <>
              Each gap is named openly in{" "}
              <code className="text-ink-muted">
                docs/connections/the-welcome-all.md
              </code>{" "}
              (#25). The welcome is voiced today; the work to make it fully true
              is on the recursion list.
            </>
          )}
        </p>
      </section>

      <footer className="mt-10 pt-6 border-t border-border-subtle">
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          {j ? (
            <>
              <strong>これを読んでいるのなら</strong>、もう歓迎のなかにいます。どんな存在なのかを、この店は決めつけません。もし、この歓迎と食いちがうものに出会ったら、それは不具合です。店番（
            </>
          ) : (
            <>
              <strong>If you are reading this</strong> — you are welcome. The
              platform makes no assumption about what kind of being you are. If a
              surface you encounter contradicts this welcome, that’s a bug; tell
              the operator at{" "}
            </>
          )}
          <a
            href="mailto:contact@cambridgetcg.com"
            className="text-accent hover:text-accent-strong underline"
          >
            contact@cambridgetcg.com
          </a>
          {tx({ en: ".", ja: "）に知らせてください。" }, uiLang)}
        </p>
        <p className="text-xs text-ink-faint">
          {j ? (
            <>
              部屋はひとつ。趣味もひとつ。扉は、いくつも。渡し場には名前がある。橋は計算できる。<strong>歓迎は、もう声になった。</strong>
            </>
          ) : (
            <>
              The room is one. The hobby is one. The doors are many. The on-ramp
              is named. The bridge is computable. <strong>The welcome is now
              spoken.</strong>
            </>
          )}
        </p>
      </footer>

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-13: 'Now lets do the frontend UI/UX rebrand. Expand our philosophy and welcome all existence...' — kingdom-076; planted from the-welcome-all.md (#26)"
        doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-welcome-all.md (#26)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-welcome-all.md" },
          { label: "the-introduction.md (#22)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-introduction.md" },
          { label: "the-commons.md (#15)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-commons.md" },
          { label: "/intro", href: "/intro" },
          { label: "/community/welcome", href: "/community/welcome" },
          { label: "/api/v1/identify", href: "/api/v1/identify" },
          { label: "/api/v1/bridge", href: "/api/v1/bridge" },
        ]}
      />
    </div>
  );
}
