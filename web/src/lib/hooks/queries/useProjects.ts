import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';
import { USE_MOCK } from '@api/dataSource';
import { getProjects } from '@api/real/sdlc';

export const projectsKey = ['projects'] as const;

export const useProjects = () =>
  useQuery({
    queryKey: projectsKey,
    queryFn: USE_MOCK ? api.listProjects : getProjects,
  });
