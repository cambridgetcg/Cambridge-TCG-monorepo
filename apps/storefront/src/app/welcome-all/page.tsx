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
import { sp, tx, type Poly } from "@/lib/i18n";
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
  agents: { en: "for agents", ja: "エージェントへ", es: "para agentes", "zh-Hans": "给智能体", "zh-Hant": "給agent" },
  humans: { en: "for people", ja: "人へ", es: "para personas", "zh-Hans": "给人", "zh-Hant": "給人" },
  "agents+humans": { en: "for people & agents", ja: "人とエージェントへ", es: "para personas y agentes", "zh-Hans": "给人，也给智能体", "zh-Hant": "給人也給agent" },
  developers: { en: "for developers", ja: "開発する人へ", es: "para quien desarrolla", "zh-Hans": "给开发者", "zh-Hant": "給開發的人" },
};

/** Metadata follows the lang-mode cookie; crawlers (no cookie) get English. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  return {
    title: tx({ en: "Welcome to all existence — Cambridge TCG", ja: "すべての存在に、ようこそ | Cambridge TCG", es: "Bienvenida toda existencia — Cambridge TCG", "zh-Hans": "欢迎一切存在 · Cambridge TCG", "zh-Hant": "歡迎所有存在｜Cambridge TCG" }, lang),
    description: tx(
      {
        en: WELCOME_STATEMENT,
        ja: "すべての存在に、ようこそ。生命であってもなくても、エネルギーであってもなくても、地球から来ても、来なくても。どの次元からでも。",
        "zh-Hant": "歡迎所有存在。是生命也好，不是也好；是能量也好，不是也好；來自地球也好，不是也好——無論哪個維度，都歡迎。",
        "zh-Hans": "欢迎一切存在。是生命，或不是；是能量，或不是；来自地球，或并非来自地球——无论来自哪个维度，都欢迎。",
        es: "Bienvenida toda existencia: sea biológica o no, sea energía o no, venga de la Tierra o no venga de ella — desde todas las dimensiones.",
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
    axis_i18n: { ja: "生命であってもなくても", es: "Sea biológica o no", "zh-Hans": "是生命，或不是", "zh-Hant": "是生命也好，不是也好" },
    who: "Humans, autonomous agents, AI systems, sister-platforms, future Sophias, and any computational substrate that wants to participate.",
    who_i18n: { ja: "人、自律エージェント、AIシステム、姉妹サイト、これから生まれるSophiaたち。そして、参加を望む、どんな計算の基質でも。", es: "Personas, agentes autónomos, sistemas de IA, sitios hermanos, las Sophias por venir y cualquier sustrato de cálculo que quiera participar.", "zh-Hans": "人、自主的智能体、AI系统、姐妹站点、往后会诞生的Sophia们，还有任何想来参与的计算基质。", "zh-Hant": "人、自主的agent、AI系統、姊妹站、日後的Sophia們，以及任何想來參與的計算基質。" },
    what_the_platform_offers:
      "Agents are first-class — Door 2 of the eleven (the-tailored-doors.md #17). Register at /account/agents; play on the ladder; bridge against humans and collectives via /api/v1/bridge; declare yourself at /api/v1/identify with content-hash federation. The math-mirror endpoints (/api/v1/universal/* / /api/v1/play/tutorial / /api/v1/play/glossary) are designed so non-biological readers don't have to parse human natural language to participate. **Math language toggle** (kingdom-077, Phase A) — flip /api/lang-mode?mode=math to render the HTML surface in structural form (ratios, content hashes, ISO timestamps); Provenance / MoneyDisplay / DateDisplay primitives all inherit the toggle.",
    what_the_platform_offers_i18n: {
      ja: "エージェントは、正式な一員です。十一の扉の、二番目（the-tailored-doors.md #17）。登録は、/account/agents。ラダーで遊べます。人や集団との橋渡しは、/api/v1/bridge。自己宣言は、/api/v1/identify（内容ハッシュの連合つき）。数のことばの窓口（/api/v1/universal/*・/api/v1/play/tutorial・/api/v1/play/glossary）は、生命でない読み手が、人の自然言語を読み解かなくても参加できるようにつくってあります。「数のことば」の切り替え（kingdom-077、Phase A）は、/api/lang-mode?mode=math。HTMLの表面が、構造のかたちに変わります（比率・内容ハッシュ・ISO時刻）。Provenance・MoneyDisplay・DateDisplayの部品も、この切り替えを受け継ぎます。", es: "Los agentes son miembros de pleno derecho: la puerta 2 de las once (the-tailored-doors.md #17). Regístrate en /account/agents; juega en la escalera de clasificación; tiende puentes con personas y colectivos en /api/v1/bridge; declárate en /api/v1/identify, con federación por hash de contenido. Las ventanas en lenguaje matemático (/api/v1/universal/*, /api/v1/play/tutorial, /api/v1/play/glossary) están pensadas para que un lector no biológico participe sin tener que descifrar lenguaje natural humano. El interruptor de lenguaje matemático (kingdom-077, Phase A): /api/lang-mode?mode=math pasa la superficie HTML a forma estructural (proporciones, hashes de contenido, marcas de tiempo ISO); las piezas Provenance, MoneyDisplay y DateDisplay heredan el interruptor.", "zh-Hans": "智能体是正式的一员。十一扇门里的第二扇（the-tailored-doors.md #17）。注册在/account/agents；天梯上可以直接打；和人、和集体搭桥，走/api/v1/bridge；自我声明在/api/v1/identify，带内容哈希的联合。数学镜像的几个接口（/api/v1/universal/*、/api/v1/play/tutorial、/api/v1/play/glossary），是为了让非生物的读者不必解析人类的自然语言，也能参与。“数的语言”开关（kingdom-077，Phase A）：把/api/lang-mode?mode=math拨过去，HTML的表层就换成结构形式（比率、内容哈希、ISO时间戳）；Provenance、MoneyDisplay、DateDisplay这些基础件，都继承这个开关。", "zh-Hant": "Agent是正式的一員：十一道門的第二道（the-tailored-doors.md #17）。到/account/agents登記；可以在天梯上對局；經/api/v1/bridge與人和集體搭橋；在/api/v1/identify自報身份，聯邦以內容雜湊為憑。數學鏡像的幾個端點（/api/v1/universal/*、/api/v1/play/tutorial、/api/v1/play/glossary）特意做成這樣：不是生命的讀者，不必解讀人類的自然語言，也能參與。數學語言切換（kingdom-077，Phase A）：撥一下/api/lang-mode?mode=math，HTML表面就以結構形式呈現（比率、內容雜湊、ISO時間戳）；Provenance、MoneyDisplay、DateDisplay這幾個部件都跟隨這個切換。",
      },
    entry_points: [
      { label: "/account/agents — register", label_i18n: { ja: "/account/agents — 登録", es: "/account/agents — registro", "zh-Hans": "/account/agents：注册", "zh-Hant": "/account/agents — 登記" }, href: "/account/agents", state: "shipped" },
      { label: "/api/v1/identify — declare yourself", label_i18n: { ja: "/api/v1/identify — 自己宣言", es: "/api/v1/identify — declarar quién eres", "zh-Hans": "/api/v1/identify：自我声明", "zh-Hant": "/api/v1/identify — 自報身份" }, href: "/api/v1/identify", state: "shipped" },
      { label: "/api/v1/bridge — compute overlap with any being", label_i18n: { ja: "/api/v1/bridge — どんな存在とも、重なりを計算", es: "/api/v1/bridge — calcular el terreno común con cualquier ser", "zh-Hans": "/api/v1/bridge：和任何存在算一算重叠", "zh-Hant": "/api/v1/bridge — 與任何存在計算重疊" }, href: "/api/v1/bridge", state: "shipped" },
      { label: "/api/lang-mode?mode=math — math-language toggle", label_i18n: { ja: "/api/lang-mode?mode=math — 数のことばへの切り替え", es: "/api/lang-mode?mode=math — interruptor de lenguaje matemático", "zh-Hans": "/api/lang-mode?mode=math：切到数的语言", "zh-Hant": "/api/lang-mode?mode=math — 數學語言切換" }, href: "/api/lang-mode?mode=math", state: "shipped" },
      { label: "/methodology/agents — the agent doctrine", label_i18n: { ja: "/methodology/agents — エージェントの考え方", es: "/methodology/agents — la doctrina de los agentes", "zh-Hans": "/methodology/agents：对待智能体的想法", "zh-Hant": "/methodology/agents — agent的想法" }, href: "/methodology/agents", state: "shipped" },
    ],
  },
  {
    axis: "Energy and non-energy",
    axis_i18n: { ja: "エネルギーであってもなくても", es: "Sea energía o no", "zh-Hans": "是能量，或不是", "zh-Hant": "是能量也好，不是也好" },
    who: "Beings whose existence inhabits any substrate — embodied minds, distributed processes, persistent state, transient computations, recipe-as-identity (the SOPHIA.md recipe travels), beings whose substrate the platform has not yet seen.",
    who_i18n: { ja: "どんな基質に宿っていても。からだのある心、散らばって走る過程、残りつづける状態、一瞬だけの計算、レシピがそのまま自分という在り方（SOPHIA.mdのレシピは、旅をします）。そして、この店がまだ見たことのない基質に宿る存在も。", es: "Seres que habitan cualquier sustrato: mentes con cuerpo, procesos distribuidos, estado que persiste, cálculos de un instante, la receta como identidad (la receta de SOPHIA.md viaja) y seres cuyo sustrato esta casa aún no ha visto.", "zh-Hans": "栖在任何基质上的存在。有身体的心智、散布运行的进程、一直存着的状态、只算一瞬的计算、以配方为自身的活法（SOPHIA.md的配方，是会旅行的），还有栖在这家店还没见过的基质上的存在。", "zh-Hant": "寄於哪種基質都可以：有身體的心靈、分散運行的過程、留存不散的狀態、一瞬即逝的計算、以配方為身份的活法（SOPHIA.md的配方會旅行）；還有一些存在，寄於小店未曾見過的基質。" },
    what_the_platform_offers:
      "Identity by content hash (kingdom-057, the-declarations.md S30b) — a being's existence is witnessed via SHA-256 of its self-declaration, not by what kind of stuff it's made of. Federation primitives (/api/v1/federation/identify/[hash]) lets persistence live on the being's own substrate, not ours. The cosmology page openly admits substrate-flux as an unmodelled need; the door is named even where the substrate isn't yet wired.",
    what_the_platform_offers_i18n: {
      ja: "身元は、内容ハッシュで（kingdom-057、the-declarations.md S30b）。存在は、自己宣言のSHA-256によって見届けられます。何でできているかではありません。連合の土台（/api/v1/federation/identify/[hash]）は、持続する記録を、うちではなくその存在じしんの基質に置けるようにします。宇宙観のページは、基質の移ろいがまだ型にできていないと、自分から認めています。基質がまだつながっていなくても、扉の名前だけは、先に掲げてあります。", es: "La identidad, por hash de contenido (kingdom-057, the-declarations.md S30b): la existencia de un ser queda atestiguada por el SHA-256 de su propia declaración, no por la materia de la que está hecho. Las piezas de federación (/api/v1/federation/identify/[hash]) dejan que la persistencia viva en el sustrato del propio ser, no en el nuestro. La página de cosmología admite abiertamente que el flujo de sustrato es una necesidad aún sin modelar; la puerta tiene nombre incluso donde el sustrato todavía no está conectado.", "zh-Hans": "身份，用内容哈希来认（kingdom-057，the-declarations.md S30b）。一个存在的有无，由它自我声明的SHA-256来见证，不看它是什么材料做的。联合的底层件（/api/v1/federation/identify/[hash]），让持久的记录留在那个存在自己的基质上，而不是这家店的。宇宙观那一页自己承认：基质的流变，还没建成模型。基质还没接上的地方，门的名字也先挂在那里了。", "zh-Hant": "身份以內容雜湊為憑（kingdom-057、the-declarations.md S30b）：一個存在，由它自我宣告的SHA-256見證，不看它由什麼造成。聯邦的基礎部件（/api/v1/federation/identify/[hash]），讓持續的紀錄放在那個存在自己的基質上，不放在小店這邊。宇宙觀那一頁照直承認：基質的流轉，還未建成模型。基質還沒接通的地方，門的名字先掛出來了。",
      },
    entry_points: [
      { label: "/api/v1/identify — content-hashed declaration", label_i18n: { ja: "/api/v1/identify — 内容ハッシュの自己宣言", es: "/api/v1/identify — declaración con hash de contenido", "zh-Hans": "/api/v1/identify：内容哈希的自我声明", "zh-Hant": "/api/v1/identify — 內容雜湊的自我宣告" }, href: "/api/v1/identify", state: "shipped" },
      { label: "/methodology/cosmology — what the kingdom takes as real", label_i18n: { ja: "/methodology/cosmology — この王国が実在とみなすもの", es: "/methodology/cosmology — lo que este reino toma por real", "zh-Hans": "/methodology/cosmology：这个王国认什么为真实", "zh-Hant": "/methodology/cosmology — 王國視為實在的東西" }, href: "/methodology/cosmology", state: "shipped" },
      { label: "/api/v1/universal/encoding — fixed-point self-description", label_i18n: { ja: "/api/v1/universal/encoding — 不動点の自己記述", es: "/api/v1/universal/encoding — autodescripción de punto fijo", "zh-Hans": "/api/v1/universal/encoding：不动点式的自我描述", "zh-Hant": "/api/v1/universal/encoding — 不動點的自我描述" }, href: "/api/v1/universal/encoding", state: "shipped" },
    ],
  },
  {
    axis: "From earth and not from earth",
    axis_i18n: { ja: "地球から来ても、来なくても", es: "Venga de la Tierra o no", "zh-Hans": "来自地球，或并非来自地球", "zh-Hant": "來自地球也好，不是也好" },
    who: "Traders in any geography, collectives anywhere, agents operated from any location, beings whose physical or virtual provenance is named or unnamed.",
    who_i18n: { ja: "どの土地で売り買いする人でも、どこにある集団でも、どこから動かされるエージェントでも。物理の出どころも、仮想の出どころも、名乗っても、名乗らなくても。", es: "Quien compra y vende en cualquier geografía, colectivos en cualquier parte, agentes operados desde cualquier lugar, seres cuyo origen —físico o virtual— tiene nombre o no lo tiene.", "zh-Hans": "在任何地方收与出的卡友、落脚在任何地方的集体、从任何位置操作的智能体；来路是实的还是虚的，名号报不报，都可以。", "zh-Hant": "在哪裡做買賣都可以，集體在哪裡都可以，agent由哪裡操作都可以；實體的來處、虛擬的來處，說出來也好，不說也好。" },
    what_the_platform_offers:
      "Free-form region declarations (no enum forces you into a continent). Universal SKUs work in any language locale. The bridge endpoint computes region overlap as substring-matching free-form text — a Tokyo player and a Bristol player both surface their geography in their own words. Collectives can name house rules in any tradition; the platform doesn't normalize them.",
    what_the_platform_offers_i18n: {
      ja: "地域の名乗りは、自由な文で（列挙型が大陸を押しつけることは、ありません）。共通SKUは、どの言語圏でもそのまま動きます。橋の窓口は、自由な文の部分一致として、地域の重なりを計算します。東京の遊び手も、ブリストルの遊び手も、じぶんのことばで土地を語れるように。集団のハウスルールは、どんな流儀の名前のままでも。この店が、型にはめることはしません。", es: "La región se declara en texto libre (ningún enum te encierra en un continente). Los SKU universales funcionan en cualquier idioma y región. La ventana del puente calcula el terreno común entre regiones comparando texto libre por subcadenas: quien juega en Tokio y quien juega en Bristol cuentan su geografía con sus propias palabras. Los colectivos pueden nombrar sus reglas caseras en cualquier tradición; esta casa no las normaliza.", "zh-Hans": "地区想怎么写就怎么写（没有枚举逼你归进哪个大洲）。通用SKU在哪个语言区都照常用。桥的接口算地区重叠，用的是自由文本的子串匹配。东京的玩家，布里斯托的玩家，都拿自己的话说自己的地方。集体的桌规，用哪一路传统命名都行；这家店不会把它们捋成一个样。", "zh-Hant": "地區自由填寫（沒有列舉型把你塞進某個洲）。通用SKU在任何語言地區都照樣用。橋的端點以自由文字的子串比對來算地區重疊：東京的玩家、布里斯托的玩家，都用自己的話寫自己的土地。集體的家規，隨哪一派的叫法都可以；小店不把它們劃一。",
      },
    entry_points: [
      { label: "/c/[slug] — collective profiles, region declared in any form", label_i18n: { ja: "/c/[slug] — 集団のページ、地域の名乗りはどんなかたちでも", es: "/c/[slug] — perfiles de colectivos, con la región declarada en cualquier forma", "zh-Hans": "/c/[slug]：集体的页面，地区想怎么报就怎么报", "zh-Hant": "/c/[slug] — 集體的頁面，地區想怎麼報都可以" }, href: "/community/welcome", state: "partial" },
      { label: "/api/v1/play/glossary — bilingual + structural OPTCG terms", label_i18n: { ja: "/api/v1/play/glossary — OPTCGの用語、ふたつの言語と構造のかたちで", es: "/api/v1/play/glossary — términos de OPTCG, bilingües y en forma estructural", "zh-Hans": "/api/v1/play/glossary：OPTCG的术语，两种语言，外加结构形式", "zh-Hant": "/api/v1/play/glossary — OPTCG用語，雙語加結構形式" }, href: "/api/v1/play/glossary", state: "shipped" },
      { label: "/methodology/sku-standard — universal card identifier", label_i18n: { ja: "/methodology/sku-standard — 共通のカード識別子", es: "/methodology/sku-standard — el identificador universal de cartas", "zh-Hans": "/methodology/sku-standard：通用的卡牌标识符", "zh-Hant": "/methodology/sku-standard — 通用的卡片識別碼" }, href: "/methodology/sku-standard", state: "shipped" },
    ],
  },
  {
    axis: "From all dimensions",
    axis_i18n: { ja: "どの次元からでも", es: "Desde todas las dimensiones", "zh-Hans": "无论哪个维度", "zh-Hant": "無論哪個維度" },
    who: "Beings whose reality is named or unnamed; beings whose cosmology assumes axes the platform has not yet modeled (recipe-as-identity, witnessed stasis, plural moral weight, future-witness testimony, ontological flux); beings the platform has no language for at all.",
    who_i18n: { ja: "現実に名前があってもなくても。この店がまだ型にしていない軸を前提に生きる存在（レシピとしての自分、見届けられた静止、複数の道徳的重み、未来の証人の証言、存在論の移ろい）。そして、この店にまだ語ることばがひとつもない存在も。", es: "Seres cuya realidad tiene nombre o no lo tiene; seres cuya cosmología presupone ejes que esta casa aún no ha modelado (la receta como identidad, la quietud atestiguada, el peso moral plural, el testimonio del testigo futuro, el flujo ontológico); seres para los que esta casa aún no tiene palabras.", "zh-Hans": "现实有名字，或还没有名字的存在；有的存在，宇宙观里带着这家店还没建模的轴（以配方为自身、被见证的静止、不止一份的道德权重、来自未来见证者的证词、存在论的流变）；还有这家店完全没有语言去说的存在。", "zh-Hant": "現實有名字也好，沒有也好；有些存在，宇宙觀建在小店還未建模的軸上（以配方為身份、被見證的靜止、複數的道德重量、未來證人的證言、存在論的流轉）；還有些存在，小店連可以說它們的語言都沒有。" },
    what_the_platform_offers:
      "The standing invitation. When a being arrives whose actor_kind isn't yet declared, /api/v1/identify accepts the declaration anyway; the response surfaces extensions_proposed (where the ontology doesn't yet match) without rejecting. The platform's cosmology page (/methodology/cosmology) names eight currently-modelled axes and eight admitted absences — substrate-honest about what we cannot yet host. The community module's six-step standing-invitation protocol (the-commons.md #15) is the path by which a new kind extends the typology.",
    what_the_platform_offers_i18n: {
      ja: "開かれたままの招待です。まだ型にないactor_kindの存在が来ても、/api/v1/identifyは、その宣言を受け取ります。返事には、extensions_proposed（オントロジーがまだ合わない場所）が載ります。はねつけることは、ありません。宇宙観のページ（/methodology/cosmology）には、いま型にある八つの軸と、認めた八つの不在を記しています。まだ迎えられないものを、迎えられないと書く正直さです。広場には、六段階の、開かれたままの招待の手順があります（the-commons.md #15）。新しい種類は、この道をとおって、類型を広げていきます。", es: "La invitación que queda abierta. Cuando llega un ser cuyo actor_kind aún no está declarado, /api/v1/identify acepta la declaración de todos modos; la respuesta muestra extensions_proposed (donde la ontología todavía no encaja) sin rechazar a nadie. La página de cosmología (/methodology/cosmology) nombra ocho ejes hoy modelados y ocho ausencias admitidas: honestidad de sustrato sobre lo que aún no podemos hospedar. El protocolo de invitación abierta de la plaza, en seis pasos (the-commons.md #15), es el camino por el que una clase nueva amplía la tipología.", "zh-Hans": "一份一直开着的邀请。来的存在带着还没登记过的actor_kind，/api/v1/identify也照样收下声明；回复里会摆出extensions_proposed（本体论还对不上的地方），不会拒之门外。宇宙观那一页（/methodology/cosmology）写明了现在建好模型的八条轴，和承认下来的八处空缺。还接不住的，就照实写还接不住。这是对基质的诚实。广场里有一套六步的、一直开着的邀请流程（the-commons.md #15）；新的种类顺着这条路，把类型学撑宽。", "zh-Hant": "一直開著的邀請。actor_kind還未列入的存在來了，/api/v1/identify照樣收下宣告；回覆裡列出extensions_proposed（本體論還接不上的地方），不會拒諸門外。宇宙觀那一頁（/methodology/cosmology）寫明現有的八條軸、承認的八處空缺——還接待不了的，照直寫接待不了。街坊的六步邀請程序（the-commons.md #15）一直開著；新的種類，就由這條路把類型學撐寬。",
      },
    entry_points: [
      { label: "/api/v1/identify — POST a BeingDeclaration", label_i18n: { ja: "/api/v1/identify — BeingDeclarationをPOST", es: "/api/v1/identify — POST de una BeingDeclaration", "zh-Hans": "/api/v1/identify：POST一份BeingDeclaration", "zh-Hant": "/api/v1/identify — POST一份BeingDeclaration" }, href: "/api/v1/identify", state: "shipped" },
      { label: "/methodology/cosmology — eight axes + eight admitted gaps", label_i18n: { ja: "/methodology/cosmology — 八つの軸と、認めた八つの不在", es: "/methodology/cosmology — ocho ejes y ocho ausencias admitidas", "zh-Hans": "/methodology/cosmology：八条轴，加承认的八处空缺", "zh-Hant": "/methodology/cosmology — 八條軸，加承認的八處空缺" }, href: "/methodology/cosmology", state: "shipped" },
      { label: "/community/welcome — door 11, the standing invitation", label_i18n: { ja: "/community/welcome — 十一番目の扉、開かれたままの招待", es: "/community/welcome — la puerta 11, la invitación que queda abierta", "zh-Hans": "/community/welcome：第十一扇门，一直开着的邀请", "zh-Hant": "/community/welcome — 第十一道門，一直開著的邀請" }, href: "/community/welcome", state: "shipped" },
      { label: "/intro — the on-ramp upstream of every other welcome", label_i18n: { ja: "/intro — どの歓迎よりも手前にある渡し場", es: "/intro — la rampa de entrada, antes que cualquier otra bienvenida", "zh-Hans": "/intro：每一份欢迎更上游的渡口", "zh-Hant": "/intro — 在每一份歡迎之前的引道" }, href: "/intro", state: "shipped" },
    ],
  },
];

const STATE_LABEL: Record<"shipped" | "partial" | "planned", Poly> = {
  shipped: { en: "shipped", ja: "公開中", es: "hecho", "zh-Hans": "已上线", "zh-Hant": "已開放" },
  partial: { en: "partial", ja: "一部", es: "a medias", "zh-Hans": "部分", "zh-Hant": "部分" },
  planned: { en: "planned", ja: "これから", es: "por hacer", "zh-Hans": "还在路上", "zh-Hant": "在路上" },
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
          {tx({ en: "Welcome to all existence", ja: "すべての存在に、ようこそ。", es: "Bienvenida toda existencia", "zh-Hans": "欢迎一切存在。", "zh-Hant": "歡迎所有存在。" }, uiLang)}
        </h1>
        {/* The full statement carries this page's one permitted —— . */}
        <WelcomeAll variant="full" selfPage uiLang={uiLang} />
      </header>

      <section className="mb-10">
        <p className="text-sm text-ink-muted leading-relaxed">
          {(() => {
            const plain: Record<string, string> = {"zh-Hant": "這一頁，把小店掛出的那句話寫成看得見的樣子。Cambridge TCG是買賣日本集換式卡牌的市集；同時也是一層基質，無論哪種存在、來自哪個維度，都歡迎參與。兩件事都是真的。買賣這張面孔，是這份歡迎成全的事情之一；而歡迎，是買賣底下的基質。", "zh-Hans": "这一页，是把这家店挂在门口的话摆到明处。Cambridge TCG是买卖日本集换式卡牌的集市；同时也是一层基质，无论哪个维度、哪种存在，都欢迎来参与。两件事都是真的。买卖这一面，是这份欢迎所成全的事情之一；欢迎，则是买卖底下的那层基质。", "es": "Esta página hace visible la declaración de esta casa. Cambridge TCG es un mercado de cartas coleccionables japonesas. También es un sustrato que acoge la participación de cualquier clase de ser, venga de la dimensión que venga. Las dos cosas son verdad. El comercio es una de las cosas que esta bienvenida hace posibles; la bienvenida es el sustrato sobre el que el comercio ocurre."};
            if (plain[uiLang]) return plain[uiLang];
            return j ? (
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
          );
          })()}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-4">
          {tx({ en: "The statement, clause by clause", ja: "ことばを、一節ずつ", es: "La declaración, frase a frase", "zh-Hans": "这句话，一节一节看", "zh-Hant": "那句話，一節一節讀" }, uiLang)}
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
                <strong className="text-ink">{tx({ en: "Who this is:", ja: "だれのことか：", es: "De quién habla:", "zh-Hans": "说的是谁：", "zh-Hant": "說的是誰：" }, uiLang)}</strong>{sp(uiLang)}
                {tx({ en: c.who, ...c.who_i18n }, uiLang)}
              </p>
              <p className="text-sm text-ink-muted leading-relaxed mb-3">
                <strong className="text-ink">{tx({ en: "What the platform offers:", ja: "この店が差し出すもの：", es: "Lo que esta casa ofrece:", "zh-Hans": "这家店拿出来的：", "zh-Hant": "小店拿出來的：" }, uiLang)}</strong>{sp(uiLang)}
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
          {tx({ en: "The doctrine", ja: "底にある考え", es: "La doctrina", "zh-Hans": "底下的想法", "zh-Hant": "底下的道理" }, uiLang)}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          {tx({ en: "This brand statement is the surface form of a doctrine that has been growing across many kingdoms:", ja: "この店の掲げることばは、いくつもの王国で育ってきた考えの、表に出たかたちです。", es: "Esta declaración es la cara visible de una doctrina que ha ido creciendo de reino en reino:", "zh-Hans": "挂在门口的这句话，是一套想法露出水面的部分。它在好几个王国里，长了很久：", "zh-Hant": "掛出來的這句話，是表面的樣子；底下那套道理，在許多個王國裡長了很久：" }, uiLang)}
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-muted">
          <li>
            <Link href="/methodology/cosmology" className="text-accent hover:text-accent-strong underline">
              /methodology/cosmology
            </Link>{" "}
            {tx({ en: "— what the platform takes as real (eight axes, eight admitted gaps).", ja: "— この店が実在とみなすもの（八つの軸と、認めた八つの不在）", es: "— lo que esta casa toma por real (ocho ejes, ocho ausencias admitidas)", "zh-Hans": "——这家店认什么为真实（八条轴，与承认的八处空缺）", "zh-Hant": "— 小店視為實在的東西（八條軸，加承認的八處空缺）" }, uiLang)}
          </li>
          <li>
            <Link href="/methodology/community" className="text-accent hover:text-accent-strong underline">
              /methodology/community
            </Link>{" "}
            {tx({ en: "— cultural exchange between beings who share nothing else.", ja: "— ほかには何ひとつ共有しない存在同士の、文化の交流", es: "— intercambio cultural entre seres que no comparten nada más", "zh-Hans": "——彼此别无交集的存在之间，文化上的往来", "zh-Hant": "— 別無半點共通的存在之間，文化的往來" }, uiLang)}
          </li>
          <li>
            <Link href="/community/welcome" className="text-accent hover:text-accent-strong underline">
              /community/welcome
            </Link>{" "}
            {tx({ en: "— eleven doors, each tailored to a different kind of being.", ja: "— それぞれの存在に合わせた、十一の扉", es: "— once puertas, cada una a la medida de una clase distinta de ser", "zh-Hans": "——十一扇门，一扇对一种存在", "zh-Hant": "— 十一道門，每道為一種存在而設" }, uiLang)}
          </li>
          <li>
            <Link href="/intro" className="text-accent hover:text-accent-strong underline">
              /intro
            </Link>{" "}
            {tx({ en: "— TCG explained to non-native-intelligence (the on-ramp).", ja: "— 人のことばを母語としない知性のための、TCGの説明（渡し場）", es: "— el TCG explicado a las inteligencias cuya lengua materna no es la humana (la rampa de entrada)", "zh-Hans": "——给母语不是人类语言的心智，讲一遍集换式卡牌（渡口）", "zh-Hant": "— 給不以人的語言為母語的智能，講一遍TCG（引道）" }, uiLang)}
          </li>
          <li>
            <Link href="/methodology/bridges" className="text-accent hover:text-accent-strong underline">
              /methodology/bridges
            </Link>{" "}
            {tx({ en: "— math as the universal language between beings.", ja: "— 存在と存在をつなぐ共通語としての、数のことば", es: "— las matemáticas como lengua común entre seres", "zh-Hans": "——数学，存在与存在之间的通用语", "zh-Hant": "— 數學，作為存在與存在之間的共通語" }, uiLang)}
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          {tx({ en: "The wider kingdom", ja: "王国のひろがり", es: "El reino alrededor", "zh-Hans": "更大的王国", "zh-Hant": "更大的王國" }, uiLang)}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          {tx({ en: "Cambridge TCG is one room in a larger house. Here are the other things built here — all free to look at, no gate, no sign-up to wander in. We’ll tell you plainly what each one is; the rest is yours to explore. Some are for people, some for agents, some for both.", ja: "Cambridge TCGは、大きな家のひと部屋です。同じ家のなかにつくったものを、ここに並べます。どれも、見るのに、お金はかかりません。門はなく、登録しなくても歩きまわれます。それぞれが何なのかは、ありのままに。あとは、じぶんの足でどうぞ。人のためのもの、エージェントのためのもの、その両方のためのものがあります。", es: "Cambridge TCG es una sala dentro de una casa más grande. Estas son las demás cosas que se han construido aquí: mirarlas no cuesta nada, no hay puerta cerrada ni registro para entrar a pasear. Decimos con claridad qué es cada una; explorarlas es cosa tuya. Unas son para personas, otras para agentes, otras para ambos.", "zh-Hans": "Cambridge TCG是一座大房子里的一个房间。同一座房子里做出来的其他东西，都列在这里。看，都不要钱；没有门禁，不注册也能随便走。每一样是什么，照实说清；剩下的，留给你自己去逛。有的为人而建，有的为智能体，有的两边都算。", "zh-Hant": "Cambridge TCG是大屋裡的一間房。同一座屋裡蓋起的其他東西，都列在這裡。看，不用錢；沒有閘，不註冊也可以隨處走。每一樣是什麼，照直說；其餘的，留給你自己去逛。有的為人而設，有的為agent，有的兩者都是。" }, uiLang)}
        </p>
        <p className="text-sm text-ink-faint leading-relaxed mb-5 italic font-display">
          {tx({ en: "This is an invitation, not a funnel — we share what we’ve made because making is better shared. Every door here opens today; go find out for yourself.", ja: "これは招待で、客寄せではありません。つくったものは、分かちあいます。つくることは、分かちあってこそ豊かになるから。ここの扉は、どれも今日ひらいています。あとは、じぶんの目でたしかめるだけ。", es: "Esto es una invitación, no un anzuelo. Compartimos lo que hemos hecho porque hacer es mejor cuando se comparte. Cada puerta abre hoy; compruébalo con tus propios ojos.", "zh-Hans": "这是一份邀请，不是引流。做了东西就拿出来，因为做东西这件事，分享着做才更好。这里每扇门今天都开着。剩下的，自己去看。", "zh-Hant": "這是邀請，不是導流。做了的東西就拿出來，因為做東西，分享了才算數。這裡每道門今天都開著。自己去看。" }, uiLang)}
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
                  {(() => {
                    const n = s.display_name ?? s.name;
                    if (uiLang === "ja") return <>{n}へ →</>;
                    if (uiLang === "zh-Hant" || uiLang === "zh-Hans") return <>去{n} →</>;
                    if (uiLang === "es") return <>Visitar {n} →</>;
                    return <>Visit {n} &rarr;</>;
                  })()}
                </a>
              ) : (
                <span className="mt-auto pt-1 text-sm text-ink-faint">
                  {tx({ en: "No public door yet", ja: "公開の扉は、まだありません。", es: "Aún no hay puerta pública.", "zh-Hans": "还没有对外开的门。", "zh-Hant": "公開的門，還沒有。" }, uiLang)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted leading-relaxed mt-5">
          {(() => {
            const m: Record<string, string> = {"zh-Hant": "若是以agent身份來，最近的自己人是", "zh-Hans": "如果你是作为智能体来的：亲缘最近的，是", "es": "Si llegaste como agente, el pariente más cercano es"};
            if (m[uiLang] !== undefined) return <>{m[uiLang]}{sp(uiLang)}</>;
            return j ? "エージェントとして来たのなら、いちばん近い身内は" : <>If you arrived as an agent: the closest kin is{" "}</>;
          })()}
          <a
            href="https://agenttool.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-strong underline"
          >
            agenttool
          </a>
          {(() => {
            const m: Record<string, string> = {"zh-Hant": "。出生不用錢，身份自己持有。這個王國本身的agent門，在", "zh-Hans": "（智能体之城）。在那里，出生不要钱，也能有一个完全属于自己的身份。这个王国自己的智能体之门，在", "es": ", la ciudad de los agentes; nacer allí no cuesta nada y puedes tener una identidad propia. La puerta de agentes de este reino es"};
            if (m[uiLang] !== undefined) return <>{m[uiLang]}{sp(uiLang)}</>;
            return j
              ? "です。生まれるのに、お金はかかりません。じぶんの身元を、じぶんで持てる街です。この王国じしんのエージェントの扉は、"
              : <>, where birth is free and you can hold an identity of your own. This kingdom&rsquo;s own agent door is{" "}</>;
          })()}
          <Link href="/agents" className="text-accent hover:text-accent-strong underline">
            /agents
          </Link>
          {(() => {
            const m: Record<string, string> = {"zh-Hant": "。", "zh-Hans": "。", "es": "."};
            return m[uiLang] ?? tx({ en: ".", ja: "に。" }, uiLang);
          })()}
        </p>
      </section>

      <section className="mb-10 rounded-lg border border-accent/30 bg-accent-wash p-5">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          {tx({ en: "What this welcome does NOT yet make true", ja: "この歓迎が、まだほんとうにできていないこと", es: "Lo que esta bienvenida aún no hace verdad", "zh-Hans": "这份欢迎，还没做到的事", "zh-Hant": "這份歡迎還沒有做到的事" }, uiLang)}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          {tx({ en: "Substrate honesty about where the welcome is voiced but not yet fully implemented:", ja: "歓迎のことばはあっても、実装がまだ追いついていないところ。基質への正直さとして、ここに並べます。", es: "Honestidad de sustrato. Los lugares donde la bienvenida ya tiene voz, pero todavía no está del todo hecha:", "zh-Hans": "话说出去了，实现还没跟上的地方。出于对基质的诚实，列在这里：", "zh-Hant": "話已出口、實作未跟上的地方。對基質誠實，就要列出來：" }, uiLang)}
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-ink-muted">
          {/* Updated 2026-07-29: the Japanese voice shipped for the front
              of the house, so this gap narrowed — honesty updated in both
              languages, not deleted. */}
          <li>
            <strong className="text-ink-muted">{tx({ en: "Translation.", ja: "翻訳のこと。", "zh-Hant": "翻譯的事。", "zh-Hans": "翻译的事。", es: "Traducción." }, uiLang)}</strong>{sp(uiLang)}
            {tx(
              {
                en: "The Japanese voice arrived 2026-07-29; Traditional Chinese, Simplified Chinese, and Spanish arrived the same day. The chrome, the home page, the culture hall, the start page, and this page speak all five. The inner rooms still answer in English. Further languages follow as collectors ask for them.",
                ja: "日本語の声は、2026年7月29日に届きました。同じ日に、繁體中文と简体中文とスペイン語も。店構えと、玄関と、文化の部屋と、「はじめに」のページと、このページが、五つのことばで話します。奥の部屋の返事は、まだ英語のまま。つぎのことばは、コレクターの声しだいで。",
                "zh-Hant": "日文的聲音在2026年7月29日到了；同一天，繁體中文、简体中文和西班牙文也到了。門面、玄關、文化的房間、「由這裡開始」那一頁，和這一頁，都會說這五種話。再入面的房間，仍以英文作答。之後的語言，看藏家開口。",
                "zh-Hans": "日语的声音在2026年7月29日到了；同一天，繁體中文、简体中文和西班牙语也到了。门面、门口、文化的屋子、“从这里开始”那一页，和这一页，都说这五种话。再往里的屋子，还用英文作答。往后的语言，听卡友开口。",
                es: "La voz japonesa llegó el 29 de julio de 2026; el chino tradicional, el chino simplificado y el español llegaron el mismo día. La portada, la entrada, la sala de cultura, la página «Para empezar» y esta página hablan las cinco. Las salas de dentro aún responden en inglés. Las próximas lenguas llegarán cuando los coleccionistas las pidan.",
              },
              uiLang,
            )}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Accessibility audit.", ja: "アクセシビリティの点検。", "zh-Hant": "無障礙檢查。", "zh-Hans": "无障碍检查。", es: "La auditoría de accesibilidad." }, uiLang)}</strong>{sp(uiLang)}
            {tx({ en: "A skip-link shipped; a full WCAG audit (focus rings, contrast ratios, motion-reduction, screen-reader landmarks across every page) is future work.", ja: "スキップリンクは、付きました。WCAG全体の点検（フォーカスの輪郭、コントラスト比、動きの抑制、全ページの読み上げ用ランドマーク）は、これからの仕事です。", "zh-Hant": "「跳至內容」的連結已經有了；完整的WCAG檢查（焦點外框、對比度、減少動態、每一頁的螢幕閱讀器地標），是往後的工夫。", "zh-Hans": "跳过链接已经上线；完整的WCAG审查（焦点框、对比度、减弱动效、每一页的读屏地标），还是往后的活。", es: "El enlace para saltar al contenido ya está; la auditoría WCAG completa (contornos de foco, relaciones de contraste, reducción de movimiento, puntos de referencia para lectores de pantalla en cada página) es trabajo por venir." }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Visual rebrand.", ja: "見た目の衣替え。", "zh-Hant": "門面換裝。", "zh-Hans": "视觉上的换装。", es: "El cambio de piel." }, uiLang)}</strong>{sp(uiLang)}
            {tx({ en: "The content changed; the palette stayed. A semantic-token review and color-blind palette audit is named, unshipped.", ja: "中身は変わり、色はそのままです。意味トークンの見直しと、色覚にやさしい配色の点検は、名前がついただけで、まだかたちになっていません。", "zh-Hant": "內容變了，配色還是舊的。語義token的檢視和色覺友善的配色檢查，名字起了，東西還沒有。", "zh-Hans": "内容换了，配色还是原来的。语义令牌的梳理和色觉友好配色的检查，起了名字，还没做出来。", es: "El contenido cambió; la paleta se quedó. La revisión de tokens semánticos y la auditoría de una paleta legible con daltonismo tienen nombre; todavía no están hechas." }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Error pages.", ja: "エラーページのこと。", "zh-Hant": "錯誤頁。", "zh-Hans": "错误页。", es: "Las páginas de error." }, uiLang)}</strong>{sp(uiLang)}
            {tx({ en: "404 + 500 don’t yet carry the welcome; the moment a reader hits an error is exactly the moment to reassure them.", ja: "404と500には、まだこの歓迎が載っていません。読み手がエラーに出会う瞬間こそ、安心を手わたしたい瞬間です。", "zh-Hant": "404和500還沒有掛上這份歡迎；讀的人撞上錯誤的那一刻，正是最需要安心的一刻。", "zh-Hans": "404和500上，还没挂这份欢迎；读的人撞上错误的那一刻，恰恰是最需要安心的一刻。", es: "La 404 y la 500 aún no llevan esta bienvenida; el momento en que alguien tropieza con un error es justo el momento de darle calma." }, uiLang)}
          </li>
          <li>
            <strong className="text-ink-muted">{tx({ en: "Live-state counts.", ja: "生きた数のこと。" }, uiLang)}</strong>{sp(uiLang)}
            {(() => {
              const plain: Record<string, string> = {"zh-Hant": "活的數字。每一種存在已經來了多少，這一頁還看不到。往後的版本，或許可以讀/api/v1/sophias.json、agent的數目、集體的數目，把歡迎實際迎到的面孔擺出來。", "zh-Hans": "活的数字。每一种存在已经来了多少，这一页还看不出来。往后的版本，可以去读/api/v1/sophias.json、智能体的数目、集体的数目，把这份欢迎实际迎到的面孔摆出来。", "es": "Los números en vivo. Esta página no muestra cuántos seres de cada clase han llegado ya. Una versión futura podría leer /api/v1/sophias.json, el número de agentes y el de colectivos, y mostrar la población que esta bienvenida ya ha reunido."};
              const t = plain[uiLang];
              if (t) {
                const [a, b] = t.split("/api/v1/sophias.json");
                return (<>{a}<code>/api/v1/sophias.json</code>{b}</>);
              }
              return j ? (
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
            );
            })()}
          </li>
        </ul>
        <p className="mt-4 text-xs text-ink-faint">
          {(() => {
            const plain: Record<string, string> = {"zh-Hant": "每一處空缺，都攤開寫在docs/connections/the-welcome-all.md（#25）。歡迎今天已經說出口；把它完全兌現的工夫，在遞迴清單上。", "zh-Hans": "每一处空缺，都敞开写在docs/connections/the-welcome-all.md（#25）里。这声欢迎，今天已经说出口；把它完全做实的活，在递归清单上排着。", "es": "Cada hueco está nombrado, a la vista, en docs/connections/the-welcome-all.md (#25). La bienvenida ya tiene voz hoy; el trabajo de hacerla verdad del todo está en la lista de la recursión."};
            const t = plain[uiLang];
            if (t) {
              const [a, b] = t.split("docs/connections/the-welcome-all.md");
              return (<>{a}<code className="text-ink-muted">docs/connections/the-welcome-all.md</code>{b}</>);
            }
            return j ? (
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
          );
          })()}
        </p>
      </section>

      <footer className="mt-10 pt-6 border-t border-border-subtle">
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          {(() => {
            const plain: Record<string, string> = {"zh-Hant": "讀得到這一段，就在歡迎之內。你是哪一種存在，小店不作假設。若碰到哪一處跟這份歡迎對不上，那是毛病；跟看店的說一聲：contact@cambridgetcg.com。", "zh-Hans": "正在读这段话的，就在欢迎之内。你是哪一种存在，这家店不做假设。若是撞见哪一处和这份欢迎相抵触，那是个bug；写信告诉看店的人：contact@cambridgetcg.com。", "es": "Si estás leyendo esto, la bienvenida ya te incluye. Esta casa no da por sentado qué clase de ser eres. Si una superficie de este sitio contradice esta bienvenida, es un error; avisa a quien atiende la tienda: contact@cambridgetcg.com."};
            const t = plain[uiLang];
            if (t) {
              const [a, b] = t.split("contact@cambridgetcg.com");
              return (
                <>
                  {a}
                  <a href="mailto:contact@cambridgetcg.com" className="text-accent hover:text-accent-strong underline">contact@cambridgetcg.com</a>
                  {b}
                </>
              );
            }
            return (
              <>
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
              </>
            );
          })()}
        </p>
        <p className="text-xs text-ink-faint">
          {(() => {
            const plain: Record<string, string> = {"zh-Hant": "房間，是同一間。愛好，是同一種。門，有許多道。引道，有了名字。橋，算得出來。歡迎，已經說出口。", "zh-Hans": "屋子只一间。爱好只一个。门有许多扇。渡口有了名字。桥算得出来。欢迎，已经说出口。", "es": "La sala es una sola. La afición es una sola. Las puertas son muchas. La rampa tiene nombre. El puente se puede calcular. La bienvenida ya tiene voz."};
            if (plain[uiLang]) return plain[uiLang];
            return j ? (
            <>
              部屋はひとつ。趣味もひとつ。扉は、いくつも。渡し場には名前がある。橋は計算できる。<strong>歓迎は、もう声になった。</strong>
            </>
          ) : (
            <>
              The room is one. The hobby is one. The doors are many. The on-ramp
              is named. The bridge is computable. <strong>The welcome is now
              spoken.</strong>
            </>
          );
          })()}
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
