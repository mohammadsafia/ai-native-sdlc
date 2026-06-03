import { type FC } from 'react';

import { useParams, Link } from 'react-router-dom';
import { Download, Sparkles, ChevronRight } from 'lucide-react';

import { cn } from '@utils';
import { useProject } from '@hooks/queries';
import Card from '@components/ui/card/Card';
import Button from '@components/ui/button/Button';
import Skeleton from '@components/ui/skeleton/Skeleton';
import PrimeLoader from '@components/shared/prime-loader/PrimeLoader';
import HealthBadge from '@components/shared/health-badge/HealthBadge';
import HealthRing from '@components/shared/health-ring/HealthRing';
import MetricStat from '@components/shared/metric-stat/MetricStat';
import ReportNarrative from '@components/shared/report-narrative/ReportNarrative';
import RiskRow from '@components/shared/risk-row/RiskRow';
import DecisionRow from '@components/shared/decision-row/DecisionRow';
import TimelineForecastBar from '@components/shared/timeline-forecast-bar/TimelineForecastBar';
import EmptyState from '@components/shared/empty-state/EmptyState';
import { FULL_ROUTES_PATH } from '@routes/routes';

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

  // ── Loading state ──
  if (isLoading) {
    return <ProjectHubSkeleton />;
  }

  // ── Not-found state ──
  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        hint="This project may have been removed or the URL is incorrect."
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
            Projects
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          <span className="text-foreground/70">{project.name}</span>
        </nav>

        {/* Title row + actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Project Hub</h1>
            <HealthBadge score={project.health.overall} label={project.health.label} />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export
            </Button>
            <Button variant="default" size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Generate report
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
                  label="Open risks"
                  tone="destructive"
                />
              </Card.Content>
            </Card>
            <Card className="p-4">
              <Card.Content className="p-0">
                <MetricStat
                  value={project.blockers.length}
                  label="Blockers"
                  tone="warning"
                />
              </Card.Content>
            </Card>
          </div>

          {/* Timeline forecast */}
          <Card>
            <Card.Header className="pb-2">
              <Card.Title className="text-sm font-semibold text-foreground">Forecast</Card.Title>
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
            <Card.Title className="text-base font-semibold">Top risks</Card.Title>
          </Card.Header>
          <Card.Content className="pt-0">
            {project.risks.length === 0 ? (
              <EmptyState title="No open risks" hint="All risks have been resolved." />
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
            <Card.Title className="text-base font-semibold">Key decisions</Card.Title>
          </Card.Header>
          <Card.Content className="pt-0">
            {project.decisions.length === 0 ? (
              <EmptyState title="No decisions recorded" hint="Decisions logged here will appear in reports." />
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
