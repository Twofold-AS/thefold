"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";
import Skeleton from "@/components/Skeleton";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  loading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (item: TData) => void;
  pageSize?: number;
}

export default function DataTable<TData>({
  columns,
  data,
  loading,
  emptyState,
  onRowClick,
  pageSize = 20,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: { pagination: { pageSize } },
  });

  if (loading) {
    return <Skeleton rows={5} />;
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div>
      <div style={{ borderRadius: T.r, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <Table style={{ background: T.raised }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{
                      color: T.textMuted,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontFamily: T.mono,
                      cursor: header.column.getCanSort() ? "pointer" : undefined,
                      padding: `${S.sm}px ${S.md}px`,
                      background: T.surface,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " \u2191" : header.column.getIsSorted() === "desc" ? " \u2193" : ""}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                style={{
                  borderBottom: `1px solid ${T.border}`,
                  cursor: onRowClick ? "pointer" : undefined,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.subtle)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    style={{
                      color: T.text,
                      fontSize: 13,
                      padding: `${S.sm}px ${S.md}px`,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: S.md }}>
          <span style={{ fontSize: 12, color: T.textMuted, fontFamily: T.mono }}>
            Side {table.getState().pagination.pageIndex + 1} av {table.getPageCount()}
          </span>
          <div style={{ display: "flex", gap: S.sm }}>
            <Btn size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              Forrige
            </Btn>
            <Btn size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              Neste
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
