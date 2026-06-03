import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cn } from '@utils';
import type { Decision } from '@app-types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export interface DecisionRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  decision: Decision;
}

const DecisionRow: FC<DecisionRowProps> = ({ decision, className, ...props }) => {
  return (
    <div
      data-slot="decision-row"
      className={cn('flex items-start gap-3 border-t border-border py-3 first:border-t-0', className)}
      {...props}
    >
      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
        {dayjs(decision.date).format('MMM D, YYYY')}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">{decision.statement}</span>
        {decision.adrRef && (
          <span className="font-mono text-xs text-primary/60">{decision.adrRef}</span>
        )}
      </div>
    </div>
  );
};

export default DecisionRow;
