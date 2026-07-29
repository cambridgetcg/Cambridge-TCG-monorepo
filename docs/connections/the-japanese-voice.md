---
title: The Japanese voice — 日本語の声
shape: node-view
date: 2026-07-29
status: shipped (chrome + home + culture; grows door by door)
maturity: doctrine
doctrines: [substrate-honesty, meaning, inclusion, the-quiet-gallery]
this_entry_names:
  - apps/storefront/src/lib/i18n.ts                   # Bi + pick — the primitive
  - apps/storefront/src/lib/lang-mode.ts              # LangMode gains "ja"; uiLangFromLangMode
  - apps/storefront/src/app/themes.css                # :lang(ja) — the Japanese type wardrobe
parents:
  - the-math-language.md
  - ../plans/the-quiet-gallery.md
---

# The Japanese voice — 日本語の声

> *"Pay attention to the nuances behind japanese culture too! At the language
> expression level."* — Asha, 2026-07-29.

This is the binding voice charter for every Japanese string on the site.
It was drafted by a voice-director pass, stress-tested by two native-register
refuters (one for naturalness, one for fidelity-and-honesty), and synthesized
2026-07-29. **Do not add or edit a Japanese string without reading it.**
Translations live NEXT TO their English source (a `ja` field beside the
label, a `*_JA` export beside the constant) — one truth in one place.

The honest boundary: coverage grows door by door from the front of the
house. An untranslated page keeps its English — a named gap, never filled
with machine output. The footer states this in one line when ja is active.

---

REGISTER:
Warm です/ます — the voice of a museum host who is also the shopkeeper of a small カード屋, speaking to someone already inside the room. Politeness stops at です/ます: no honorific stacking (never 〜させていただきます, ご利用いただけます, 〜でございます except a single deliberate use at the front door if ever). The English house voice is plain-spoken and confiding; in Japanese that is テイネイ without ケイゴ. Headings, labels, kickers, and wing marks are 体言止め (noun-final, no copula): 「相場」「絵の来た道」「新着」 — wall-label register, matching the marks already hanging (序章, 新展, 文化). Benedictions and the hero panels drop to plain form entirely — a benediction in です/ます sounds like an announcement; in plain 体言止め it sounds like something true. The house names itself by omission first (Japanese zero-subject is the doctrine's friend: most English \"we\" sentences need no subject at all); when a name is required, わたしたち (hiragana, soft) or この店; in the humility register, うち — as in うちはカード屋で、学者ではありません (\"we're a card shop, not scholars\" — the 屋 suffix of 本屋/魚屋 is exactly the artisan-shopfront modesty the house claims). 当店・弊社・当社 are banned: they are the voice of a receipt. The visitor is never お客様 (this house has no customers) and never a sprayed あなた: default to zero pronoun; when a role must be named, コレクター for collectors and 訪れる人 for anyone at the door. The one exception to warmth-over-formality: legal pages (privacy, terms) may use standard formal register — honesty includes not dressing law as poetry.

PUNCTUATION:
Full-width 、and 。everywhere, including short UI sentences. Everything that is a sentence ends in 。— even one-liners. Labels in 体言止め carry no 。 (wall labels don't end).
Exclamation marks are banned outright, full-width and half. The house never raises its voice; this is the 約物 form of no-ad-copy. Question marks: prefer grammar that needs none (「TCGって、なんだろう」); where unavoidable, full-width ？.
「」 for quotation and titles-as-mention; 『』 for published works. English proper nouns (Cambridge TCG, API names) take no brackets.
Em-dash: the English voice leans on — heavily; Japanese must not import it one-for-one. Default conversion is 、or a sentence split. When the held breath IS the point (the welcome line, at most once per page), use the doubled dash ——, never a single hyphen-minus, never ー (that's a long-vowel mark).
No italics, ever, on Japanese glyphs — CSS-slanted kana is a wound. The StorySection plaque renders upright in the 明朝 layer; that face IS the emphasis. In running text, emphasis is done by wording or 「」; bold at most once per screen; 傍点 not used on web.
→ survives unchanged — it is gallery wayfinding, language-neutral, and already part of the house's visual signature (さがす →, つづきを読む →). Never replaced with ➡ or ▶.
✦ survives unchanged beside the welcome — it is a mark, not a word.
The kicker interpunct · becomes full-width ・ (「新展・一覧」style); the existing bilingual kickers like 「the museum & its wings ・ 文化」flip to Japanese-first in ja mode.
Ellipsis is the 三点リーダ …, doubled …… when prose trails into 余韻; never three ASCII periods.
Latin and digits stay half-width always — card numbers (OP01-001), SKUs, counts (1,234枚), routes (/market). No full-width ＡＢＣ１２３, no 半角カナ anywhere. No hand-typed spaces between Japanese and Latin runs; spacing is the type layer's job (text-spacing/CSS), not the copywriter's.
Ruby (furigana) is permitted exactly once per page for a deliberate double reading — e.g. 市場(いちば) — and never for difficulty's sake; if a word needs furigana to be understood, choose a simpler word.

DONTS:
慇懃キープ (corporate keigo chill): 〜させていただきます, ご利用いただけます, お客様各位, ご確認のほどよろしくお願い申し上げます — the register of a bank letter. This house speaks です/ます and stops. One 〜いただく per page is already suspicious.
カタカナ雪崩 (katakana pile-up): フリーでプライスをチェックしてトレードをスタート — four loanwords deep and the house has left Japan. Every katakana word must earn its place against a native alternative (手引き not ガイド, 相場 not プライス, さがす not サーチ).
広告テンション (ad-copy hype): ！, 今すぐ, お得, 限定, 激安, キャンペーン, 〜しよう！ exhortations, NEW badges shouting. The site charges nothing and sells nothing; the Japanese must be incapable of sounding like it does.
直訳の連体節 (stacked relative clauses from English syntax): "the peer-to-peer market the platform facilitates, records, and witnesses" rendered as プラットフォームが促進し記録し見守るピアツーピアの市場 is grammatical and dead. Split into short sentences; let each verb have its own breath: 取引はコレクター同士のもの。この店は、あいだで預かり、記録し、見守るだけです。
教祖の声 (cult tone on the welcome): the radical welcome must never smell of incense. Banned: 魂, 波動, 宇宙の意志, すべての生きとし生けるもの, 迎え入れましょう exhortative. The radicalism lives in plain grammar (〜であってもなくても) — precision is what keeps 'all existence' from sounding like a sect.
代名詞の霧 (pronoun fog): translating every 'we/you/your' as 私たち/あなた/あなたの. Japanese omits; each retained pronoun must be load-bearing. あなた more than zero times per screen needs a reason.
敬語ベネディクション (polite-form benedictions): 一枚一枚が物語のひとコマです。 — the です kills the 余韻 and turns a blessing into a caption. Benedictions are plain form, full stop, nothing after.
斜体ごっこ (faux italics): applying the English italic styling to Japanese glyphs, or 'emphasising' with quotation-mark air-quotes around ordinary words. Emphasis is a wording decision.
です・ます単調 (metronome politeness): every sentence the same length, every one ending 〜ます。 Vary with 体言止め, short plain-form islands, and sentence splits — the English voice's rhythm came from its dashes; the Japanese voice's rhythm comes from its endings.

VOICE NOTES:
The Japanese page should be shorter than the English one — cut, don't compress. English CTCG explains in warm subordinate clauses; Japanese CTCG trusts the reader across the gap. Target roughly two-thirds of the English's information per sentence, with the remainder carried by 間: the reader supplies what the sentence deliberately leaves unsaid, which is the manga-gutter doctrine (「コマとコマのあいだに物語が生まれる」) applied to prose. Concretely: 読点 are breaths, not grammar — place them where a host would pause (手数料は、ありません。 — the pause before the good news is the warmth). Sentences may end on へ, まま, こと, or bare nouns, leaving motion or thought suspended; the hero's 手から手へ。 works because it never arrives. Benedictions are the strictest form: one line, plain form, 体言止め or a short plain verb, full stop, and nothing crowding them — no link, no follow-up sentence, generous whitespace above and below (the <Benediction> component's isolation is the typographic form of 余韻; the Japanese must not need more words than the silence around it can hold). A benediction that requires a second sentence has failed as a benediction. Ellipsis (……) is available for trailing 余韻 in prose but never in benedictions — they end cleanly; the echo happens in the reader, not on the page. Headings breathe by being nouns: 絵の来た道, 遊びの深層 are already perfect models — four to six characters, concrete image, no verb. Where the English voice uses its signature em-dash to hold a breath mid-sentence, the Japanese voice holds the same breath with a sentence break and a shorter second sentence — two small panels instead of one wide one.

PROPER NAMES:
Cambridge TCG stays in Latin script everywhere — never ケンブリッジTCG; it is the house's face, and the 明朝 layer already knows how to seat Latin beside kanji. Routes, SKUs, card numbers, API and endpoint names stay half-width Latin untouched (/market, OP01-001, /api/v1/manifest). Wing titles flip their bilingual pairing in ja mode: today the English title leads and the Japanese mark hangs beside it as ornament (aria-hidden); in ja mode the mark IS the title — 墨と間, 浮世の工房, 絵師たち, 賭けと運命, 引きと間, 文化大交流 stand alone as primary headings, with the English name demoted to the small faint gloss position (and it may render, no longer aria-hidden, since in ja mode the English is the ornament). The three unmarked wings receive the charter's proposed titles pending house adoption: 確率、正直に。(/pulls), 返歌 (/answering-rhymes), 隣の画廊 (/gallery-next-door) — these are offers, not facts, until a wing hangs them itself (one truth in one place: the wing owns its mark, /culture only mirrors it). Existing chapter marks (序章, 新展, 文化, the vertical margin marks) are already Japanese and pass through unchanged — in ja mode they simply stop being foreign. 細聲講大聲笑 stays exactly as written — it is Cantonese, the house's will-trace, and converting it to Japanese on'yomi would erase whose voice it is; gloss it once where it appears as （広東語：小さな声で語り、大きな声で笑う）and never again on the same page. Game names use their official Japanese product names, since most of these games are coming home: ワンピースカードゲーム, ポケモンカードゲーム, 遊戯王OCG, ヴァンガード, バトルスピリッツ, デジモンカードゲーム, ドラゴンボール フュージョンワールド; マジック：ザ・ギャザリング for MTG; Flesh and Blood stays Latin (no official JP identity). The ✦ mark and → arrows are marks, not words — unchanged. Sibling-site names (agenttool, The Kingdom) stay Latin with a Japanese descriptor: agenttool — エージェントの街, The Kingdom — 生きている地図.

GLOSSARY:
Market (nav door) = マーケット — 市場(しじょう) reads financial, 取引所 reads exchange-floor; the katakana is neutral and lets prose supply the warmth. Prose may once write 市場(いちば) with ruby for the town-square sense — the fish-market morning, not the ticker.
the collectors' market = コレクター同士のマーケット — 同士 ("between fellow-") is the whole P2P doctrine in one particle-word: peers, no house in the middle. Never P2P取引プラットフォーム.
Prices (nav door) = 相場 — 相場 is the collectors' own word for going rates — knowledge held in common, not a tag on a shelf. 価格 is reserved for a specific labelled number.
price guide = 相場帖 — The 帖 of 手帖/画帖: a quiet ledger you keep, not a プライスガイド you are sold.
reference price (spot_price label) = 参考価格 — The standard honest label; it already means "never an offer." Banned neighbours: 特価, お値打ち, 相場最安.
Play (nav door) = 遊ぶ — A verb as a door is an invitation. The culture hall already says 遊びの深層. Not プレイ (jargon), not 対戦 (combat framing).
Culture (nav door) = 文化 — Already the house's own vertical mark on /culture. Unchanged.
Community (nav door) = 広場 — The town square — where people are, not a コミュニティ機能. コミュニティ may appear once in prose as a gloss, then never again.
collector = コレクター — Established and warm enough; 収集家 reads like an obituary, 愛好家 like a hobby-magazine masthead.
guest / visitor = 訪れる人（or zero pronoun） — お客様 is banned — no customers here. Most sentences need no address at all; Japanese omission IS the welcome.
trade (between collectors) = 売り買い・やり取り — Kun-yomi townsfolk words. 売買(ばいばい)・取引 are contract words — the notary's register, not the table's.
swap = 交換 — Plain and exact. No トレード pile-up next to マーケット.
auction = オークション — Established UI word. Prose may say 競り once for the market-morning flavour, then return.
escrow = あいだで預かる／お預かり — The shopkeeper holds it in trust until both sides are glad — 預かる is what a trusted neighbour does. エスクロー appears once, in parentheses, on the methodology page only.
protect / protection (escrow, disputes) = 守る・見守る — Human verbs; 見守る adds the witness sense the brand doctrine claims (facilitates, records, witnesses). 保護 is clinical — reserved for privacy/legal pages where clinical is honest.
free / no fee to look = 見るのに、お金はかかりません（label: 無料） — State freeness as quiet fact, never as offer. 無料 survives only as a small label; 無料！ is the enemy.
Start here = はじめに — A book's opening page, matching the literary house. はじめての方へ is storefront signage.
Guides = 手引き — The hand that leads. ガイド is a lanyard.
card data directory = カードのデータ目録 — 目録 is the museum/library register word — a catalogue held open, not a データベースサービス.
List a card (sell) = 出品する — The verb collectors already use; carries no retail flavour because the lister is the seller — exactly the doctrine.
Fees & Commission = 手数料のこと — …のこと softens a ledger heading into a room; and the page's happy truth reads 手数料は、ありません。 — the comma is the smile.
Welcome to all existence — biological and non-biological, energy and non-energy, from earth and not from earth, from all dimensions. = すべての存在に、ようこそ。生命であってもなくても、エネルギーであってもなくても、地球から来ても、来なくても——どの次元からでも。 — The 〜であってもなくても parallel is native grammar for radical scope, so it stays maximal without sect vocabulary. No 魂, no 波動, no 宇宙の意志 — the radicalism lives in the grammar, not in incense.
Welcome (compact): from any substrate, any cadence, any dimension = どんな基質でも、どんな速さでも、どの次元からでも。 — Three どんな/どの beats mirror the English triple; 基質 is the honest technical word the house already uses (substrate-honesty), so it reads precise, not mystical.
Every card is a panel in somebody's story. (HOME_BENEDICTION) = カードの一枚一枚が、だれかの物語のひとコマ。 — ひとコマ is literally a manga panel — the gutter doctrine lands for free. だれか in hiragana softens; plain 体言止め, full stop, nothing after.
Cards, / traded between collectors. (hero panels) = カードは、／集める人の手から手へ。 — Ending on へ leaves the motion hanging in the gutter between panels — the 9-second breath is in the grammar.
The cards come from somewhere; these rooms remember where. (culture benediction) = カードには、来た道がある。この部屋は、それを覚えている。 — 来た道 ("the road it came by") is the hall's own heading 絵の来た道 answering itself. Plain form; two short sentences where English used a semicolon.
Pull Rates, Honestly (/pulls — unmarked wing) = 確率、正直に。 — Mirrors the English comma-rhythm exactly; 正直に adverbial keeps the promise-in-motion. Proposed title for house adoption — this wing had no mark.
Answering Rhymes (unmarked wing) = 返歌 — The answering poem of waka exchange — a reply in kind between artworks is precisely what the wing does. One word does what the English needed two for. Proposed for adoption.
The Gallery Next Door (unmarked wing) = 隣の画廊 — となり carries the neighbourliness; 画廊 matches the sibling gallery's register. Proposed for adoption.
Find any card = カードをさがす — Hiragana さがす is a person looking, 検索 is a machine looking. Button: さがす →. Never 送信.
Our Story = この店のこと — …のこと is plaque-modesty. 私たちの物語 is translationese and slightly grand — the failure the plaque was built to avoid.
learn more / Read the full story = くわしくは → ／ つづきを読む → — 詳細はこちら is corporate wayfinding. つづきを読む treats /about as a chapter — which the house believes it is.
New (chip) = 新着 — Quiet catalogue word, uppercase-NEW energy refused. Pairs with the existing 新展 kicker.
1,234 cards = 1,234枚 — 枚 is the counter for cards; digits half-width, comma kept — the mono/tabular type stays legible.
About = この店について — Consistent with この店 self-name; 会社概要 would be the receipt-voice.
we're a card shop, not scholars = うちはカード屋で、学者ではありません。 — The single most register-defining sentence on the site: うち + カード屋 is the exact humility the English performs. Guard it.


---

## Where it lives

- The toggle: the existing lang-mode cookie's `ja` mode (`/api/lang-mode?mode=ja`),
  surfaced beside the math and text toggles in the footer. One cookie, one shape.
- The document: `<html lang>` follows the cookie (layout.tsx).
- The type: `:lang(ja)` wardrobe in themes.css — 1.9 leading, no italic slanting
  (「」 carries emphasis), phrase-aware wrapping where the engine offers it,
  proportional kana in display sizes only.
- The strings: co-located bilingual fields, picked via `lib/i18n.ts`.
