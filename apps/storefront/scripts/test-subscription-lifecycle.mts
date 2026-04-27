// E2E for subscription self-service. Stripe is the external dependency
// here; we test the DB invariants (column writes, idempotency, schema)
// by exercising the exact SQL the lib + webhook handlers run, rather
// than going through the Stripe SDK against a live key.
//
// Suites:
//   1. cancel: cancel_at_period_end flag + expires_at mirror
//   2. resume: clears the flag
//   3. webhook subscription.updated: portal-side change syncs to DB
//   4. webhook subscription.deleted: status→cancelled
//   5. checkout.session.completed: customer_id stored, payment method
//      captured, cancel_at flag cleared on (re-)activation
//   6. Schema regression for migration 0059

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

async function makeUser(label: string, opts: {
  active: boolean;
  customerId?: string | null;
  cancelAt?: boolean;
} = { active: true }): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name, subscription_status, subscription_stripe_id,
       subscription_cancel_at_period_end, stripe_customer_id, subscription_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')
     RETURNING id`,
    [
      `${label}@test.invalid`, label,
      opts.active ? "active" : null,
      opts.active ? `sub_test_${label}` : null,
      opts.cancelAt ?? false,
      opts.customerId === undefined ? `cus_test_${label}` : opts.customerId,
    ],
  );
  return u.rows[0].id;
}

async function getUser(id: string) {
  const r = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return r.rows[0];
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

// SQL the lib's cancelSubscription runs after Stripe confirms.
async function applyCancel(userId: string, periodEndUnix: number) {
  await pool.query(
    `UPDATE users
        SET subscription_cancel_at_period_end = true,
            subscription_expires_at = COALESCE(to_timestamp($2), subscription_expires_at),
            updated_at = NOW()
      WHERE id = $1`,
    [userId, periodEndUnix],
  );
}

// SQL resumeSubscription runs.
async function applyResume(userId: string) {
  await pool.query(
    `UPDATE users
        SET subscription_cancel_at_period_end = false,
            updated_at = NOW()
      WHERE id = $1`,
    [userId],
  );
}

// SQL the customer.subscription.updated webhook handler runs.
async function applyWebhookUpdated(opts: {
  subId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEndUnix: number | null;
  pmBrand?: string | null;
  pmLast4?: string | null;
}) {
  await pool.query(
    `UPDATE users
        SET subscription_status = $2,
            subscription_cancel_at_period_end = $3,
            subscription_expires_at = COALESCE(to_timestamp($4), subscription_expires_at),
            subscription_payment_brand = COALESCE($5, subscription_payment_brand),
            subscription_payment_last4 = COALESCE($6, subscription_payment_last4),
            tier_calculated_at = NOW(),
            updated_at = NOW()
      WHERE subscription_stripe_id = $1`,
    [opts.subId, opts.status, opts.cancelAtPeriodEnd, opts.periodEndUnix, opts.pmBrand ?? null, opts.pmLast4 ?? null],
  );
}

// SQL the customer.subscription.deleted webhook runs.
async function applyWebhookDeleted(subId: string) {
  await pool.query(
    `UPDATE users
        SET subscription_status = 'cancelled',
            tier_calculated_at = NOW(),
            updated_at = NOW()
      WHERE subscription_stripe_id = $1`,
    [subId],
  );
}

// SQL the checkout.session.completed webhook runs for a Platinum sub.
async function applyCheckoutCompleted(opts: {
  userId: string; tierId: string; subId: string; expiresAt: Date;
  plan: "monthly" | "annual";
  customerId: string | null; pmBrand: string | null; pmLast4: string | null;
}) {
  await pool.query(
    `UPDATE users
        SET paid_tier_id = $2, tier_id = $2,
            subscription_status = 'active',
            subscription_stripe_id = $3,
            subscription_expires_at = $4,
            subscription_cancel_at_period_end = false,
            subscription_plan = $5,
            stripe_customer_id = COALESCE(stripe_customer_id, $6),
            subscription_payment_brand = $7,
            subscription_payment_last4 = $8,
            tier_source = 'subscription',
            tier_calculated_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [opts.userId, opts.tierId, opts.subId, opts.expiresAt.toISOString(), opts.plan, opts.customerId, opts.pmBrand, opts.pmLast4],
  );
}

try {
  const t = Date.now().toString(36).slice(-5);
  const tier = await pool.query(`SELECT id FROM tiers WHERE name='Platinum' LIMIT 1`);
  const platinumId: string | null = tier.rows[0]?.id ?? null;
  if (!platinumId) {
    console.error("Platinum tier missing — run seeds first");
    process.exit(1);
  }

  // ── Suite 1: cancel ──
  console.log("\n— Suite 1: cancel mirrors Stripe state into DB");
  const u1 = await makeUser(`sub-${t}-1`, { active: true });
  const periodEnd1 = Math.floor(Date.now() / 1000) + 30 * 86400;
  await applyCancel(u1, periodEnd1);

  const row1 = await getUser(u1);
  assert(row1.subscription_cancel_at_period_end === true,
    "cancel_at_period_end set in DB after lib's UPDATE");
  assert(new Date(row1.subscription_expires_at).getTime() >= Date.now() + 29 * 86400 * 1000,
    "expires_at advanced to period end (~30 days out)");
  assert(row1.subscription_status === "active",
    "status stays 'active' until the period actually elapses");

  // Re-cancel is idempotent (SQL is COALESCE-safe + flag is already true)
  await applyCancel(u1, periodEnd1);
  const row1b = await getUser(u1);
  assert(row1b.subscription_cancel_at_period_end === true, "re-cancel keeps flag true");

  // ── Suite 2: resume ──
  console.log("\n— Suite 2: resume clears the flag");
  await applyResume(u1);
  const row2 = await getUser(u1);
  assert(row2.subscription_cancel_at_period_end === false,
    "cancel_at_period_end cleared after resume");
  assert(row2.subscription_status === "active",
    "status stays 'active' through resume");

  // ── Suite 3: webhook subscription.updated ──
  console.log("\n— Suite 3: subscription.updated mirrors portal-side changes");
  const u3 = await makeUser(`sub-${t}-3`, { active: true });
  await applyWebhookUpdated({
    subId: `sub_test_sub-${t}-3`,
    status: "active",
    cancelAtPeriodEnd: true,
    periodEndUnix: Math.floor(Date.now() / 1000) + 60 * 86400,
    pmBrand: "visa", pmLast4: "4242",
  });
  const row3 = await getUser(u3);
  assert(row3.subscription_cancel_at_period_end === true,
    "portal-side cancel reflected in DB via webhook");
  assert(row3.subscription_payment_brand === "visa", "PM brand captured from webhook");
  assert(row3.subscription_payment_last4 === "4242", "PM last4 captured from webhook");

  // Portal-side resume
  await applyWebhookUpdated({
    subId: `sub_test_sub-${t}-3`,
    status: "active",
    cancelAtPeriodEnd: false,
    periodEndUnix: Math.floor(Date.now() / 1000) + 60 * 86400,
  });
  const row3b = await getUser(u3);
  assert(row3b.subscription_cancel_at_period_end === false,
    "portal-side resume reflected via webhook");
  assert(row3b.subscription_payment_brand === "visa",
    "COALESCE keeps PM brand when webhook payload omits it");

  // Status transition (e.g. payment failed → past_due)
  await applyWebhookUpdated({
    subId: `sub_test_sub-${t}-3`,
    status: "past_due",
    cancelAtPeriodEnd: false,
    periodEndUnix: null,
  });
  const row3c = await getUser(u3);
  assert(row3c.subscription_status === "past_due",
    "status transition (active → past_due) reflected");

  // ── Suite 4: subscription.deleted ──
  console.log("\n— Suite 4: subscription.deleted final state");
  await applyWebhookDeleted(`sub_test_sub-${t}-3`);
  const row4 = await getUser(u3);
  assert(row4.subscription_status === "cancelled",
    "subscription.deleted sets status='cancelled'");

  // ── Suite 5: checkout.session.completed for new subscription ──
  console.log("\n— Suite 5: checkout completion stores customer_id + PM");
  const u5 = await makeUser(`sub-${t}-5`, { active: false, customerId: null });
  // Seed user with no subscription, no customer id
  await pool.query(
    `UPDATE users SET subscription_status = NULL, subscription_stripe_id = NULL,
       stripe_customer_id = NULL WHERE id = $1`,
    [u5],
  );

  await applyCheckoutCompleted({
    userId: u5,
    tierId: platinumId,
    subId: `sub_e2e_${t}`,
    expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
    plan: "monthly",
    customerId: `cus_e2e_${t}`,
    pmBrand: "mastercard",
    pmLast4: "5556",
  });
  const row5 = await getUser(u5);
  assert(row5.subscription_status === "active", "subscription activates");
  assert(row5.subscription_stripe_id === `sub_e2e_${t}`, "subscription id stored");
  assert(row5.stripe_customer_id === `cus_e2e_${t}`, "customer id stored on first checkout");
  assert(row5.subscription_plan === "monthly", "plan stored");
  assert(row5.subscription_payment_brand === "mastercard", "PM brand captured");
  assert(row5.subscription_payment_last4 === "5556", "PM last4 captured");
  assert(row5.subscription_cancel_at_period_end === false,
    "cancel_at_period_end resets to false on (re-)activation");
  assert(row5.tier_source === "subscription", "tier_source set to subscription");

  // Re-checkout (e.g. user resubs after cancellation) — customer_id
  // already on file means COALESCE keeps the existing id, doesn't
  // overwrite. Critical so we don't fragment Stripe customers.
  await applyCheckoutCompleted({
    userId: u5,
    tierId: platinumId,
    subId: `sub_e2e_${t}_v2`,
    expiresAt: new Date(Date.now() + 60 * 86400 * 1000),
    plan: "annual",
    customerId: `cus_DIFFERENT_${t}`,  // Stripe sent a different customer somehow
    pmBrand: "amex",
    pmLast4: "0005",
  });
  const row5b = await getUser(u5);
  assert(row5b.stripe_customer_id === `cus_e2e_${t}`,
    "COALESCE preserves original customer_id on re-checkout");
  assert(row5b.subscription_plan === "annual", "plan updated to annual");
  assert(row5b.subscription_stripe_id === `sub_e2e_${t}_v2`, "subscription id updated");

  // ── Suite 6: schema regression ──
  console.log("\n— Suite 6: migration 0059 schema");
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='users' AND column_name IN
        ('stripe_customer_id', 'subscription_cancel_at_period_end',
         'subscription_payment_brand', 'subscription_payment_last4',
         'subscription_plan')`,
  );
  assert(cols.rows.length === 5,
    `all 5 migration 0059 columns exist (got ${cols.rows.length})`);

  const idx = await pool.query(
    `SELECT indexname FROM pg_indexes
      WHERE tablename='users' AND indexname IN
        ('idx_users_stripe_customer', 'idx_users_subscription_stripe')`,
  );
  assert(idx.rows.length === 2,
    `lookup indexes exist (got ${idx.rows.length})`);

  // Ensure the cancel flag column has the NOT NULL default the migration set.
  const flagDefault = await pool.query(
    `SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_name='users' AND column_name='subscription_cancel_at_period_end'`,
  );
  assert(flagDefault.rows[0]?.is_nullable === "NO",
    "cancel_at_period_end is NOT NULL");
  assert(/false/.test(flagDefault.rows[0]?.column_default ?? ""),
    `default is false (got ${flagDefault.rows[0]?.column_default})`);

  // ── Cleanup ──
  await cleanup([u1, u3, u5]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
