/**
 * DataTable — generic server-renderable table primitive.
 *
 * Each consumer page defines its column spec and passes typed rows. The
 * shell (border, spacing, header style, row hover) is unified. Subsumes
 * the hand-rolled <table> blocks in /account/{orders,trades,auctions}
 * and /prices/one-piece.
 */

import * as React from "react";

export type Align = "left" | "right" | "center";

export interface Column<T> {
  /** Stable id for React keys. */
  key: string;
  /** Header content — usually a string. */
  header: React.ReactNode;
  align?: Align;
  /** Tailwind classes appended to the <td>. */
  cellClass?: string;
  /** Tailwind classes appended to the <th>. */
  headerClass?: string;
  /** Renders the cell content. */
  render: (row: T, index: number) => React.ReactNode;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  /** Empty-state message (in-table). Use <EmptyState /> for full blocks. */
  emptyMessage?: string;
  /** Min-width for horizontal-scroll on narrow viewports. */
  minWidth?: number;
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
  emptyMessage = "No rows.",
  minWidth = 600,
}: DataTableProps<T>) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: `${minWidth}px` }}>
          <thead className="bg-surface-subtle border-b border-border-subtle">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted whitespace-nowrap",
                    ALIGN_CLS[col.align ?? "left"],
                    col.hideOnMobile ? "hidden sm:table-cell" : "",
                    col.headerClass ?? "",
                  ].join(" ")}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-ink-muted text-sm border-t border-border-subtle"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  className="border-t border-border-subtle/60 transition hover:bg-surface-subtle/60"
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
