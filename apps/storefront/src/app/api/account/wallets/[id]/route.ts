import { auth } from "@/lib/auth";
import { participantError, participantJson } from "@/lib/wallets/http";
import { revokeParticipantWalletLink } from "@/lib/wallets/service";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return participantJson(
      { error: { code: "SIGN_IN_REQUIRED", message: "Sign in required." } },
      401,
    );
  }
  const { id } = await context.params;
  try {
    return participantJson(
      await revokeParticipantWalletLink({
        user_id: session.user.id,
        request,
        wallet_id: id,
      }),
    );
  } catch (error) {
    return participantError(error, "revoke");
  }
}
