import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const portfolioKey = ['portfolio'] as const;

export const usePortfolio = () =>
  useQuery({ queryKey: portfolioKey, queryFn: api.getPortfolio });
