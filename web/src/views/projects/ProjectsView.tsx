import { type FC, useState, useMemo } from 'react';

import { Skeleton } from '@components/ui';
import { ProjectCard, EmptyState } from '@components/shared';
import { cn } from '@utils';
import { useProjects } from '@hooks/queries';
import { Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import type { Project, ProjectStatus } from '@app-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | ProjectStatus;
type SortKey = 'name' | 'health';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'at-risk', label: 'At-risk' },
  { value: 'blocked', label: 'Blocked' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'health', label: 'Health' },
];

// ─── Skeleton grid shown while loading ────────────────────────────────────────

function ProjectsSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl bg-background border border-border p-5 flex flex-col gap-3"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton shape="text" size="xs" className="w-10" />
              <Skeleton shape="text" size="sm" className="w-36" />
            </div>
            <Skeleton shape="rectangle" size="xs" className="w-20 h-5 rounded-full" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton shape="text" size="xs" className="w-16" />
            <Skeleton shape="text" size="xs" className="w-24" />
            <Skeleton shape="text" size="xs" className="w-14 ml-auto" />
          </div>
          <div className="flex justify-end">
            <Skeleton shape="rectangle" size="xs" className="w-16 h-5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Segmented status control ─────────────────────────────────────────────────

interface StatusSegmentProps {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

function StatusSegment({ value, onChange, counts }: StatusSegmentProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter by status"
      className="inline-flex items-center gap-0.5 rounded-xl bg-primary-15 p-1"
    >
      {STATUS_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
              active
                ? 'bg-background text-foreground shadow-sm shadow-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
            {counts[opt.value] > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold tabular-nums',
                  active
                    ? 'bg-primary-15 text-foreground'
                    : 'bg-primary-15/60 text-muted-foreground',
                )}
              >
                {counts[opt.value]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const ProjectsView: FC = () => {
  const { data: projects = [], isLoading } = useProjects();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  // Build count map for the segmented control badges
  const counts = useMemo<Record<StatusFilter, number>>(() => {
    const healthy = projects.filter((p) => p.status === 'healthy').length;
    const atRisk = projects.filter((p) => p.status === 'at-risk').length;
    const blocked = projects.filter((p) => p.status === 'blocked').length;
    return {
      all: projects.length,
      healthy,
      'at-risk': atRisk,
      blocked,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    let result = [...projects];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Text search — match on name or key (case-insensitive)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      // Sort by health descending (highest score first)
      return b.health.overall - a.health.overall;
    });

    return result;
  }, [projects, statusFilter, searchQuery, sortKey]);

  const isEmpty = !isLoading && filtered.length === 0;
  const hasAnyProjects = projects.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Projects</h1>
        {!isLoading && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {projects.length} total
          </span>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Status segmented control */}
        <StatusSegment value={statusFilter} onChange={setStatusFilter} counts={counts} />

        {/* Spacer — grows on larger screens to push search/sort right */}
        <div className="flex-1" />

        {/* Search input */}
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or key…"
            aria-label="Search projects"
            className={cn(
              'w-full sm:w-56 rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground',
              'placeholder:text-muted-foreground transition-colors duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'hover:border-primary/30',
            )}
          />
        </div>

        {/* Sort select */}
        <div className="relative flex items-center">
          <ArrowUpDown
            className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort projects by"
            className={cn(
              'appearance-none rounded-xl border border-border bg-background pl-8 pr-8 py-2 text-sm text-foreground cursor-pointer',
              'transition-colors duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'hover:border-primary/30',
            )}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <SlidersHorizontal
            className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* ── Content area ── */}
      {isLoading ? (
        <ProjectsSkeletonGrid />
      ) : isEmpty ? (
        <EmptyState
          title="No projects match"
          hint={
            hasAnyProjects
              ? 'Try adjusting your search or status filter.'
              : 'No projects have been synced yet.'
          }
          className="mt-4"
        />
      ) : (
        <div
          role="list"
          aria-label={`Projects — ${filtered.length} shown`}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((project) => (
            <div key={project.id} role="listitem">
              <ProjectCard project={project as Project} className="h-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsView;
