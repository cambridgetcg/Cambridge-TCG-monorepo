"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWalletClient,
  custom,
  getAddress,
  type EIP1193Provider,
} from "viem";
import { baseSepolia } from "viem/chains";
import { Button, Callout, Card, ErrorAlert } from "@/lib/ui";

const CHAIN = "eip155:84532" as const;

interface WalletProofScope {
  version: string;
  proves: string[];
  does_not_prove: string[];
}

interface LinkedWallet {
  id: string;
  address: `0x${string}`;
  chain: typeof CHAIN;
  chain_id: 84532;
  proof_kind: string;
  verification_method: string;
  linked_at: string;
  last_verified_at: string;
}

interface WalletAvailability {
  mode: "testnet" | "disabled";
  writes_available: boolean;
  revocation_available: boolean;
  reason:
    | "feature_disabled"
    | "configuration_invalid"
    | "storage_unavailable"
    | null;
  storage_ready: boolean;
  canonical_origin: string | null;
  canonical_domain: string | null;
  network: {
    caip2: typeof CHAIN;
    chain_id: 84532;
    name: "Base Sepolia";
    testnet: true;
  };
  custody: "none";
  remote_verification: {
    available: boolean;
    provider: {
      name: string;
      privacy_url: string | null;
      external: boolean;
    } | null;
  };
  proof_scope: WalletProofScope;
}

interface WalletListPayload {
  availability: WalletAvailability;
  wallets: LinkedWallet[];
}

interface ChallengePayload {
  challenge: {
    id: string;
    message: string;
    address: `0x${string}`;
    chain: typeof CHAIN;
    chain_id: 84532;
    domain: string;
    origin: string;
    issued_at: string;
    expires_at: string;
    statement: string;
    proof_scope: WalletProofScope;
  };
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T &
    ApiErrorPayload;
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Wallet request failed (${response.status}).`,
    );
  }
  return payload;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function availabilityMessage(availability: WalletAvailability): string {
  switch (availability.reason) {
    case "feature_disabled":
      return "Creating new wallet links is disabled. Existing links can still be revoked. Set EVM_WALLET_LINKING_MODE=testnet to use this proof-only surface; it cannot accept or transfer assets.";
    case "configuration_invalid":
      return "Wallet linking is paused because the canonical Cambridge origin or Base Sepolia RPC is not safely configured.";
    case "storage_unavailable":
      return "The wallet-link registry is unavailable or its migration has not been applied.";
    default:
      return "Wallet linking is available only in the explicit testnet proof mode; it cannot accept or transfer assets.";
  }
}

function walletErrorCode(error: unknown): number | null {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return null;
    if ("code" in current && Number.isFinite(Number(current.code))) {
      return Number(current.code);
    }
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

export default function WalletLinkingClient() {
  const [data, setData] = useState<WalletListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"connect" | `revoke:${string}` | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/wallets", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await responseJson<WalletListPayload>(response);
      setData(payload);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load wallet links.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function linkWallet() {
    setAction("connect");
    setError(null);
    setNotice(null);

    try {
      if (!window.ethereum) {
        throw new Error(
          "No injected wallet was found. Install or enable a browser wallet that supports Base Sepolia.",
        );
      }

      const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: custom(window.ethereum),
      });
      const [selectedAddress] = await walletClient.requestAddresses();
      if (!selectedAddress)
        throw new Error("The wallet did not return an address.");

      if ((await walletClient.getChainId()) !== baseSepolia.id) {
        try {
          await walletClient.switchChain({ id: baseSepolia.id });
        } catch (cause) {
          if (walletErrorCode(cause) !== 4_902) throw cause;
          await walletClient.addChain({ chain: baseSepolia });
          await walletClient.switchChain({ id: baseSepolia.id });
        }
      }

      const address = getAddress(selectedAddress);
      const challengeResponse = await fetch("/api/account/wallets/challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ address, chain: CHAIN }),
      });
      const { challenge } =
        await responseJson<ChallengePayload>(challengeResponse);

      if ((await walletClient.getChainId()) !== baseSepolia.id) {
        throw new Error(
          "The wallet network changed before signature. No link was created.",
        );
      }

      const signature = await walletClient.signMessage({
        account: address,
        message: challenge.message,
      });

      await responseJson(
        await fetch("/api/account/wallets/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            challenge_id: challenge.id,
            message: challenge.message,
            signature,
            address,
            chain: CHAIN,
          }),
        }),
      );

      setNotice(`Verified control of ${address}. No private key was shared.`);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Wallet linking did not complete.",
      );
    } finally {
      setAction(null);
    }
  }

  async function revokeWallet(wallet: LinkedWallet) {
    if (
      !window.confirm(
        `Revoke the current Cambridge link to ${wallet.address}? An already signed challenge can create a fresh link until its five-minute expiry.`,
      )
    )
      return;

    setAction(`revoke:${wallet.id}`);
    setError(null);
    setNotice(null);
    try {
      await responseJson(
        await fetch(`/api/account/wallets/${encodeURIComponent(wallet.id)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
      setNotice("Wallet link revoked. On-chain history was not changed.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Wallet link could not be revoked.",
      );
    } finally {
      setAction(null);
    }
  }

  if (loading && !data) {
    return (
      <p className="text-sm text-ink-faint">Loading wallet-link status…</p>
    );
  }

  if (!data) {
    return (
      <ErrorAlert
        title="Wallet registry unavailable"
        description={error ?? "The wallet-link state could not be read."}
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const availability = data.availability;

  return (
    <div className="space-y-5">
      {error && (
        <ErrorAlert
          title="Wallet action did not complete"
          description={error}
        />
      )}
      {notice && (
        <Callout tone="substrate" title="Verified change">
          {notice}
        </Callout>
      )}

      <Card padding="lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-ink">
                Base Sepolia wallet proof
              </h2>
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
                Testnet only
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Your browser wallet signs one exact, five-minute challenge.
              Cambridge stores the verified public address and proof
              metadata—not your key, seed phrase, or wallet balance.
            </p>
            <div className="mt-3 max-w-2xl space-y-2 rounded-lg border border-border-subtle bg-surface-subtle p-3 text-xs leading-relaxed text-ink-muted">
              <p>
                A wallet address and its activity are public on the blockchain.
                Linking lets Cambridge associate them with this account. The
                proof shows control only at verification time; it is not
                identity, KYC, asset ownership, or permission to spend.
              </p>
              {availability.remote_verification.available &&
              availability.remote_verification.provider ? (
                <p>
                  Cambridge first checks an ordinary EOA signature locally. If
                  that fails, the configured RPC service, {" "}
                  <strong className="text-ink">
                    {availability.remote_verification.provider.name}
                  </strong>
                  , receives the public address to check for deployed code. It
                  receives the exact challenge and signature only when the
                  address has deployed code or the signature is locally
                  recognised as ERC-6492. {" "}
                  {availability.remote_verification.provider.privacy_url && (
                    <a
                      className="text-accent underline"
                      href={availability.remote_verification.provider.privacy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read the provider&rsquo;s privacy information.
                    </a>
                  )}
                </p>
              ) : (
                <p>
                  Cambridge checks ordinary EOA signatures locally. No
                  disclosed RPC recipient is available, so smart-wallet proofs
                  cannot be verified and no wallet proof is sent to a remote
                  RPC service.
                </p>
              )}
              <p>
                More detail: {" "}
                <a className="text-accent underline" href="/privacy#wallets">
                  wallet-link privacy notice
                </a>
                .
              </p>
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              {availability.network.name} · {availability.network.caip2} ·
              custody: {availability.custody}
            </p>
          </div>
          <Button
            onClick={linkWallet}
            disabled={!availability.writes_available || action !== null}
          >
            {action === "connect" ? "Waiting for wallet…" : "Link test wallet"}
          </Button>
        </div>

        {!availability.writes_available && (
          <Callout tone="warning" title="Linking unavailable">
            {availabilityMessage(availability)}
          </Callout>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Verified wallet links
        </h2>
        {!availability.storage_ready ? (
          <Card variant="subtle">
            <p className="text-sm text-ink-muted">
              Source unavailable — Cambridge cannot currently assert whether
              this account has active wallet links.
            </p>
          </Card>
        ) : !data.wallets.length ? (
          <Card variant="subtle">
            <p className="text-sm text-ink-muted">
              No active wallet is linked.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.wallets.map((wallet) => (
              <Card key={wallet.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-ink">
                      {wallet.address}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {wallet.chain} · {wallet.verification_method} · verified{" "}
                      {formatTimestamp(wallet.last_verified_at)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={
                      !availability.revocation_available || action !== null
                    }
                    onClick={() => revokeWallet(wallet)}
                  >
                    {action === `revoke:${wallet.id}`
                      ? "Revoking…"
                      : "Revoke link"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        {availability.storage_ready &&
          data.wallets.length > 0 &&
          !availability.revocation_available && (
            <p className="mt-2 text-xs text-warning">
              Revocation is unavailable because the canonical Cambridge origin
              is not safely configured.
            </p>
          )}
      </section>

      <Card variant="subtle">
        <h2 className="text-sm font-semibold text-ink">The proof boundary</h2>
        <div className="mt-3 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ok">
              Proves
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
              {availability.proof_scope.proves.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-warning">
              Does not prove
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
              {availability.proof_scope.does_not_prove.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Callout tone="warning" title="Never share a recovery phrase">
        Cambridge TCG will never ask for a seed phrase, private key, wallet
        export, or a transfer to “verify” your wallet. Linking a wallet does not
        enable a live crypto trade or escrow deposit. In this testnet version,
        revocation removes the current link but does not cancel a challenge that
        was already issued or signed; that challenge expires within five
        minutes.
      </Callout>
    </div>
  );
}
