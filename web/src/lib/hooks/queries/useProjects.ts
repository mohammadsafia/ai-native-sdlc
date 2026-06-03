import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const projectsKey = ['projects'] as const;

export const useProjects = () =>
  useQuery({ queryKey: projectsKey, queryFn: api.listProjects });
