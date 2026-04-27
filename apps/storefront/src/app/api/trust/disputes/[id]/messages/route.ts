import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  addDisputeMessage,
  getDisputeMessages,
  userCanAccessDispute,
} from "@/lib/trust/db";
import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";

// Fan out a "new dispute message" notification to the counterparties
// — buyer + seller + raiser — except the sender themselves. Admin
// replies notify the raiser; user replies notify the other party and
// admin (via a system-broadcast kind that admins can watch via the
// admin page). We skip the sender to avoid self-pinging.
async function notifyDisputeCounterparties(
  disputeId: string,
  senderUserId: string | null,
  messagePreview: string,
) {
  const r = await query(
    `SELECT d.id AS dispute_id, d.raised_by,
            t.buyer_id, t.seller_id, d.trade_id
       FROM trade_disputes d JOIN market_trades t ON d.trade_id = t.id
      WHERE d.id = $1`,
    [disputeId],
  );
  if (r.rows.length === 0) return;
  const row = r.rows[0];

  // Counterparties = unique non-sender users among (buyer, seller, raiser).
  const recipients = new Set<string>();
  if (row.buyer_id && row.buyer_id !== senderUserId) recipients.add(row.buyer_id);
  if (row.seller_id && row.seller_id !== senderUserId) recipients.add(row.seller_id);
  if (row.raised_by && row.raised_by !== senderUserId) recipients.add(row.raised_by);

  const preview = messagePreview.slice(0, 140);
  for (const uid of recipients) {
    void notify({
      userId: uid,
      kind: "dispute.message",
      title: senderUserId ? "New dispute reply" : "Admin replied on your dispute",
      body: preview,
      linkUrl: `/account/trades/${row.trade_id}`,
      referenceType: "dispute",
      // Per-message reference — each message should create its own
      // notification, not de-dup with previous ones.
      referenceId: `${disputeId}:${Date.now()}`,
    });
  }
}

// GET — messages for a dispute. Previously unauthed, so anyone with
// a dispute id could read the conversation between its parties.
// Now requires admin OR party-to-trade membership.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await isAdmin();
  if (!admin) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!(await userCanAccessDispute(id, session.user.id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
  }
  const messages = await getDisputeMessages(id);
  return NextResponse.json({ messages });
}

// POST — add message. Admin posts are stored with sender_id=NULL + is_admin=true
// after migration 0057 made sender_id nullable. Previously the handler
// grabbed `SELECT id FROM users LIMIT 1` as the sender — which attributed
// admin replies to whichever real user happened to be first in the table.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  if (!body.message?.trim()) return NextResponse.json({ error: "Message required." }, { status: 400 });
  if (body.message.trim().length > 4000) {
    return NextResponse.json({ error: "Message too long (4000 char max)." }, { status: 400 });
  }

  const trimmed = body.message.trim();

  if (await isAdmin()) {
    const msg = await addDisputeMessage(id, null, trimmed, true);
    void notifyDisputeCounterparties(id, null, trimmed);
    return NextResponse.json({ message: msg });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!(await userCanAccessDispute(id, session.user.id))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const msg = await addDisputeMessage(id, session.user.id, trimmed, false);
  void notifyDisputeCounterparties(id, session.user.id, trimmed);
  return NextResponse.json({ message: msg });
}
