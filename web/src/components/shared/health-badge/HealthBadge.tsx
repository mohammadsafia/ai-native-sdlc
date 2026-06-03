import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@utils';
import type { ProjectStatus } from '@app-types';

export const healthBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        healthy: 'bg-success-200 text-success',
        'at-risk': 'bg-warning-200 text-warning',
        blocked: 'bg-destructive-200 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'healthy',
    },
  },
);

export interface HealthBadgeProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'>,
    VariantProps<typeof healthBadgeVariants> {
  score: number;
  label: ProjectStatus;
}

const HealthBadge: FC<HealthBadgeProps> = ({ score, label, className, ...props }) => {
  const variant = label as VariantProps<typeof healthBadgeVariants>['variant'];

  return (
    <span
      data-slot="health-badge"
      className={cn(healthBadgeVariants({ variant }), className)}
      {...props}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {score} · {label.charAt(0).toUpperCase() + label.slice(1).replace('-', ' ')}
    </span>
  );
};

export default HealthBadge;
