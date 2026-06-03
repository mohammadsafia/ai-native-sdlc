import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cn } from '@utils';

export interface EvidenceChipProps extends ComponentPropsWithoutRef<'span'> {
  label: string;
}

const EvidenceChip: FC<EvidenceChipProps> = ({ label, className, ...props }) => {
  return (
    <span
      data-slot="evidence-chip"
      className={cn(
        'inline-flex items-center rounded border border-muted-200 bg-muted-100 px-1 font-mono text-xs text-foreground dark:border-muted-200 dark:bg-primary-100 dark:text-foreground',
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
};

export default EvidenceChip;
