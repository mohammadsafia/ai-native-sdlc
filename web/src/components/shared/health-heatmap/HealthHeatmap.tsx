import { type ComponentPropsWithoutRef, type FC } from 'react';

import { Link } from 'react-router-dom';
import { cn } from '@utils';
import type { ProjectStatus } from '@app-types';

export interface HeatmapProject {
  id: string;
  key: string;
  name: string;
  status: ProjectStatus;
  health: { overall: number; label: ProjectStatus };
}

export interface HealthHeatmapProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  projects: HeatmapProject[];
}

const STATUS_BG: Record<ProjectStatus, string> = {
  healthy: 'bg-success-200 text-success hover:bg-success-300',
  'at-risk': 'bg-warning-200 text-warning hover:bg-warning-300',
  blocked: 'bg-destructive-200 text-destructive hover:bg-destructive-300',
};

const HealthHeatmap: FC<HealthHeatmapProps> = ({ projects, className, ...props }) => {
  return (
    <div
      data-slot="health-heatmap"
      className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6', className)}
      role="list"
      aria-label="Project health heatmap"
      {...props}
    >
      {projects.map((project) => (
        <Link
          key={project.id}
          to={`/dashboard/projects/${project.id}`}
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-xl p-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            STATUS_BG[project.status],
          )}
          role="listitem"
          aria-label={`${project.name}: health ${project.health.overall}, status ${project.status}`}
          title={project.name}
        >
          <span className="text-xs font-mono font-semibold">{project.key}</span>
          <span className="text-lg font-bold leading-none">{project.health.overall}</span>
          <span className="text-2xs line-clamp-1">{project.name}</span>
        </Link>
      ))}
    </div>
  );
};

export default HealthHeatmap;
