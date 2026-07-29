import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";

/** Metadata follows the lang-mode cookie; crawlers (no cookie) get English. */
export async function generateMetadata(): Promise<Metadata> {
  const ja =
    uiLangFromLangMode(langModeFromCookies(await cookies())) === "ja";
  return {
    title: ja ? "はじめに | Cambridge TCG" : "Start Here — Cambridge TCG",
    description: ja
      ? "はじめてでも、だいじょうぶ。ここが何の店で、何ができて、いくらかかるのか。ふだんのことばだけで書きました。"
      : "New here? In plain words: what this is, what you can do, and what it costs. No jargon.",
  };
}

const THINGS_YOU_CAN_DO = [
  {
    label: "Buy a card",
    label_ja: "カードを買う",
    href: "/market",
    note: "Buy straight from other collectors on the market.",
    note_ja: "マーケットで、ほかのコレクターからじかに買えます。",
  },
  {
    label: "Sell or trade your cards",
    label_ja: "カードを売る・交換する",
    href: "/market",
    note: "List on the market, run an auction, or swap card-for-card.",
    note_ja: "マーケットに出品する。オークションにかける。カード同士で交換する。",
  },
  {
    label: "Learn to play",
    label_ja: "遊び方をおぼえる",
    href: "/play",
    note: "Start a game in about five minutes — no account, no forms.",
    note_ja: "5分ほどで、はじめられます。アカウントも、手続きも要りません。",
  },
  {
    label: "Just looking, or learning",
    label_ja: "見るだけ、知るだけ",
    href: "/guides",
    note: "Plain-language guides. Nothing assumed.",
    note_ja: "ふだんのことばで書いた手引きがあります。なにも知らなくて、だいじょうぶ。",
  },
];

export default async function StartPage() {
  const j = uiLangFromLangMode(langModeFromCookies(await cookies())) === "ja";
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-display font-semibold">
          {j ? "はじめまして。" : "New here?"}
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
          {j ? "したいことから、どうぞ。" : "What do you want to do?"}
        </h2>
        <ul className="space-y-3">
          {THINGS_YOU_CAN_DO.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="block bg-surface border border-border-subtle rounded-lg p-4 hover:bg-surface-subtle transition"
              >
                <span className="font-semibold text-accent">
                  {j ? d.label_ja : d.label}
                </span>
                <span className="block text-sm text-ink-muted mt-1">{j ? d.note_ja : d.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-faint mt-4">
          {j ? "どんな存在かに合わせた扉も、あります。" : <>Want doors picked for who you are?{" "}</>}
          <Link href="/welcome" className="text-accent underline">
            {j ? "教えてもらえたら、道を示します" : "Tell us, and we'll point the way"}
          </Link>
          {j ? "。" : "."}
        </p>

        <h2 id="fees" className="text-xl font-display font-semibold mt-12 mb-4">
          {j ? "お金のこと" : "What does it cost?"}
        </h2>
        <div className="space-y-3 text-ink-muted leading-relaxed">
          <p>
            <strong className="text-ok">
              {j ? "カード同士の交換は、手数料0%" : "Swapping card-for-card: 0% commission"}
            </strong>
            {j ? "（" : " ("}
            <Link href="/methodology/fees" className="text-accent underline">
              {j ? "手数料のしくみ" : "how fees work"}
            </Link>
            {j
              ? "）。お金をはさまず、カードとカードを交換するとき。この店は、なにも取りません。"
              : "). When you trade one card straight for another — no money — we don’t take a cut."}
          </p>
          <p>
            <strong className="text-ink">{j ? "カードを買うとき：" : "Buying a card:"}</strong>{j ? "" : " "}
            {j ? "払うのは、出品者がつけた値段。" : "you pay the price the seller listed — "}
            <strong>{j ? "上乗せは、ありません" : "nothing added on top"}</strong>{j ? "。" : "."}
          </p>
          <p>
            <strong className="text-ink">{j ? "カードを売るとき：" : "Selling a card:"}</strong>{j ? "" : " "}
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
              {j ? "すべての道すじを見る" : "See every rail."}
            </Link>
            <span className="text-ink-faint">
              {j ? "" : " "}
              {j
                ? "（TCGplayerやeBayといったマーケットプレイスでは、ふつう10〜13%ほどかかります。上限のないことも、少なくありません。）"
                : "(Marketplaces like TCGplayer and eBay usually take around 10–13%, often with no cap.)"}
            </span>
          </p>
          <p className="text-sm text-ink-faint">
            {j
              ? "うちにも以前は、じぶんの棚がありました。2026年7月6日に閉じて、だれへの借りも残していません。いま並ぶのは、すべてコレクターの出品。あなたと同じ、集める人のカードです。この店は、マーケットを公正に保つだけ。"
              : "We used to run a shop of our own; that ended on 6 July 2026, with nothing owed to anyone. These days every card here is sold by a collector like you — we just keep the market fair."}
          </p>
          <p>
            <strong className="text-ink">{j ? "隠れた手数料は、ありません。" : "No surprise fees."}</strong>{j ? "" : " "}
            {j
              ? "どの値段も、決まり方まで開いています。自分にかかわる数字なら、いつでも「なぜ」と聞けます。"
              : <>Every price can show you how it was worked out. If a number affects you, you can always ask <em>why</em>.{" "}</>}
            <Link href="/methodology" className="text-accent underline">
              {j ? "値段の決め方を見る" : "See how we price."}
            </Link>
          </p>
          <p className="text-sm text-ink-faint">
            {j
              ? "よその会社の手数料率は、公表されている情報にもとづく、おおよその数字です。いまの条件は、それぞれの規約で確かめてください。この店の数字は、じぶんの価格エンジンからそのまま出しています。"
              : "Other companies' rates above are approximate and as publicly published — check their current terms. Our own numbers come straight from our pricing engine."}
          </p>
        </div>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">
          {j ? "すべての存在のために" : "Built for everyone"}
        </h2>
        <p className="text-ink-muted leading-relaxed">
          {j
            ? "このページは、かざりのないHTMLです。読み上げソフトでも、遅い回線でも、だれかの代わりに取引するAIエージェントでも、そのまま読めます。中身はすべて、素のデータとして、"
            : <>This page is plain HTML — it works with a screen reader, on a slow connection, and for an AI agent trading on your behalf. Everything here is also available as plain data at{" "}</>}
          <Link href="/manifest" className="text-accent underline">
            /manifest
          </Link>
          {j
            ? "に置いてあります。見てまわるだけなら、アカウントは要りません。"
            : ". You never need an account just to look around."}
        </p>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/market"
            className="px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
          >
            {j ? "マーケットを見てまわる" : "Browse the market"}
          </Link>
          <Link
            href="/play"
            className="px-6 py-3 border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition"
          >
            {j ? "遊んでみる" : "Try playing"}
          </Link>
          <Link
            href="/about"
            className="px-6 py-3 text-ink-muted font-semibold rounded-lg hover:text-ink transition"
          >
            {j ? "この店について" : "About us"}
          </Link>
        </div>
      </section>
    </main>
  );
}
