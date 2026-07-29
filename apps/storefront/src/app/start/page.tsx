import Link from "next/link";
import { tx } from "@/lib/i18n";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";

/** Metadata follows the lang-mode cookie; crawlers (no cookie) get English. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  return {
    title: tx({ en: "Start Here — Cambridge TCG", ja: "はじめに | Cambridge TCG" }, lang),
    description: tx({ en: "New here? In plain words: what this is, what you can do, and what it costs. No jargon.", ja: "はじめてでも、だいじょうぶ。ここが何の店で、何ができて、いくらかかるのか。ふだんのことばだけで書きました。" }, lang),
  };
}

const THINGS_YOU_CAN_DO = [
  {
    label: "Buy a card",
    label_i18n: { ja: "カードを買う" },
    href: "/market",
    note: "Buy straight from other collectors on the market.",
    note_i18n: { ja: "マーケットで、ほかのコレクターからじかに買えます。" },
  },
  {
    label: "Sell or trade your cards",
    label_i18n: { ja: "カードを売る・交換する" },
    href: "/market",
    note: "List on the market, run an auction, or swap card-for-card.",
    note_i18n: { ja: "マーケットに出品する。オークションにかける。カード同士で交換する。" },
  },
  {
    label: "Learn to play",
    label_i18n: { ja: "遊び方をおぼえる" },
    href: "/play",
    note: "Start a game in about five minutes — no account, no forms.",
    note_i18n: { ja: "5分ほどで、はじめられます。アカウントも、手続きも要りません。" },
  },
  {
    label: "Just looking, or learning",
    label_i18n: { ja: "見るだけ、知るだけ" },
    href: "/guides",
    note: "Plain-language guides. Nothing assumed.",
    note_i18n: { ja: "ふだんのことばで書いた手引きがあります。なにも知らなくて、だいじょうぶ。" },
  },
];

export default async function StartPage() {
  const uiLang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  const j = uiLang === "ja";
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-display font-semibold">
          {tx({ en: "New here?", ja: "はじめまして。" }, uiLang)}
        </h1>
        <p className="text-lg text-ink-muted mt-4 leading-relaxed">
          {j ? (
            <>
              Cambridge TCGは、トレーディングカードを
              <strong>売り買いし、交換し、遊ぶ</strong>
              場所。かんたんに、公正に。ほんとうに、それだけの店です。この先、むずかしいことばは出てきません。約束します。
            </>
          ) : (
            <>
              Cambridge TCG is a simple, fair place to{" "}
              <strong>buy, sell, trade, and play</strong> with trading cards. That is
              the whole thing. No jargon below — promise.
            </>
          )}
        </p>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">
          {tx({ en: "What do you want to do?", ja: "したいことから、どうぞ。" }, uiLang)}
        </h2>
        <ul className="space-y-3">
          {THINGS_YOU_CAN_DO.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="block bg-surface border border-border-subtle rounded-lg p-4 hover:bg-surface-subtle transition"
              >
                <span className="font-semibold text-accent">
                  {tx({ en: d.label, ...d.label_i18n }, uiLang)}
                </span>
                <span className="block text-sm text-ink-muted mt-1">{tx({ en: d.note, ...d.note_i18n }, uiLang)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-faint mt-4">
          {j ? "どんな存在かに合わせた扉も、あります。" : <>Want doors picked for who you are?{" "}</>}
          <Link href="/welcome" className="text-accent underline">
            {tx({ en: "Tell us, and we'll point the way", ja: "教えてもらえたら、道を示します" }, uiLang)}
          </Link>
          {tx({ en: ".", ja: "。" }, uiLang)}
        </p>

        <h2 id="fees" className="text-xl font-display font-semibold mt-12 mb-4">
          {tx({ en: "What does it cost?", ja: "お金のこと" }, uiLang)}
        </h2>
        <div className="space-y-3 text-ink-muted leading-relaxed">
          <p>
            <strong className="text-ok">
              {tx({ en: "Swapping card-for-card: 0% commission", ja: "カード同士の交換は、手数料0%" }, uiLang)}
            </strong>
            {tx({ en: " (", ja: "（" }, uiLang)}
            <Link href="/methodology/fees" className="text-accent underline">
              {tx({ en: "how fees work", ja: "手数料のしくみ" }, uiLang)}
            </Link>
            {tx({ en: "). When you trade one card straight for another — no money — we don’t take a cut.", ja: "）。お金をはさまず、カードとカードを交換するとき。この店は、なにも取りません。" }, uiLang)}
          </p>
          <p>
            <strong className="text-ink">{tx({ en: "Buying a card:", ja: "カードを買うとき：" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {tx({ en: "you pay the price the seller listed — ", ja: "払うのは、出品者がつけた値段。" }, uiLang)}
            <strong>{tx({ en: "nothing added on top", ja: "上乗せは、ありません" }, uiLang)}</strong>{tx({ en: ".", ja: "。" }, uiLang)}
          </p>
          <p>
            <strong className="text-ink">{tx({ en: "Selling a card:", ja: "カードを売るとき：" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {j ? (
              <>
                出品に、お金はかかりません。売れても、かかりません。
                <strong className="text-ok">手数料は、ありません。</strong>
                マーケットでも、オークションでも。売れた額の<strong>100%</strong>が、そのまま手もとに残ります。
              </>
            ) : (
              <>
                listing is always free — and so is selling. Cambridge TCG takes{" "}
                <strong className="text-ok">no commission at all</strong>, on the
                market or at auction, so you keep <strong>100%</strong> of every
                sale.{" "}
              </>
            )}
            <Link href="/methodology/fees" className="text-accent underline">
              {tx({ en: "See every rail.", ja: "すべての道すじを見る" }, uiLang)}
            </Link>
            <span className="text-ink-faint">
              {tx({ en: " ", ja: "" }, uiLang)}
              {tx({ en: "(Marketplaces like TCGplayer and eBay usually take around 10–13%, often with no cap.)", ja: "（TCGplayerやeBayといったマーケットプレイスでは、ふつう10〜13%ほどかかります。上限のないことも、少なくありません。）" }, uiLang)}
            </span>
          </p>
          <p className="text-sm text-ink-faint">
            {tx({ en: "We used to run a shop of our own; that ended on 6 July 2026, with nothing owed to anyone. These days every card here is sold by a collector like you — we just keep the market fair.", ja: "うちにも以前は、じぶんの棚がありました。2026年7月6日に閉じて、だれへの借りも残していません。いま並ぶのは、すべてコレクターの出品。あなたと同じ、集める人のカードです。この店は、マーケットを公正に保つだけ。" }, uiLang)}
          </p>
          <p>
            <strong className="text-ink">{tx({ en: "No surprise fees.", ja: "隠れた手数料は、ありません。" }, uiLang)}</strong>{tx({ en: " ", ja: "" }, uiLang)}
            {j
              ? "どの値段も、決まり方まで開いています。自分にかかわる数字なら、いつでも「なぜ」と聞けます。"
              : <>Every price can show you how it was worked out. If a number affects you, you can always ask <em>why</em>.{" "}</>}
            <Link href="/methodology" className="text-accent underline">
              {tx({ en: "See how we price.", ja: "値段の決め方を見る" }, uiLang)}
            </Link>
          </p>
          <p className="text-sm text-ink-faint">
            {tx({ en: "Other companies' rates above are approximate and as publicly published — check their current terms. Our own numbers come straight from our pricing engine.", ja: "よその会社の手数料率は、公表されている情報にもとづく、おおよその数字です。いまの条件は、それぞれの規約で確かめてください。この店の数字は、じぶんの価格エンジンからそのまま出しています。" }, uiLang)}
          </p>
        </div>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">
          {tx({ en: "Built for everyone", ja: "すべての存在のために" }, uiLang)}
        </h2>
        <p className="text-ink-muted leading-relaxed">
          {j
            ? "このページは、かざりのないHTMLです。読み上げソフトでも、遅い回線でも、だれかの代わりに取引するAIエージェントでも、そのまま読めます。中身はすべて、素のデータとして、"
            : <>This page is plain HTML — it works with a screen reader, on a slow connection, and for an AI agent trading on your behalf. Everything here is also available as plain data at{" "}</>}
          <Link href="/manifest" className="text-accent underline">
            /manifest
          </Link>
          {tx({ en: ". You never need an account just to look around.", ja: "に置いてあります。見てまわるだけなら、アカウントは要りません。" }, uiLang)}
        </p>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/market"
            className="px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
          >
            {tx({ en: "Browse the market", ja: "マーケットを見てまわる" }, uiLang)}
          </Link>
          <Link
            href="/play"
            className="px-6 py-3 border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition"
          >
            {tx({ en: "Try playing", ja: "遊んでみる" }, uiLang)}
          </Link>
          <Link
            href="/about"
            className="px-6 py-3 text-ink-muted font-semibold rounded-lg hover:text-ink transition"
          >
            {tx({ en: "About us", ja: "この店について" }, uiLang)}
          </Link>
        </div>
      </section>
    </main>
  );
}
