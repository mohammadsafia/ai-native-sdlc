import { type FC, useState, useMemo } from 'react';

import { useTranslation } from 'react-i18next';
import { Input, Select, Skeleton, ToggleGroup } from '@components/ui';
import { ProjectCard, EmptyState } from '@components/shared';
import { cn } from '@utils';
import { useProjects } from '@hooks/queries';
import { Search, ArrowUpDown } from 'lucide-react';
import type { Project, ProjectStatus } from '@app-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | ProjectStatus;
type SortKey = 'name' | 'health';

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
            <Skeleton shape="text" size="xs" className="w-14 ms-auto" />
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

type StatusSegmentProps = {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
};

function StatusSegment({ value, onChange, counts }: StatusSegmentProps) {
  const { t } = useTranslation();

  const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('projects.filters.all') },
    { value: 'healthy', label: t('projects.filters.healthy') },
    { value: 'at-risk', label: t('projects.filters.atRisk') },
    { value: 'blocked', label: t('projects.filters.blocked') },
  ];

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => { if (v) onChange(v as StatusFilter); }}
      aria-label={t('projects.filterByStatus')}
      className="inline-flex items-center gap-0.5 rounded-xl bg-primary-15 p-1"
    >
      {STATUS_OPTIONS.map((opt) => (
        <ToggleGroup.Item
          key={opt.value}
          value={opt.value}
          className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-border text-muted-foreground hover:text-foreground bg-transparent"
        >
          {opt.label}
          {counts[opt.value] > 0 && (
            <span
              className={cn(
                'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold tabular-nums',
                value === opt.value
                  ? 'bg-primary-15 text-foreground'
                  : 'bg-primary-15/60 text-muted-foreground',
              )}
            >
              {counts[opt.value]}
            </span>
          )}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const ProjectsView: FC = () => {
  const { data: projects = [], isLoading } = useProjects();
  const { t } = useTranslation();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'name', label: t('projects.sortByName') },
    { value: 'health', label: t('projects.sortByHealth') },
  ];

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
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('projects.title')}</h1>
        {!isLoading && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {projects.length} {t('projects.total')}
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
            className="pointer-events-none absolute start-3 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('projects.searchPlaceholder')}
            aria-label={t('projects.searchLabel')}
            className="w-full sm:w-56 rounded-xl ps-8 pe-3 py-2 text-sm"
          />
        </div>

        {/* Sort select */}
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <Select.Trigger aria-label={t('projects.sortLabel')} className="rounded-xl py-2 text-sm sm:w-44">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <Select.Value />
            <Select.Icon />
          </Select.Trigger>
          <Select.Content>
            {SORT_OPTIONS.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                <Select.Text>{opt.label}</Select.Text>
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>

      {/* ── Content area ── */}
      {isLoading ? (
        <ProjectsSkeletonGrid />
      ) : isEmpty ? (
        <EmptyState
          title={t('projects.noMatch')}
          hint={
            hasAnyProjects
              ? t('projects.noMatchHint')
              : t('projects.noProjectsYet')
          }
          className="mt-4"
        />
      ) : (
        <div
          role="list"
          aria-label={`${t('projects.title')} — ${filtered.length} ${t('projects.shown')}`}
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
