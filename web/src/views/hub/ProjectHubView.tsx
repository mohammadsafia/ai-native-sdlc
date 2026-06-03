import { type FC } from 'react';

import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Card, Button, Skeleton } from '@components/ui';
import {
  PrimeLoader,
  HealthBadge,
  HealthRing,
  MetricStat,
  ReportNarrative,
  RiskRow,
  DecisionRow,
  TimelineForecastBar,
  EmptyState,
} from '@components/shared';
import { cn } from '@utils';
import { FULL_ROUTES_PATH } from '@routes';
import { useProject } from '@hooks/queries';
import { Download, Sparkles, ChevronRight } from 'lucide-react';

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function ProjectHubSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-2">
        <Skeleton shape="text" size="xs" className="w-48" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton shape="text" size="md" className="w-40" />
            <Skeleton shape="rectangle" size="xs" className="w-20 h-6 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton shape="rectangle" size="sm" className="w-20 h-9 rounded-md" />
            <Skeleton shape="rectangle" size="sm" className="w-32 h-9 rounded-md" />
          </div>
        </div>
      </div>

      {/* Main 2-col grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: narrative */}
        <div className="rounded-2xl border border-border bg-background p-6 flex flex-col gap-3">
          <Skeleton shape="text" size="sm" className="w-32" />
          <div className="flex flex-col gap-2">
            <Skeleton shape="text" size="xs" className="w-full" />
            <Skeleton shape="text" size="xs" className="w-full" />
            <Skeleton shape="text" size="xs" className="w-5/6" />
            <Skeleton shape="text" size="xs" className="w-full" />
            <Skeleton shape="text" size="xs" className="w-4/5" />
          </div>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {/* Health ring */}
          <div className="rounded-2xl border border-border bg-background p-6 flex flex-col items-center gap-4">
            <Skeleton shape="avatar" size="xl" className="w-28 h-28" />
            <div className="w-full flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} shape="text" size="xs" className="w-full" />
              ))}
            </div>
          </div>
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Skeleton shape="rectangle" size="md" className="rounded-2xl w-full h-16" />
            <Skeleton shape="rectangle" size="md" className="rounded-2xl w-full h-16" />
          </div>
          {/* Forecast */}
          <div className="rounded-2xl border border-border bg-background p-6 flex flex-col gap-3">
            <Skeleton shape="text" size="sm" className="w-24" />
            <Skeleton shape="text" size="xs" className="w-full" />
            <Skeleton shape="text" size="xs" className="w-3/4" />
          </div>
        </div>
      </div>

      {/* Lower 2-col grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-6 flex flex-col gap-3">
          <Skeleton shape="text" size="sm" className="w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="text" size="xs" className="w-full" />
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-background p-6 flex flex-col gap-3">
          <Skeleton shape="text" size="sm" className="w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} shape="text" size="xs" className="w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────────

const ProjectHubView: FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(id);
  const { t } = useTranslation();

  // ── Loading state ──
  if (isLoading) {
    return <ProjectHubSkeleton />;
  }

  // ── Not-found state ──
  if (!project) {
    return (
      <EmptyState
        title={t('hub.projectNotFound')}
        hint={t('hub.projectNotFoundHint')}
        className="mt-16"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            to={FULL_ROUTES_PATH.PROJECTS.INDEX}
            className="transition-colors duration-150 hover:text-foreground"
          >
            {t('nav.projects')}
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50 rtl:rotate-180" aria-hidden="true" />
          <span className="text-foreground/70">{project.name}</span>
        </nav>

        {/* Title row + actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('hub.title')}</h1>
            <HealthBadge score={project.health.overall} label={project.health.label} />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.export')}
            </Button>
            <Button variant="default" size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.generateReport')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Main 2-column grid ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* LEFT: narrative hero */}
        <ReportNarrative report={project.report} />

        {/* RIGHT rail */}
        <div className="flex flex-col gap-4">

          {/* Health ring */}
          <Card className={cn('p-5')}>
            <Card.Content className="p-0">
              <HealthRing
                score={project.health.overall}
                subScores={project.health.subScores}
              />
            </Card.Content>
          </Card>

          {/* Metric stats row */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <Card.Content className="p-0">
                <MetricStat
                  value={project.risks.length}
                  label={t('hub.openRisks')}
                  tone="destructive"
                />
              </Card.Content>
            </Card>
            <Card className="p-4">
              <Card.Content className="p-0">
                <MetricStat
                  value={project.blockers.length}
                  label={t('hub.blockers')}
                  tone="warning"
                />
              </Card.Content>
            </Card>
          </div>

          {/* Timeline forecast */}
          <Card>
            <Card.Header className="pb-2">
              <Card.Title className="text-sm font-semibold text-foreground">{t('hub.forecast')}</Card.Title>
            </Card.Header>
            <Card.Content className="pt-0">
              <TimelineForecastBar forecast={project.forecast} />
            </Card.Content>
          </Card>

        </div>
      </div>

      {/* ── Lower 2-column grid ─────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Top risks */}
        <Card>
          <Card.Header>
            <Card.Title className="text-base font-semibold">{t('hub.topRisks')}</Card.Title>
          </Card.Header>
          <Card.Content className="pt-0">
            {project.risks.length === 0 ? (
              <EmptyState title={t('hub.noOpenRisks')} hint={t('hub.noOpenRisksHint')} />
            ) : (
              <div>
                {project.risks.map((risk) => (
                  <RiskRow key={risk.id} risk={risk} />
                ))}
              </div>
            )}
          </Card.Content>
        </Card>

        {/* Key decisions */}
        <Card>
          <Card.Header>
            <Card.Title className="text-base font-semibold">{t('hub.keyDecisions')}</Card.Title>
          </Card.Header>
          <Card.Content className="pt-0">
            {project.decisions.length === 0 ? (
              <EmptyState title={t('hub.noDecisions')} hint={t('hub.noDecisionsHint')} />
            ) : (
              <div>
                {project.decisions.map((decision) => (
                  <DecisionRow key={decision.id} decision={decision} />
                ))}
              </div>
            )}
          </Card.Content>
        </Card>

      </div>
    </div>
  );
};

export default ProjectHubView;
