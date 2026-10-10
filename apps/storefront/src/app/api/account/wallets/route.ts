import { auth } from "@/lib/auth";
import {
  getWalletLinkConfig,
  walletLinkAvailability,
} from "@/lib/wallets/config";
import { participantJson } from "@/lib/wallets/http";
import { listParticipantWalletLinks } from "@/lib/wallets/service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return participantJson(
      { error: { code: "SIGN_IN_REQUIRED", message: "Sign in required." } },
      401,
    );
  }

  const config = getWalletLinkConfig();
  try {
    const wallets = await listParticipantWalletLinks(session.user.id);
    return participantJson({
      availability: walletLinkAvailability(config, true),
      wallets,
    });
  } catch (error) {
    // GET remains a truthful availability surface when the migration or DB is
    // unavailable. An empty array is paired with storage_ready=false so it can
    // never be mistaken for a verified claim that the account has no links.
    console.error("[account/wallets/list] unavailable:", error);
    return participantJson({
      availability: walletLinkAvailability(config, false),
      wallets: [],
    });
  }
}
