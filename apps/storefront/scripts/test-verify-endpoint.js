// Seeds a bounty_pulls row and hits /api/bounty/pulls/[id]/proof to verify
// the public endpoint returns the expected shape + exposes the seed
// (server_seed is published AFTER a draw; we simulate that state directly).

import pg from "pg";
import crypto from "node:crypto";

const url = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function main() {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Verify Test') RETURNING id`,
    [`verify-test-${Date.now()}@test.invalid`],
  );
  const userId = u.rows[0].id;

  const serverSeed = crypto.randomBytes(32).toString("hex");
  const commitment = sha256(serverSeed);
  const clientSeed = userId;
  const nonce = 42;

  const p = await pool.query(
    `INSERT INTO bounty_pulls (user_id, tier, earned_from, rolled_rarity, rolled_sku, rolled_spot_gbp,
                                rng_server_seed_hash, rng_server_seed, rng_client_seed, rng_nonce)
     VALUES ($1, 'uncommon', 'test_seed', 'R', 'TEST-R-1', 5.00,
             $2, $3, $4, $5)
     RETURNING id`,
    [userId, commitment, serverSeed, clientSeed, nonce],
  );
  const pullId = p.rows[0].id;

  const res = await fetch(`http://localhost:3000/api/bounty/pulls/${pullId}/proof`);
  const body = await res.json();

  let ok = true;
  if (res.status !== 200) { console.error("FAIL: status not 200"); ok = false; }
  if (body.commitment !== commitment) { console.error("FAIL: commitment mismatch"); ok = false; }
  if (body.server_seed !== serverSeed) { console.error("FAIL: server_seed mismatch"); ok = false; }
  if (body.client_seed !== clientSeed) { console.error("FAIL: client_seed mismatch"); ok = false; }
  if (body.nonce !== nonce) { console.error("FAIL: nonce mismatch"); ok = false; }
  if (body.rolled_rarity !== "R") { console.error("FAIL: rolled_rarity mismatch"); ok = false; }
  if (!body.rarity_weights) { console.error("FAIL: rarity_weights missing"); ok = false; }

  // Verify the SHA-256 chain client-side (matches what the browser does)
  const computed = sha256(serverSeed);
  if (computed !== commitment) { console.error("FAIL: sha256(seed) != commitment"); ok = false; }

  console.log("proof response:", JSON.stringify(body, null, 2).split("\n").slice(0, 14).join("\n"));

  // Cleanup
  await pool.query(`DELETE FROM bounty_pulls WHERE user_id=$1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);

  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
}

main().finally(() => pool.end());
