/**
 * DataTable — generic table primitive used by both Dashboard sub-tables
 * and Manager full-page tables.
 *
 * Each module defines its column spec and passes typed rows. The shell
 * (border, spacing, header style, row hover) is unified.
 *
 * Subsumes the hand-rolled <table> in commerce/{trade-ins,auctions,market}/
 * and ops/{stock,orders}/, catalog/users/.
 */

import * as React from "react";

export type Align = "left" | "right" | "center";

export interface Column<T> {
  /** Stable id for React keys. */
  key: string;
  /** Header content — usually a string. Sister-compatible alias: `label`. */
  header?: React.ReactNode;
  /** Alias for `header` — sister chapels may use this name. One must be set. */
  label?: React.ReactNode;
  align?: Align;
  /** Tailwind classes appended to the <td>. */
  cellClass?: string;
  /** Tailwind classes appended to the <th>. */
  headerClass?: string;
  /** Renders the cell content. */
  render: (row: T, index: number) => React.ReactNode;
  /** Hide on small screens (Manager tables can have wide columns). */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  /** Empty-state message. Use <EmptyState /> if you want a full block. */
  emptyMessage?: string;
  /** Alias for `emptyMessage` — sister chapels may use this name. */
  empty?: string;
  /** Min-width for horizontal-scroll on narrow viewports. */
  minWidth?: number;
  /** Optional row click target. If returned, the row gets a hover cursor. */
  rowHref?: (row: T) => string | undefined;
}

const ALIGN_CLS: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  empty,
  minWidth = 600,
  rowHref,
}: DataTableProps<T>) {
  const emptyText = emptyMessage ?? empty ?? "No rows.";
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
          <thead className="bg-surface/80 border-b border-border-subtle">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-faint whitespace-nowrap",
                    ALIGN_CLS[col.align ?? "left"],
                    col.hideOnMobile ? "hidden sm:table-cell" : "",
                    col.headerClass ?? "",
                  ].join(" ")}
                >
                  {col.header ?? col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-ink-faint text-sm border-t border-border-subtle"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const href = rowHref?.(row);
                return (
                  <tr
                    key={rowKey(row, i)}
                    className={[
                      "border-t border-border-subtle/60 transition",
                      href ? "hover:bg-surface-elevated/50 cursor-pointer" : "hover:bg-surface-elevated/30",
                    ].join(" ")}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          "px-4 py-3 text-ink",
                          ALIGN_CLS[col.align ?? "left"],
                          col.hideOnMobile ? "hidden sm:table-cell" : "",
                          col.cellClass ?? "",
                        ].join(" ")}
                      >
                        {col.render(row, i)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
