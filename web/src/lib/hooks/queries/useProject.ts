import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';
import { USE_MOCK } from '@api/dataSource';
import { getProject } from '@api/real/sdlc';

export const projectKey = (id: string) => ['project', id] as const;

export const useProject = (id: string) =>
  useQuery({
    queryKey: projectKey(id),
    queryFn: USE_MOCK ? () => api.getProject(id) : () => getProject(id),
    enabled: !!id,
  });
