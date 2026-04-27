"use client";

import { useState, useEffect } from "react";

interface WantedRow {
  cardId: number;
  cardNumber: string;
  name: string | null;
  setCode: string | null;
  price: number | null;
  imageUrl: string | null;
  stock: number;
  demandCount: number;
  clientNames: string;
}

export default function AdminWantedPage() {
  const [rows, setRows] = useState<WantedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/wanted")
      .then((r) => r.json())
      .then((data) => { setRows(data); setLoading(false); });
  }, []);

  if (loading) {
    return <p className="text-gray-400">Loading wanted cards...</p>;
  }

  if (rows.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Wanted Cards</h1>
        <p className="text-gray-500">No cards have been marked as wanted yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Wanted Cards</h1>
      <p className="text-sm text-gray-400 mb-4">{rows.length} card{rows.length !== 1 ? "s" : ""} with demand</p>
      <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#12121a]">
            <tr className="text-left text-gray-400">
              <th className="px-4 py-3 font-medium w-14"></th>
              <th className="px-4 py-3 font-medium">Card #</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Set</th>
              <th className="px-4 py-3 font-medium text-right">Price</th>
              <th className="px-4 py-3 font-medium text-right">Stock</th>
              <th className="px-4 py-3 font-medium text-right">Demand</th>
              <th className="px-4 py-3 font-medium">Clients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {rows.map((row) => (
              <tr key={row.cardId} className="hover:bg-[#12121a] transition">
                <td className="px-4 py-2">
                  {row.imageUrl ? (
                    <img src={row.imageUrl} alt={row.cardNumber} className="h-10 w-auto rounded" loading="lazy" />
                  ) : (
                    <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-brand-500">{row.cardNumber}</td>
                <td className="px-4 py-3 text-gray-300">{row.name || "—"}</td>
                <td className="px-4 py-3 text-gray-400">{row.setCode || "—"}</td>
                <td className="px-4 py-3 text-right text-green-400 font-medium">
                  {row.price != null ? `£${row.price.toFixed(2)}` : "—"}
                </td>
                <td className={`px-4 py-3 text-right ${row.stock > 0 ? "text-green-400" : "text-gray-500"}`}>
                  {row.stock}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-pink-400 font-medium">
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    {row.demandCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{row.clientNames}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
