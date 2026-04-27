import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashSync } from "bcryptjs";
import { clients, games, sets, cards } from "./schema";
import { eq } from "drizzle-orm";
import { calculatePrice } from "../pricing";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function seed() {
  // Seed admin
  await db.insert(clients).values({
    name: "Admin",
    email: "admin@cambridgetcg.com",
    passwordHash: hashSync("admin123", 10),
    company: "Cambridge TCG",
    role: "admin",
    currentMonthSpend: 0,
    priorMonthSpend: 0,
    volumeDiscountPct: 0,
  }).onConflictDoNothing();

  // Seed test client
  await db.insert(clients).values({
    name: "Test Client",
    email: "client@streamer.com",
    passwordHash: hashSync("client123", 10),
    company: "StreamerCo",
    role: "client",
    currentMonthSpend: 0,
    priorMonthSpend: 25000,
    volumeDiscountPct: 0.04,
  }).onConflictDoNothing();

  // Seed games
  const gameData = [
    { code: "onepiece", name: "One Piece", slug: "one-piece", sortOrder: 0, active: true },
    { code: "pokemon", name: "Pokémon", slug: "pokemon", sortOrder: 1, active: false },
    { code: "yugioh", name: "Yu-Gi-Oh!", slug: "yu-gi-oh", sortOrder: 2, active: false },
    { code: "dragonball", name: "Dragon Ball", slug: "dragon-ball", sortOrder: 3, active: false },
  ];

  for (const g of gameData) {
    await db.insert(games).values(g).onConflictDoNothing();
  }

  // Get One Piece game ID
  const [onepieceGame] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.code, "onepiece"))
    .limit(1);
  const onepieceId = onepieceGame!.id;

  // Seed One Piece sets
  const setData = [
    { code: "OP01", name: "Romance Dawn", releaseDate: "2022-07-22", sortOrder: 0 },
    { code: "OP02", name: "Paramount War", releaseDate: "2022-11-04", sortOrder: 1 },
    { code: "OP03", name: "Pillars of Strength", releaseDate: "2023-01-27", sortOrder: 2 },
    { code: "OP04", name: "Kingdoms of Intrigue", releaseDate: "2023-05-27", sortOrder: 3 },
    { code: "OP05", name: "Awakening of the New Era", releaseDate: "2023-08-25", sortOrder: 4 },
    { code: "OP06", name: "Wings of the Captain", releaseDate: "2023-11-25", sortOrder: 5 },
    { code: "OP07", name: "500 Years in the Future", releaseDate: "2024-02-24", sortOrder: 6 },
    { code: "OP08", name: "Two Legends", releaseDate: "2024-05-25", sortOrder: 7 },
    { code: "OP09", name: "The Four Emperors", releaseDate: "2024-08-24", sortOrder: 8 },
    { code: "OP10", name: "Royal Blood", releaseDate: "2024-11-23", sortOrder: 9 },
    { code: "ST01", name: "Starter Deck: Straw Hat Crew", sortOrder: 100 },
    { code: "ST02", name: "Starter Deck: Worst Generation", sortOrder: 101 },
    { code: "ST03", name: "Starter Deck: The Seven Warlords", sortOrder: 102 },
    { code: "ST04", name: "Starter Deck: Animal Kingdom Pirates", sortOrder: 103 },
    { code: "ST05", name: "Starter Deck: Film Edition", sortOrder: 104 },
    { code: "ST06", name: "Starter Deck: Navy", sortOrder: 105 },
    { code: "ST07", name: "Starter Deck: Big Mom Pirates", sortOrder: 106 },
    { code: "ST08", name: "Starter Deck: Monkey D. Luffy", sortOrder: 107 },
    { code: "ST09", name: "Starter Deck: Yamato", sortOrder: 108 },
    { code: "ST10", name: "Starter Deck: Ultimate Deck", sortOrder: 109 },
    { code: "ST11", name: "Starter Deck: Uta", sortOrder: 110 },
    { code: "ST12", name: "Starter Deck: Zoro & Sanji", sortOrder: 111 },
    { code: "ST13", name: "Starter Deck: The Three Captains", sortOrder: 112 },
    { code: "ST14", name: "Starter Deck: 3D2Y", sortOrder: 113 },
    { code: "ST15", name: "Starter Deck: RED Edward Newgate", sortOrder: 114 },
    { code: "ST16", name: "Starter Deck: GREEN Uta", sortOrder: 115 },
    { code: "EB01", name: "Memorial Collection", releaseDate: "2024-01-27", sortOrder: 50 },
    { code: "PRB01", name: "Premium Booster", releaseDate: "2023-10-28", sortOrder: 51 },
  ];

  for (const s of setData) {
    await db.insert(sets).values({ ...s, gameId: onepieceId }).onConflictDoNothing();
  }

  // Build set ID lookup map
  const allSets = await db.select({ id: sets.id, code: sets.code }).from(sets).where(eq(sets.gameId, onepieceId));
  const setIdMap = Object.fromEntries(allSets.map(s => [s.code, s.id]));

  // Seed 10 sample One Piece cards
  const rate = 208.53;
  const sampleCards = [
    { cardNumber: "OP01-001", sku: "OP-OP01-001-JP", name: "Roronoa Zoro (Leader)", setCode: "OP01", setName: "Romance Dawn", jpy: 17800 },
    { cardNumber: "OP01-002", sku: "OP-OP01-002-JP", name: "Nami", setCode: "OP01", setName: "Romance Dawn", jpy: 2500 },
    { cardNumber: "OP01-003", sku: "OP-OP01-003-JP", name: "Usopp", setCode: "OP01", setName: "Romance Dawn", jpy: 1200 },
    { cardNumber: "OP01-060", sku: "OP-OP01-060-JP", name: "Shanks", setCode: "OP01", setName: "Romance Dawn", jpy: 9800 },
    { cardNumber: "OP02-001", sku: "OP-OP02-001-JP", name: "Monkey D. Luffy (Leader)", setCode: "OP02", setName: "Paramount War", jpy: 22000 },
    { cardNumber: "OP02-002", sku: "OP-OP02-002-JP", name: "Portgas D. Ace", setCode: "OP02", setName: "Paramount War", jpy: 8500 },
    { cardNumber: "OP03-001", sku: "OP-OP03-001-JP", name: "Boa Hancock (Leader)", setCode: "OP03", setName: "Pillars of Strength", jpy: 15000 },
    { cardNumber: "OP03-002", sku: "OP-OP03-002-JP", name: "Crocodile", setCode: "OP03", setName: "Pillars of Strength", jpy: 6200 },
    { cardNumber: "OP04-001", sku: "OP-OP04-001-JP", name: "Kaido (Leader)", setCode: "OP04", setName: "Kingdoms of Intrigue", jpy: 19500 },
    { cardNumber: "OP04-044", sku: "OP-OP04-044-JP", name: "Yamato", setCode: "OP04", setName: "Kingdoms of Intrigue", jpy: 12500 },
  ];

  for (const c of sampleCards) {
    const price = calculatePrice(c.jpy, rate);

    await db.insert(cards).values({
      cardNumber: c.cardNumber,
      sku: c.sku,
      name: c.name,
      setCode: c.setCode,
      setName: c.setName,
      cardrushUrl: `https://www.cardrush-op.jp/product/${c.cardNumber}`,
      cardrushJpy: c.jpy,
      gbpJpyRate: rate,
      baseGbp: price.baseGbp,
      price: price.price,
      lastSyncedAt: new Date(),
      gameId: onepieceId,
      setId: setIdMap[c.setCode],
      category: "singles" as const,
    }).onConflictDoNothing();
  }

  console.log("Seeded database with admin, test client, games, sets, and 10 sample cards");
  await client.end();
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
