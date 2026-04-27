import { NextResponse } from "next/server";
import { fetchPrices } from "@/lib/wholesale/client";
import { generateReference, createSubmission } from "@/lib/tradein/db";
import { sendConfirmationEmail } from "@/lib/tradein/email";
import { auth } from "@/lib/auth";
import { awardAchievement } from "@/lib/social/db";

// Simple in-memory rate limiter: max 5 submissions per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }

  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 600_000);

interface SubmitItem {
  sku: string;
  card_number: string;
  name: string;
  set_code: string | null;
  quantity: number;
  cash_price: number;
  credit_price: number;
}

interface SubmitBody {
  items: SubmitItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: "cash" | "credit";
  deliveryMethod: "mail" | "instore";
  bankSortCode?: string;
  bankAccountNumber?: string;
  isOver18: boolean;
  conditionDeclaration: boolean;
  notes?: string;
}

export async function POST(request: Request) {
  try {
    // Rate limit by IP
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const body: SubmitBody = await request.json();

    // Validate required fields
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "No items provided." }, { status: 400 });
    }
    if (!body.customerName?.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!body.customerEmail?.trim() || !body.customerEmail.includes("@")) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!["cash", "credit"].includes(body.paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }
    if (!["mail", "instore"].includes(body.deliveryMethod)) {
      return NextResponse.json({ error: "Invalid delivery method." }, { status: 400 });
    }
    if (!body.isOver18) {
      return NextResponse.json({ error: "You must be 18 or over." }, { status: 400 });
    }
    if (!body.conditionDeclaration) {
      return NextResponse.json({ error: "Condition declaration is required." }, { status: 400 });
    }

    // Validate individual items
    for (const item of body.items) {
      if (!item.sku || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: "Invalid item in submission." }, { status: 400 });
      }
    }

    // Re-validate prices against current buylist (allow 10% drift)
    const [creditRes, cashRes] = await Promise.all([
      fetchPrices({ game: "one-piece", channel: "tradein-credit", limit: 500 }),
      fetchPrices({ game: "one-piece", channel: "tradein-cash", limit: 500 }),
    ]);

    const currentCreditMap = new Map<string, number>();
    for (const item of creditRes.items) {
      currentCreditMap.set(item.sku, item.channel_price ?? 0);
    }
    const currentCashMap = new Map<string, number>();
    for (const item of cashRes.items) {
      currentCashMap.set(item.sku, item.channel_price ?? 0);
    }

    for (const item of body.items) {
      const currentCredit = currentCreditMap.get(item.sku) ?? 0;
      const currentCash = currentCashMap.get(item.sku) ?? 0;

      if (item.credit_price > 0 && currentCredit > 0) {
        const drift = Math.abs(item.credit_price - currentCredit) / currentCredit;
        if (drift > 0.10) {
          return NextResponse.json(
            { error: `Price has changed for ${item.name}. Please refresh the buylist.` },
            { status: 409 }
          );
        }
      }
      if (item.cash_price > 0 && currentCash > 0) {
        const drift = Math.abs(item.cash_price - currentCash) / currentCash;
        if (drift > 0.10) {
          return NextResponse.json(
            { error: `Price has changed for ${item.name}. Please refresh the buylist.` },
            { status: 409 }
          );
        }
      }
    }

    // Calculate totals
    let cashTotal = 0;
    let creditTotal = 0;
    for (const item of body.items) {
      cashTotal += item.cash_price * item.quantity;
      creditTotal += item.credit_price * item.quantity;
    }

    // Generate reference and expiry
    const reference = await generateReference();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Insert into DB
    await createSubmission({
      reference,
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim().toLowerCase(),
      customerPhone: body.customerPhone?.trim(),
      paymentMethod: body.paymentMethod,
      bankSortCode: body.bankSortCode,
      bankAccountNumber: body.bankAccountNumber,
      deliveryMethod: body.deliveryMethod,
      isOver18: body.isOver18,
      notes: body.notes,
      cashTotal,
      creditTotal,
      expiresAt,
      items: body.items,
    });

    // Social: first trade-in achievement (if user is logged in)
    auth().then((session) => {
      if (session?.user?.id) {
        awardAchievement(session.user.id, "first_tradein").catch(() => {});
      }
    }).catch(() => {});

    // Send confirmation email (non-blocking — don't fail submission if email fails)
    try {
      await sendConfirmationEmail({
        reference,
        customerName: body.customerName.trim(),
        customerEmail: body.customerEmail.trim().toLowerCase(),
        paymentMethod: body.paymentMethod,
        deliveryMethod: body.deliveryMethod,
        items: body.items.map((i) => ({
          name: i.name,
          card_number: i.card_number,
          quantity: i.quantity,
          cash_price: i.cash_price,
          credit_price: i.credit_price,
        })),
        cashTotal,
        creditTotal,
        expiresAt,
      });
    } catch (emailErr) {
      console.error("[tradein] Email failed but submission succeeded:", emailErr);
    }

    return NextResponse.json({
      reference,
      expiresAt: expiresAt.toISOString(),
      cashTotal,
      creditTotal,
    });
  } catch (err) {
    console.error("[tradein] Submit error:", err);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
