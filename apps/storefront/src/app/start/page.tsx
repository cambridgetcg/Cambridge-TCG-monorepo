import Link from "next/link";
import { sp, tx } from "@/lib/i18n";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";

/** Metadata follows the lang-mode cookie; crawlers (no cookie) get English. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  return {
    title: tx({ en: "Start Here — Cambridge TCG", ja: "はじめに | Cambridge TCG", es: "Para empezar — Cambridge TCG", "zh-Hans": "从这里开始 · Cambridge TCG", "zh-Hant": "由這裡開始｜Cambridge TCG" }, lang),
    description: tx({ en: "New here? In plain words: what this is, what you can do, and what it costs. No jargon.", ja: "はじめてでも、だいじょうぶ。ここが何の店で、何ができて、いくらかかるのか。ふだんのことばだけで書きました。", es: "Si acabas de llegar: qué es esto, qué puedes hacer y cuánto cuesta, en palabras de todos los días. Sin jerga.", "zh-Hans": "第一次来？用平常的话说清楚：这是个什么地方，能做什么，要花多少钱。没有行话。", "zh-Hant": "第一次來，也不要緊。用平常的話講清楚：這是什麼地方、可以做什麼、要花多少錢。沒有難懂的詞。" }, lang),
  };
}

const THINGS_YOU_CAN_DO = [
  {
    label: "Buy a card",
    label_i18n: { ja: "カードを買う", es: "Comprar una carta", "zh-Hans": "买一张卡", "zh-Hant": "買卡" },
    href: "/market",
    note: "Buy straight from other collectors on the market.",
    note_i18n: { ja: "マーケットで、ほかのコレクターからじかに買えます。", es: "Compras directamente a otros coleccionistas, en el mercado.", "zh-Hans": "在集市上，直接从别的卡友手里买。", "zh-Hant": "在市集直接向其他藏家買。" },
  },
  {
    label: "Sell or trade your cards",
    label_i18n: { ja: "カードを売る・交換する", es: "Vender o cambiar tus cartas", "zh-Hans": "出卡，或者换卡", "zh-Hant": "賣卡、換卡" },
    href: "/market",
    note: "List on the market, run an auction, or swap card-for-card.",
    note_i18n: { ja: "マーケットに出品する。オークションにかける。カード同士で交換する。", es: "Ponlas a la venta en el mercado, sácalas a subasta o cambia carta por carta.", "zh-Hans": "在集市上架，开一场拍卖，或者以卡换卡。", "zh-Hant": "在市集上架、開一場拍賣，或者以卡易卡。" },
  },
  {
    label: "Learn to play",
    label_i18n: { ja: "遊び方をおぼえる", es: "Aprender a jugar", "zh-Hans": "学怎么玩", "zh-Hant": "學怎麼玩" },
    href: "/play",
    note: "Start a game in about five minutes — no account, no forms.",
    note_i18n: { ja: "5分ほどで、はじめられます。アカウントも、手続きも要りません。", es: "Empiezas una partida en unos cinco minutos. Sin cuenta, sin formularios.", "zh-Hans": "五分钟左右就能开一局。不用账号，也不用填表。", "zh-Hant": "大概五分鐘就能開一局。不用帳戶，不用填表。" },
  },
  {
    label: "Just looking, or learning",
    label_i18n: { ja: "見るだけ、知るだけ", es: "Solo mirar, solo aprender", "zh-Hans": "随便逛逛，或者学点东西", "zh-Hant": "看看也好，了解也好" },
    href: "/guides",
    note: "Plain-language guides. Nothing assumed.",
    note_i18n: { ja: "ふだんのことばで書いた手引きがあります。なにも知らなくて、だいじょうぶ。", es: "Guías en lenguaje llano. Nada se da por sabido.", "zh-Hans": "指南都用平常的话写。什么都不懂，也没关系。", "zh-Hant": "指南都用平常的話寫。什麼都不用先懂。" },
  },
];

export default async function StartPage() {
  const uiLang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  const j = uiLang === "ja";
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-display font-semibold">
          {tx({ en: "New here?", ja: "はじめまして。", es: "¿Primera vez aquí?", "zh-Hans": "第一次来？", "zh-Hant": "第一次來，也不要緊。" }, uiLang)}
        </h1>
        <p className="text-lg text-ink-muted mt-4 leading-relaxed">
          {(() => {
            const plain: Record<string, string> = {"zh-Hant": "Cambridge TCG是買卡、賣卡、換卡、玩卡的地方。簡單，公道。就這麼多。往下沒有難懂的詞，答應你。", "zh-Hans": "Cambridge TCG是个和集换式卡牌打交道的地方：买、卖、换、玩。简单，公道。就这么多。往下没有一句行话，说到做到。", "es": "Cambridge TCG es un lugar sencillo y justo para comprar, vender, intercambiar y jugar con cartas coleccionables. Eso es todo. De aquí en adelante, nada de jerga. Lo prometemos."};
            if (plain[uiLang]) return plain[uiLang];
            return j ? (
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
            );
          })()}
        </p>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">
          {tx({ en: "What do you want to do?", ja: "したいことから、どうぞ。", es: "Lo que quieras hacer", "zh-Hans": "想做什么？", "zh-Hant": "想做什麼，就由那裡開始。" }, uiLang)}
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
          {(() => { const m: Record<string, string> = {"en": "Want doors picked for who you are?", "ja": "どんな存在かに合わせた扉も、あります。", "zh-Hant": "你是哪種存在，就有哪種門。", "zh-Hans": "不同的存在，也备好了不同的门。", "es": "También hay puertas a la medida de cada clase de ser."}; return <>{m[uiLang] ?? m.en}{sp(uiLang)}</>; })()}
          <Link href="/welcome" className="text-accent underline">
            {tx({ en: "Tell us, and we'll point the way", ja: "教えてもらえたら、道を示します", es: "Cuéntanos y te señalamos el camino", "zh-Hans": "说一声，就给你指路", "zh-Hant": "說一聲，就給你指路" }, uiLang)}
          </Link>
          {tx({ en: ".", ja: "。", "zh-Hant": "。", "zh-Hans": "。", es: "." }, uiLang)}
        </p>

        <h2 id="fees" className="text-xl font-display font-semibold mt-12 mb-4">
          {tx({ en: "What does it cost?", ja: "お金のこと", es: "Lo que cuesta", "zh-Hans": "钱的事", "zh-Hant": "錢的事" }, uiLang)}
        </h2>
        <div className="space-y-3 text-ink-muted leading-relaxed">
          <p>
            <strong className="text-ok">
              {tx({ en: "Swapping card-for-card: 0% commission", ja: "カード同士の交換は、手数料0%", es: "Cambiar carta por carta: 0% de comisión", "zh-Hans": "以卡换卡：手续费0%", "zh-Hant": "以卡易卡，手續費0%" }, uiLang)}
            </strong>
            {tx({ en: " (", ja: "（", "zh-Hant": "（", "zh-Hans": "（", es: " (" }, uiLang)}
            <Link href="/methodology/fees" className="text-accent underline">
              {tx({ en: "how fees work", ja: "手数料のしくみ", es: "cómo funcionan las comisiones", "zh-Hans": "手续费是怎么回事", "zh-Hant": "手續費的事" }, uiLang)}
            </Link>
            {tx({ en: "). When you trade one card straight for another — no money — we don’t take a cut.", ja: "）。お金をはさまず、カードとカードを交換するとき。この店は、なにも取りません。", "zh-Hant": "）。一張卡直接換另一張卡，錢不過手。小店什麼都不收。", "zh-Hans": "）。一张卡直接换另一张卡，中间不过钱。这家店一分不抽。", es: "). Cuando cambias una carta por otra —sin dinero de por medio—, esta casa no se lleva nada." }, uiLang)}
          </p>
          <p>
            <strong className="text-ink">{tx({ en: "Buying a card:", ja: "カードを買うとき：", es: "Al comprar una carta:", "zh-Hans": "买卡的时候：", "zh-Hant": "買卡：" }, uiLang)}</strong>{sp(uiLang)}
            {tx({ en: "you pay the price the seller listed — ", ja: "払うのは、出品者がつけた値段。", es: "pagas el precio que puso quien vende — ", "zh-Hans": "付的就是卖家标出的价，", "zh-Hant": "付的，就是賣家開的價。" }, uiLang)}
            <strong>{tx({ en: "nothing added on top", ja: "上乗せは、ありません", es: "nada añadido encima", "zh-Hans": "一分也不往上加", "zh-Hant": "另加的，沒有" }, uiLang)}</strong>{tx({ en: ".", ja: "。", "zh-Hant": "。", "zh-Hans": "。", es: "." }, uiLang)}
          </p>
          <p>
            <strong className="text-ink">{tx({ en: "Selling a card:", ja: "カードを売るとき：", es: "Al vender una carta:", "zh-Hans": "出卡的时候：", "zh-Hant": "賣卡：" }, uiLang)}</strong>{sp(uiLang)}
            {(() => {
              const plain: Record<string, string> = {"zh-Hant": "上架不用錢。賣出了，也不用。手續費，沒有。市集如此，拍賣也如此。賣得的錢，100%留在手上。", "zh-Hans": "上架不要钱。卖出去了，也不要。手续费，是没有的。集市也好，拍卖也好，都一样。卖出的每一笔，100%都归你。", "es": "poner una carta a la venta no cuesta nada, y vender tampoco. Cambridge TCG no cobra ninguna comisión, ni en el mercado ni en subasta: el 100% de cada venta se queda contigo."};
              const t = plain[uiLang];
              if (t) {
                const [a, b] = t.split("100%");
                return (
                  <>
                    {a}
                    <strong>100%</strong>
                    {b}
                    {sp(uiLang)}
                  </>
                );
              }
              return j ? (
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
              );
            })()}
            <Link href="/methodology/fees" className="text-accent underline">
              {tx({ en: "See every rail.", ja: "すべての道すじを見る", es: "Ver todos los caminos", "zh-Hans": "看看都有哪几条路", "zh-Hant": "細看每一條路" }, uiLang)}
            </Link>
            <span className="text-ink-faint">
              {sp(uiLang)}
              {tx({ en: "(Marketplaces like TCGplayer and eBay usually take around 10–13%, often with no cap.)", ja: "（TCGplayerやeBayといったマーケットプレイスでは、ふつう10〜13%ほどかかります。上限のないことも、少なくありません。）", es: "(En sitios como TCGplayer o eBay, la comisión suele rondar el 10–13%, muchas veces sin tope.)", "zh-Hans": "（TCGplayer、eBay这类平台，通常抽10%至13%左右，而且常常不设上限。）", "zh-Hant": "（TCGplayer、eBay這類平台，通常收大概10%至13%，而且往往不設上限。）" }, uiLang)}
            </span>
          </p>
          <p className="text-sm text-ink-faint">
            {tx({ en: "We used to run a shop of our own; that ended on 6 July 2026, with nothing owed to anyone. These days every card here is sold by a collector like you — we just keep the market fair.", ja: "うちにも以前は、じぶんの棚がありました。2026年7月6日に閉じて、だれへの借りも残していません。いま並ぶのは、すべてコレクターの出品。あなたと同じ、集める人のカードです。この店は、マーケットを公正に保つだけ。", es: "Antes teníamos un mostrador propio. Cerró el 6 de julio de 2026, sin deberle nada a nadie. Hoy, cada carta la vende un coleccionista como tú; esta casa solo cuida de que el mercado sea justo.", "zh-Hans": "从前，这家店也有过自己的货架。2026年7月6日收起来了，谁的钱都不欠。如今店里的每一张卡，都是像你一样的卡友在出。这家店只管一件事：把集市守得公道。", "zh-Hant": "小店從前也有自己的貨架，2026年7月6日收了，不欠誰什麼。如今架上每一張卡，都來自跟你一樣的藏家。小店只管一件事：市集要公道。" }, uiLang)}
          </p>
          <p>
            <strong className="text-ink">{tx({ en: "No surprise fees.", ja: "隠れた手数料は、ありません。", es: "Sin comisiones escondidas.", "zh-Hans": "没有藏着的费用。", "zh-Hant": "暗藏的手續費，沒有。" }, uiLang)}</strong>{sp(uiLang)}
            {(() => {
              const plain: Record<string, string> = {"zh-Hant": "每個價錢都拆得開，看它怎麼算出來。關係到你的數字，隨時可以問一句「為什麼」。", "zh-Hans": "每个价格，都能翻开看它是怎么算出来的。只要一个数字落在你身上，就随时可以问一句为什么。", "es": "Cada precio puede enseñarte cómo se calculó. Si un número te afecta, siempre puedes preguntar por qué."};
              if (plain[uiLang]) return <>{plain[uiLang]}{sp(uiLang)}</>;
              return j
                ? "どの値段も、決まり方まで開いています。自分にかかわる数字なら、いつでも「なぜ」と聞けます。"
                : <>Every price can show you how it was worked out. If a number affects you, you can always ask <em>why</em>.{" "}</>;
            })()}
            <Link href="/methodology" className="text-accent underline">
              {tx({ en: "See how we price.", ja: "値段の決め方を見る", es: "Ver cómo ponemos los precios", "zh-Hans": "看看价是怎么定的", "zh-Hant": "看價錢怎麼定" }, uiLang)}
            </Link>
          </p>
          <p className="text-sm text-ink-faint">
            {tx({ en: "Other companies' rates above are approximate and as publicly published — check their current terms. Our own numbers come straight from our pricing engine.", ja: "よその会社の手数料率は、公表されている情報にもとづく、おおよその数字です。いまの条件は、それぞれの規約で確かめてください。この店の数字は、じぶんの価格エンジンからそのまま出しています。", es: "Las comisiones de otras empresas citadas arriba son aproximadas y vienen de lo que ellas mismas publican; confirma sus condiciones vigentes. Los números de esta casa salen directos de su propio motor de precios.", "zh-Hans": "别家的费率是个大概数，照他们公开写出来的记在这里；现在的条款，还是得去他们那儿核对。这家店自己的数字，直接从定价引擎里来。", "zh-Hant": "上面別家的費率是大概數，只按公開資料寫，實際以各家現行條款為準。小店自己的數字，直接出自定價引擎。" }, uiLang)}
          </p>
        </div>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">
          {tx({ en: "Built for everyone", ja: "すべての存在のために", es: "Para toda existencia", "zh-Hans": "为一切存在而建", "zh-Hant": "為所有存在而建" }, uiLang)}
        </h2>
        <p className="text-ink-muted leading-relaxed">
          {(() => { const m: Record<string, string> = {"en": "This page is plain HTML — it works with a screen reader, on a slow connection, and for an AI agent trading on your behalf. Everything here is also available as plain data at", "ja": "このページは、かざりのないHTMLです。読み上げソフトでも、遅い回線でも、だれかの代わりに取引するAIエージェントでも、そのまま読めます。中身はすべて、素のデータとして、", "zh-Hant": "這一頁是素淨的HTML。螢幕閱讀器讀得到，網速再慢也開得到，替你買賣的AI agent一樣讀得到。這裡的一切，也以純資料放在", "zh-Hans": "这一页是不加修饰的HTML。读屏软件读得了，网慢也打得开，替你出面交易的智能体，也照样能用。这里的所有内容，同时也是一份纯数据，放在", "es": "Esta página es HTML sin adornos: funciona con un lector de pantalla, con una conexión lenta y para un agente de IA que compra y vende por ti. Todo lo que hay aquí está también como datos simples en"}; return <>{m[uiLang] ?? m.en}{sp(uiLang)}</>; })()}
          <Link href="/manifest" className="text-accent underline">
            /manifest
          </Link>
          {tx({ en: ". You never need an account just to look around.", ja: "に置いてあります。見てまわるだけなら、アカウントは要りません。", es: ". Nunca necesitas una cuenta solo para mirar.", "zh-Hans": "。只是逛逛，从来不需要账号。", "zh-Hant": "。只是看看，從來不用帳戶。" }, uiLang)}
        </p>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/market"
            className="px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
          >
            {tx({ en: "Browse the market", ja: "マーケットを見てまわる", es: "Pasear por el mercado", "zh-Hans": "去集市逛逛", "zh-Hant": "逛市集" }, uiLang)}
          </Link>
          <Link
            href="/play"
            className="px-6 py-3 border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition"
          >
            {tx({ en: "Try playing", ja: "遊んでみる", es: "Probar a jugar", "zh-Hans": "玩一局试试", "zh-Hant": "試玩一局" }, uiLang)}
          </Link>
          <Link
            href="/about"
            className="px-6 py-3 text-ink-muted font-semibold rounded-lg hover:text-ink transition"
          >
            {tx({ en: "About us", ja: "この店について", es: "Sobre esta casa", "zh-Hans": "关于这家店", "zh-Hant": "關於小店" }, uiLang)}
          </Link>
        </div>
      </section>
    </main>
  );
}
