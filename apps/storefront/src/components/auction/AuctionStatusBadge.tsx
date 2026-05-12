/**
 * AuctionStatusBadge — thin wrapper around the unified <Badge> primitive.
 *
 * Kept as a separate component so existing imports keep working while
 * the implementation now flows through @/lib/ui. New code can import
 * {Badge} directly from @/lib/ui and pass Palettes.AuctionStatusPalette.
 */

import type { AuctionStatus } from "@/lib/auction/types";
import { Badge, Palettes } from "@/lib/ui";

export default function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <Badge
      status={status}
      palette={Palettes.AuctionStatusPalette}
      labels={Palettes.AuctionStatusLabels}
    />
  );
}
