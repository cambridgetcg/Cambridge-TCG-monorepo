const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?::|$)/i;

export interface PublicClientSeed {
  clientSeed: string | null;
  display: string | null;
  outcomeReplayAvailable: boolean;
  withheld: boolean;
}

/** Legacy draw seeds began with the account UUID. Those values are owner-only. */
export function hasAccountLinkedPrefix(clientSeed: string): boolean {
  return UUID_PREFIX.test(clientSeed);
}

export function projectClientSeed(
  clientSeed: string | null,
  isOwner: boolean,
): PublicClientSeed {
  if (!clientSeed) {
    return {
      clientSeed: null,
      display: null,
      outcomeReplayAvailable: false,
      withheld: false,
    };
  }

  if (hasAccountLinkedPrefix(clientSeed) && !isOwner) {
    return {
      clientSeed: null,
      display: "[withheld: legacy account-linked seed]",
      outcomeReplayAvailable: false,
      withheld: true,
    };
  }

  return {
    clientSeed,
    display: clientSeed,
    outcomeReplayAvailable: true,
    withheld: false,
  };
}
