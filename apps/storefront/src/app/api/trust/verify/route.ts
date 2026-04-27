import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  submitVerification,
  getVerification,
  listPendingVerifications,
  listAllVerifications,
  approveVerification,
  rejectVerification,
} from "@/lib/trust/db";
import { UK_POSTCODE_REGEX } from "@/lib/trust/types";
import { notify } from "@/lib/notifications/db";

// GET — user's verification status, or admin list
export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin") === "true";

  if (admin) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pending = url.searchParams.get("pending") === "true";
    const verifications = pending ? await listPendingVerifications() : await listAllVerifications();
    return NextResponse.json({ verifications });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const verification = await getVerification(session.user.id);
  return NextResponse.json({ verification });
}

// Accept both snake_case and camelCase from the body. The page has
// always sent snake_case; this route previously only validated
// camelCase, so every submit failed with "Full legal name required" —
// the verification flow has been silently broken since day one.
function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  return body[camel] ?? body[snake];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// POST — submit verification (customer) or approve/reject (admin)
export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  // ── Admin actions ──
  if (body.action === "approve" || body.action === "reject") {
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const targetUserId = body.userId as string;

    if (body.action === "approve") {
      const notes = typeof body.notes === "string" ? body.notes : undefined;
      await approveVerification(targetUserId, notes);
      void notify({
        userId: targetUserId,
        kind: "verification.approved",
        title: "Verification approved",
        body: "You're verified. You can now trade P2P and raise disputes.",
        linkUrl: "/account/verify",
        referenceType: "verification",
        referenceId: `${targetUserId}:approved`,
      });
      return NextResponse.json({ status: "verified" });
    }

    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return NextResponse.json({ error: "Rejection reason required." }, { status: 400 });
    }
    const reason = body.reason.trim();
    await rejectVerification(targetUserId, reason);
    void notify({
      userId: targetUserId,
      kind: "verification.rejected",
      title: "Verification not accepted",
      body: `${reason} Go to your verification page to resubmit.`,
      linkUrl: "/account/verify",
      // Per-rejection reference so a second rejection after resubmit
      // creates a distinct notification.
      referenceType: "verification",
      referenceId: `${targetUserId}:rejected:${Date.now()}`,
    });
    return NextResponse.json({ status: "rejected" });
  }

  // ── Customer submission ──
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const fullLegalName = str(pick(body, "fullLegalName", "full_legal_name"));
  const dateOfBirth   = str(pick(body, "dateOfBirth", "date_of_birth"));
  const addressLine1  = str(pick(body, "addressLine1", "address_line1"));
  const addressLine2  = str(pick(body, "addressLine2", "address_line2"));
  const city          = str(body.city);
  const county        = str(body.county);
  const postcode      = str(body.postcode);
  const phone         = str(body.phone);
  const bankSortCode  = str(pick(body, "bankSortCode", "bank_sort_code"));
  const bankAccountNumber = str(pick(body, "bankAccountNumber", "bank_account_number"));
  const bankAccountName   = str(pick(body, "bankAccountName", "bank_account_name"));

  // Per-field validation — return explicit messages indexed by field
  // name so the client can highlight the offending input rather than
  // swapping in one generic toast.
  const errors: Record<string, string> = {};
  if (!fullLegalName) errors.fullLegalName = "Full legal name required.";
  if (!dateOfBirth) errors.dateOfBirth = "Date of birth required.";
  if (!addressLine1) errors.addressLine1 = "Address required.";
  if (!city) errors.city = "City required.";
  if (!postcode) errors.postcode = "Postcode required.";
  else if (!UK_POSTCODE_REGEX.test(postcode)) errors.postcode = "Enter a valid UK postcode.";

  if (dateOfBirth && !errors.dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      errors.dateOfBirth = "Invalid date.";
    } else {
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 18) errors.dateOfBirth = "You must be 18 or over to trade P2P.";
      else if (age > 120) errors.dateOfBirth = "Enter your actual date of birth.";
    }
  }

  // Bank details: all-or-nothing — if the user provided any, require
  // the trio. Half-filled details make seller payouts fail later.
  const anyBank = !!(bankSortCode || bankAccountNumber || bankAccountName);
  if (anyBank) {
    if (!bankSortCode) errors.bankSortCode = "Sort code required with account details.";
    if (!bankAccountNumber) errors.bankAccountNumber = "Account number required with account details.";
    if (!bankAccountName) errors.bankAccountName = "Account name required with account details.";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Validation failed.", fields: errors }, { status: 400 });
  }

  const verification = await submitVerification(session.user.id, {
    fullLegalName,
    dateOfBirth,
    addressLine1,
    addressLine2: addressLine2 || undefined,
    city,
    county: county || undefined,
    postcode,
    phone: phone || undefined,
    bankSortCode: bankSortCode || undefined,
    bankAccountNumber: bankAccountNumber || undefined,
    bankAccountName: bankAccountName || undefined,
  });

  return NextResponse.json({ verification });
}
