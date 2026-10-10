import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/services/database/supabaseClient', async () => {
  const fake = await import('./fakeSupabase.js');
  return { supabase: fake.supabase };
});

const { resetFakeDb } = await import('./fakeSupabase.js');
const { initDatabase, resetDatabase } = await import('../src/services/database/db');
const { createGroup, getGroup, addMember, removeMember } = await import('../src/services/groupService');
const { createExpense, updateExpense, deleteExpense, listExpenses } = await import('../src/services/expenseService');
const { getBalances, getSuggestedSettlements, recordSettlement, markCompleted, undoSettlement } = await import(
  '../src/services/settlementService'
);
const { exportBackupData, importBackupData } = await import('../src/services/backupService');
const { rupeesToPaise } = await import('../src/utils/currency');

beforeEach(async () => {
  resetFakeDb();
  await initDatabase();
});

async function setupGroup(names) {
  return createGroup({ name: 'Trip', description: 'test group', memberNames: names });
}

describe('expense + settlement integration (fake in-memory Supabase)', () => {
  it('creates a group with members and persists them', async () => {
    const group = await setupGroup(['Alice', 'Bob', 'Carol']);
    expect(group.members).toHaveLength(3);
    const reloaded = await getGroup(group.id);
    expect(reloaded.members.map((m) => m.name)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('creates an equal-split expense and computes balances correctly', async () => {
    const group = await setupGroup(['Alice', 'Bob', 'Carol']);
    const [a, b, c] = group.members;
    await createExpense(group.id, {
      title: 'Dinner',
      amountPaise: rupeesToPaise(300),
      payerId: a.id,
      participantIds: [a.id, b.id, c.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    const balances = await getBalances(group.id);
    expect(balances.get(a.id).net).toBe(rupeesToPaise(200));
    expect(balances.get(b.id).net).toBe(rupeesToPaise(-100));
    expect(balances.get(c.id).net).toBe(rupeesToPaise(-100));
  });

  it('supports exact-amount and percentage splits', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    await createExpense(group.id, {
      title: 'Exact split',
      amountPaise: rupeesToPaise(100),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'exact',
      splits: { [a.id]: rupeesToPaise(60), [b.id]: rupeesToPaise(40) },
    });
    let expenses = await listExpenses(group.id);
    expect(expenses[0].participants.find((p) => p.memberId === b.id).sharePaise).toBe(rupeesToPaise(40));

    await createExpense(group.id, {
      title: 'Percentage split',
      amountPaise: rupeesToPaise(100),
      payerId: b.id,
      participantIds: [a.id, b.id],
      date: '2026-01-02',
      splitMethod: 'percentage',
      splits: { [a.id]: 70, [b.id]: 30 },
    });
    expenses = await listExpenses(group.id);
    const pct = expenses.find((e) => e.title === 'Percentage split');
    expect(pct.participants.find((p) => p.memberId === a.id).sharePaise).toBe(rupeesToPaise(70));
  });

  it('rejects invalid amounts and percentages', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    await expect(
      createExpense(group.id, {
        title: 'Bad amount',
        amountPaise: 0,
        payerId: a.id,
        participantIds: [a.id, b.id],
        date: '2026-01-01',
        splitMethod: 'equal',
      })
    ).rejects.toThrow();

    await expect(
      createExpense(group.id, {
        title: 'Bad percentage',
        amountPaise: rupeesToPaise(100),
        payerId: a.id,
        participantIds: [a.id, b.id],
        date: '2026-01-01',
        splitMethod: 'percentage',
        splits: { [a.id]: 60, [b.id]: 30 }, // sums to 90, not 100
      })
    ).rejects.toThrow();
  });

  it('editing an expense recalculates balances without corrupting history', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    const expense = await createExpense(group.id, {
      title: 'Lunch',
      amountPaise: rupeesToPaise(100),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    expect((await getBalances(group.id)).get(b.id).net).toBe(rupeesToPaise(-50));

    await updateExpense(expense.id, {
      title: 'Lunch (updated)',
      amountPaise: rupeesToPaise(200),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    expect((await getBalances(group.id)).get(b.id).net).toBe(rupeesToPaise(-100));
  });

  it('deleting an expense removes its effect on balances', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    const expense = await createExpense(group.id, {
      title: 'Snacks',
      amountPaise: rupeesToPaise(100),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    await deleteExpense(expense.id);
    const balances = await getBalances(group.id);
    expect(balances.get(a.id).net).toBe(0);
    expect(balances.get(b.id).net).toBe(0);
  });

  it('completed settlements reduce outstanding balances correctly and can be undone', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    await createExpense(group.id, {
      title: 'Taxi',
      amountPaise: rupeesToPaise(100),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    const suggestions = await getSuggestedSettlements(group.id);
    expect(suggestions).toEqual([{ fromId: b.id, toId: a.id, amountPaise: rupeesToPaise(50) }]);

    const settlement = await recordSettlement(group.id, suggestions[0]);
    await markCompleted(settlement.id, '2026-01-05');
    expect((await getBalances(group.id)).get(b.id).afterSettlements).toBe(0);
    expect(await getSuggestedSettlements(group.id)).toEqual([]);

    await undoSettlement(settlement.id);
    expect((await getBalances(group.id)).get(b.id).afterSettlements).toBe(rupeesToPaise(-50));
  });

  it('prevents removing a member who has expense or settlement records', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    await createExpense(group.id, {
      title: 'Coffee',
      amountPaise: rupeesToPaise(50),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    await expect(removeMember(b.id)).rejects.toThrow();
  });

  it('allows removing a member with no records', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [, b] = group.members;
    await removeMember(b.id);
    expect((await getGroup(group.id)).members).toHaveLength(1);
  });

  it('persists data across a simulated reload (re-init against the shared database)', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    await createExpense(group.id, {
      title: 'Persisted expense',
      amountPaise: rupeesToPaise(80),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });

    // Re-initializing simulates the app reloading: data lives server-side, so it's unaffected.
    const result = await initDatabase();
    expect(result.restored).toBe(true);
    const reloaded = await getGroup(group.id);
    expect(reloaded.name).toBe('Trip');
    expect(await listExpenses(group.id)).toHaveLength(1);
  });

  it('exports a backup and re-imports it, restoring all data', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    const [a, b] = group.members;
    await createExpense(group.id, {
      title: 'Backup test',
      amountPaise: rupeesToPaise(60),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });

    const backup = await exportBackupData();
    await resetDatabase();
    expect(await getGroup(group.id)).toBeNull();

    await importBackupData(backup);
    const restored = await getGroup(group.id);
    expect(restored.name).toBe('Trip');
    expect(await listExpenses(group.id)).toHaveLength(1);
  });

  it('rejects a corrupted/invalid backup without touching existing data', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    await expect(importBackupData({ not: 'a backup' })).rejects.toThrow();
    // Original data must remain untouched.
    expect(await getGroup(group.id)).not.toBeNull();
  });
});
