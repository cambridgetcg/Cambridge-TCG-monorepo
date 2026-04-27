"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { useCreditSell } from "@/context/CreditSellContext";

export default function SellForCreditButton({
  sku,
  creditAmount,
  cardName,
  cardNumber,
  setCode,
  imageUrl,
}: {
  sku: string;
  creditAmount: number;
  cardName?: string;
  cardNumber?: string;
  setCode?: string | null;
  imageUrl?: string | null;
}) {
  const [added, setAdded] = useState(false);
  const { toast } = useToast();
  const { addItem } = useCreditSell();

  function handleSell() {
    addItem({
      sku,
      name: cardName || sku,
      cardNumber: cardNumber || "",
      setCode: setCode || null,
      imageUrl: imageUrl || null,
      creditPrice: creditAmount,
    });
    toast("Added to sell cart", "success");
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <button
      onClick={handleSell}
      disabled={added}
      className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50"
    >
      {added ? "Added!" : "Sell Now"}
    </button>
  );
}
