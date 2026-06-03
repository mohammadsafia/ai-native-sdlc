import { type FC } from 'react';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { FileText, CheckCircle2, Circle, Clock, AlertCircle, GitPullRequest } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@utils';
import { useWeeklyReport, useProjects } from '@hooks/queries';
import { useActiveProject } from '@contexts';
import Card from '@components/ui/card/Card';
import Skeleton from '@components/ui/skeleton/Skeleton';
import {
  ReportNarrative,
  MetricStat,
  RiskRow,
  EvidenceChip,
  EmptyState,
  PrimeLoader,
} from '@components/shared';
import type { ReportItem } from '@app-types';

dayjs.extend(relativeTime);

// ─── Project selector ─────────────────────────────────────────────────────────

interface ProjectSelectorProps {
  activeId: string;
  onSelect: (id: string) => void;
}

function ProjectSelector({ activeId, onSelect }: ProjectSelectorProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton shape="rectangle" size="xs" className="w-40 h-8" />;
  }

  return (
    <select
      value={activeId}
      onChange={(e) => onSelect(e.target.value)}
      aria-label={t('report.project')}
      className={cn(
        'rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-foreground cursor-pointer',
        'transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1',
        'hover:border-primary/30',
      )}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading report…" aria-busy="true">
      {/* Narrative card skeleton */}
      <div className="rounded-2xl bg-background shadow border border-border p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <Skeleton shape="text" size="sm" className="w-36" />
          <Skeleton shape="rectangle" size="xs" className="w-24 h-5 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton shape="text" size="xs" className="w-full" />
          <Skeleton shape="text" size="xs" className="w-5/6" />
          <Skeleton shape="text" size="xs" className="w-4/5" />
          <Skeleton shape="text" size="xs" className="w-3/4" />
        </div>
      </div>

      {/* Metrics row skeleton */}
      <div className="rounded-2xl bg-background shadow border border-border p-5">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton shape="text" size="md" className="w-10" />
              <Skeleton shape="text" size="xs" className="w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Section cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-background shadow border border-border p-6 flex flex-col gap-3">
          <Skeleton shape="text" size="sm" className="w-28" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="flex items-center gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <Skeleton shape="rectangle" size="xs" className="w-16 h-5" />
              <Skeleton shape="text" size="xs" className="flex-1" />
              <Skeleton shape="text" size="xs" className="w-24" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Story row ────────────────────────────────────────────────────────────────

interface StoryRowProps {
  item: ReportItem;
  tone?: 'default' | 'warning';
}

function StoryRow({ item, tone = 'default' }: StoryRowProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2.5 first:border-t-0',
      )}
    >
      <EvidenceChip label={item.key} />
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground',
          tone === 'warning' && 'text-warning',
        )}
      >
        {item.title}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">{item.assignee}</span>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function SectionCard({ title, icon, children, className }: SectionCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <Card.Header className="pb-1 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
          <Card.Title className="text-base font-semibold text-foreground">{title}</Card.Title>
        </div>
      </Card.Header>
      <Card.Content className="pt-1 pb-4">{children}</Card.Content>
    </Card>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const WeeklyReportView: FC = () => {
  const { activeId, setActiveId } = useActiveProject();
  const { data: report, isLoading } = useWeeklyReport(activeId);
  const { t } = useTranslation();

  // ── States ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        {/* Header skeleton */}
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <Skeleton shape="text" size="sm" className="w-36" />
              <Skeleton shape="text" size="xs" className="w-48" />
            </div>
            <Skeleton shape="rectangle" size="xs" className="w-40 h-8" />
          </div>
          <ReportSkeleton />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('report.title')}</h1>
            </div>
            <ProjectSelector activeId={activeId} onSelect={setActiveId} />
          </div>
          <EmptyState
            title={t('report.noReport')}
            hint={t('report.noReportHint')}
          />
        </div>
      </div>
    );
  }

  const {
    summary,
    narrative: _narrative,
    completed,
    inProgress,
    staleStories,
    idlePrs,
    risks,
    periodEnd,
    generatedAt,
    dataCompleteness,
  } = report;

  const completenessLabel = `${Math.round(dataCompleteness)}% ${t('report.dataCompleteness').toLowerCase()}`;
  const generatedLabel = `${t('report.generatedAt')} ${dayjs(generatedAt).fromNow()}`;
  const velocityPct =
    summary.pointsCommitted > 0
      ? Math.round((summary.pointsCompleted / summary.pointsCommitted) * 100)
      : 0;

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* ── Page header ── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('report.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('report.weekEnding')} {dayjs(periodEnd).format('MMM D, YYYY')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">{t('report.project')}</span>
            <ProjectSelector activeId={activeId} onSelect={setActiveId} />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col gap-6">

          {/* ── AI Narrative ── */}
          <ReportNarrative report={report} />

          {/* ── Summary metrics ── */}
          <Card>
            <Card.Content className="py-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 md:grid-cols-6">
                <MetricStat
                  value={summary.done}
                  label={t('report.done')}
                  tone={summary.done > 0 ? 'success' : 'default'}
                />
                <MetricStat
                  value={summary.inProgress}
                  label={t('report.inProgressShort')}
                />
                <MetricStat
                  value={summary.todo}
                  label={t('report.toDo')}
                  tone="muted"
                />
                <MetricStat
                  value={summary.blocked}
                  label={t('report.blocked')}
                  tone={summary.blocked > 0 ? 'destructive' : 'default'}
                />
                <MetricStat
                  value={summary.pointsCompleted}
                  label={t('report.pointsDone')}
                  tone={velocityPct >= 75 ? 'success' : velocityPct >= 50 ? 'warning' : 'destructive'}
                />
                <MetricStat
                  value={summary.pointsCommitted}
                  label={t('report.pointsCommitted')}
                  tone="muted"
                />
              </div>
            </Card.Content>
          </Card>

          {/* ── Completed ── */}
          <SectionCard
            title={t('report.completed')}
            icon={<CheckCircle2 size={16} />}
          >
            {completed.length === 0 ? (
              <EmptyState title={t('report.noCompletedItems')} className="border-none py-6" />
            ) : (
              <div>
                {completed.map((item) => (
                  <StoryRow key={item.key} item={item} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── In progress ── */}
          <SectionCard
            title={t('report.inProgress')}
            icon={<Circle size={16} />}
          >
            {inProgress.length === 0 ? (
              <EmptyState title={t('report.nothingInProgress')} className="border-none py-6" />
            ) : (
              <div>
                {inProgress.map((item) => (
                  <StoryRow key={item.key} item={item} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── Stale stories ── */}
          <SectionCard
            title={t('report.staleStories')}
            icon={<Clock size={16} />}
          >
            {staleStories.length === 0 ? (
              <EmptyState title={t('report.noStaleStories')} hint={t('report.noStaleStoriesHint')} className="border-none py-6" />
            ) : (
              <div>
                {staleStories.map((item) => (
                  <StoryRow key={item.key} item={item} tone="warning" />
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── Idle PRs ── */}
          <SectionCard
            title={t('report.idlePRs')}
            icon={<GitPullRequest size={16} />}
          >
            {idlePrs.length === 0 ? (
              <EmptyState title={t('report.noIdlePRs')} hint={t('report.noIdlePRsHint')} className="border-none py-6" />
            ) : (
              <div>
                {idlePrs.map((pr) => (
                  <div
                    key={pr.id}
                    className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
                  >
                    <EvidenceChip label={pr.id} />
                    <span className="flex-1 text-sm text-muted-foreground tabular-nums">
                      {t('report.daysIdleShort', { days: pr.daysIdle })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── Risks ── */}
          <SectionCard
            title={t('report.risks')}
            icon={<AlertCircle size={16} />}
          >
            {risks.length === 0 ? (
              <EmptyState title={t('report.noRisksIdentified')} hint={t('report.noRisksIdentifiedHint')} className="border-none py-6" />
            ) : (
              <div>
                {risks.map((risk) => (
                  <RiskRow key={risk.id} risk={risk} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── Footer grounding line ── */}
          <footer className="flex flex-col gap-0.5 pb-4 text-center">
            <p className="text-xs text-muted-foreground">
              {completenessLabel} · {generatedLabel}
            </p>
            <p className="text-xs text-muted-foreground/50">
              {t('report.aiDisclaimer')}
            </p>
          </footer>

        </div>
      </div>
    </div>
  );
};

export default WeeklyReportView;
