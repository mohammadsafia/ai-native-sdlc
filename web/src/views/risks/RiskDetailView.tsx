import { type FC } from 'react';

import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, AlertTriangle, Info, Lightbulb, FileText } from 'lucide-react';

import { cn } from '@utils';
import { useRisk } from '@hooks/queries';
import Card from '@components/ui/card/Card';
import Skeleton from '@components/ui/skeleton/Skeleton';
import SeverityBadge from '@components/shared/severity-badge/SeverityBadge';
import EvidenceChip from '@components/shared/evidence-chip/EvidenceChip';
import EvidenceList from '@components/shared/evidence-list/EvidenceList';
import EmptyState from '@components/shared/empty-state/EmptyState';
import type { RiskKind } from '@app-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const KIND_ICONS: Record<RiskKind, typeof ShieldAlert> = {
  delivery: ShieldAlert,
  scope_creep: AlertTriangle,
  dependency: Info,
  resource_overload: AlertTriangle,
};

const KIND_LABELS: Record<RiskKind, string> = {
  delivery: 'Delivery',
  scope_creep: 'Scope Creep',
  dependency: 'Dependency',
  resource_overload: 'Resource Overload',
};

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function RiskDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Skeleton shape="text" size="xs" className="w-24" />

      {/* Header card */}
      <Card shadow="sm" className="border border-border">
        <Card.Content className="flex flex-col gap-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton shape="text" size="sm" className="w-80" />
              <div className="flex items-center gap-2">
                <Skeleton shape="rectangle" size="xs" className="w-14 h-5 rounded-full" />
                <Skeleton shape="rectangle" size="xs" className="w-20 h-4 rounded" />
                <Skeleton shape="text" size="xs" className="w-24" />
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Evidence card */}
      <Card shadow="sm" className="border border-border">
        <Card.Content className="flex flex-col gap-3 pt-5">
          <Skeleton shape="text" size="xs" className="w-20" />
          <Skeleton shape="text" size="xs" className="w-full" />
          <Skeleton shape="text" size="xs" className="w-3/4" />
        </Card.Content>
      </Card>

      {/* Recommendation card */}
      <Card shadow="sm" className="border border-border">
        <Card.Content className="flex flex-col gap-3 pt-5">
          <Skeleton shape="text" size="xs" className="w-28" />
          <Skeleton shape="text" size="xs" className="w-full" />
          <Skeleton shape="text" size="xs" className="w-2/3" />
        </Card.Content>
      </Card>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
  className?: string;
}

function SectionCard({ icon: Icon, title, children, className }: SectionCardProps) {
  return (
    <Card
      shadow="sm"
      className={cn('border border-border overflow-hidden', className)}
    >
      <Card.Header className="flex flex-row items-center gap-2 border-b border-border bg-surface py-3">
        <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <Card.Title className="text-sm font-semibold text-foreground">{title}</Card.Title>
      </Card.Header>
      <Card.Content className="py-4">{children}</Card.Content>
    </Card>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RiskDetailViewProps {
  id: string;
}

// ─── Main view ────────────────────────────────────────────────────────────────

const RiskDetailView: FC<RiskDetailViewProps> = ({ id }) => {
  const { data: risk, isLoading } = useRisk(id);

  if (isLoading) return <RiskDetailSkeleton />;

  if (!risk) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          to="/dashboard/risks"
          className={cn(
            'inline-flex items-center gap-1.5 text-sm text-muted-foreground',
            'transition-colors duration-150 hover:text-foreground',
            'focus-visible:outline-none focus-visible:underline',
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Risks
        </Link>
        <EmptyState
          title="Risk not found"
          hint="This risk may have been removed or the ID is incorrect."
          className="mt-4"
        />
      </div>
    );
  }

  const KindIcon = KIND_ICONS[risk.kind];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Back link ── */}
      <Link
        to="/dashboard/risks"
        className={cn(
          'inline-flex items-center gap-1.5 text-sm text-muted-foreground w-fit',
          'transition-colors duration-150 hover:text-foreground',
          'focus-visible:outline-none focus-visible:underline',
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Risks
      </Link>

      {/* ── Header card ── */}
      <Card shadow="sm" className="border border-border overflow-hidden">
        <Card.Header className="border-b border-border bg-surface py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KindIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>{KIND_LABELS[risk.kind]}</span>
            <span aria-hidden="true">·</span>
            <EvidenceChip label={risk.subjectRef} />
          </div>
        </Card.Header>
        <Card.Content className="py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-xl font-bold text-foreground leading-snug">{risk.title}</h1>
            <SeverityBadge severity={risk.severity} className="shrink-0 self-start" />
          </div>
        </Card.Content>
      </Card>

      {/* ── Evidence section ── */}
      <SectionCard icon={FileText} title="Evidence">
        <div className="flex flex-col gap-3">
          <EvidenceList items={[risk.subjectRef]} />
          <p className="text-sm text-foreground leading-relaxed">{risk.evidence}</p>
        </div>
      </SectionCard>

      {/* ── Recommendation section ── */}
      <SectionCard icon={Lightbulb} title="Recommendation">
        <p className="text-sm text-foreground leading-relaxed">{risk.recommendation}</p>
      </SectionCard>
    </div>
  );
};

export default RiskDetailView;
