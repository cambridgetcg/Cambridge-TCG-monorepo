import { auth } from "@/lib/auth";
import {
  participantError,
  participantJson,
  readParticipantJson,
} from "@/lib/wallets/http";
import { issueParticipantWalletChallenge } from "@/lib/wallets/service";

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
    const challenge = await issueParticipantWalletChallenge({
      user_id: session.user.id,
      request,
      address: body.address,
      chain: body.chain,
      chain_id: body.chain_id,
    });
    return participantJson({ challenge }, 201);
  } catch (error) {
    return participantError(error, "challenge");
  }
}
