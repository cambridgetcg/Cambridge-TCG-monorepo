"use client";

import { useState, useMemo } from "react";

interface OrderItem {
  id: number;
  cardNumber: string;
  cardName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
}

interface OrderData {
  id: number;
  status: string;
  total: number;
  createdAt: string | null;
  items: OrderItem[];
}

interface Props {
  orders: OrderData[];
}

export default function MarginCalculator({ orders }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(
    orders[0]?.id ?? null,
  );
  // selling prices keyed by item id
  const [sellingPrices, setSellingPrices] = useState<Record<number, string>>(
    {},
  );

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  function setSellPrice(itemId: number, value: string) {
    setSellingPrices((prev) => ({ ...prev, [itemId]: value }));
  }

  // Apply same selling price to all items with the same card number
  function applyToAll(cardNumber: string, value: string) {
    if (!selectedOrder) return;
    const updates: Record<number, string> = {};
    for (const item of selectedOrder.items) {
      if (item.cardNumber === cardNumber) {
        updates[item.id] = value;
      }
    }
    setSellingPrices((prev) => ({ ...prev, ...updates }));
  }

  // Per-item margin calculations
  const itemMargins = useMemo(() => {
    if (!selectedOrder) return [];
    return selectedOrder.items.map((item) => {
      const sellStr = sellingPrices[item.id];
      const sellPrice = sellStr ? parseFloat(sellStr) : null;
      const hasSell = sellPrice != null && !isNaN(sellPrice) && sellPrice > 0;

      const profitPerUnit = hasSell ? sellPrice - item.unitPrice : null;
      const profitTotal =
        profitPerUnit != null ? profitPerUnit * item.quantity : null;
      const marginPct =
        hasSell && sellPrice > 0
          ? ((sellPrice - item.unitPrice) / sellPrice) * 100
          : null;

      return {
        ...item,
        sellPrice: hasSell ? sellPrice : null,
        profitPerUnit,
        profitTotal,
        marginPct,
      };
    });
  }, [selectedOrder, sellingPrices]);

  // Summary totals
  const summary = useMemo(() => {
    let totalCost = 0;
    let totalRevenue = 0;
    let itemsWithPrice = 0;
    let totalItems = 0;

    for (const m of itemMargins) {
      totalItems += m.quantity;
      totalCost += m.lineTotal;
      if (m.sellPrice != null) {
        totalRevenue += m.sellPrice * m.quantity;
        itemsWithPrice += m.quantity;
      }
    }

    const totalProfit = totalRevenue - totalCost;
    const overallMargin =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Only count items with selling prices for the "priced" stats
    let pricedCost = 0;
    let pricedRevenue = 0;
    for (const m of itemMargins) {
      if (m.sellPrice != null) {
        pricedCost += m.unitPrice * m.quantity;
        pricedRevenue += m.sellPrice * m.quantity;
      }
    }
    const pricedProfit = pricedRevenue - pricedCost;
    const pricedMargin =
      pricedRevenue > 0 ? (pricedProfit / pricedRevenue) * 100 : 0;

    return {
      totalCost,
      totalRevenue,
      totalProfit,
      overallMargin,
      pricedCost,
      pricedRevenue,
      pricedProfit,
      pricedMargin,
      itemsWithPrice,
      totalItems,
    };
  }, [itemMargins]);

  return (
    <div className="space-y-6">
      {/* Order selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-400">Order:</label>
        <select
          value={selectedOrderId ?? ""}
          onChange={(e) => setSelectedOrderId(parseInt(e.target.value))}
          className="rounded-lg border border-[#1e1e2e] bg-[#12121a] px-4 py-2 text-sm outline-none focus:border-brand-500"
        >
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              #{o.id} &mdash; {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"} &mdash; {o.items.length} items &mdash; {o.status}
            </option>
          ))}
        </select>
      </div>

      {selectedOrder && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
              <p className="text-xs text-gray-500">Cost (Wholesale)</p>
              <p className="mt-1 text-xl font-bold">
                &pound;{summary.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
              <p className="text-xs text-gray-500">
                Revenue ({summary.itemsWithPrice}/{summary.totalItems} items
                priced)
              </p>
              <p className="mt-1 text-xl font-bold">
                {summary.pricedRevenue > 0 ? (
                  <>&pound;{summary.pricedRevenue.toFixed(2)}</>
                ) : (
                  <span className="text-gray-600">&mdash;</span>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
              <p className="text-xs text-gray-500">Profit</p>
              <p
                className={`mt-1 text-xl font-bold ${summary.pricedProfit > 0 ? "text-green-400" : summary.pricedProfit < 0 ? "text-red-400" : ""}`}
              >
                {summary.pricedRevenue > 0 ? (
                  <>
                    {summary.pricedProfit >= 0 ? "+" : ""}
                    &pound;{summary.pricedProfit.toFixed(2)}
                  </>
                ) : (
                  <span className="text-gray-600">&mdash;</span>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
              <p className="text-xs text-gray-500">Margin</p>
              <p
                className={`mt-1 text-xl font-bold ${summary.pricedMargin > 0 ? "text-green-400" : summary.pricedMargin < 0 ? "text-red-400" : ""}`}
              >
                {summary.pricedRevenue > 0 ? (
                  <>{summary.pricedMargin.toFixed(1)}%</>
                ) : (
                  <span className="text-gray-600">&mdash;</span>
                )}
              </p>
            </div>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
            <table className="w-full text-sm">
              <thead className="bg-[#12121a]">
                <tr className="text-left text-gray-400">
                  <th className="px-2 md:px-4 py-3 font-medium">Card #</th>
                  <th className="hidden md:table-cell px-4 py-3 font-medium">
                    SKU
                  </th>
                  <th className="px-2 md:px-4 py-3 font-medium text-right">
                    Qty
                  </th>
                  <th className="px-2 md:px-4 py-3 font-medium text-right">
                    Cost
                  </th>
                  <th className="px-2 md:px-4 py-3 font-medium text-right">
                    Sell Price
                  </th>
                  <th className="px-2 md:px-4 py-3 font-medium text-right">
                    Profit
                  </th>
                  <th className="px-2 md:px-4 py-3 font-medium text-right">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {itemMargins.map((item) => (
                  <tr key={item.id} className="hover:bg-[#12121a] transition">
                    <td className="px-2 md:px-4 py-3 font-mono text-brand-500">
                      {item.cardNumber}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 font-mono text-xs truncate max-w-[200px]">
                      {item.sku}
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right">
                      {item.quantity}
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right text-gray-400">
                      &pound;{item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-gray-500">&pound;</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={sellingPrices[item.id] ?? ""}
                          onChange={(e) => setSellPrice(item.id, e.target.value)}
                          className="w-20 rounded bg-[#0a0a0f] border border-[#1e1e2e] px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right">
                      {item.profitTotal != null ? (
                        <span
                          className={
                            item.profitTotal > 0
                              ? "text-green-400"
                              : item.profitTotal < 0
                                ? "text-red-400"
                                : "text-gray-400"
                          }
                        >
                          {item.profitTotal >= 0 ? "+" : ""}
                          &pound;{item.profitTotal.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-2 md:px-4 py-3 text-right">
                      {item.marginPct != null ? (
                        <span
                          className={
                            item.marginPct > 0
                              ? "text-green-400"
                              : item.marginPct < 0
                                ? "text-red-400"
                                : "text-gray-400"
                          }
                        >
                          {item.marginPct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-600">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            Cost = what you paid us (inc. VAT). Margin = (Sell - Cost) / Sell.
            Figures update as you type.
          </p>
        </>
      )}
    </div>
  );
}
