// The competitive meta, as a dated snapshot — substrate honesty first:
// a metagame is a moving river and this file is a photograph of it.
// Every claim below is grounded in cited tournament data (researched +
// adversarially spot-checked; see sources per section). Decklist links
// point at their publishers — facts cited, articles linked, never
// republished wholesale.
//
// Re-verify cadence: when a new set releases, when Bandai posts
// restriction news, or ~monthly — whichever comes first. AS_OF below is
// the honesty banner on every surface that renders this.

export interface MetaTierEntry {
  tier: "S" | "A" | "B";
  leaderCard: string;
  leaderName: string;
  color: string;
  archetype: string;
  /** Grounded in results data — meta share / top cuts, not vibes. */
  why: string;
  /** Representation evidence as published by the source, when given. */
  representation?: string;
}

export interface TournamentResult {
  name: string;
  date: string;
  region?: string;
  size?: string;
  /** Player handle as published by the event's own coverage; omitted
   *  when the organizer didn't publish one. */
  winnerName?: string;
  winnerLeader: string;
  decklistUrl?: string;
  sourceUrl: string;
}

export interface CircuitLink {
  name: string;
  what: string;
  url: string;
}

export interface MetaSnapshot {
  asOf: string;
  dataWindow: string;
  latestSet: string;
  /** Format-landscape facts every player should know (rotation, formats,
   *  banlist cadence) — each line carries its own source in prose. */
  formatContext: string[];
  tiers: MetaTierEntry[];
  recentResults: TournamentResult[];
  officialCircuit: CircuitLink[];
  communityCircuit: CircuitLink[];
  sources: string[];
}

// Filled 2026-07-22 from a five-agent research pass (meta share + top cuts,
// event standings, circuit pages, banlist currency) with an adversarial
// verify agent re-checking every claim against the live sources. The
// verifier's corrections are applied below — where it falsified a citation
// (e.g. a claimed Regional top-16 that was actually 34th) the claim was
// removed, not softened.
export const META_SNAPSHOT: MetaSnapshot = {
  asOf: "2026-07-22",
  dataWindow:
    "Four 750+ player majors, 2026-06-20 → 2026-07-12 (Regionals Peoria 1,117 · Toulouse 1,024 · Bielefeld 1,541 · Utrecht 788, plus same-weekend Treasure Cups) + Limitless OP16-format month sample (3,747 placement points)",
  latestSet: "OP-16 “The Time of Battle” (EN release 2026-06-12)",
  formatContext: [
    "The game got its first block rotation on 2026-04-01: Block 1 (OP01–OP04 era) left the Standard format, which now runs on the Block 2+ card pool. Everything below is the Standard meta.",
    "Rotated cards stay legal in the Extra format — Bandai runs a parallel Extra Championship 26-27 and Extra Grand Battles for the full card pool (see the official events hubs below).",
    "The banned/restricted list in force is effective 2026-04-10 and is unchanged since — our mirror is re-verified against Bandai's page and enforced at our tables (see the banlist page).",
    "Our deck checker currently validates construction + banlist but does not yet enforce Standard set-rotation — a deck of rotated cards is fine at our casual tables and in Extra, but check the official Standard pool before a Regional.",
  ],
  tiers: [
    {
      tier: "S",
      leaderCard: "OP15-058",
      leaderName: "Enel",
      color: "Purple",
      archetype:
        "Purple DON!!-ramp midrange that snowballs resource advantage into board dominance",
      why: "Best converter in the format: won Regional Bielefeld (1,541 players, 4 Jul) and Regional Toulouse (1,024, 27 Jun), put 5 of 8 into Regional Utrecht's top cut, and added the (smaller, 250-player) Treasure Cup Utrecht title. No other leader is close on top-8 count.",
      representation:
        "21.6% meta share (813/3,747 pts, past-month window); 11 of 32 top-8 slots across the four Jun 20–Jul 12 majors; 162 all-time placings incl. 8 wins on Limitless",
    },
    {
      tier: "S",
      leaderCard: "OP11-041",
      leaderName: "Nami",
      color: "Blue/Yellow",
      archetype:
        "Stall/control that grinds attrition through blue tempo denial and yellow life manipulation",
      why: "Most-played deck in the OP16 format and consistently converts: 2nd/3rd/4th at Regional Peoria (1,117 players, 20 Jun), 4th and 6th at Regional Toulouse, 6th at Regional Utrecht. No regional win in this exact window, but its share and top-cut density define what every deck must beat.",
      representation:
        "#1 meta share at 24.5% (924/3,747 pts); 143 all-time placings incl. 6 wins",
    },
    {
      tier: "S",
      leaderCard: "OP16-022",
      leaderName: "Monkey.D.Luffy",
      color: "Green/Blue",
      archetype:
        "Tempo midrange from the new set — green rest/blue bounce disruption while curving out",
      why: "The breakout OP16 leader: 6 top-8s across the four majors (3rd, 6th, 8th at Bielefeld; 3rd, 7th at Toulouse; 5th at Peoria) and won Treasure Cup Bielefeld (764 players, 5 Jul). Share and conversion both S-caliber one month after release.",
      representation:
        "21.9% meta share (825/3,747 pts); 66 placings incl. 2 wins since OP16 released",
    },
    {
      tier: "A",
      leaderCard: "OP16-080",
      leaderName: "Marshall.D.Teach (Blackbeard)",
      color: "Black/Yellow",
      archetype:
        "Black/yellow midrange trading life for KO removal and late-game power swings",
      why: "Won the most recent regional in the dataset (Regional Utrecht, 788 players, 11 Jul, Tom Kaiser) and added 5th at Toulouse plus 7th/8th at Peoria — 4 top-8s at the four majors on a third of the play rate of the S decks.",
      representation:
        "8.3% meta share (312/3,747 pts); 23 placings incl. 1 win since OP16 release",
    },
    {
      tier: "A",
      leaderCard: "OP15-002",
      leaderName: "Lucy (Luffy)",
      color: "Red/Blue",
      archetype: "Aggressive red rush backed by blue bounce/tempo disruption",
      why: "Massive overperformer relative to play rate: won Regional Peoria (1,117 players, 20 Jun, BahiaéBH), 2nd at Regional Toulouse and 5th at Regional Utrecht — 3 major top-8s including a title from a tiny pilot base.",
      representation:
        "Only 2.8% meta share (105 pts), but 28 placings incl. 1 regional win",
    },
    {
      tier: "A",
      leaderCard: "OP12-061",
      leaderName: "Donquixote Rosinante",
      color: "Purple/Yellow",
      archetype:
        "Purple/yellow ramp-control hybrid mixing DON acceleration with life tricks",
      why: "Earns A on sustained representation and volume of placings, but conversion at the regionals themselves is soft: zero top-8s at the four majors. Its recent results live in the Treasure Cups — 3rd and 7th at Bielefeld (764 players), 5th at Utrecht, 7th at Toulouse.",
      representation:
        "4th-most played at 9.3% meta share (351/3,747 pts); 57 all-time placings incl. 1 win",
    },
    {
      tier: "B",
      leaderCard: "OP11-001",
      leaderName: "Koby",
      color: "Red/Black",
      archetype: "Red/black aggro-control using cost reduction into black removal",
      why: "Nearly won the biggest event of the window — 2nd at Regional Bielefeld (1,541 players, 4 Jul) plus 11th at Treasure Cup Utrecht — but the archetype is a rounding error in play rate, so one pilot's spike is the bulk of its evidence.",
      representation: "0.9% meta share; only 5 recorded placings",
    },
    {
      tier: "B",
      leaderCard: "OP16-079",
      leaderName: "Yamato",
      color: "Black",
      archetype:
        "Mono-black control built almost entirely from new OP16 KO/trash tools",
      why: "Real but thin results: 5th at Treasure Cup Bielefeld (764 players, 5 Jul) is its one verified top cut, on 5 recorded placings since OP16's release. Shows the new set's black package can compete, without regional top-cut proof yet.",
      representation: "1.4% meta share; 5 placings since OP16 release",
    },
    {
      tier: "B",
      leaderCard: "ST30-001",
      leaderName: "Monkey.D.Luffy & Portgas.D.Ace",
      color: "Red/Green",
      archetype:
        "Starter-deck twin-attacker aggro that pressures early with two-character synergy",
      why: "Two genuine spikes — 4th at Regional Bielefeld (1,541 players) and 6th at the 256-player Treasure Cup Peoria (20 Jun edition) — but a two-placing sample keeps it at B until more pilots repeat the result.",
      representation: "0.9% meta share; just 2 recorded placings",
    },
  ],
  recentResults: [
    {
      name: "Treasure Cup Utrecht",
      date: "2026-07-12",
      region: "Netherlands (Europe)",
      size: "250 players",
      winnerName: "Fabian Godglück",
      winnerLeader: "Enel (OP15-058, Purple)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6345",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/445",
    },
    {
      name: "Regional Utrecht",
      date: "2026-07-11",
      region: "Netherlands (Europe)",
      size: "788 players",
      winnerName: "Tom Kaiser",
      winnerLeader: "Marshall.D.Teach (OP16-080, Black/Yellow Blackbeard)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6690",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/432",
    },
    {
      name: "Treasure Cup Bielefeld",
      date: "2026-07-05",
      region: "Germany (Europe)",
      size: "764 players",
      winnerName: "Hrvoje Hedžet",
      winnerLeader: "Monkey.D.Luffy (OP16-022, Green/Blue)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6537",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/444",
    },
    {
      name: "Regional Bielefeld",
      date: "2026-07-04",
      region: "Germany (Europe)",
      size: "1,541 players",
      winnerName: "Luka Forjan",
      winnerLeader: "Enel (OP15-058, Purple)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6508",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/431",
    },
    {
      name: "Treasure Cup Toulouse",
      date: "2026-06-28",
      region: "France (Europe)",
      size: "769 players",
      winnerName: "David Melendo Villena",
      winnerLeader: "Monkey.D.Luffy (OP16-022, Green/Blue)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6451",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/420",
    },
    {
      name: "Regional Toulouse",
      date: "2026-06-27",
      region: "France (Europe)",
      size: "1,024 players",
      winnerName: "Giorgio Saraniero",
      winnerLeader: "Enel (OP15-058, Purple)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6422",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/415",
    },
    {
      name: "Treasure Cup Peoria, IL",
      date: "2026-06-21",
      region: "United States (North America)",
      size: "510 players",
      winnerName: "YTJJGaming",
      winnerLeader: "Nami (OP11-041, Blue/Yellow)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6620",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/440",
    },
    {
      name: "Regional Peoria, IL",
      date: "2026-06-20",
      region: "United States (North America)",
      size: "1,117 players",
      winnerName: "BahiaéBH",
      winnerLeader: "Lucy (OP15-002, Red/Blue)",
      decklistUrl: "https://onepiece.limitlesstcg.com/decks/list/6423",
      sourceUrl: "https://onepiece.limitlesstcg.com/tournaments/413",
    },
  ],
  officialCircuit: [
    {
      name: "ONE PIECE CARD GAME events hub (EN — NA/EU/Oceania/LatAm)",
      what: "Bandai's master events calendar for the West: Championship 26-27, Regionals Season 1 (Mar–Jul) and Season 2 (Aug–Dec 2026), Treasure Cups, Store Tournaments Vol. 3, Flame-Flame Fruit Coliseum, and Bandai Card Games Fest Utrecht (Sep 4–6) + Dallas (Sep 18–20).",
      url: "https://en.onepiece-cardgame.com/events/",
    },
    {
      name: "Championship 26-27 structure",
      what: "The season blueprint (Mar 2026–Mar 2027): Regionals and Store Championships feed invites to Regional Finals (S1 Sep 2026, S2 Jan 2027), whose winners earn invites to the World Championship Finals in Japan. Invites are season-specific; residency rules apply.",
      url: "https://en.onepiece-cardgame.com/events/championship-26-27.html",
    },
    {
      name: "Season 2 Regionals 26-27 (dates + registration)",
      what: "Regional-by-regional dates (NA Aug–Sep, EU Aug–Oct, Oceania Aug–Sep, LatAm Sep–Dec 2026) with each organizer's registration link. Top 16 earn a Finals invite; Standard regulation as of April 1, 2026.",
      url: "https://en.onepiece-cardgame.com/events/regional-season2-26-27.html",
    },
    {
      name: "Bandai TCG+ (organized play portal)",
      what: "The official organized-play system and the practical entry door: search and apply for events at nearby stores, pre-register decklists, check in, see pairings, report results. How you enter store tournaments and most qualifier-level play.",
      url: "https://lp.bandai-tcg-plus.com/en/",
    },
    {
      name: "Beginners Deck Party 2026",
      what: "Starter-deck-only beginner tournament at local stores, Jul 31–Aug 30, 2026 — registration open now via TCG+. The canonical first competitive step for a new player.",
      url: "https://en.onepiece-cardgame.com/events/beginners-deck-party2026.html",
    },
    {
      name: "Official Shop hub (store network + welcome events)",
      what: "Directory of dedicated Official Shops (US, UK, France, Germany) and their new-player on-ramps — Welcome Events and Buddy Battles. Find a shop here, play a beginner event, then graduate toward Store Championships and Regionals.",
      url: "https://en.onepiece-cardgame.com/events/official-shop.html",
    },
    {
      name: "Events hub — Asia English",
      what: "The Asia-Pacific circuit: Championship 26-27, Extra Championship 26-27 (Aug 2026–Jan 2027, the wider Extra card pool), Flagship Battles, Standard Battle monthlies, and the Flame-Flame Fruit tournament (Hong Kong / Kuala Lumpur, Nov 28–29, 2026).",
      url: "https://asia-en.onepiece-cardgame.com/events/",
    },
    {
      name: "Events hub — Japan",
      what: "Japan's circuit: Championship 26-27, Extra Championship 26-27, Flagship Battles, 8-Pack Battles, Grand Battles (Extra format), monthly Standard Battles, and beginner teaching events.",
      url: "https://www.onepiece-cardgame.com/events/",
    },
  ],
  communityCircuit: [
    {
      name: "Limitless One Piece",
      what: "The de-facto Western results database: major-event standings with player counts, top decklists organized by leader, meta-share stats, card search, rankings, and player tools. The tier list above is grounded in its data.",
      url: "https://onepiece.limitlesstcg.com/",
    },
    {
      name: "Limitless — upcoming tournaments",
      what: "Live calendar of upcoming OPTCG events, online and offline, across regions — with dates, formats, and registration links.",
      url: "https://onepiece.limitlesstcg.com/tournaments/upcoming",
    },
    {
      name: "Limitless Play",
      what: "Limitless's online tournament platform — enter (or host) grassroots online tournaments, with integrated deck submission.",
      url: "https://play.limitlesstcg.com/",
    },
    {
      name: "Egman Events (+ Egman Deck Builder)",
      what: "Long-running community organizer and livestream/archive hub; its tournament results and decklist database lives on the Deck Builder site, filterable by format.",
      url: "https://egmanevents.com/",
    },
    {
      name: "GumGum.gg",
      what: "Fan-run meta decklists and card database — events data, meta decklists, market-watch price tracking, and player tools.",
      url: "https://gumgum.gg/",
    },
    {
      name: "One Piece Top Decks",
      what: "Decklist and results aggregator, strong on Japan-side results and early set news, with card database and tournament-report articles.",
      url: "https://onepiecetopdecks.com/",
    },
  ],
  sources: [
    "https://onepiece.limitlesstcg.com/decks",
    "https://onepiece.limitlesstcg.com/tournaments",
    "https://en.onepiece-cardgame.com/topics/029.php",
    "https://en.onepiece-cardgame.com/events/",
    "https://x.com/ONEPIECE_tcg_EN/status/2033129895279431738",
  ],
};
