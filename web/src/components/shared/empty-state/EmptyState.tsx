import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cn } from '@utils';

export interface EmptyStateProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  title: string;
  hint?: string;
}

const EmptyState: FC<EmptyStateProps> = ({ title, hint, className, ...props }) => {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center',
        className,
      )}
      {...props}
    >
      <span className="text-sm font-medium text-muted-foreground">{title}</span>
      {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
    </div>
  );
};

export default EmptyState;
