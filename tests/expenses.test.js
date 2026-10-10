import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, resetDatabase } from '../src/services/database/db';
import { createGroup, getGroup, addMember, removeMember } from '../src/services/groupService';
import { createExpense, updateExpense, deleteExpense, listExpenses } from '../src/services/expenseService';
import { getBalances, getSuggestedSettlements, recordSettlement, markCompleted, undoSettlement } from '../src/services/settlementService';
import { exportBackupData, importBackupData } from '../src/services/backupService';
import { rupeesToPaise } from '../src/utils/currency';

beforeEach(async () => {
  await initDatabase();
  await resetDatabase();
});

async function setupGroup(names) {
  return createGroup({ name: 'Trip', description: 'test group', memberNames: names });
}

describe('expense + settlement integration (real SQLite via sql.js)', () => {
  it('creates a group with members and persists them', async () => {
    const group = await setupGroup(['Alice', 'Bob', 'Carol']);
    expect(group.members).toHaveLength(3);
    const reloaded = getGroup(group.id);
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
    const balances = getBalances(group.id);
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
    let expenses = listExpenses(group.id);
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
    expenses = listExpenses(group.id);
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
    expect(getBalances(group.id).get(b.id).net).toBe(rupeesToPaise(-50));

    await updateExpense(expense.id, {
      title: 'Lunch (updated)',
      amountPaise: rupeesToPaise(200),
      payerId: a.id,
      participantIds: [a.id, b.id],
      date: '2026-01-01',
      splitMethod: 'equal',
    });
    expect(getBalances(group.id).get(b.id).net).toBe(rupeesToPaise(-100));
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
    const balances = getBalances(group.id);
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
    const suggestions = getSuggestedSettlements(group.id);
    expect(suggestions).toEqual([{ fromId: b.id, toId: a.id, amountPaise: rupeesToPaise(50) }]);

    const settlement = await recordSettlement(group.id, suggestions[0]);
    await markCompleted(settlement.id, '2026-01-05');
    expect(getBalances(group.id).get(b.id).afterSettlements).toBe(0);
    expect(getSuggestedSettlements(group.id)).toEqual([]);

    await undoSettlement(settlement.id);
    expect(getBalances(group.id).get(b.id).afterSettlements).toBe(rupeesToPaise(-50));
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
    expect(getGroup(group.id).members).toHaveLength(1);
  });

  it('persists data across a simulated reload (re-init from IndexedDB)', async () => {
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

    // Re-initializing simulates the app reloading: it should restore from IndexedDB.
    const result = await initDatabase();
    expect(result.restored).toBe(true);
    const reloaded = getGroup(group.id);
    expect(reloaded.name).toBe('Trip');
    expect(listExpenses(group.id)).toHaveLength(1);
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

    const backup = exportBackupData();
    await resetDatabase();
    expect(getGroup(group.id)).toBeNull();

    await importBackupData(backup);
    const restored = getGroup(group.id);
    expect(restored.name).toBe('Trip');
    expect(listExpenses(group.id)).toHaveLength(1);
  });

  it('rejects a corrupted/invalid backup without touching existing data', async () => {
    const group = await setupGroup(['Alice', 'Bob']);
    await expect(importBackupData({ not: 'a backup' })).rejects.toThrow();
    // Original data must remain untouched.
    expect(getGroup(group.id)).not.toBeNull();
  });
});
