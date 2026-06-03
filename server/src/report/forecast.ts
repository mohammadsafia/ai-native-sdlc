/**
 * computeForecast — pure function, no I/O.
 *
 * Given a list of completed sprints (sorted oldest-first) and the total
 * remaining story points in the project, returns a TimelineForecast with
 * expected / optimistic (low) / pessimistic (high) completion dates and a
 * confidence value derived from velocity stability.
 *
 * All dates are ISO-8601 strings (YYYY-MM-DD).  Passing `asOf` lets tests
 * stay deterministic.
 */

export interface SprintSample {
  name: string;
  completedPoints: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface TimelineForecastResult {
  expected: string;
  low: string;
  high: string;
  confidence: number;
  basisSprints: string[];
}

/** Clamp a number to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Add `days` to a Date and return the result as an ISO date (YYYY-MM-DD). */
function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Derive sprint length in days from start/end of one sprint, capping at 30
 * and defaulting to 14 if not available.
 */
function sprintLenDays(sprint: SprintSample): number {
  if (sprint.startDate && sprint.endDate) {
    const days = Math.round(
      (sprint.endDate.getTime() - sprint.startDate.getTime()) / 86_400_000,
    );
    if (days > 0 && days <= 30) return days;
  }
  return 14;
}

export function computeForecast(
  sprints: SprintSample[],
  remainingPoints: number,
  asOf: Date = new Date(),
): TimelineForecastResult {
  const empty: TimelineForecastResult = {
    expected: '',
    low: '',
    high: '',
    confidence: 0,
    basisSprints: [],
  };

  // Only consider completed sprints with positive velocity.
  const completed = [...sprints]
    .filter((s) => s.completedPoints > 0)
    .sort((a, b) => {
      // Sort by endDate ascending; fall back to stable order if absent.
      const aT = a.endDate?.getTime() ?? 0;
      const bT = b.endDate?.getTime() ?? 0;
      return aT - bT;
    })
    .slice(-4); // last 4 sprints

  if (completed.length === 0) return empty;

  const velocities = completed.map((s) => s.completedPoints);
  const avg = mean(velocities);

  if (avg <= 0) return empty;

  const maxVelocity = Math.max(...velocities);
  const minVelocity = Math.min(...velocities);

  // Sprint length — use the most recent completed sprint's dates.
  const latestSprint = completed[completed.length - 1];
  const lenDays = sprintLenDays(latestSprint);

  // Sprints remaining = remainingPoints / velocity (use 0 if already done).
  const remaining = Math.max(0, remainingPoints);

  const sprintsExpected = remaining / avg;
  const sprintsLow = remaining / maxVelocity; // optimistic: faster → sooner
  const sprintsHigh = remaining / minVelocity; // pessimistic: slower → later

  const expected = addDays(asOf, sprintsExpected * lenDays);
  const low = addDays(asOf, sprintsLow * lenDays);
  const high = addDays(asOf, sprintsHigh * lenDays);

  // Confidence: 1 - (stddev / avg), clamped to [0,1].  0.5 for < 2 samples.
  let confidence: number;
  if (completed.length < 2) {
    confidence = 0.5;
  } else {
    const sd = stddev(velocities, avg);
    confidence = clamp(1 - sd / avg, 0, 1);
  }
  // Round to 2 decimal places.
  confidence = Math.round(confidence * 100) / 100;

  return {
    expected,
    low,
    high,
    confidence,
    basisSprints: completed.map((s) => s.name),
  };
}
