/**
 * Pure, framework-independent balance calculations. All amounts are integer
 * paise. No React, no SQL — this module only knows about plain data.
 *
 * Data shapes expected:
 *   members:     [{ id, name }]
 *   expenses:    [{ id, amountPaise, payerId, participants: [{ memberId, sharePaise }] }]
 *   settlements: [{ id, fromId, toId, amountPaise, completed }]
 */

/**
 * Returns a Map<memberId, { paid, fairShare, net, afterSettlements }>.
 *  - paid: total amount this member paid out across all expenses.
 *  - fairShare: total amount this member owes as a participant.
 *  - net: paid - fairShare (positive => owed money by the group, negative => owes money).
 *  - afterSettlements: net adjusted for already-completed settlements. This is
 *    the member's true outstanding balance and is what calculateSettlements
 *    should be run against.
 */
export function calculateBalances(members, expenses, settlements = []) {
  const balances = new Map();
  for (const m of members) {
    balances.set(m.id, { memberId: m.id, paid: 0, fairShare: 0, net: 0, afterSettlements: 0 });
  }

  for (const expense of expenses) {
    const payer = balances.get(expense.payerId);
    if (payer) payer.paid += expense.amountPaise;

    for (const p of expense.participants) {
      const entry = balances.get(p.memberId);
      if (entry) entry.fairShare += p.sharePaise;
    }
  }

  for (const entry of balances.values()) {
    entry.net = entry.paid - entry.fairShare;
    entry.afterSettlements = entry.net;
  }

  for (const s of settlements) {
    if (!s.completed) continue;
    const from = balances.get(s.fromId);
    const to = balances.get(s.toId);
    // `from` paid down their debt -> their balance moves toward zero (increases).
    if (from) from.afterSettlements += s.amountPaise;
    // `to` received money they were owed -> their balance moves toward zero (decreases).
    if (to) to.afterSettlements -= s.amountPaise;
  }

  return balances;
}

/** Convenience helper: total expense amount across a list of expenses. */
export function totalExpenses(expenses) {
  return expenses.reduce((sum, e) => sum + e.amountPaise, 0);
}

/** Convenience helper: group-wide total still outstanding (unsigned, sum of positive afterSettlements). */
export function totalOutstanding(balancesMap) {
  let total = 0;
  for (const b of balancesMap.values()) {
    if (b.afterSettlements > 0) total += b.afterSettlements;
  }
  return total;
}
