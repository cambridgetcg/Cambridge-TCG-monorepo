"use client";

import { useState } from "react";

interface AddToPortfolioProps {
  sku: string;
  name: string;
  cardNumber?: string | null;
  setCode?: string | null;
  setName?: string | null;
  imageUrl?: string | null;
  rarity?: string | null;
  price?: number | null;
}

export default function AddToPortfolio({
  sku,
  name,
  cardNumber,
  setCode,
  setName,
  imageUrl,
  rarity,
  price,
}: AddToPortfolioProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "added" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          cardName: name,
          cardNumber: cardNumber || null,
          setCode: setCode || null,
          setName: setName || null,
          imageUrl: imageUrl || null,
          rarity: rarity || null,
          condition: "NM",
          quantity: 1,
          acquisitionPrice: price ?? null,
          acquiredAt: null,
        }),
      });
      if (res.ok) {
        setStatus("added");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          // Not logged in — silently fail or redirect
          setStatus("error");
          setTimeout(() => setStatus("idle"), 2000);
        } else {
          console.error("Failed to add to portfolio:", data);
          setStatus("error");
          setTimeout(() => setStatus("idle"), 2000);
        }
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === "loading"}
      className={`text-sm font-medium transition ${
        status === "added"
          ? "text-emerald-400"
          : status === "error"
            ? "text-red-400"
            : "text-neutral-400 hover:text-amber-400"
      } disabled:opacity-50`}
    >
      {status === "idle" && "Track in Portfolio"}
      {status === "loading" && "Adding..."}
      {status === "added" && "Added!"}
      {status === "error" && "Failed — try again"}
    </button>
  );
}
