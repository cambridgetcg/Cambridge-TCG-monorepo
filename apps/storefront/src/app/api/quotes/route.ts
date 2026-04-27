import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { createQuoteRequest, listAllQuotes } from "@/lib/quote/db";
import { sendQuoteReceivedEmail, sendQuoteAdminNotification } from "@/lib/quote/email";

// GET — admin: list all quotes
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const quotes = await listAllQuotes();
  return NextResponse.json({ quotes });
}

// POST — public: submit a custom quote request
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.customerName?.trim() || !body.customerEmail?.trim()) {
      return NextResponse.json({ error: "Name and email required." }, { status: 400 });
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "At least one card is required." }, { status: 400 });
    }

    for (const item of body.items) {
      if (!item.description?.trim()) {
        return NextResponse.json({ error: "Each card needs a description." }, { status: 400 });
      }
    }

    const { reference } = await createQuoteRequest({
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim().toLowerCase(),
      customerPhone: body.customerPhone?.trim(),
      paymentMethod: body.paymentMethod || "credit",
      deliveryMethod: body.deliveryMethod || "mail",
      notes: body.notes?.trim(),
      items: body.items,
    });

    // Emails (non-blocking)
    const emailData = {
      reference,
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim().toLowerCase(),
      itemCount: body.items.length,
    };
    sendQuoteReceivedEmail(emailData).catch((e) => console.error("[quote] Email failed:", e));
    sendQuoteAdminNotification(emailData).catch((e) => console.error("[quote] Admin email failed:", e));

    return NextResponse.json({ reference });
  } catch (err) {
    console.error("[quote] Submit error:", err);
    return NextResponse.json({ error: "Failed to submit quote request." }, { status: 500 });
  }
}
