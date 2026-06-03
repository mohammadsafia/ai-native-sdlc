import { type ComponentPropsWithoutRef, type FC } from 'react';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { cn } from '@utils';
import type { TimelineForecast } from '@app-types';

dayjs.extend(relativeTime);

export interface TimelineForecastBarProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  forecast: TimelineForecast;
}

const TimelineForecastBar: FC<TimelineForecastBarProps> = ({ forecast, className, ...props }) => {
  // Guard: if expected date is missing or invalid, render a muted placeholder
  if (!forecast?.expected || !dayjs(forecast.expected).isValid()) {
    return (
      <div
        data-slot="timeline-forecast-bar"
        className={cn('flex flex-col gap-2', className)}
        {...props}
      >
        <span className="text-sm text-muted-foreground italic">No forecast available yet</span>
      </div>
    );
  }

  const expected = dayjs(forecast.expected);
  const low = dayjs(forecast.low);
  const high = dayjs(forecast.high);

  // Compute ±days from low to high around expected
  const daysBefore = expected.diff(low, 'day');
  const daysAfter = high.diff(expected, 'day');
  const rangeLabel = daysBefore === daysAfter ? `±${daysBefore}d` : `−${daysBefore}d / +${daysAfter}d`;

  // Position the confidence band visually (low..high window)
  const totalWindow = high.diff(low, 'day') || 1;
  const bandLeft = 0; // low is leftmost
  const bandWidth = 100; // full width = low to high
  // Expected marker position within low..high
  const markerPct = Math.min(100, Math.max(0, (expected.diff(low, 'day') / totalWindow) * 100));

  const confidencePct = Math.round(forecast.confidence * 100);

  return (
    <div
      data-slot="timeline-forecast-bar"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    >
      {/* Expected date + range */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-foreground">
          {expected.format('MMM D, YYYY')}
        </span>
        <span className="text-xs text-muted-foreground">{rangeLabel}</span>
      </div>

      {/* Track + confidence band */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted-200">
        {/* Band */}
        <div
          className="absolute inset-y-0 rounded-full bg-primary-100 opacity-60"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        {/* Expected marker */}
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary"
          style={{ left: `${markerPct}%` }}
          aria-label={`Expected: ${expected.format('MMM D, YYYY')}`}
        />
      </div>

      {/* Caption */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Based on {forecast.basisSprints.length} sprint{forecast.basisSprints.length !== 1 ? 's' : ''}
        </span>
        <span>{confidencePct}% confidence</span>
      </div>
    </div>
  );
};

export default TimelineForecastBar;
