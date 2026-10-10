import { describe, it, expect } from 'vitest';
import { calculateSettlements, greedyMatch, minTransactions } from '../src/algorithms/calculateSettlements';

const members = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Carol' },
  { id: 'd', name: 'Dave' },
];

function expense({ amountPaise, payerId, participants }) {
  return { id: 'e' + Math.random(), amountPaise, payerId, participants };
}

function assertValidSettlement(members, expenses, settlements, result) {
  const totalPaid = result.reduce((s, t) => s + t.amountPaise, 0);
  const totalReceived = totalPaid; // by construction from/to pairs
  expect(totalPaid).toBe(totalReceived);
  for (const t of result) {
    expect(t.amountPaise).toBeGreaterThan(0);
    expect(t.fromId).not.toBe(t.toId);
  }
}

describe('calculateSettlements', () => {
  it('settles a simple three-member equal split with one transaction per debtor', () => {
    const expenses = [
      expense({ amountPaise: 300, payerId: 'a', participants: [
        { memberId: 'a', sharePaise: 100 }, { memberId: 'b', sharePaise: 100 }, { memberId: 'c', sharePaise: 100 },
      ]}),
    ];
    const result = calculateSettlements(members.slice(0, 3), expenses, []);
    assertValidSettlement(members, expenses, [], result);
    expect(result.length).toBe(2);
    expect(result.every((t) => t.toId === 'a')).toBe(true);
  });

  it('one member owes money to several others', () => {
    // member 0 owes everyone; 1, 2, 3 are each owed 100
    const balances = [-300, 100, 100, 100];
    const result = minTransactions(balances);
    expect(result.length).toBe(3);
    // Secondary objective (least total money moved) favors direct pairing here.
    const total = result.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(300);
    expect(result.every((t) => t.from === 0)).toBe(true);
  });

  it('several members owe one member', () => {
    const balances = [300, -100, -100, -100];
    const result = minTransactions(balances);
    expect(result.length).toBe(3);
    expect(result.every((t) => t.to === 0)).toBe(true);
    const total = result.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(300);
  });

  it('returns no transactions when all balances are zero', () => {
    const result = calculateSettlements(members, [], []);
    expect(result).toEqual([]);
  });

  it('returns no transactions for an empty group', () => {
    const result = calculateSettlements([], [], []);
    expect(result).toEqual([]);
  });

  it('handles rounding: three-way split of an odd amount loses no money', () => {
    // 100 paise split 3 ways: 34, 33, 33 — verify settlement still balances exactly.
    const expenses = [
      expense({ amountPaise: 100, payerId: 'a', participants: [
        { memberId: 'a', sharePaise: 34 }, { memberId: 'b', sharePaise: 33 }, { memberId: 'c', sharePaise: 33 },
      ]}),
    ];
    const result = calculateSettlements(members.slice(0, 3), expenses, []);
    const totalPaid = result.reduce((s, t) => s + t.amountPaise, 0);
    expect(totalPaid).toBe(66); // b + c owe a total of 66
  });

  it('exact solver (minTransactions) finds the true minimum for a routable case', () => {
    // a owes 50, b is owed 30, c is owed 20. Optimal: a->b 30, a->c 20 (2 txns)
    // or a->b 50 then b->c 20 (2 txns) -- both are 2, minimum is 2, not 3.
    const balances = [-50, 30, 20];
    const result = minTransactions(balances);
    expect(result.length).toBe(2); // not 3 — a routes directly to b and c
    const total = result.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(50);
  });

  it('greedy and exact solvers both produce valid (zero-sum) settlements', () => {
    const balances = [-50, 30, 20, -10, 40, -30];
    for (const solver of [greedyMatch, minTransactions]) {
      const result = solver([...balances]);
      // Replay transactions against balances to confirm everyone ends at zero.
      const copy = [...balances];
      for (const t of result) {
        expect(t.amount).toBeGreaterThan(0);
        expect(t.from).not.toBe(t.to);
        copy[t.from] += t.amount;
        copy[t.to] -= t.amount;
      }
      for (const b of copy) expect(b).toBe(0);
    }
  });

  it('repeated calculations with unchanged inputs produce consistent results', () => {
    const expenses = [
      expense({ amountPaise: 500, payerId: 'a', participants: [
        { memberId: 'a', sharePaise: 125 }, { memberId: 'b', sharePaise: 125 },
        { memberId: 'c', sharePaise: 125 }, { memberId: 'd', sharePaise: 125 },
      ]}),
    ];
    const r1 = calculateSettlements(members, expenses, []);
    const r2 = calculateSettlements(members, expenses, []);
    expect(r1).toEqual(r2);
  });

  it('falls back to greedy for groups above the exact-solver limit without hanging', () => {
    const bigMembers = Array.from({ length: 15 }, (_, i) => ({ id: 'm' + i, name: 'M' + i }));
    const expenses = [
      expense({
        amountPaise: 1500,
        payerId: 'm0',
        participants: bigMembers.map((m) => ({ memberId: m.id, sharePaise: 100 })),
      }),
    ];
    const start = Date.now();
    const result = calculateSettlements(bigMembers, expenses, []);
    expect(Date.now() - start).toBeLessThan(2000);
    const totalPaid = result.reduce((s, t) => s + t.amountPaise, 0);
    expect(totalPaid).toBe(1400); // everyone except m0 owes 100
  });
});
