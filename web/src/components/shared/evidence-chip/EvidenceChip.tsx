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
        'inline-flex items-center rounded border border-border bg-surface px-1 font-mono text-xs text-primary',
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
};

export default EvidenceChip;
