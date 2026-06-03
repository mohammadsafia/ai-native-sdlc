import { type FC, useState, useMemo } from 'react';

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Card, Input, Select, Skeleton, ToggleGroup } from '@components/ui';
import { SeverityBadge, EvidenceChip, EmptyState } from '@components/shared';
import { cn } from '@utils';
import { useRisks } from '@hooks/queries';
import { Search, ShieldAlert, AlertTriangle, Info, ChevronRight, Filter } from 'lucide-react';
import type { RiskKind, Severity } from '@app-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const KIND_ICONS: Record<RiskKind, typeof ShieldAlert> = {
  delivery: ShieldAlert,
  scope_creep: AlertTriangle,
  dependency: Info,
  resource_overload: AlertTriangle,
};

// ─── Skeleton loading rows ────────────────────────────────────────────────────

function RisksSkeletonList() {
  return (
    <Card shadow="sm" className="border border-border overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4" aria-hidden="true">
            <Skeleton shape="rectangle" size="xs" className="w-14 h-5 rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton shape="text" size="xs" className="w-64" />
              <Skeleton shape="text" size="xs" className="w-40" />
            </div>
            <Skeleton shape="rectangle" size="xs" className="w-20 h-4 shrink-0" />
            <Skeleton shape="rectangle" size="xs" className="w-24 h-4 shrink-0" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type FilterBarProps = {
  kindFilter: 'all' | RiskKind;
  severityFilter: 'all' | Severity;
  searchQuery: string;
  onKindChange: (v: 'all' | RiskKind) => void;
  onSeverityChange: (v: 'all' | Severity) => void;
  onSearchChange: (v: string) => void;
};

function FilterBar({
  kindFilter,
  severityFilter,
  searchQuery,
  onKindChange,
  onSeverityChange,
  onSearchChange,
}: FilterBarProps) {
  const { t } = useTranslation();

  const KIND_OPTIONS: { value: 'all' | RiskKind; label: string }[] = [
    { value: 'all', label: t('risks.allKinds') },
    { value: 'delivery', label: t('risks.kinds.delivery') },
    { value: 'scope_creep', label: t('risks.kinds.scope_creep') },
    { value: 'dependency', label: t('risks.kinds.dependency') },
    { value: 'resource_overload', label: t('risks.kinds.resource_overload') },
  ];

  const SEVERITY_OPTIONS: { value: 'all' | Severity; label: string }[] = [
    { value: 'all', label: t('risks.allSeverities') },
    { value: 'high', label: t('risks.severityHigh') },
    { value: 'medium', label: t('risks.severityMedium') },
    { value: 'low', label: t('risks.severityLow') },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      {/* Search */}
      <div className="relative flex items-center">
        <Search
          className="pointer-events-none absolute start-3 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('risks.searchPlaceholder')}
          aria-label={t('risks.searchLabel')}
          className="w-full sm:w-52 rounded-xl ps-8 pe-3 py-2 text-sm"
        />
      </div>

      {/* Kind filter */}
      <Select value={kindFilter} onValueChange={(v) => onKindChange(v as 'all' | RiskKind)}>
        <Select.Trigger aria-label={t('risks.filterByKind')} className="rounded-xl py-2 text-sm sm:w-48">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <Select.Value />
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {KIND_OPTIONS.map((opt) => (
            <Select.Item key={opt.value} value={opt.value}>
              <Select.Text>{opt.label}</Select.Text>
            </Select.Item>
          ))}
        </Select.Content>
      </Select>

      {/* Severity segmented control */}
      <ToggleGroup
        type="single"
        value={severityFilter}
        onValueChange={(v) => { if (v) onSeverityChange(v as 'all' | Severity); }}
        aria-label={t('risks.filterBySeverity')}
        className="inline-flex items-center gap-0.5 rounded-xl bg-primary-15 p-1"
      >
        {SEVERITY_OPTIONS.map((opt) => (
          <ToggleGroup.Item
            key={opt.value}
            value={opt.value}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:shadow-border text-muted-foreground hover:text-foreground bg-transparent"
          >
            {opt.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup>
    </div>
  );
}

// ─── Risk list row ────────────────────────────────────────────────────────────

type RiskListRowProps = {
  id: string;
  severity: Severity;
  title: string;
  subjectRef: string;
  kind: RiskKind;
  recommendation: string;
};

function RiskListRow({ id, severity, title, subjectRef, kind, recommendation }: RiskListRowProps) {
  const { t } = useTranslation();
  const KindIcon = KIND_ICONS[kind];

  const KIND_LABELS: Record<RiskKind, string> = {
    delivery: t('risks.kinds.delivery'),
    scope_creep: t('risks.kinds.scope_creep'),
    dependency: t('risks.kinds.dependency'),
    resource_overload: t('risks.kinds.resource_overload'),
  };

  return (
    <Link
      to={`/dashboard/risks/${id}`}
      className={cn(
        'group flex items-center gap-4 px-5 py-4',
        'transition-colors duration-150 hover:bg-primary-15/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
      )}
      aria-label={`${t('risks.title')}: ${title}`}
    >
      {/* Severity badge */}
      <SeverityBadge severity={severity} className="shrink-0 w-14 justify-center" />

      {/* Title + subject ref */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground truncate">{title}</span>
        <div className="flex items-center gap-1.5">
          <EvidenceChip label={subjectRef} />
        </div>
      </div>

      {/* Kind */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
        <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{KIND_LABELS[kind]}</span>
      </div>

      {/* Truncated recommendation */}
      <p className="hidden md:block text-xs text-muted-foreground truncate max-w-56 shrink-0">
        {recommendation}
      </p>

      {/* Chevron */}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}

// ─── Severity summary pills ───────────────────────────────────────────────────

type SeveritySummaryProps = {
  counts: { high: number; medium: number; low: number };
};

function SeveritySummary({ counts }: SeveritySummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {counts.high > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
          {counts.high} {t('risks.severityHigh').toLowerCase()}
        </span>
      )}
      {counts.medium > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
          {counts.medium} {t('risks.severityMedium').toLowerCase()}
        </span>
      )}
      {counts.low > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
          {counts.low} {t('risks.severityLow').toLowerCase()}
        </span>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const RisksView: FC = () => {
  const { data: risks = [], isLoading } = useRisks();
  const { t } = useTranslation();

  const [kindFilter, setKindFilter] = useState<'all' | RiskKind>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const severityCounts = useMemo(() => ({
    high: risks.filter((r) => r.severity === 'high').length,
    medium: risks.filter((r) => r.severity === 'medium').length,
    low: risks.filter((r) => r.severity === 'low').length,
  }), [risks]);

  const filtered = useMemo(() => {
    let result = [...risks];

    if (kindFilter !== 'all') {
      result = result.filter((r) => r.kind === kindFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter((r) => r.severity === severityFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subjectRef.toLowerCase().includes(q) ||
          r.recommendation.toLowerCase().includes(q),
      );
    }

    // Sort: high → medium → low
    const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    result.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

    return result;
  }, [risks, kindFilter, severityFilter, searchQuery]);

  const isEmpty = !isLoading && filtered.length === 0;
  const hasAnyRisks = risks.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('risks.title')}</h1>
          {!isLoading && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {risks.length} {t('risks.total')}
            </span>
          )}
        </div>
        {!isLoading && <SeveritySummary counts={severityCounts} />}
      </div>

      {/* ── Filter bar ── */}
      <FilterBar
        kindFilter={kindFilter}
        severityFilter={severityFilter}
        searchQuery={searchQuery}
        onKindChange={setKindFilter}
        onSeverityChange={setSeverityFilter}
        onSearchChange={setSearchQuery}
      />

      {/* ── Content ── */}
      {isLoading ? (
        <RisksSkeletonList />
      ) : isEmpty ? (
        <EmptyState
          title={t('risks.noMatch')}
          hint={
            hasAnyRisks
              ? t('risks.noMatchHint')
              : t('risks.noRisksYet')
          }
          className="mt-4"
        />
      ) : (
        <Card
          shadow="sm"
          className="border border-border overflow-hidden"
          role="list"
          aria-label={`${t('risks.title')} — ${filtered.length} ${t('risks.shown')}`}
        >
          {/* Table header */}
          <div
            className="hidden sm:grid grid-cols-[5rem_1fr_10rem_14rem_1.5rem] gap-4 items-center border-b border-border bg-surface px-5 py-2.5"
            aria-hidden="true"
          >
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{t('risks.tableColSeverity')}</span>
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{t('risks.tableColRiskRef')}</span>
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{t('risks.tableColKind')}</span>
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{t('risks.tableColRecommendation')}</span>
            <span />
          </div>

          <div role="list" className="divide-y divide-border">
            {filtered.map((risk) => (
              <div key={risk.id} role="listitem">
                <RiskListRow
                  id={risk.id}
                  severity={risk.severity}
                  title={risk.title}
                  subjectRef={risk.subjectRef}
                  kind={risk.kind}
                  recommendation={risk.recommendation}
                />
              </div>
            ))}
          </div>

          {/* Footer count */}
          <footer className="border-t border-border bg-surface px-5 py-2.5">
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('risks.showingOf', { shown: filtered.length, total: risks.length })}
            </span>
          </footer>
        </Card>
      )}
    </div>
  );
};

export default RisksView;
