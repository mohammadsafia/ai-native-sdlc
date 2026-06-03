import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';

export const projectKey = (id: string) => ['project', id] as const;

export const useProject = (id: string) =>
  useQuery({ queryKey: projectKey(id), queryFn: () => api.getProject(id), enabled: !!id });
