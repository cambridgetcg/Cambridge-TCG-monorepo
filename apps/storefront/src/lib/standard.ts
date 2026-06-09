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
];

export const STANDARD_META = {
  name: "The Plain Standard",
  tagline: "Every rule — protocol to law — in plain words, in any language, free.",
  version: "0.1",
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
