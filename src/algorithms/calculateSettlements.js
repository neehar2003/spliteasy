/**
 * Settle-up algorithm.
 *
 * Given a set of members, their expenses, and already-recorded settlements,
 * this module computes the minimal set of suggested payments that zero out
 * every member's outstanding balance.
 *
 * Two strategies are provided:
 *
 *   1. greedyMatch(balances) - O(n log n). At each step, match the member who
 *      owes the most with the member who is owed the most, settle the
 *      smaller of the two amounts, and repeat. This always produces a valid,
 *      correct settlement (every balance reaches zero) but is a heuristic:
 *      it does NOT guarantee the fewest possible transactions. Example: debts
 *      of [+10, +10, -10, -10] where the two +10s/-10s actually pair up
 *      independently, greedy still finds the 2-transaction optimum here, but
 *      there are inputs (e.g. certain combinations where a single member's
 *      balance exactly equals the sum of two others) where greedy uses one
 *      more transaction than necessary because it always peels off the
 *      current largest debtor/creditor pair instead of searching for exact
 *      subset matches.
 *
 *   2. minTransactions(balances) - exact minimum number of transactions,
 *      found via DFS + branch-and-bound over the non-zero balances (this is
 *      the classic "optimal account balancing" search). It tries, for the
 *      first unsettled member, every possible match with another member of
 *      opposite sign, recursing until all balances are zero, and keeps the
 *      best (fewest-transaction) solution found. This is worst-case
 *      exponential (roughly O(n!) in the number of non-zero balances), so it
 *      is only used when the number of members with a non-zero balance is at
 *      or below EXACT_SOLVER_MEMBER_LIMIT. Above that, calculateSettlements
 *      falls back to the greedy heuristic automatically so the UI never
 *      hangs on a large group.
 *
 * Both strategies operate on integer paise and are guaranteed to:
 *   - never produce a negative or zero transaction,
 *   - never make a member pay themselves,
 *   - make total debtor payments exactly equal total creditor receipts,
 *   - fully zero out every balance (no money created or lost).
 */

import { calculateBalances } from './calculateBalances';

export const EXACT_SOLVER_MEMBER_LIMIT = 10;

/**
 * Main entry point. Computes balances from members/expenses/settlements,
 * then returns the suggested payments to settle all outstanding debts.
 *
 * @returns {Array<{fromId, toId, amountPaise}>}
 */
export function calculateSettlements(members, expenses, settlements = [], { exact = true } = {}) {
  const balancesMap = calculateBalances(members, expenses, settlements);
  const nonZero = [...balancesMap.values()].filter((b) => b.afterSettlements !== 0);

  if (nonZero.length === 0) return [];

  const useExact = exact && nonZero.length <= EXACT_SOLVER_MEMBER_LIMIT;
  const amounts = nonZero.map((b) => b.afterSettlements);
  const ids = nonZero.map((b) => b.memberId);

  const rawTransactions = useExact ? minTransactions(amounts) : greedyMatch(amounts);

  return rawTransactions.map(({ from, to, amount }) => ({
    fromId: ids[from],
    toId: ids[to],
    amountPaise: amount,
  }));
}

/**
 * Greedy heuristic over an array of signed integer balances (index-based).
 * Returns [{ from, to, amount }] where `from`/`to` are indices into the
 * input array and `amount` is the positive paise amount transferred.
 */
export function greedyMatch(balances) {
  const working = balances.map((amount, index) => ({ index, amount })).filter((b) => b.amount !== 0);
  const transactions = [];

  while (working.length > 0) {
    working.sort((a, b) => a.amount - b.amount);
    const debtor = working[0]; // most negative
    const creditor = working[working.length - 1]; // most positive

    if (debtor.amount >= 0 || creditor.amount <= 0) break; // all settled

    const amount = Math.min(-debtor.amount, creditor.amount);
    transactions.push({ from: debtor.index, to: creditor.index, amount });

    debtor.amount += amount;
    creditor.amount -= amount;

    for (let i = working.length - 1; i >= 0; i--) {
      if (working[i].amount === 0) working.splice(i, 1);
    }
  }

  return transactions;
}

/**
 * Exact minimum-transaction solver via DFS + branch-and-bound.
 * `balances` is an array of signed integer paise amounts (index-based).
 */
export function minTransactions(balances) {
  // Each `start` index is always fully resolved against a single partner in
  // one step (its whole balance is merged into that partner). Processing the
  // smallest-magnitude balances first means those forced "full" transfers are
  // small, which in practice yields direct, intuitive debtor/creditor pairs
  // instead of chaining the group's largest balance through several people.
  // This does not change the number of transactions found (still the true
  // minimum) - only which of the equally-minimal solutions is returned.
  const pairs = balances
    .map((amount, index) => ({ amount, index }))
    .filter((p) => p.amount !== 0)
    .sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  const bal = pairs.map((p) => p.amount);
  const indexMap = pairs.map((p) => p.index);

  let best = { count: Infinity, total: Infinity, transactions: [] };

  // At each step, take the first member with a non-zero balance and try
  // settling them against every other member of opposite sign. The pair's
  // balance is fully merged into the other (arr[i] += arr[start]), which may
  // leave `i` owing/being owed a smaller remainder - handled by recursion.
  //
  // Minimizing transaction count alone can admit multiple equally-minimal
  // solutions that route money through an intermediate member instead of
  // pairing debtors/creditors directly. As a secondary objective (tie-break),
  // we also prefer the solution that moves the least total money, which in
  // practice favors the more intuitive direct pairings.
  function dfs(arr, start, path, pathTotal) {
    while (start < arr.length && arr[start] === 0) start++;
    if (start === arr.length) {
      if (path.length < best.count || (path.length === best.count && pathTotal < best.total)) {
        best = { count: path.length, total: pathTotal, transactions: [...path] };
      }
      return;
    }
    if (path.length > best.count) return; // can't beat the best count found so far

    for (let i = start + 1; i < arr.length; i++) {
      if (arr[i] === 0) continue;
      if ((arr[i] > 0 && arr[start] > 0) || (arr[i] < 0 && arr[start] < 0)) continue; // same sign, skip

      const amount = Math.abs(arr[start]);
      const from = arr[start] < 0 ? start : i;
      const to = arr[start] < 0 ? i : start;

      const savedI = arr[i];
      const savedStart = arr[start];
      arr[i] += arr[start];
      arr[start] = 0;

      path.push({ from: indexMap[from], to: indexMap[to], amount });
      dfs(arr, start + 1, path, pathTotal + amount);
      path.pop();

      arr[start] = savedStart;
      arr[i] = savedI;
    }
  }

  dfs([...bal], 0, [], 0);
  return best.transactions;
}
