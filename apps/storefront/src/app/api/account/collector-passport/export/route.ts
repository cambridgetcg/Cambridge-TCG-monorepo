import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPortablePassportHoldings } from "@/lib/collector-passport/db";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });
  }

  try {
    const holdings = await getPortablePassportHoldings(session.user.id);
    const generatedAt = new Date().toISOString();
    const body = {
      schema: "cambridge.collector-passport.private-archive/1",
      generated_at: generatedAt,
      audience: "account-owner",
      redistribution_notice:
        "Private account archive. It is not a public catalog dataset. Check third-party rights before redistributing records combined with other sources.",
      visibility_notice:
        "publication_selected is the saved item flag only. Effective public visibility also depends on the current notice, public profile and account trust state, and is not asserted by this archive.",
      field_lineage: {
        sku: "Cambridge canonical SKU selected or recorded for this account",
        condition_quantity_notes: "legacy account record; usually account-supplied or a first-party transaction fact",
        acquisition_price_recorded: "legacy derived cost-basis estimate; currency and per-lot provenance were not recorded",
        passport_label_story: "collector-authored",
      },
      excluded_mixed_source_fields: [
        "card_name",
        "card_number",
        "set_code",
        "set_name",
        "rarity",
        "image_url",
        "valuation",
      ],
      holding_count: holdings.length,
      holdings,
    };
    return new NextResponse(`${JSON.stringify(body, null, 2)}\n`, {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="cambridge-tcg-collector-passport-${generatedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("[collector-passport/export] archive unavailable", {
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Collector Passport archive is temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }
}
