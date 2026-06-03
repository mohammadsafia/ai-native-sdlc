import { type FC } from 'react';

import { useTranslation } from 'react-i18next';

import ProjectsTable from './ProjectsTable';

// ─── Main view ────────────────────────────────────────────────────────────────

const ProjectsView: FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('projects.title')}</h1>
      </div>

      {/* ── DataTable ── */}
      <ProjectsTable />
    </div>
  );
};

export default ProjectsView;
