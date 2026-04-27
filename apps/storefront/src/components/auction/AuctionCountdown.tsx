"use client";

import { useEffect, useState } from "react";
import { getTimeRemaining } from "@/lib/auction/lifecycle";

interface AuctionCountdownProps {
  endsAt: string;
  serverTime: string;
}

export default function AuctionCountdown({ endsAt, serverTime }: AuctionCountdownProps) {
  // Calculate clock offset between server and client
  const [offset] = useState(() => {
    return new Date(serverTime).getTime() - Date.now();
  });

  const [remaining, setRemaining] = useState(() => getTimeRemaining(endsAt));

  useEffect(() => {
    const tick = () => {
      // Adjust endsAt by the offset so countdown is server-relative
      const adjustedEnd = new Date(new Date(endsAt).getTime() - offset).toISOString();
      setRemaining(getTimeRemaining(adjustedEnd));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt, offset]);

  if (remaining.expired) {
    return <span className="text-neutral-500 font-mono text-sm">Ended</span>;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const isUrgent = remaining.total < 60 * 60 * 1000; // < 1 hour

  return (
    <span className={`font-mono text-sm ${isUrgent ? "text-red-500" : "text-neutral-300"}`}>
      {remaining.days > 0 && `${pad(remaining.days)}:`}
      {pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}
    </span>
  );
}
