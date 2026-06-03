import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cn } from '@utils';
import type { Risk, Severity } from '@app-types';
import SeverityBadge from '@components/shared/severity-badge/SeverityBadge';
import EvidenceChip from '@components/shared/evidence-chip/EvidenceChip';

export interface RiskRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  risk: Risk;
}

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-success',
};

const RiskRow: FC<RiskRowProps> = ({ risk, className, ...props }) => {
  return (
    <div
      data-slot="risk-row"
      className={cn(
        'flex flex-col gap-1 border-t border-border py-3 first:border-t-0',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[risk.severity])}
          aria-hidden="true"
        />
        <span className="flex-1 text-sm font-medium text-foreground">{risk.title}</span>
        <SeverityBadge severity={risk.severity} />
      </div>
      <div className="flex items-center gap-1.5 pl-4 text-xs text-muted-foreground">
        <span>{risk.evidence}</span>
        <EvidenceChip label={risk.subjectRef} />
      </div>
    </div>
  );
};

export default RiskRow;
