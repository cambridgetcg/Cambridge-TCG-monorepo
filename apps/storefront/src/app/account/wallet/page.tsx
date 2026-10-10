import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, PageHeader, Provenance } from "@/lib/ui";
import WalletLinkingClient from "./WalletLinkingClient";

export const metadata: Metadata = {
  title: "Wallet",
  description:
    "Verify control of a Base Sepolia wallet without giving Cambridge TCG its keys.",
  other: audienceMetadata("consumer", ["account", "wallet", "testnet"]),
};

export default function WalletPage() {
  return (
    <div>
      <PageHeader
        title="Wallet"
        description={
          <>
            Prove current control of a Base Sepolia address without giving
            Cambridge TCG its keys. Cambridge TCG does not accept or move
            assets, and this does not enable crypto checkout. Read the{" "}
            <Link
              href="/methodology/crypto-escrow"
              className="text-accent hover:text-accent-strong"
            >
              escrow methodology
            </Link>
            .
          </>
        }
        provenance={<Provenance kind="live" source="wallet link registry" />}
      />
      <WalletLinkingClient />
    </div>
  );
}
