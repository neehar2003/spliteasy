import { useMemo, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { listGroups } from '../services/groupService';
import EmptyState from '../components/common/EmptyState';
import SettlementPanel from '../components/settlements/SettlementPanel';

export default function SettlementsPage() {
  const { version } = useDatabase();
  const groups = useMemo(() => listGroups(), [version]);
  const [groupId, setGroupId] = useState('');

  const activeGroup = groupId || groups[0]?.id || '';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settlements</h1>
          <p className="page-subtitle">Suggested payments to settle up, and your settlement history, per group.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={HandCoins} title="No groups yet" message="Create a group and add expenses before settling up." />
      ) : (
        <>
          <div className="filters-bar card">
            <select value={activeGroup} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <SettlementPanel groupId={activeGroup} />
        </>
      )}
    </div>
  );
}
