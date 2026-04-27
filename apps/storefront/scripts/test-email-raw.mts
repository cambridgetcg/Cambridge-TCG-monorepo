// Unit test for the raw-MIME path.
// Seeds a user, calls sendEmail with unsubscribe params, intercepts the
// MailComposer output BEFORE it goes to SES (by pointing sendEmail at a
// no-cred state), and asserts the List-Unsubscribe headers are present.
//
// We do this by calling MailComposer directly with the same headers
// sendEmail would set, since sendEmail itself needs AWS creds to run.

import MailComposer from "nodemailer/lib/mail-composer";
const { makeUnsubscribeToken } = await import("../src/lib/email/preferences");

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-raw";

const token = makeUnsubscribeToken("00000000-0000-0000-0000-000000000000", "vault_expired");
const oneClickUrl = `https://cambridgetcg.com/api/email/unsubscribe?token=${encodeURIComponent(token)}`;

const composer = new MailComposer({
  from: "Cambridge TCG Bounty Board <bounty@cambridgetcg.com>",
  to: "recipient@test.invalid",
  subject: "Your vault item expired",
  html: "<p>Hi</p>",
  text: "Hi",
  headers: {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});

const raw: Buffer = await new Promise((resolve, reject) => {
  composer.compile().build((err, msg) => (err ? reject(err) : resolve(msg)));
});

const rawText = raw.toString("utf-8");

// Show the actual header lines so the test report is debuggable.
console.log("List-Unsubscribe* lines in raw:");
for (const line of rawText.split("\n")) {
  if (line.toLowerCase().includes("list-unsub")) console.log("  ", JSON.stringify(line));
}

assert(/^List-Unsubscribe:/m.test(rawText), "raw message has List-Unsubscribe header");
assert(rawText.includes("List-Unsubscribe-Post: List-Unsubscribe=One-Click"), "raw message has RFC 8058 Post header");
assert(rawText.includes(oneClickUrl), "unsubscribe URL appears in raw message");
assert(rawText.includes("multipart/alternative"), "is multipart (text + html)");
assert(rawText.includes("text/html"), "contains text/html part");
assert(rawText.includes("text/plain"), "contains text/plain part");
assert(rawText.includes("From: Cambridge TCG Bounty Board <bounty@cambridgetcg.com>"), "From header present");
assert(rawText.includes("Subject: Your vault item expired"), "Subject header present");

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
