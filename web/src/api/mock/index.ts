import { delay } from './latency';
import { PROJECTS, PORTFOLIO } from './fixtures';
import type { PaginatedResult, Risk } from '@app-types';

export { PROJECTS, PORTFOLIO };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a single URLSearchParams-encoded query string into a plain object. */
function parseParams(rawParams: string): Record<string, string | string[]> {
  const params = new URLSearchParams(rawParams);
  const result: Record<string, string | string[]> = {};
  params.forEach((value, key) => {
    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  });
  return result;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const api = {
  listProjects: async () => {
    await delay();
    return PROJECTS.map(({ trace: _trace, report: _report, ...p }) => p);
  },
  getProject: async (id: string) => {
    await delay();
    const p = PROJECTS.find((x) => x.id === id);
    if (!p) throw new Error('not found');
    return p;
  },
  getReport: async (id: string) => {
    await delay(700);
    return PROJECTS.find((x) => x.id === id)!.report;
  },
  getPortfolio: async () => {
    await delay();
    return PORTFOLIO;
  },
  listRisks: async () => {
    await delay();
    return PROJECTS.flatMap((p) => p.risks);
  },
  getRisk: async (id: string) => {
    await delay(300);
    return PROJECTS.flatMap((p) => p.risks).find((r) => r.id === id) ?? null;
  },
  getTraceability: async (id: string) => {
    await delay();
    return PROJECTS.find((x) => x.id === id)!.trace;
  },

  /**
   * Server-paginated risk list for the DataTable.
   * Supports: global search (title|subjectRef|recommendation),
   *           faceted `kind` filter, faceted `severity` filter,
   *           sorting by any field (field:asc|desc),
   *           and page / pageSize pagination.
   */
  listRisksPaged: async (rawParams: string): Promise<PaginatedResult<Risk>> => {
    await delay(400);

    const p = parseParams(rawParams);

    const page = Math.max(1, Number(p['page'] ?? 1));
    const pageSize = Math.max(1, Number(p['pageSize'] ?? 10));
    const search = (p['search'] as string | undefined)?.toLowerCase() ?? '';
    const sortParam = (p['sort'] as string | undefined) ?? '';

    // Faceted filters come through as repeated query params: kind=delivery&kind=scope_creep
    const kindFilter: string[] = Array.isArray(p['kind'])
      ? (p['kind'] as string[])
      : p['kind']
        ? [p['kind'] as string]
        : [];
    const severityFilter: string[] = Array.isArray(p['severity'])
      ? (p['severity'] as string[])
      : p['severity']
        ? [p['severity'] as string]
        : [];

    let risks: Risk[] = PROJECTS.flatMap((proj) => proj.risks);

    // Global search
    if (search) {
      risks = risks.filter(
        (r) =>
          r.title.toLowerCase().includes(search) ||
          r.subjectRef.toLowerCase().includes(search) ||
          r.recommendation.toLowerCase().includes(search),
      );
    }

    // Faceted kind filter
    if (kindFilter.length > 0) {
      risks = risks.filter((r) => kindFilter.includes(r.kind));
    }

    // Faceted severity filter
    if (severityFilter.length > 0) {
      risks = risks.filter((r) => severityFilter.includes(r.severity));
    }

    // Sorting: "field:asc" or "field:desc"
    if (sortParam) {
      const [field, dir] = sortParam.split(':');
      const desc = dir === 'desc';
      risks = [...risks].sort((a, b) => {
        const aVal = a[field as keyof Risk] ?? '';
        const bVal = b[field as keyof Risk] ?? '';
        if (aVal < bVal) return desc ? 1 : -1;
        if (aVal > bVal) return desc ? -1 : 1;
        return 0;
      });
    }

    const total = risks.length;
    const totalPage = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const data = risks.slice(start, start + pageSize);

    return {
      data,
      pagination: { page, pageSize, total, totalPage },
    };
  },
};
