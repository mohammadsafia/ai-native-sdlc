import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@utils';
import type { Severity } from '@app-types';

export const severityBadgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        high: 'bg-destructive-200 text-destructive',
        medium: 'bg-warning-200 text-warning',
        low: 'bg-success-200 text-success',
      },
    },
    defaultVariants: {
      variant: 'low',
    },
  },
);

export interface SeverityBadgeProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'>,
    VariantProps<typeof severityBadgeVariants> {
  severity: Severity;
}

const SeverityBadge: FC<SeverityBadgeProps> = ({ severity, className, ...props }) => {
  const variant = severity as VariantProps<typeof severityBadgeVariants>['variant'];

  return (
    <span
      data-slot="severity-badge"
      className={cn(severityBadgeVariants({ variant }), className)}
      {...props}
    >
      {severity}
    </span>
  );
};

export default SeverityBadge;
