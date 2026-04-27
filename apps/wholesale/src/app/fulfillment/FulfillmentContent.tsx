"use client";

import { useState } from "react";
import CardThumbnail from "@/components/CardThumbnail";

type FulfilledEntry = {
  fulfillmentDate: string;
  orderId: number;
  orderItemId: number;
  unitPrice: number;
  cardNumber: string;
  sku: string;
  imageUrl: string | null;
  fulfilledQty: number;
};

type PendingItem = {
  id: number;
  orderId: number;
  quantity: number;
  unitPrice: number;
  cardNumber: string;
  sku: string;
  imageUrl: string | null;
  remaining: number;
};

type OrderProgress = {
  orderId: number;
  totalQty: number;
  fulfilledQty: number;
};

type Props = {
  orderProgress: OrderProgress[];
  overallTotal: number;
  overallFulfilled: number;
  fulfilledByDate: [string, FulfilledEntry[]][];
  unfulfilledItems: PendingItem[];
};

export default function FulfillmentContent({
  orderProgress,
  overallTotal,
  overallFulfilled,
  fulfilledByDate,
  unfulfilledItems,
}: Props) {
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);

  const toggle = (orderId: number) =>
    setSelectedOrder((prev) => (prev === orderId ? null : orderId));

  // Filter data by selected order
  const filteredFulfilledByDate = selectedOrder
    ? fulfilledByDate
        .map(([date, entries]) => [date, entries.filter((e) => e.orderId === selectedOrder)] as [string, FulfilledEntry[]])
        .filter(([, entries]) => entries.length > 0)
    : fulfilledByDate;

  const filteredPending = selectedOrder
    ? unfulfilledItems.filter((i) => i.orderId === selectedOrder)
    : unfulfilledItems;

  // Compute filtered progress
  const displayTotal = selectedOrder
    ? orderProgress.find((o) => o.orderId === selectedOrder)?.totalQty ?? 0
    : overallTotal;
  const displayFulfilled = selectedOrder
    ? orderProgress.find((o) => o.orderId === selectedOrder)?.fulfilledQty ?? 0
    : overallFulfilled;

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Fulfillment</h1>
        <span className={`text-sm font-medium ${displayFulfilled >= displayTotal ? "text-green-400" : "text-yellow-400"}`}>
          {displayFulfilled} / {displayTotal} items{selectedOrder ? "" : " overall"}
        </span>
      </div>

      {/* Per-order toggle cards */}
      {orderProgress.length > 1 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderProgress.map((o) => {
            const pct = o.totalQty > 0 ? (o.fulfilledQty / o.totalQty) * 100 : 0;
            const done = o.fulfilledQty >= o.totalQty;
            const active = selectedOrder === o.orderId;
            return (
              <button
                key={o.orderId}
                onClick={() => toggle(o.orderId)}
                className={`rounded-lg border p-4 text-left transition ${
                  active
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-[#1e1e2e] bg-[#12121a] hover:border-brand-600/50"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Order #{o.orderId}</span>
                  <span className={`text-sm ${done ? "text-green-400" : "text-yellow-400"}`}>
                    {o.fulfilledQty} / {o.totalQty}
                  </span>
                </div>
                <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${done ? "bg-green-500" : "bg-yellow-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Single order — show as non-interactive card */}
      {orderProgress.length === 1 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderProgress.map((o) => {
            const pct = o.totalQty > 0 ? (o.fulfilledQty / o.totalQty) * 100 : 0;
            const done = o.fulfilledQty >= o.totalQty;
            return (
              <div
                key={o.orderId}
                className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Order #{o.orderId}</span>
                  <span className={`text-sm ${done ? "text-green-400" : "text-yellow-400"}`}>
                    {o.fulfilledQty} / {o.totalQty}
                  </span>
                </div>
                <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${done ? "bg-green-500" : "bg-yellow-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fulfilled — grouped by date */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Fulfilled</h2>
        {filteredFulfilledByDate.length > 0 ? (
          <div className="space-y-6">
            {filteredFulfilledByDate.map(([date, entries]) => (
              <div key={date}>
                <h3 className="mb-3 text-sm font-medium text-gray-400">{date}</h3>
                <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#12121a]">
                      <tr className="text-left text-gray-400">
                        <th className="w-12 px-2 md:px-4 py-3 font-medium"></th>
                        <th className="px-2 md:px-4 py-3 font-medium">Card #</th>
                        <th className="hidden md:table-cell px-4 py-3 font-medium">SKU</th>
                        <th className="px-2 md:px-4 py-3 font-medium text-right">Price</th>
                        {!selectedOrder && <th className="px-2 md:px-4 py-3 font-medium text-right">Order</th>}
                        <th className="px-2 md:px-4 py-3 font-medium text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e2e]">
                      {entries.map((e, i) => (
                        <tr key={i}>
                          <td className="px-2 md:px-4 py-1">
                            {e.imageUrl ? (
                              <CardThumbnail src={e.imageUrl} alt={e.cardNumber} />
                            ) : (
                              <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                            )}
                          </td>
                          <td className="px-2 md:px-4 py-3">
                            <span className="font-mono text-brand-500">{e.cardNumber}</span>
                          </td>
                          <td className="hidden md:table-cell px-4 py-3 text-gray-400 font-mono text-xs">{e.sku}</td>
                          <td className="px-2 md:px-4 py-3 text-right text-gray-400">&pound;{e.unitPrice.toFixed(2)}</td>
                          {!selectedOrder && <td className="px-2 md:px-4 py-3 text-right text-gray-400">#{e.orderId}</td>}
                          <td className="px-2 md:px-4 py-3 text-right text-green-400">{e.fulfilledQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No items fulfilled yet.</p>
        )}
      </section>

      {/* Unfulfilled / Pending */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Pending</h2>
        {filteredPending.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
            <table className="w-full text-sm">
              <thead className="bg-[#12121a]">
                <tr className="text-left text-gray-400">
                  <th className="w-12 px-2 md:px-4 py-3 font-medium"></th>
                  <th className="px-2 md:px-4 py-3 font-medium">Card #</th>
                  <th className="hidden md:table-cell px-4 py-3 font-medium">SKU</th>
                  <th className="px-2 md:px-4 py-3 font-medium text-right">Price</th>
                  {!selectedOrder && <th className="px-2 md:px-4 py-3 font-medium text-right">Order</th>}
                  <th className="px-2 md:px-4 py-3 font-medium text-right">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {filteredPending.map((item) => (
                  <tr key={item.id}>
                    <td className="px-2 md:px-4 py-1">
                      {item.imageUrl ? (
                        <CardThumbnail src={item.imageUrl} alt={item.cardNumber} />
                      ) : (
                        <div className="h-10 w-7 rounded bg-[#1e1e2e]" />
                      )}
                    </td>
                    <td className="px-2 md:px-4 py-3">
                      <span className="font-mono text-brand-500">{item.cardNumber}</span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 font-mono text-xs">{item.sku}</td>
                    <td className="px-2 md:px-4 py-3 text-right text-gray-400">&pound;{item.unitPrice.toFixed(2)}</td>
                    {!selectedOrder && <td className="px-2 md:px-4 py-3 text-right text-gray-400">#{item.orderId}</td>}
                    <td className="px-2 md:px-4 py-3 text-right text-yellow-400">{item.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {selectedOrder ? "No pending items for this order." : "All items have been fulfilled."}
          </p>
        )}
      </section>
    </>
  );
}
