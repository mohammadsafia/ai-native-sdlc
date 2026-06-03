import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const riskKey = (id: string) => ['risk', id] as const;

export const useRisk = (id: string) =>
  useQuery({ queryKey: riskKey(id), queryFn: () => api.getRisk(id), enabled: !!id });
