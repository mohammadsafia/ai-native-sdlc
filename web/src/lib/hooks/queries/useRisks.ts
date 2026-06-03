import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const risksKey = ['risks'] as const;

export const useRisks = () =>
  useQuery({ queryKey: risksKey, queryFn: api.listRisks });
