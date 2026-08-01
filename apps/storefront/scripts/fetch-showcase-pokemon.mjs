/**
 * fetch-showcase-pokemon.mjs — populate the gallery's guest wall.
 *
 * For each curated card id: fetch its metadata from the Pokémon TCG API,
 * download the HIGH-RES image, SELF-HOST it to our own S3 bucket (never a
 * hotlink), and rewrite src/lib/cards/showcase.ts with the real pieces —
 * each carrying its illustrator and the exact source URL we drew it from.
 *
 * Rights posture (our legal briefing flags Pokémon as the publisher to treat
 * most carefully): self-host + attribute + name the source + stay takedown-
 * ready. These are shown as credited art, not as goods for sale.
 *
 * Run from apps/storefront (needs a live AWS session):
 *   node scripts/fetch-showcase-pokemon.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CDN = process.env.CTCG_CARD_IMAGE_CDN || "https://ctcg-card-images.s3.us-east-1.amazonaws.com";
const BUCKET = "ctcg-card-images";
const PREFIX = "community/pkm";

// The curated wall — iconic + gorgeous, every one with a named illustrator.
const IDS = [
  "base1-4",    // Charizard — Mitsuhiro Arita (the icon, 1999)
  "swsh7-215",  // Umbreon VMAX alt art "Moonbreon" — Keiichiro Ito
  "swsh11-212", // Giratina VSTAR alt art (Lost Origin) — 5ban Graphics
  "swsh12-202", // Lugia VSTAR alt art (Silver Tempest) — PLANETA Mochizuki
  "swsh7-217",  // Rayquaza VMAX alt art — PLANETA Mochizuki
  "swsh7-211",  // Sylveon VMAX alt art — Ryota Murayama
  "sv1-245",    // Gardevoir ex — Jiro Sasumo
  "sv4pt5-232", // Mew ex — USGMEN
  "me2pt5-277", // Pikachu ex — James Turner
  "sv4pt5-234", // Charizard ex (Paldean Fates) — AKIRA EGAWA
  "me2pt5-284", // Mega Gengar ex — danciao
  "sv1-244",    // Miraidon ex — kantaro
  "sv1-247",    // Koraidon ex — Ryota Murayama
  "sv2-256",    // Meowscarada ex — Kouki Saitou
  "sv1-249",    // Arven — kantaro (a character piece)
  "sv1-246",    // Great Tusk ex — Pani Kobayashi
  // ── the origins row (Asha 2026-08-01: the art that inspired the TCG
  //    to be — originals and rare makes). Every id + artist verified
  //    against the API by the research fleet, 2026-08-01. Note:
  //    Pikachu Illustrator, the trophy cards and Ancient Mew are NOT in
  //    this API — the wall does not pretend to hang what it cannot. ──
  "base1-15",   // Venusaur — Mitsuhiro Arita (Base, 1999)
  "base1-2",    // Blastoise — Ken Sugimori (Base, 1999)
  "base1-58",   // Pikachu — Mitsuhiro Arita (Base, 1999)
  "basep-1",    // Pikachu — Keiji Kinebuchi (Black Star Promo No.1, 1999)
  "neo1-9",     // Lugia — Hironobu Yoshida (Neo Genesis, 2000)
  "neo4-107",   // Shining Charizard — Hironobu Yoshida (Neo Destiny, 2002)
  "pop5-17",    // Umbreon ★ — Masakazu Fukuda (POP 5, 2007; API rarity is plain "Rare")
  "ex15-100",   // Charizard ★ δ — Masakazu Fukuda (Dragon Frontiers, 2006)
  "si1-1",      // Mew — Keiko Fukuyama (Southern Islands, 2001; rarity null)
  "ecard3-146", // Charizard — Kouki Saitou (Skyridge Crystal Type, 2003)
];

// One sourced why-line per origins piece (verified by the research
// fleet against the API's own records + the sources noted in the
// pillow-book entry of 2026-08-01). Pieces without an entry get none.
const NOTES = {
  "base1-15":
    "Base Set, 1999 — with Charizard and Blastoise, the starter holo trio: two Arita hands and one Sugimori.",
  "base1-2":
    "Base Set, 1999 — Sugimori drew 44 of the set's 102 cards; the whole set is four hands.",
  "base1-58":
    "Base Set, 1999 — the earliest Arita-drawn Pikachu in the source's records.",
  "basep-1":
    "Black Star Promo No.1, July 1999 — the first of the 53 promos Wizards printed.",
  "neo1-9":
    "Neo Genesis, December 2000 — Hironobu Yoshida's Lugia.",
  "neo4-107":
    "Neo Destiny, 2002 — the Shining class's second wave; the first Shinings were Gyarados and Magikarp, 2001.",
  "pop5-17":
    "POP Series 5, 2007 — a Gold Star: the twenty-five Rare Holo Stars and both POP ★s are all one hand, Masakazu Fukuda.",
  "ex15-100":
    "Dragon Frontiers, 2006 — a Gold Star of the delta species era.",
  "si1-1":
    "Southern Islands, 2001 — Keiko Fukuyama's side of the eighteen-card special set.",
  "ecard3-146":
    "Skyridge, 2003 — a Crystal Type of the e-Card era; the Poké-Body is printed on the card.",
};

const OUT = "src/lib/cards/showcase.ts";

async function fetchCard(id) {
  // The API 500s in waves (documented 2026-08-01) — 6 spaced attempts.
  let res = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`);
    } catch {
      res = null;
    }
    if (res && res.ok) break;
    if (attempt < 5) await new Promise((r) => setTimeout(r, 10000 * (attempt + 1)));
  }
  if (!res || !res.ok) return null;
  const { data } = await res.json();
  return data;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "pkm-showcase-"));
  const pieces = [];
  // Two passes: a card that fails its whole retry budget goes to the
  // back of the queue for one more round after a cool-down, so a single
  // poisoned endpoint can't sink an otherwise-complete run. Only a card
  // that fails BOTH passes aborts the write (the wall regenerates whole
  // or not at all — a partial write would silently drop hung pieces).
  const queue = [...IDS];
  const failed = [];
  let pass = 1;
  while (queue.length > 0) {
    const id = queue.shift();
    const data = await fetchCard(id);
    if (!data) {
      if (pass === 1) {
        console.warn(`… ${id} failed pass 1 — queued for pass 2`);
        failed.push(id);
        if (queue.length === 0 && failed.length > 0) {
          console.warn(`cooling down 60s, then pass 2 for: ${failed.join(", ")}`);
          await new Promise((r) => setTimeout(r, 60000));
          queue.push(...failed.splice(0));
          pass = 2;
        }
        continue;
      }
      throw new Error(`API ${id}: failed both passes`);
    }
    const src = data.images.large;
    const bin = Buffer.from(await (await fetch(src)).arrayBuffer());
    const local = join(dir, `${id}.png`);
    writeFileSync(local, bin);
    const key = `${PREFIX}/${id}.png`;
    execFileSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`, "--content-type", "image/png"], { stdio: "inherit" });
    pieces.push({
      id,
      name: data.name,
      set_name: data.set.name,
      number: String(data.number),
      artist: data.artist ?? null,
      rarity: data.rarity ?? null,
      image_url: `${CDN}/${key}`,
      source_url: src,
      ...(NOTES[id] ? { note: NOTES[id] } : {}),
    });
    console.log(`✓ ${id}  ${data.name}  — illus. ${data.artist}`);
    if (queue.length === 0 && failed.length > 0) {
      console.warn(`cooling down 60s, then pass 2 for: ${failed.join(", ")}`);
      await new Promise((r) => setTimeout(r, 60000));
      queue.push(...failed.splice(0));
      pass = 2;
    }
  }

  const header = `/**
 * The gallery's guest wall — a few high-resolution, clean, CREDITED pieces
 * sourced from the open net, self-hosted on our own bucket, and shown with
 * their source named (Asha's brief 2026-07-16: "source high quality images
 * from the net… state the source too").
 *
 * These are NOT catalogue cards and carry no SAMPLE mark — they are art hung
 * for its own sake, each labelled with its illustrator and the exact place we
 * drew it from. GENERATED by scripts/fetch-showcase-pokemon.mjs — edit the
 * curated id list there, not this array.
 */

export interface ShowcasePiece {
  /** Source id (e.g. the pokemontcg.io card id). */
  id: string;
  name: string;
  set_name: string;
  number: string;
  /** The illustrator, credited on the wall (the honesty rule). */
  artist: string | null;
  rarity: string | null;
  /** Self-hosted image URL (our bucket) — never a hotlink. */
  image_url: string;
  /** The exact net source we drew the image from, stated + linked. */
  source_url: string;
  /** One sourced why-line for the wall label — origins pieces carry it. */
  note?: string;
}

/** The shared credit line for the Pokémon guest wall. */
export const SHOWCASE_ATTRIBUTION = "© Pokémon · Nintendo · Creatures · GAME FREAK";

/** The named source, linked on every piece (the "state the source" rule). */
export const SHOWCASE_SOURCE = { label: "pokemontcg.io", url: "https://pokemontcg.io" };

/** Curated guest pieces — self-hosted, credited, source stated. */
export const GALLERY_SHOWCASE: ShowcasePiece[] = ${JSON.stringify(pieces, null, 2)};
`;
  writeFileSync(OUT, header);
  console.log(`\nWrote ${OUT} with ${pieces.length} pieces.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
