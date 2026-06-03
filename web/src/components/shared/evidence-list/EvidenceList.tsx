import { type ComponentPropsWithoutRef, type FC } from 'react';

import { EvidenceChip } from '@components/shared';
import { cn } from '@utils';

export interface EvidenceListProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  items: string[];
}

const EvidenceList: FC<EvidenceListProps> = ({ items, className, ...props }) => {
  return (
    <div
      data-slot="evidence-list"
      className={cn('flex flex-wrap gap-1.5', className)}
      {...props}
    >
      {items.map((item) => (
        <EvidenceChip key={item} label={item} />
      ))}
    </div>
  );
};

export default EvidenceList;
