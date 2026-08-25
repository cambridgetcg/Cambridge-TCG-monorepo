import { auth } from "@/lib/auth";
import { WALLET_PROOF_SCOPE } from "@/lib/wallets/types";
import {
  participantError,
  participantJson,
  readParticipantJson,
} from "@/lib/wallets/http";
import { verifyParticipantWalletChallenge } from "@/lib/wallets/service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return participantJson(
      { error: { code: "SIGN_IN_REQUIRED", message: "Sign in required." } },
      401,
    );
  }
  const parsed = await readParticipantJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  try {
    const result = await verifyParticipantWalletChallenge({
      user_id: session.user.id,
      request,
      challenge_id: body.challenge_id,
      message: body.message,
      signature: body.signature,
      address: body.address,
      chain: body.chain,
    });
    return participantJson(
      {
        linked: true,
        created: result.created,
        wallet: result.wallet,
        proof_scope: WALLET_PROOF_SCOPE,
      },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return participantError(error, "verify");
  }
}
