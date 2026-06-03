import { type FC, useMemo } from 'react';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, type OnChangeFn, type ColumnFiltersState, type Updater } from '@tanstack/react-table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { DataTable, DataTableColumnHeader } from '@components/tables';
import { HealthBadge } from '@components/shared';

import { useDataTable } from '@hooks/utils';
import { useDataTableQuery } from '@hooks/shared';

import { api } from '@api/mock';
import { listProjectsPagedReal } from '@api/real/sdlc';
import { USE_MOCK } from '@api/dataSource';
import type { Project, ProjectStatus, DataTableFilterMeta } from '@app-types';

dayjs.extend(relativeTime);

// useDataTable / useDataTableQuery require TData extends Record<string, unknown>.
// Project is an interface without an index signature, so we use this intersection alias.
type ProjectRow = Omit<Project, 'trace' | 'report'> & Record<string, unknown>;

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

const ProjectsTable: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Filter options ──────────────────────────────────────────────────────────

  const statusOptions = useMemo<SimpleOption[]>(
    () => [
      { value: 'healthy', label: t('projects.status.healthy') },
      { value: 'at-risk', label: t('projects.status.atRisk') },
      { value: 'blocked', label: t('projects.status.blocked') },
    ],
    [t],
  );

  // ── Column definitions ──────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<ProjectRow>[]>(
    () => [
      {
        accessorKey: 'name',
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('projects.tableColProject')} />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {row.original.name as string}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {row.original.key as string}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'health.overall',
        enableSorting: true,
        enableColumnFilter: true,
        meta: {
          filterMeta: makeFilterMeta(t('projects.tableColHealth'), statusOptions),
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('projects.tableColHealth')} />
        ),
        cell: ({ row }) => {
          const health = row.original.health as Project['health'];
          return <HealthBadge score={health.overall} label={health.label as ProjectStatus} />;
        },
        // The filterFn must match on the status field since the faceted filter
        // sends status values (healthy/at-risk/blocked) but the accessor is health.overall (number).
        // We override by matching against health.label instead.
        filterFn: (row, _columnId, filterValue: string[]) => {
          if (!filterValue || filterValue.length === 0) return true;
          const health = row.original.health as Project['health'];
          return filterValue.includes(health.label);
        },
      },
      {
        accessorKey: 'status',
        enableSorting: false,
        enableColumnFilter: false,
        // Hidden column — exists purely so the server receives the `status` filter param.
        // The visible health filter above targets health.label client-side, while this
        // column's id ("status") is what gets serialised into the URL query string for the server.
        enableHiding: true,
        meta: {
          filterMeta: makeFilterMeta(t('projects.tableColHealth'), statusOptions),
        },
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: 'risks',
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('projects.tableColRisks')} />
        ),
        cell: ({ row }) => {
          const risks = row.original.risks as Project['risks'];
          return (
            <span className="text-sm text-foreground tabular-nums">{risks.length}</span>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = (rowA.original.risks as Project['risks']).length;
          const b = (rowB.original.risks as Project['risks']).length;
          return a - b;
        },
      },
      {
        accessorKey: 'lead',
        enableSorting: false,
        header: t('projects.tableColLead'),
        cell: ({ row }) => {
          const lead = row.original.lead as Project['lead'];
          return (
            <span className="text-sm text-muted-foreground">{lead.name}</span>
          );
        },
      },
      {
        accessorKey: 'lastSyncedAt',
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('projects.tableColSynced')} />
        ),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {dayjs(row.original.lastSyncedAt as string).fromNow()}
          </span>
        ),
      },
    ],
    [t, statusOptions],
  );

  // ── Server-state query (URL params + TanStack Query) ────────────────────────

  const { data, isLoading, tableUtils } = useDataTableQuery<ProjectRow>({
    queryKey: ['projects-paged'],
    queryFn: (params) =>
      (USE_MOCK
        ? api.listProjectsPaged(params as string)
        : listProjectsPagedReal(params as string)
      ) as Promise<import('@hooks/shared').PaginatedDataTable<ProjectRow>>,
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

  const { table } = useDataTable<ProjectRow>({
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

  // ── Row click → Project Hub ─────────────────────────────────────────────────

  const handleRowClick = (row: { original: ProjectRow }) => {
    navigate(`/dashboard/projects/${row.original.id as string}`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DataTable table={table} isLoading={isLoading}>
      <DataTable.Toolbar
        totalCount={tableUtils.totalCount}
        totalLabel={t('projects.total')}
        placeholder={t('projects.searchPlaceholder')}
      />
      <DataTable.Content
        onRowClick={handleRowClick}
        getRowClassName={() => 'cursor-pointer'}
        emptyState={{
          title: t('projects.noMatch'),
          description: t('projects.noMatchHint'),
        }}
      />
      <DataTable.Pagination pageSizeOptions={[10, 20, 50]} />
    </DataTable>
  );
};

export default ProjectsTable;
