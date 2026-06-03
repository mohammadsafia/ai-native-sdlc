import { type FC } from 'react';

import { Card, Skeleton, Select } from '@components/ui';
import { TraceabilityGraph, EmptyState } from '@components/shared';
import { cn } from '@utils';
import { useActiveProject } from '@contexts';
import { useTraceability, useProjects } from '@hooks/queries';
import { GitBranch, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─── Skeleton shown while traceability data is loading ────────────────────────

function TraceabilitySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {/* Coverage header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton shape="text" size="sm" className="w-48" />
        <Skeleton shape="text" size="sm" className="w-12" />
      </div>

      {/* 7-lane grid skeleton */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))' }}
      >
        {Array.from({ length: 7 }).map((_, laneIdx) => (
          <div key={laneIdx} className="flex flex-col gap-1.5">
            {/* Lane header */}
            <Skeleton shape="text" size="xs" className="w-full h-8 rounded-t" />
            {/* Lane nodes */}
            <div className="flex flex-col gap-1.5 px-1 pb-2">
              {Array.from({ length: laneIdx === 0 ? 1 : laneIdx === 1 ? 1 : 2 }).map((_, nodeIdx) => (
                <Skeleton key={nodeIdx} shape="text" size="sm" className="w-full h-10 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend skeleton */}
      <div className="flex items-center gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} shape="text" size="xs" className="w-16" />
        ))}
      </div>
    </div>
  );
}

// ─── Project selector ─────────────────────────────────────────────────────────

interface ProjectSelectorProps {
  activeId: string;
  setActiveId: (id: string) => void;
}

function ProjectSelector({ activeId, setActiveId }: ProjectSelectorProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton shape="rectangle" size="sm" className="w-48 h-9 rounded-xl" />;
  }

  const active = projects.find((p) => p.id === activeId);

  return (
    <Select value={activeId} onValueChange={setActiveId}>
      <Select.Trigger
        aria-label={t('nav.projects')}
        className={cn(
          'h-9 min-w-48 max-w-72 rounded-xl border-border bg-surface px-3 py-2 text-sm',
          'text-foreground',
        )}
      >
        <GitBranch size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select.Value placeholder={t('nav.projects')}>
          {active?.name ?? t('nav.projects')}
        </Select.Value>
        <Select.Icon>
          <ChevronDown size={14} className="text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Content>
        <Select.Group>
          {projects.map((project) => (
            <Select.Item key={project.id} value={project.id}>
              <Select.Text>{project.name}</Select.Text>
              <Select.Indicator />
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const TraceabilityView: FC = () => {
  const { activeId, setActiveId } = useActiveProject();
  const { data: nodes, isLoading } = useTraceability(activeId);
  const { t } = useTranslation();

  const isEmpty = !isLoading && Array.isArray(nodes) && nodes.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('traceability.title')}</h1>
          <span className="text-sm text-muted-foreground">
            {t('traceability.subtitle')}
          </span>
        </div>

        <ProjectSelector activeId={activeId} setActiveId={setActiveId} />
      </div>

      {/* ── Content card ── */}
      <Card shadow="shadow-boundary" className="bg-surface">
        <Card.Content className="p-6">
          {isLoading ? (
            <TraceabilitySkeleton />
          ) : isEmpty ? (
            <EmptyState
              title={t('traceability.noTrace')}
              hint={t('traceability.noTraceHint')}
              className="py-20"
            />
          ) : (
            <TraceabilityGraph nodes={nodes ?? []} />
          )}
        </Card.Content>
      </Card>
    </div>
  );
};

export default TraceabilityView;
