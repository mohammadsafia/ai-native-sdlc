import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@utils';

export const metricStatValueVariants = cva('text-3xl font-bold leading-none', {
  variants: {
    tone: {
      default: 'text-foreground',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

export interface MetricStatProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'>,
    VariantProps<typeof metricStatValueVariants> {
  value: string | number;
  label: string;
}

const MetricStat: FC<MetricStatProps> = ({ value, label, tone, className, ...props }) => {
  return (
    <div data-slot="metric-stat" className={cn('flex flex-col gap-1', className)} {...props}>
      <span className={cn(metricStatValueVariants({ tone }))}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
};

export default MetricStat;
