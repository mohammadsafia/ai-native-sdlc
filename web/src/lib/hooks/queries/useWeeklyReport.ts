import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const weeklyReportKey = (id: string) => ['weekly-report', id] as const;

export const useWeeklyReport = (id: string) =>
  useQuery({ queryKey: weeklyReportKey(id), queryFn: () => api.getReport(id), enabled: !!id });
