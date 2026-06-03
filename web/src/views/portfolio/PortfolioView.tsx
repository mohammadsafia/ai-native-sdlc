import { type FC } from 'react';

import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight } from 'lucide-react';

import { cn } from '@utils';
import { usePortfolio } from '@hooks/queries';
import Card from '@components/ui/card/Card';
import Skeleton from '@components/ui/skeleton/Skeleton';
import {
  HealthHeatmap,
  RiskRollup,
  MetricStat,
  HealthBadge,
  EmptyState,
} from '@components/shared';

// ─── Skeleton shown while loading ─────────────────────────────────────────────

function PortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <Skeleton shape="text" size="md" className="w-32" />

      {/* AI summary banner skeleton */}
      <div className="rounded-2xl bg-background border border-border p-5 flex flex-col gap-3" aria-hidden="true">
        <div className="flex items-center gap-2">
          <Skeleton shape="rectangle" size="xs" className="w-28 h-5 rounded-full" />
        </div>
        <Skeleton shape="text" size="sm" className="w-full" />
        <Skeleton shape="text" size="sm" className="w-5/6" />
        <Skeleton shape="text" size="sm" className="w-4/6" />
      </div>

      {/* Grid row skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-background border border-border p-5 flex flex-col gap-4">
            <Skeleton shape="text" size="xs" className="w-28" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} shape="square" size="md" className="rounded-xl h-14" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* At-risk section skeleton */}
      <div className="rounded-2xl bg-background border border-border p-5 flex flex-col gap-4">
        <Skeleton shape="text" size="sm" className="w-32" />
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border">
            <div className="flex items-center gap-3">
              <Skeleton shape="text" size="xs" className="w-10" />
              <Skeleton shape="text" size="xs" className="w-32" />
            </div>
            <Skeleton shape="rectangle" size="xs" className="w-20 h-5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Trend indicator for throughput ──────────────────────────────────────────

interface TrendIndicatorProps {
  trend: number;
}

function TrendIndicator({ trend }: TrendIndicatorProps) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        +{trend}%
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
        {trend}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      Flat
    </span>
  );
}

// ─── Compact at-risk project row ─────────────────────────────────────────────

interface AtRiskRowProps {
  project: {
    id: string;
    key: string;
    name: string;
    status: import('@app-types').ProjectStatus;
    health: { overall: number; label: import('@app-types').ProjectStatus };
  };
  isLast: boolean;
}

function AtRiskRow({ project, isLast }: AtRiskRowProps) {
  return (
    <Link
      to={`/dashboard/projects/${project.id}`}
      className={cn(
        'group flex items-center justify-between gap-4 py-3 px-1 transition-colors duration-150',
        'hover:bg-primary-15 rounded-lg px-3',
        !isLast && 'border-b border-border',
      )}
      aria-label={`Open ${project.name} — health ${project.health.overall}, status ${project.health.label}`}
    >
      {/* Left: key + name */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground w-10">
          {project.key}
        </span>
        <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
      </div>

      {/* Right: badge + chevron */}
      <div className="flex items-center gap-2 shrink-0">
        <HealthBadge score={project.health.overall} label={project.health.label} />
        <ArrowRight
          className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const PortfolioView: FC = () => {
  const { data: portfolio, isLoading } = usePortfolio();

  if (isLoading) {
    return (
      <div className="p-6">
        <PortfolioSkeleton />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-6">
        <div className="flex items-baseline gap-3 mb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Portfolio</h1>
        </div>
        <EmptyState
          title="No portfolio data available"
          hint="Connect your project data sources to see the portfolio overview."
        />
      </div>
    );
  }

  const atRiskProjects = portfolio.projects.filter(
    (p) => p.health.label !== 'healthy',
  );

  const throughputTone =
    portfolio.throughput.trend > 0
      ? 'success'
      : portfolio.throughput.trend < 0
        ? 'destructive'
        : 'default';

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Portfolio</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {portfolio.projects.length} projects
        </span>
      </div>

      {/* ── AI executive summary banner ── */}
      <Card className="border border-border" shadow="sm">
        <Card.Content className="px-5 py-4">
          <div className="flex flex-col gap-3">
            {/* AI tag */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  'bg-primary-15 text-primary',
                )}
              >
                <span aria-hidden="true">✦</span>
                AI-generated
              </span>
            </div>

            {/* Summary text */}
            <p className="text-sm leading-relaxed text-foreground">
              {portfolio.executiveSummary}
            </p>
          </div>
        </Card.Content>
      </Card>

      {/* ── Metrics grid row ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Health heatmap card */}
        <Card className="border border-border md:col-span-2" shadow="sm">
          <Card.Header className="px-5 py-4 pb-2">
            <Card.Title className="text-sm font-semibold text-foreground">Project Health</Card.Title>
          </Card.Header>
          <Card.Content className="px-5 pb-4">
            <HealthHeatmap projects={portfolio.projects} />
          </Card.Content>
        </Card>

        {/* Throughput + risk column */}
        <div className="flex flex-col gap-4">
          {/* Throughput stat card */}
          <Card className="border border-border" shadow="sm">
            <Card.Content className="px-5 py-4">
              <div className="flex flex-col gap-1.5">
                <MetricStat
                  value={portfolio.throughput.merged}
                  label={`PRs merged / ${portfolio.throughput.window}`}
                  tone={throughputTone}
                />
                <TrendIndicator trend={portfolio.throughput.trend} />
              </div>
            </Card.Content>
          </Card>

          {/* Risk rollup card */}
          <Card className="border border-border flex-1" shadow="sm">
            <Card.Header className="px-5 py-3 pb-1">
              <Card.Title className="text-sm font-semibold text-foreground">Risk by Kind</Card.Title>
            </Card.Header>
            <Card.Content className="px-5 pb-4">
              <RiskRollup riskByKind={portfolio.riskByKind} />
            </Card.Content>
          </Card>
        </div>
      </div>

      {/* ── At-risk projects section ── */}
      <Card className="border border-border" shadow="sm">
        <Card.Header className="px-5 py-4 pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            <Card.Title className="text-sm font-semibold text-foreground">
              At-risk Projects
            </Card.Title>
            {atRiskProjects.length > 0 && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning tabular-nums"
                aria-label={`${atRiskProjects.length} projects need attention`}
              >
                {atRiskProjects.length}
              </span>
            )}
          </div>
        </Card.Header>
        <Card.Content className="px-5 pb-4">
          {atRiskProjects.length === 0 ? (
            <EmptyState
              title="All projects are healthy"
              hint="No projects currently require attention."
            />
          ) : (
            <div role="list" aria-label="At-risk projects">
              {atRiskProjects.map((project, index) => (
                <div key={project.id} role="listitem">
                  <AtRiskRow
                    project={project}
                    isLast={index === atRiskProjects.length - 1}
                  />
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
};

export default PortfolioView;
