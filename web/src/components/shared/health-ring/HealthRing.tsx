import { type ComponentPropsWithoutRef, type FC } from 'react';

import { cn } from '@utils';
import type { SubScores } from '@app-types';

export interface HealthRingProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  score: number;
  subScores: SubScores;
}

function subScoreColor(value: number): string {
  if (value >= 75) return 'bg-success';
  if (value >= 50) return 'bg-warning';
  return 'bg-destructive';
}

function subScoreTextColor(value: number): string {
  if (value >= 75) return 'text-success';
  if (value >= 50) return 'text-warning';
  return 'text-destructive';
}

const SUB_SCORE_LABELS: Record<keyof SubScores, string> = {
  scope: 'Scope',
  timeline: 'Timeline',
  velocity: 'Velocity',
  techRisk: 'Tech risk',
};

const HealthRing: FC<HealthRingProps> = ({ score, subScores, className, ...props }) => {
  // Clamp score to 0–100 for the conic gradient
  const pct = Math.min(100, Math.max(0, score));

  return (
    <div data-slot="health-ring" className={cn('flex flex-col gap-4', className)} {...props}>
      {/* Ring */}
      <div className="flex items-center justify-center">
        <div
          className="relative flex h-28 w-28 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(var(--color-warning) ${pct}%, var(--color-muted-200) 0)`,
          }}
          aria-label={`Health score: ${score}`}
          role="img"
        >
          {/* Inner circle */}
          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-background">
            <span className="text-2xl font-bold leading-none text-foreground">{score}</span>
            <span className="text-2xs text-muted-foreground">Health</span>
          </div>
        </div>
      </div>

      {/* Sub-score bars */}
      <div className="flex flex-col gap-2">
        {(Object.entries(subScores) as Array<[keyof SubScores, number]>).map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{SUB_SCORE_LABELS[key]}</span>
              <span className={cn('text-xs font-medium', subScoreTextColor(value))}>{value}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted-200">
              <div
                className={cn('h-full rounded-full transition-all', subScoreColor(value))}
                style={{ width: `${value}%` }}
                role="progressbar"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HealthRing;
