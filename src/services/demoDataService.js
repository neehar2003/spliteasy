import { createGroup } from './groupService';
import { createExpense } from './expenseService';
import { recordSettlement, markCompleted } from './settlementService';
import { rupeesToPaise } from '../utils/currency';
import { setCurrentUserName, getCurrentUserName } from './settingsService';

/** Seeds a couple of realistic sample groups. Never runs automatically - only via an explicit "Load demo data" action. */
export async function loadDemoData() {
  if (!getCurrentUserName()) {
    await setCurrentUserName('You');
  }

  const trip = await createGroup({
    name: 'Goa Trip 2026',
    description: 'Weekend trip with the college gang',
    memberNames: ['You', 'Rahul', 'Priya', 'Aditi'],
  });
  const [you, rahul, priya, aditi] = trip.members;

  await createExpense(trip.id, {
    title: 'Hotel booking',
    amountPaise: rupeesToPaise(12000),
    payerId: you.id,
    participantIds: [you.id, rahul.id, priya.id, aditi.id],
    date: '2026-01-10',
    notes: 'Beachside resort, 2 nights',
    splitMethod: 'equal',
  });

  await createExpense(trip.id, {
    title: 'Dinner at Thalassa',
    amountPaise: rupeesToPaise(4500),
    payerId: rahul.id,
    participantIds: [you.id, rahul.id, priya.id, aditi.id],
    date: '2026-01-10',
    splitMethod: 'equal',
  });

  await createExpense(trip.id, {
    title: 'Cab from airport',
    amountPaise: rupeesToPaise(1800),
    payerId: priya.id,
    participantIds: [you.id, priya.id],
    date: '2026-01-09',
    splitMethod: 'exact',
    splits: { [you.id]: rupeesToPaise(900), [priya.id]: rupeesToPaise(900) },
  });

  await createExpense(trip.id, {
    title: 'Scuba diving tickets',
    amountPaise: rupeesToPaise(6000),
    payerId: aditi.id,
    participantIds: [rahul.id, aditi.id],
    date: '2026-01-11',
    splitMethod: 'percentage',
    splits: { [rahul.id]: 50, [aditi.id]: 50 },
  });

  const settlement = await recordSettlement(trip.id, { fromId: priya.id, toId: you.id, amountPaise: rupeesToPaise(900) });
  await markCompleted(settlement.id, '2026-01-12');

  const flatmates = await createGroup({
    name: 'Flatmates - Koramangala',
    description: 'Monthly shared household expenses',
    memberNames: ['You', 'Sanjay', 'Meera'],
  });
  const [you2, sanjay, meera] = flatmates.members;

  await createExpense(flatmates.id, {
    title: 'Electricity bill',
    amountPaise: rupeesToPaise(2700),
    payerId: sanjay.id,
    participantIds: [you2.id, sanjay.id, meera.id],
    date: '2026-02-01',
    splitMethod: 'equal',
  });

  await createExpense(flatmates.id, {
    title: 'Groceries (BigBasket)',
    amountPaise: rupeesToPaise(3250),
    payerId: you2.id,
    participantIds: [you2.id, sanjay.id, meera.id],
    date: '2026-02-03',
    splitMethod: 'equal',
  });

  await createExpense(flatmates.id, {
    title: 'Internet bill',
    amountPaise: rupeesToPaise(1199),
    payerId: meera.id,
    participantIds: [you2.id, sanjay.id, meera.id],
    date: '2026-02-05',
    splitMethod: 'equal',
  });
}
