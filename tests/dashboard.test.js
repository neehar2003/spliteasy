import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/services/database/supabaseClient', async () => {
  const fake = await import('./fakeSupabase.js');
  return { supabase: fake.supabase };
});

const { resetFakeDb } = await import('./fakeSupabase.js');
const { initDatabase } = await import('../src/services/database/db');
const { createGroup } = await import('../src/services/groupService');
const { createExpense } = await import('../src/services/expenseService');
const { recordSettlement, markCompleted, getSuggestedSettlements } = await import('../src/services/settlementService');
const { getDashboardSummary } = await import('../src/services/dashboardService');
const { setCurrentUserName } = await import('../src/services/settingsService');
const { rupeesToPaise } = await import('../src/utils/currency');

beforeEach(async () => {
  resetFakeDb();
  localStorage.clear();
  await initDatabase();
});

describe('getDashboardSummary', () => {
  it('reflects a completed settlement instead of the pre-settlement balance', async () => {
    await setCurrentUserName('Neehar');
    const group = await createGroup({ name: 'Trip', description: '', memberNames: ['Neehar', 'Nikhil'] });
    const [neehar, nikhil] = group.members;

    await createExpense(group.id, {
      title: 'Hotel',
      amountPaise: rupeesToPaise(1090),
      payerId: nikhil.id,
      participantIds: [neehar.id, nikhil.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });

    const before = await getDashboardSummary();
    expect(before.myOwed).toBe(rupeesToPaise(545));

    const [suggestion] = await getSuggestedSettlements(group.id);
    const settlement = await recordSettlement(group.id, suggestion);
    await markCompleted(settlement.id, '2026-01-02');

    const after = await getDashboardSummary();
    expect(after.myOwed).toBe(0);
    expect(after.owedToMe).toBe(0);
    expect(after.netBalance).toBe(0);
  });
});
