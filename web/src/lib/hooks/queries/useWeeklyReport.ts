import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';
import { USE_MOCK } from '@api/dataSource';
import { getWeeklyReport } from '@api/real/sdlc';

export const weeklyReportKey = (id: string) => ['weekly-report', id] as const;

export const useWeeklyReport = (id: string) =>
  useQuery({
    queryKey: weeklyReportKey(id),
    queryFn: USE_MOCK ? () => api.getReport(id) : () => getWeeklyReport(id),
    enabled: !!id,
  });
