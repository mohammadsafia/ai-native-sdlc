import { type FC } from 'react';

import { useTranslation } from 'react-i18next';

import RisksTable from './RisksTable';

// ─── Main view ────────────────────────────────────────────────────────────────

const RisksView: FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('risks.title')}</h1>
      </div>

      {/* ── DataTable ── */}
      <RisksTable />
    </div>
  );
};

export default RisksView;
