import { describe, it, expect } from 'vitest';
import { calculateBalances, totalExpenses } from '../src/algorithms/calculateBalances';

const members = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Carol' },
];

function expense({ amountPaise, payerId, participants }) {
  return { id: 'e' + Math.random(), amountPaise, payerId, participants };
}

describe('calculateBalances', () => {
  it('splits equally between three members', () => {
    const expenses = [
      expense({
        amountPaise: 300,
        payerId: 'a',
        participants: [
          { memberId: 'a', sharePaise: 100 },
          { memberId: 'b', sharePaise: 100 },
          { memberId: 'c', sharePaise: 100 },
        ],
      }),
    ];
    const balances = calculateBalances(members, expenses);
    expect(balances.get('a').net).toBe(200); // paid 300, owes 100
    expect(balances.get('b').net).toBe(-100);
    expect(balances.get('c').net).toBe(-100);
  });

  it('handles a payer who is also a participant', () => {
    const expenses = [
      expense({
        amountPaise: 900,
        payerId: 'a',
        participants: [
          { memberId: 'a', sharePaise: 300 },
          { memberId: 'b', sharePaise: 300 },
          { memberId: 'c', sharePaise: 300 },
        ],
      }),
    ];
    const balances = calculateBalances(members, expenses);
    expect(balances.get('a').paid).toBe(900);
    expect(balances.get('a').fairShare).toBe(300);
    expect(balances.get('a').net).toBe(600);
  });

  it('handles a payer who is not a participant', () => {
    const expenses = [
      expense({
        amountPaise: 600,
        payerId: 'a',
        participants: [
          { memberId: 'b', sharePaise: 300 },
          { memberId: 'c', sharePaise: 300 },
        ],
      }),
    ];
    const balances = calculateBalances(members, expenses);
    expect(balances.get('a').fairShare).toBe(0);
    expect(balances.get('a').net).toBe(600);
    expect(balances.get('b').net).toBe(-300);
    expect(balances.get('c').net).toBe(-300);
  });

  it('aggregates multiple expenses paid by different members', () => {
    const expenses = [
      expense({ amountPaise: 300, payerId: 'a', participants: [
        { memberId: 'a', sharePaise: 100 }, { memberId: 'b', sharePaise: 100 }, { memberId: 'c', sharePaise: 100 },
      ]}),
      expense({ amountPaise: 600, payerId: 'b', participants: [
        { memberId: 'a', sharePaise: 200 }, { memberId: 'b', sharePaise: 200 }, { memberId: 'c', sharePaise: 200 },
      ]}),
    ];
    const balances = calculateBalances(members, expenses);
    expect(balances.get('a').paid).toBe(300);
    expect(balances.get('a').fairShare).toBe(300);
    expect(balances.get('a').net).toBe(0);
    expect(balances.get('b').net).toBe(300);
    expect(balances.get('c').net).toBe(-300);
    expect(totalExpenses(expenses)).toBe(900);
  });

  it('returns zero balances and empty map correctly for no expenses', () => {
    const balances = calculateBalances(members, []);
    for (const m of members) {
      expect(balances.get(m.id).net).toBe(0);
    }
  });

  it('applies completed settlements to reduce outstanding balance', () => {
    const expenses = [
      expense({ amountPaise: 300, payerId: 'a', participants: [
        { memberId: 'a', sharePaise: 100 }, { memberId: 'b', sharePaise: 100 }, { memberId: 'c', sharePaise: 100 },
      ]}),
    ];
    const settlements = [
      { id: 's1', fromId: 'b', toId: 'a', amountPaise: 100, completed: true },
    ];
    const balances = calculateBalances(members, expenses, settlements);
    expect(balances.get('b').afterSettlements).toBe(0);
    expect(balances.get('a').afterSettlements).toBe(100); // c still owes a
    expect(balances.get('c').afterSettlements).toBe(-100);
  });

  it('ignores pending (not completed) settlements for afterSettlements', () => {
    const expenses = [
      expense({ amountPaise: 200, payerId: 'a', participants: [
        { memberId: 'a', sharePaise: 100 }, { memberId: 'b', sharePaise: 100 },
      ]}),
    ];
    const settlements = [
      { id: 's1', fromId: 'b', toId: 'a', amountPaise: 100, completed: false },
    ];
    const balances = calculateBalances(members, expenses, settlements);
    expect(balances.get('b').afterSettlements).toBe(-100);
  });
});
