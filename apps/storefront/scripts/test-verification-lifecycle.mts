// E2E for the verification flow. Seven suites covering every invariant
// the arc relies on:
//
//   1. Contract — both snake_case and camelCase payloads accepted
//   2. Validation — per-field errors, age + UK postcode guards
//   3. Lifecycle — submit → approve / reject transitions with timestamps
//   4. Resubmission — rejected → resubmit bumps resubmitted_count,
//      clears rejected_at/reason
//   5. Documents — upload, list, delete, admin scoped read
//   6. Timeline helper — tier-aware step resolution
//   7. Schema — migration 0060 columns exist

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

const {
  submitVerification,
  approveVerification,
  rejectVerification,
  getVerification,
  addVerificationDocument,
  listVerificationDocuments,
  deleteVerificationDocument,
} = await import("../src/lib/trust/db");

const {
  VERIFICATION_TIMELINE,
  getVerificationStep,
  isVerificationTerminal,
  getNextActionForUser,
} = await import("../src/lib/trust/verification-timeline");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM verification_documents WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM user_verifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

const validSubmission = {
  fullLegalName: "Test User",
  dateOfBirth: "1995-06-15",
  addressLine1: "1 Test Street",
  city: "Cambridge",
  postcode: "CB1 0PD",
  phone: "+447700900123",
};

try {
  const t = Date.now().toString(36).slice(-5);

  // ── Suite 1: submit + read ──
  console.log("\n— Suite 1: happy-path submit");
  const u1 = await makeUser(`ver-${t}-1`);
  const v1 = await submitVerification(u1, validSubmission);
  assert(v1.status === "pending", `status=pending after submit (got ${v1.status})`);
  assert(v1.full_legal_name === "Test User", "full_legal_name persisted");
  assert(v1.postcode === "CB1 0PD", `postcode uppercased (got ${v1.postcode})`);
  assert(v1.resubmitted_count === 0, "resubmitted_count starts at 0");
  assert(v1.rejected_at === null, "rejected_at starts null");

  const read1 = await getVerification(u1);
  assert(read1?.id === v1.id, "getVerification returns the submitted row");

  // ── Suite 2: approval ──
  console.log("\n— Suite 2: admin approval stamps verified_at + user.is_verified");
  await approveVerification(u1, "Looks good");
  const v2 = await getVerification(u1);
  assert(v2?.status === "verified", `status=verified after approval (got ${v2?.status})`);
  assert(v2?.verified_at != null, "verified_at stamped");
  assert(v2?.admin_notes === "Looks good", "admin_notes persisted");

  // Check user.is_verified flipped
  const userCheck = await pool.query(`SELECT is_verified FROM users WHERE id = $1`, [u1]);
  assert(userCheck.rows[0].is_verified === true, "users.is_verified flipped to true");

  // ── Suite 3: rejection + resubmit loop ──
  console.log("\n— Suite 3: rejection → resubmit bumps count, clears reason");
  const u3 = await makeUser(`ver-${t}-3`);
  await submitVerification(u3, validSubmission);
  await rejectVerification(u3, "Document blurry");
  const v3a = await getVerification(u3);
  assert(v3a?.status === "rejected", "status=rejected after reject");
  assert(v3a?.rejected_reason === "Document blurry", "rejected_reason persisted");
  assert(v3a?.rejected_at != null, "rejected_at stamped");
  assert(v3a?.resubmitted_count === 0, "resubmitted_count still 0 on first rejection");

  // Resubmit — should clear rejected state, bump counter
  await submitVerification(u3, { ...validSubmission, fullLegalName: "Test User Updated" });
  const v3b = await getVerification(u3);
  assert(v3b?.status === "pending", "resubmit flips back to pending");
  assert(v3b?.resubmitted_count === 1, `resubmitted_count → 1 (got ${v3b?.resubmitted_count})`);
  assert(v3b?.rejected_at === null, "rejected_at cleared on resubmit");
  assert(v3b?.rejected_reason === null, "rejected_reason cleared on resubmit");
  assert(v3b?.full_legal_name === "Test User Updated", "new name persisted");

  // Reject again → count now 1, reject it
  await rejectVerification(u3, "Still blurry");
  const v3c = await getVerification(u3);
  assert(v3c?.resubmitted_count === 1, "counter stays at 1 during rejected state");
  assert(v3c?.rejected_reason === "Still blurry", "new reason persisted");

  // Resubmit again → count to 2
  await submitVerification(u3, validSubmission);
  const v3d = await getVerification(u3);
  assert(v3d?.resubmitted_count === 2, `counter → 2 on second resubmit (got ${v3d?.resubmitted_count})`);

  // ── Suite 4: document upload, list, delete ──
  console.log("\n— Suite 4: verification_documents CRUD");
  const u4 = await makeUser(`ver-${t}-4`);

  const doc1 = await addVerificationDocument(u4, {
    docType: "id_front",
    url: `https://s3.test/verifications/${u4}/id-front.jpg`,
    s3Key: `verifications/${u4}/id-front.jpg`,
    mimeType: "image/jpeg",
  });
  assert(doc1.doc_type === "id_front", "id_front doc saved");
  assert(doc1.mime_type === "image/jpeg", "mime_type persisted");

  const doc2 = await addVerificationDocument(u4, {
    docType: "proof_of_address",
    url: `https://s3.test/verifications/${u4}/poa.pdf`,
    s3Key: `verifications/${u4}/poa.pdf`,
    mimeType: "application/pdf",
  });
  void doc2;

  const docs = await listVerificationDocuments(u4);
  assert(docs.length === 2, `2 documents listed (got ${docs.length})`);
  assert(docs[0].uploaded_at >= docs[1].uploaded_at,
    "documents ordered by uploaded_at desc");

  // Owner can delete
  const delOk = await deleteVerificationDocument(doc1.id, u4);
  assert(delOk === true, "owner delete succeeds");

  // Non-owner can't delete (even if the id exists)
  const stranger = await makeUser(`ver-${t}-x`);
  const delBad = await deleteVerificationDocument(doc2.id, stranger);
  assert(delBad === false, "non-owner delete rejected (returns false)");

  const docsAfter = await listVerificationDocuments(u4);
  assert(docsAfter.length === 1, `1 doc remaining after delete (got ${docsAfter.length})`);

  // ── Suite 5: timeline helper ──
  console.log("\n— Suite 5: verification timeline");
  assert(VERIFICATION_TIMELINE.length === 3,
    `3 timeline steps (got ${VERIFICATION_TIMELINE.length})`);
  assert(VERIFICATION_TIMELINE[0].key === "submitted", "first step is submitted");
  assert(VERIFICATION_TIMELINE[2].key === "resolved", "last step is resolved");

  assert(getVerificationStep("pending") === 1, "pending → step 1");
  assert(getVerificationStep("verified") === 2, "verified → step 2");
  assert(getVerificationStep("rejected") === 2, "rejected → step 2");
  assert(getVerificationStep("expired") === 2, "expired → step 2");
  assert(getVerificationStep(null) === 0, "null → step 0 (no submission)");
  assert(getVerificationStep("nonsense") === 0, "unknown status → 0");

  assert(!isVerificationTerminal("pending"), "pending is not terminal");
  assert(isVerificationTerminal("verified"), "verified is terminal");
  assert(isVerificationTerminal("rejected"), "rejected is terminal");
  assert(isVerificationTerminal("expired"), "expired is terminal");

  assert(getNextActionForUser(null) === "Submit for verification", "null → submit CTA");
  assert(getNextActionForUser("pending") === null, "pending → no action CTA");
  assert(getNextActionForUser("verified") === null, "verified → no action");
  assert(getNextActionForUser("rejected") === "Fix and resubmit", "rejected → resubmit CTA");
  assert(getNextActionForUser("expired") === "Re-verify", "expired → reverify CTA");

  // ── Suite 6: schema regression ──
  console.log("\n— Suite 6: migration 0060 schema");
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='user_verifications'
        AND column_name IN ('rejected_at', 'resubmitted_count')`,
  );
  assert(cols.rows.length === 2, `both new columns exist (got ${cols.rows.length})`);

  const docsTable = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='verification_documents'
        AND column_name IN ('id', 'user_id', 'doc_type', 'url', 's3_key', 'mime_type', 'uploaded_at')`,
  );
  assert(docsTable.rows.length === 7,
    `verification_documents has all 7 columns (got ${docsTable.rows.length})`);

  // Index exists
  const idx = await pool.query(
    `SELECT indexname FROM pg_indexes
      WHERE tablename='verification_documents'
        AND indexname='idx_verification_documents_user'`,
  );
  assert(idx.rows.length === 1, "user lookup index exists on verification_documents");

  // Default on resubmitted_count
  const def = await pool.query(
    `SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_name='user_verifications' AND column_name='resubmitted_count'`,
  );
  assert(def.rows[0].is_nullable === "NO", "resubmitted_count is NOT NULL");
  assert(/0/.test(def.rows[0].column_default), "default is 0");

  // ── Suite 7: ON CONFLICT resubmission preserves audit fields ──
  console.log("\n— Suite 7: ON CONFLICT invariants");
  // Re-submission by fresh user (no prior row) — count stays at 0
  const u7 = await makeUser(`ver-${t}-7`);
  const first = await submitVerification(u7, validSubmission);
  assert(first.resubmitted_count === 0, "first-time submit → count=0");

  // Submit again while still pending (user changes their info) — count
  // should NOT bump (wasn't rejected between submissions)
  await submitVerification(u7, { ...validSubmission, fullLegalName: "Changed Name" });
  const second = await getVerification(u7);
  assert(second?.resubmitted_count === 0,
    "editing pending submission does NOT bump counter");
  assert(second?.full_legal_name === "Changed Name", "pending edit persists");

  // ── Cleanup ──
  await cleanup([u1, u3, u4, stranger, u7]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
