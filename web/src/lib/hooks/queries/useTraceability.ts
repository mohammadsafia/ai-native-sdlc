import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const traceabilityKey = (id: string) => ['traceability', id] as const;

export const useTraceability = (id: string) =>
  useQuery({ queryKey: traceabilityKey(id), queryFn: () => api.getTraceability(id), enabled: !!id });
