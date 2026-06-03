import { type FC, useMemo } from 'react';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, type OnChangeFn, type ColumnFiltersState, type Updater } from '@tanstack/react-table';

import { DataTable, DataTableColumnHeader } from '@components/tables';
import { SeverityBadge, EvidenceChip } from '@components/shared';

import { useDataTable } from '@hooks/utils';
import { useDataTableQuery } from '@hooks/shared';

import { api } from '@api/mock';
import type { Risk, RiskKind, Severity, DataTableFilterMeta } from '@app-types';

// useDataTable / useDataTableQuery require TData extends Record<string, unknown>.
// Risk is an interface without an index signature, so we use this intersection alias.
type RiskRow = Risk & Record<string, unknown>;

// ─── Filter meta helpers ──────────────────────────────────────────────────────

type SimpleOption = { value: string; label: string };

function makeFilterMeta(label: string, options: SimpleOption[]): DataTableFilterMeta {
  return {
    label,
    variant: 'multiSelect',
    options,
    getOptionValue: (o) => (o as SimpleOption).value,
    getOptionLabel: (o) => (o as SimpleOption).label,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const RisksTable: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Filter options ──────────────────────────────────────────────────────────

  const kindOptions = useMemo<SimpleOption[]>(
    () => [
      { value: 'delivery', label: t('risks.kinds.delivery') },
      { value: 'scope_creep', label: t('risks.kinds.scope_creep') },
      { value: 'dependency', label: t('risks.kinds.dependency') },
      { value: 'resource_overload', label: t('risks.kinds.resource_overload') },
    ],
    [t],
  );

  const severityOptions = useMemo<SimpleOption[]>(
    () => [
      { value: 'high', label: t('risks.severityHigh') },
      { value: 'medium', label: t('risks.severityMedium') },
      { value: 'low', label: t('risks.severityLow') },
    ],
    [t],
  );

  // ── Column definitions ──────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<RiskRow>[]>(
    () => [
      {
        accessorKey: 'severity',
        enableSorting: true,
        enableColumnFilter: true,
        meta: {
          filterMeta: makeFilterMeta(t('risks.tableColSeverity'), severityOptions),
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('risks.tableColSeverity')} />
        ),
        cell: ({ row }) => <SeverityBadge severity={row.original.severity as Severity} />,
      },
      {
        accessorKey: 'title',
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('risks.tableColRiskRef')} />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {row.original.title as string}
            </span>
            <EvidenceChip label={row.original.subjectRef as string} />
          </div>
        ),
      },
      {
        accessorKey: 'kind',
        enableSorting: true,
        enableColumnFilter: true,
        meta: {
          filterMeta: makeFilterMeta(t('risks.tableColKind'), kindOptions),
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('risks.tableColKind')} />
        ),
        cell: ({ row }) => {
          const KIND_LABELS: Record<RiskKind, string> = {
            delivery: t('risks.kinds.delivery'),
            scope_creep: t('risks.kinds.scope_creep'),
            dependency: t('risks.kinds.dependency'),
            resource_overload: t('risks.kinds.resource_overload'),
          };
          return (
            <span className="text-xs text-muted-foreground">
              {KIND_LABELS[row.original.kind as RiskKind]}
            </span>
          );
        },
      },
      {
        accessorKey: 'recommendation',
        enableSorting: false,
        header: t('risks.tableColRecommendation'),
        cell: ({ row }) => (
          <p className="text-xs text-muted-foreground truncate max-w-xs">
            {row.original.recommendation as string}
          </p>
        ),
      },
    ],
    [t, kindOptions, severityOptions],
  );

  // ── Server-state query (URL params + TanStack Query) ────────────────────────

  const { data, isLoading, tableUtils } = useDataTableQuery<RiskRow>({
    queryKey: ['risks-paged'],
    queryFn: (params) =>
      api.listRisksPaged(params as string) as Promise<import('@hooks/shared').PaginatedDataTable<RiskRow>>,
    defaultPageSize: 10,
  });

  // ── Bridge: wire useDataTableQuery state into useDataTable ──────────────────

  const onGlobalFilterChange: OnChangeFn<string> = (updater) => {
    const next = typeof updater === 'function' ? updater(tableUtils.state.globalFilter) : updater;
    tableUtils.setGlobalFilter(next);
  };

  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater: Updater<ColumnFiltersState>) => {
    tableUtils.setColumnFilters(updater);
  };

  const { table } = useDataTable<RiskRow>({
    data,
    columns,
    pageCount: tableUtils.totalPages,
    state: {
      sorting: tableUtils.state.sorting,
      columnFilters: tableUtils.state.columnFilters,
      globalFilter: tableUtils.state.globalFilter,
      pagination: tableUtils.state.pagination,
    },
    onSortingChange: tableUtils.setSorting,
    onPaginationChange: tableUtils.setPagination,
    onGlobalFilterChange,
    onColumnFiltersChange,
    enableGlobalFilter: true,
  });

  // ── Row click → detail view ─────────────────────────────────────────────────

  const handleRowClick = (row: { original: RiskRow }) => {
    navigate(`/dashboard/risks/${row.original.id as string}`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DataTable table={table} isLoading={isLoading}>
      <DataTable.Toolbar
        totalCount={tableUtils.totalCount}
        totalLabel={t('risks.total')}
        placeholder={t('risks.searchPlaceholder')}
      />
      <DataTable.Content
        onRowClick={handleRowClick}
        getRowClassName={() => 'cursor-pointer'}
        emptyState={{
          title: t('risks.noMatch'),
          description: t('risks.noMatchHint'),
        }}
      />
      <DataTable.Pagination pageSizeOptions={[10, 20, 50]} />
    </DataTable>
  );
};

export default RisksTable;
