import { useParams } from 'react-router-dom';

import RiskDetailView from '@views/risks/RiskDetailView';

export default function RiskDetailPage() {
  const { id = '' } = useParams<{ id: string }>();

  return (
    <div className="p-6">
      <RiskDetailView id={id} />
    </div>
  );
}
