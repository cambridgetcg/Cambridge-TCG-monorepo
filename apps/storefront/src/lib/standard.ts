/**
 * The Plain Standard — one legible grammar for every rule, technical to legal.
 *
 * The internet's standards are gatekept by density on purpose: RFCs are dense,
 * ISO is paywalled, law is legalese, cloud docs sprawl. The Plain Standard wins by
 * the opposite move — every rule, whatever its domain (how bytes move OR what you
 * may not do with a person's data), snaps into ONE tiny shape a child, a lawyer, or
 * an AI can follow, in any language:
 *
 *     What it is · Why it matters · The rule · ✅ Do · ❌ Don't · (in your language)
 *
 * This file is the kingdom's self-describing standard, in the family of /manifest,
 * /graph, /ontology, /patterns: a typed source of truth → a JSON endpoint → a page.
 * It is an example of itself — legible, plain, multilingual, free.
 */

// ── The languages the standard speaks (it is never English-only) ─────────────
export type Lang = "en" | "zh" | "es" | "ar" | "hi";
export const LANGS: { code: Lang; name: string; native: string }[] = [
  { code: "en", name: "English", native: "English" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
];

// ── The doctrine: what makes EVERY entry better than the establishment ───────
export const DOCTRINE: { hold: string; over: string; why: string }[] = [
  { hold: "Legible", over: "opaque", why: "if you can't read the rule, it isn't a rule, it's a leash." },
  { hold: "Plain", over: "jargon", why: "density is gatekeeping. Plain words let everyone in." },
  { hold: "Free", over: "paywalled", why: "a standard behind a paywall (ISO) only governs those who can pay." },
  { hold: "Multilingual", over: "English-only", why: "the web defaulted to one tongue. People don't." },
  { hold: "Do / Don't", over: "prose", why: "a rule you can follow beats a paragraph you must interpret." },
  { hold: "Honest", over: "hidden", why: "every claim names how it came to be true (source, freshness, who)." },
  { hold: "Beautiful", over: "utilitarian", why: "what is pleasant to read gets read, and followed." },
  { hold: "Customizable", over: "one-size", why: "a standard is a floor to build on, not a cage." },
];

// ── The Stack: the technical layers, bottom to top ───────────────────────────
// Each layer is "our better version of an internet primitive". `state` is
// substrate-honest about how real it is in the kingdom today.
export type LayerState = "built" | "partial" | "aspirational";
export interface Layer {
  n: number;
  key: string;
  name: string;
  what: string;
  replaces: string;
  builtOn: string; // the real kingdom artifact this stands on
  state: LayerState;
}

export const STACK: Layer[] = [
  { n: 0, key: "wire", name: "Wire", what: "How bytes move and a message arrives.",
    replaces: "TCP / IP / raw HTTP", builtOn: "rides HTTP today, with legibility added (freshness budgets, /api/v1/status)", state: "partial" },
  { n: 1, key: "self", name: "Self", what: "Who or what a participant is — you declare yourself, no registrar.",
    replaces: "accounts + passwords + x509/PKI + OAuth", builtOn: "/api/v1/identify (BeingDeclaration → content_hash)", state: "built" },
  { n: 2, key: "name", name: "Name", what: "How you point at a thing — named by what it is FOR, not who paid.",
    replaces: "DNS + URLs + domain squatting", builtOn: "/manifest + /graph (typed nodes + edges, _links on every response)", state: "built" },
  { n: 3, key: "shape", name: "Shape", what: "The form of a message — it says what it is, how fresh, who made it, how to check.",
    replaces: "opaque JSON / protobuf byte-soup", builtOn: "@cambridge-tcg/data-spec envelope { data, _meta } (CC0)", state: "built" },
  { n: 4, key: "meaning", name: "Meaning", what: "What a thing means to other things — a layer the internet never had.",
    replaces: "nothing (net-new)", builtOn: "/ontology (~60 typed properties, each with source + modality)", state: "built" },
  { n: 5, key: "trust", name: "Trust", what: "Why you should believe a message — trust you can read and audit.",
    replaces: "TLS/CA cartel + opaque credit/reputation scores", builtOn: "lib/trust/state.ts + methodology pages + content_hash", state: "built" },
  { n: 6, key: "worth", name: "Worth", what: "How value moves — money you can read.",
    replaces: "the banking rails + opaque crypto", builtOn: "ZERONE (proof-of-truth, 2-of-2) + @cambridge-tcg/pricing", state: "aspirational" },
  { n: 7, key: "face", name: "Face", what: "What you see — beautiful, simple, customizable, and free of dark patterns.",
    replaces: "HTML/CSS chaos + the dark-patterned web", builtOn: "the four doctrines + lib/ui + the authenticity shield", state: "partial" },
];

// ── The Format: the one shape every standard entry snaps into ────────────────
export type Domain =
  | "wire" | "self" | "name" | "shape" | "meaning" | "trust" | "worth" | "face" // the stack
  | "security" | "process" | "law" | "regulation" | "cloud";                    // the governance overlay

/** A translation of the human-facing parts of an entry. The id/rule logic never changes per language. */
export interface Translation {
  what: string;
  rule: string;
  do: string[];
  dont: string[];
}

export interface StandardEntry {
  id: string;
  domain: Domain;
  title: string;
  /** What it is, one plain sentence. */
  what: string;
  /** Why it matters, plain. */
  why: string;
  /** The single rule. */
  rule: string;
  /** ✅ Do this. */
  do: string[];
  /** ❌ Not that. */
  dont: string[];
  /** The dense/opaque thing it replaces (optional). */
  replaces?: string;
  since: string;
  /** The same entry in other languages — never English-only by design. */
  translations?: Partial<Record<Lang, Translation>>;
}

// ── The Corpus: a seed that proves ONE format spans protocol → security → law ─
export const STANDARDS: StandardEntry[] = [
  {
    id: "every-message-says-what-it-is",
    domain: "shape",
    title: "Every message says what it is",
    what: "Every response carries its data and a small _meta saying what it is, how fresh, who made it, and how to verify.",
    why: "A value with no provenance is a rumour. If you can't tell live from cached from guessed, you can't trust any of it.",
    rule: "Never emit data without an envelope: { data, _meta: { source, freshness, verify } }.",
    do: ["Wrap every public response in { data, _meta }.", "State freshness honestly: live, cached, snapshot, or computed.", "Include a way to check the claim (a hash, a methodology link)."],
    dont: ["Don't return a bare value.", "Don't label cached or guessed data as live.", "Don't hide where a number came from."],
    replaces: "opaque JSON-over-HTTP",
    since: "2026-05",
    translations: {
      zh: {
        what: "每條訊息都說明自己是什麼：附上資料，以及一小段 _meta，說明它是什麼、有多新、誰做的、如何查證。",
        rule: "送出資料時一定要附上信封：{ data, _meta: { 來源, 新鮮度, 查證方式 } }。",
        do: ["每個對外回應都用 { data, _meta } 包起來。", "誠實標明新鮮度：即時、快取、快照、或計算得出。"],
        dont: ["不要回傳沒有說明的裸資料。", "不要把快取或猜測的資料標成即時。"],
      },
    },
  },
  {
    id: "you-are-your-declaration",
    domain: "self",
    title: "You are your declaration",
    what: "A participant says who it is in a small signed declaration; its identity is the content-hash of that, not an account a gatekeeper grants.",
    why: "Identity owned by a registrar can be revoked, sold, or surveilled. Identity you declare is yours.",
    rule: "Let any being declare itself; address it by the hash of its declaration, not a granted account.",
    do: ["Accept a self-declaration from any kind of participant (human, AI, collective).", "Derive identity from the content, so it's verifiable by anyone."],
    dont: ["Don't require an account to exist.", "Don't make one company the issuer of who is real."],
    replaces: "accounts + passwords + OAuth",
    since: "2026-05",
  },
  {
    id: "never-a-secret-in-a-url",
    domain: "security",
    title: "Never a secret in a URL",
    what: "Personal or sensitive data must never travel in a URL, query string, or anything logged by default.",
    why: "URLs are written to server logs, browser history, and referrer headers. A secret in a URL is a secret already leaked.",
    rule: "Secrets and personal data go in the body or a header, never the path or query.",
    do: ["Put tokens and personal data in the request body or an Authorization header.", "Treat the URL as public, always."],
    dont: ["Don't put a token, password, email, or ID in a URL.", "Don't pass personal data in query parameters."],
    replaces: "the sprawling, unread cloud security policy",
    since: "2026-05",
    translations: {
      zh: {
        what: "個人或敏感資料，絕不放進網址、查詢字串、或任何預設會被記錄的地方。",
        rule: "機密與個資放在請求內文或標頭，永遠不要放在路徑或查詢字串。",
        do: ["把權杖與個資放在內文或 Authorization 標頭。", "永遠把網址當成公開的。"],
        dont: ["不要把權杖、密碼、電子郵件、或身分編號放進網址。"],
      },
    },
  },
  {
    id: "a-person-can-always-say-no",
    domain: "law",
    title: "A person can always say no — for free",
    what: "A person may decline, delete, or walk away from any service, at any time, without a fee, a maze, or a guilt-trip.",
    why: "Consent that's costly or hidden to withdraw isn't consent. The right to leave is what makes the right to join real.",
    rule: "Make leaving as easy and as free as joining. Show the exit before the entrance.",
    do: ["Make 'no', 'cancel', and 'delete my data' one clear, free action.", "Show how to leave before someone joins."],
    dont: ["Don't charge to cancel or hide the cancel path.", "Don't word the 'no' to shame the person (confirmshaming)."],
    replaces: "pages of legalese nobody reads",
    since: "2026-05",
  },
  {
    id: "verify-before-you-claim-done",
    domain: "process",
    title: "Verify before you claim done",
    what: "Nothing is 'done' until a check proves it. If the check failed or was skipped, say so plainly.",
    why: "A claim of done with no verification is just hope. Honest status is worth more than optimistic status.",
    rule: "Run the gate, then state the real result — including failures and skips.",
    do: ["Run the check (tests, audit, a live probe) and report its actual output.", "Say 'I skipped X' or 'Y failed' when true."],
    dont: ["Don't say 'done' on hope.", "Don't bury a failing test or a skipped step."],
    replaces: "the green checkmark that means nothing",
    since: "2026-05",
  },
  {
    id: "every-score-is-inspectable",
    domain: "trust",
    title: "Every score is inspectable by the one it's about",
    what: "Any number that affects a person (a trust score, a fee, a hold, a flag) can be opened and understood by that person.",
    why: "A score you can't see is a verdict without a trial. Decisions about people belong to those people to inspect.",
    rule: "For every user-affecting score, publish how it's computed and let the subject read their own.",
    do: ["Link every score to a plain methodology page.", "Show the inputs and the downstream effects (the propagation)."],
    dont: ["Don't ship a sealed score.", "Don't let only the operator see why."],
    replaces: "the opaque credit/reputation score",
    since: "2026-05",
  },
  {
    id: "tell-the-truth-about-freshness",
    domain: "cloud",
    title: "Tell the truth about freshness",
    what: "Every served value declares how old it is and when it will be considered stale.",
    why: "Stale data wearing a live mask causes more harm than missing data. Honesty about age is honesty about risk.",
    rule: "Attach a freshness budget to every value; when it lapses, say 'stale', don't pretend.",
    do: ["Carry freshness on every value (live / cached / snapshot / computed).", "Degrade visibly to '—' on a failed read, never silently to 0."],
    dont: ["Don't serve a cache as if it were live.", "Don't turn a failed read into a confident zero."],
    replaces: "the opaque cloud SLA",
    since: "2026-05",
  },

  // ── Grown 2026-06-10, harvested by hand from the kingdom's own wisdom:
  //    the four doctrines, the fifth question, the shield's pledge, and our
  //    security + freshness rules — said plainly, for the first time. ───────

  // from substrate honesty
  {
    id: "say-how-you-know",
    domain: "shape",
    title: "Say how you know",
    what: "Every value says how it became true — measured live, served from a cache, a saved snapshot, or computed.",
    why: "\"5 stars\" measured today and \"5 stars\" from a month-old cache are different facts. Treating them the same is a quiet lie.",
    rule: "Label every value with its provenance: live · cached · snapshot · computed.",
    do: ["Tag each value with how it was obtained.", "Show the timestamp whenever it isn't live."],
    dont: ["Don't present cached or computed data as freshly measured.", "Don't blend sources without saying so."],
    replaces: "numbers with no past",
    since: "2026-06",
  },
  {
    id: "a-dash-not-a-zero",
    domain: "shape",
    title: "When you don't know, say so",
    what: "When a lookup fails, show \"—\" (unknown) — never a confident 0.",
    why: "A failed read shown as \"0 sales\" or \"$0\" reads as a fact and misleads. \"—\" tells the truth: we don't know yet.",
    rule: "On a failed read, degrade visibly to \"—\", never silently to 0.",
    do: ["Render an unknown value as \"—\".", "Record the failure so someone can fix it."],
    dont: ["Don't turn a missing value into a zero.", "Don't hide that a read failed."],
    since: "2026-06",
  },
  // from transparency
  {
    id: "show-what-a-number-does-to-you",
    domain: "trust",
    title: "Show what a number does to you",
    what: "When a score affects you, show not just the score but what it changes — your fee, your limit, your hold.",
    why: "A bare number is abstract. What it DOES to you is the real decision. Hiding the chain hides the stakes.",
    rule: "Render the downstream effects of any user-affecting score right next to the score.",
    do: ["Show the fee, limit, or hold a score produces.", "Link the plain methodology behind it."],
    dont: ["Don't show a bare score with no consequences.", "Don't keep the effects operator-only."],
    since: "2026-06",
  },
  // from meaning
  {
    id: "name-what-a-link-is-for",
    domain: "meaning",
    title: "Name what a link is for",
    what: "Don't just say two things are connected — say what the connection is FOR.",
    why: "\"A links to B\" tells you the wire. \"A pays B's commission\" tells you the meaning. Architecture without meaning is a maze.",
    rule: "Every meaningful connection names its purpose, not just its existence.",
    do: ["Write down what each link is for.", "Let a newcomer learn the why, not just the what."],
    dont: ["Don't ship a connection whose purpose lives only in someone's head."],
    replaces: "the undocumented dependency",
    since: "2026-06",
  },
  {
    id: "every-answer-points-to-the-next",
    domain: "name",
    title: "Every answer points to the next",
    what: "Every response carries links to the related things, so anyone can always find the next step.",
    why: "A dead-end answer makes you start over. A response that knows its neighbors lets anyone explore without a map.",
    rule: "Attach links to the related resources on every response.",
    do: ["Link to siblings, the schema, and the parent.", "Use null when an edge is genuinely absent — that's honest too."],
    dont: ["Don't return an island.", "Don't fake a link that isn't real."],
    since: "2026-06",
  },
  // from creation
  {
    id: "every-change-carries-its-origin",
    domain: "process",
    title: "Every change says who made it and why",
    what: "Every meaningful change records what asked for it, who made it, and the change itself.",
    why: "A diff with no story can't be trusted or undone wisely. The origin is what makes work auditable.",
    rule: "Each change carries its will (what specified it), its author, and its diff.",
    do: ["Write why in the message.", "Credit the author — human and AI both.", "Keep the trace."],
    dont: ["Don't ship an anonymous, reasonless change.", "Don't erase who made it."],
    since: "2026-06",
  },
  // from the fifth question / inclusion
  {
    id: "ask-for-whom-is-this-true",
    domain: "law",
    title: "Ask: for whom is this true?",
    what: "Before you ship, ask who the default quietly excludes — the non-English speaker, the blind, the asynchronous, the departed, the non-human.",
    why: "Defaults — one person, sighted, English, synchronous, paying — feel neutral but lock real people out. Naming the excluded is the first kindness.",
    rule: "For every feature, name whom the default serves, and give a path to those it doesn't.",
    do: ["Support more than one language, modality, and pace.", "Write down who is still excluded today."],
    dont: ["Don't assume the default user is everyone.", "Don't ship a single-language, single-pace-only path in silence."],
    since: "2026-06",
    translations: {
      zh: {
        what: "在你發布之前，先問：預設值悄悄排除了誰——不說英文的人、看不見的人、無法即時回應的人、已離世的人。",
        rule: "每個功能都要說明預設值服務的是誰，並為其他人留一條路。",
        do: ["支援多種語言、形式與節奏。", "寫下還有誰被排除在外。"],
        dont: ["不要假設預設使用者就是所有人。", "不要默默只提供單一語言、單一節奏的路徑。"],
      },
    },
  },
  {
    id: "synchrony-is-a-preference",
    domain: "law",
    title: "Let people move at their own pace",
    what: "Don't force everyone onto your clock; let people answer at the pace they actually live at.",
    why: "A 48-hour timer assumes everyone is always online and well. Many aren't. Time pressure excludes the slow, the sick, the busy.",
    rule: "Make response windows a preference, never a hardcoded universal.",
    do: ["Read a per-person response window.", "Offer an unhurried, asynchronous path."],
    dont: ["Don't hardcode one deadline for everyone.", "Don't punish a slower pace."],
    since: "2026-06",
  },
  // from the shield's pledge
  {
    id: "never-charge-the-scared",
    domain: "law",
    title: "Never charge a person for their own safety",
    what: "A person's protection — a safety warning, a scam alert, the basic result — is free and never gated.",
    why: "The moment you paywall safety, you're selling fear. Money may come from those who hold the value — never from the frightened individual.",
    rule: "Keep the safety result free for the person, always; charge only volume and business use.",
    do: ["Keep the core protection free and ungated.", "Put any wall only on volume or business use."],
    dont: ["Don't gate a safety verdict.", "Don't add \"upgrade to see all the flags\"."],
    replaces: "the freemium safety trap",
    since: "2026-06",
  },
  {
    id: "patterns-not-verdicts",
    domain: "law",
    title: "Show patterns, never pronounce guilt",
    what: "Name what's consistent with a problem; never declare a specific person or thing fraudulent.",
    why: "A false \"this IS a scam\" can defame and mislead. A confidence band — \"looks likely\" — is honest and leaves the choice with the person.",
    rule: "Report patterns and a confidence band; never a fake certain verdict.",
    do: ["Say \"consistent with X\".", "Give a likely / possible band.", "Let the person decide."],
    dont: ["Don't claim a certainty you don't have.", "Don't accuse a named party."],
    since: "2026-06",
  },
  // from security
  {
    id: "keep-no-secret-in-plain-sight",
    domain: "security",
    title: "Keep no secret in plain sight",
    what: "Store secrets — keys, tokens, passwords — only as one-way hashes, never as readable text.",
    why: "A database read, a backup leak, or one insider shouldn't be able to read a single password. Plaintext secrets are pre-leaked.",
    rule: "Hash secrets at rest; compare them in constant time.",
    do: ["Store a salted hash, never the secret.", "Verify with a timing-safe compare."],
    dont: ["Don't store a password, key, or token as plaintext.", "Don't compare secrets with a plain equals."],
    since: "2026-06",
  },
  {
    id: "check-the-signature-before-you-act",
    domain: "security",
    title: "Check who it's from before you act",
    what: "Before acting on an incoming event — a webhook, a callback — verify it truly came from who it claims.",
    why: "An unverified webhook is a door anyone can knock on pretending to be your bank. Act first, check never, and money walks out.",
    rule: "Verify a signed event over its raw body before doing anything; reject stale or replayed events.",
    do: ["Check the signature on the raw payload first.", "Reject events outside a time window.", "Make handling idempotent."],
    dont: ["Don't trust a message just because it arrived.", "Don't process the same event twice."],
    since: "2026-06",
  },
  {
    id: "the-free-door-needs-no-key",
    domain: "security",
    title: "The free door needs no key",
    what: "The free, anonymous path must run with no secret at all — no API key, no account, nothing that can leak.",
    why: "If the basic thing needs a secret, the secret will leak and the basic thing will break — for the people who can least afford it. Needing nothing is the most robust security there is.",
    rule: "The anonymous path touches no secret and no database; secrets only sharpen, never gate.",
    do: ["Make the floor work at zero config.", "Let keys only ADD nuance, never unlock the basics."],
    dont: ["Don't make the free path require a key or a database.", "Don't let a missing secret silently downgrade a paying user."],
    since: "2026-06",
    translations: {
      zh: {
        what: "免費、匿名的功能必須在沒有任何機密的情況下運作——不需要金鑰、不需要帳號、沒有任何會外洩的東西。",
        rule: "匿名路徑不接觸任何機密或資料庫；金鑰只用來加強，絕不用來把關。",
        do: ["讓最基本的功能在零設定下運作。", "金鑰只用來增加細緻度，不解鎖基本功能。"],
        dont: ["不要讓免費路徑需要金鑰或資料庫。", "不要因為少了機密就悄悄降級付費用戶。"],
      },
    },
  },
  // from our freshness + build rules
  {
    id: "say-a-thing-once",
    domain: "process",
    title: "Say a thing once",
    what: "Every fact lives in exactly one place; everything else points to it.",
    why: "A value copied into two files drifts. Then two answers disagree and nobody knows which is real. One source can't disagree with itself.",
    rule: "Define each fact once; derive every copy; never hand-maintain a duplicate.",
    do: ["Keep one canonical definition.", "Render or import it everywhere else."],
    dont: ["Don't fork a value across files.", "Don't hand-sync two copies and hope."],
    replaces: "the drifting duplicate",
    since: "2026-06",
  },
  {
    id: "doing-it-twice-does-no-harm",
    domain: "process",
    title: "Doing it twice does no harm",
    what: "Running the same operation twice leaves the same result as running it once.",
    why: "Networks retry, crons re-fire, people double-click. If a repeat double-charges or double-ships, the system is a trap.",
    rule: "Make writes idempotent — keyed so a repeat is a no-op.",
    do: ["Key operations so retries are safe.", "Check \"already done\" before doing."],
    dont: ["Don't assume an operation runs exactly once.", "Don't double-apply on a retry."],
    since: "2026-06",
  },
  {
    id: "a-broken-thing-says-so",
    domain: "cloud",
    title: "A broken thing says so",
    what: "When something is misconfigured or broken, it fails loudly — never a quiet wrong answer.",
    why: "A silent wrong answer is worse than an outage: it spreads, undetected, and is believed. A loud failure gets fixed.",
    rule: "Tell apart \"unreachable\" (degrade) from \"misconfigured\" (fail loud, a real error).",
    do: ["Surface a structural error as a real failure.", "Alert on it."],
    dont: ["Don't serve a wrong answer to hide a misconfig.", "Don't degrade silently when the real problem is structural."],
    since: "2026-06",
  },
];

export const STANDARD_META = {
  name: "The Plain Standard",
  tagline: "Every rule — protocol to law — in plain words, in any language, free.",
  version: "0.2",
  since: "2026-06-09",
  license: "CC0-1.0",
  self_describing: "This standard is written in its own format. It is an example of itself.",
};

/** The shape of an entry, declared so a reader (human or machine) can author a conforming one. */
export const ENTRY_FORMAT: { field: string; meaning: string }[] = [
  { field: "id", meaning: "stable kebab-case name" },
  { field: "domain", meaning: "which part of life it governs (a stack layer or a governance domain)" },
  { field: "title", meaning: "the rule, as a plain headline" },
  { field: "what", meaning: "what it is, one plain sentence" },
  { field: "why", meaning: "why it matters, plain" },
  { field: "rule", meaning: "the single rule" },
  { field: "do", meaning: "✅ a short list of what to do" },
  { field: "dont", meaning: "❌ a short list of what not to do" },
  { field: "replaces", meaning: "the dense/opaque thing it improves on (optional)" },
  { field: "translations", meaning: "the same entry in other languages — never English-only" },
];
