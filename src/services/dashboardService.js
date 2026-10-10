import { listGroups, listMembers } from './groupService';
import { listExpenses } from './expenseService';
import { listSettlements } from './settlementService';
import { calculateBalances, totalExpenses } from '../algorithms/calculateBalances';
import { getCurrentUserName } from './settingsService';

/**
 * Aggregates totals across every group for the dashboard. Since the app has
 * no login, the "current user" is matched by display name (case-insensitive)
 * against each group's member list — a member named the same as the
 * configured user name is treated as "me" in that group.
 */
export async function getDashboardSummary() {
  const currentUserName = getCurrentUserName();
  const groups = await listGroups();

  let totalExpenseAmount = 0;
  let myPaid = 0;
  let myOwed = 0; // what I owe others
  let owedToMe = 0; // what others owe me
  const recentExpenses = [];

  for (const group of groups) {
    const [members, expenses, settlements] = await Promise.all([
      listMembers(group.id),
      listExpenses(group.id),
      listSettlements(group.id),
    ]);
    totalExpenseAmount += totalExpenses(expenses);

    for (const e of expenses) {
      recentExpenses.push({ ...e, groupId: group.id, groupName: group.name });
    }

    if (!currentUserName) continue;
    const me = members.find((m) => m.name.toLowerCase() === currentUserName.toLowerCase());
    if (!me) continue;

    const balances = calculateBalances(members, expenses, settlements);
    const myBalance = balances.get(me.id);
    if (!myBalance) continue;
    myPaid += myBalance.paid;
    if (myBalance.afterSettlements < 0) myOwed += -myBalance.afterSettlements;
    if (myBalance.afterSettlements > 0) owedToMe += myBalance.afterSettlements;
  }

  recentExpenses.sort((a, b) => new Date(b.date) - new Date(a.date) || b.createdAt?.localeCompare(a.createdAt));

  return {
    hasCurrentUser: !!currentUserName,
    currentUserName,
    totalExpenseAmount,
    myPaid,
    netBalance: owedToMe - myOwed,
    myOwed,
    owedToMe,
    groupCount: groups.length,
    recentExpenses: recentExpenses.slice(0, 5),
    groups,
  };
}
