import { type ComponentPropsWithoutRef, type FC } from 'react';

import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { Card } from '@components/ui';
import { HealthBadge } from '@components/shared';
import { cn } from '@utils';
import type { Project } from '@app-types';
import { AlertTriangle, User, RefreshCw } from 'lucide-react';

dayjs.extend(relativeTime);

export interface ProjectCardProps extends Omit<ComponentPropsWithoutRef<'article'>, 'children'> {
  project: Project;
}

/**
 * Renders a tiny inline SVG sparkline from an array of velocity numbers.
 */
function VelocitySparkline({ data }: { data: number[] }) {
  if (!data.length) return null;

  const w = 64;
  const h = 20;
  const max = Math.max(...data, 1);
  const step = w / Math.max(data.length - 1, 1);

  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(' ');

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-label="Velocity trend"
      role="img"
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-primary-300"
      />
    </svg>
  );
}

const ProjectCard: FC<ProjectCardProps> = ({ project, className, ...props }) => {
  const openRisks = project.risks.filter((r) => r.severity !== 'low').length;

  return (
    <Card
      data-slot="project-card"
      className={cn('transition-shadow hover:shadow-md', className)}
      {...props}
    >
      <Link
        to={`/dashboard/projects/${project.id}`}
        className="flex flex-col gap-3 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={`Open ${project.name} hub`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono text-muted-foreground">{project.key}</span>
            <span className="text-base font-semibold text-foreground">{project.name}</span>
          </div>
          <HealthBadge score={project.health.overall} label={project.status} />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {openRisks > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {openRisks} risk{openRisks !== 1 ? 's' : ''}
            </span>
          )}
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" aria-hidden="true" />
            {project.lead.name}
          </span>
          <span className="flex items-center gap-1 ms-auto">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {dayjs(project.lastSyncedAt).fromNow()}
          </span>
        </div>

        {/* Sparkline */}
        <div className="flex items-end justify-end">
          <VelocitySparkline data={project.velocityHistory} />
        </div>
      </Link>
    </Card>
  );
};

export default ProjectCard;
