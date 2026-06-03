import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cn } from '@utils';
import type { RiskKind } from '@app-types';

export interface RiskRollupProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  riskByKind: Record<RiskKind, number>;
}

const KIND_LABELS: Record<RiskKind, string> = {
  delivery: 'Delivery',
  scope_creep: 'Scope Creep',
  dependency: 'Dependency',
  resource_overload: 'Resource Overload',
};

const RiskRollup: FC<RiskRollupProps> = ({ riskByKind, className, ...props }) => {
  const entries = Object.entries(riskByKind) as Array<[RiskKind, number]>;
  const maxCount = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div
      data-slot="risk-rollup"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    >
      {entries.map(([kind, count]) => (
        <div key={kind} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs text-muted-foreground">{KIND_LABELS[kind]}</span>
          <div className="flex flex-1 items-center gap-2">
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted-200">
              <div
                className="h-full rounded-full bg-destructive/60 transition-all"
                style={{ width: `${(count / maxCount) * 100}%` }}
                role="progressbar"
                aria-valuenow={count}
                aria-valuemin={0}
                aria-valuemax={maxCount}
              />
            </div>
            <span className="w-4 text-right text-xs font-semibold text-foreground">{count}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RiskRollup;
