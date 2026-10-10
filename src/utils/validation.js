export function isPositiveAmount(paise) {
  return Number.isFinite(paise) && paise > 0;
}

export function validateGroupForm({ name, members }) {
  const errors = {};
  if (!name || !name.trim()) {
    errors.name = 'Group name is required.';
  }
  const trimmed = (members || []).map((m) => m.trim()).filter(Boolean);
  if (trimmed.length < 2) {
    errors.members = 'Add at least two members.';
  }
  const lower = trimmed.map((m) => m.toLowerCase());
  if (new Set(lower).size !== lower.length) {
    errors.members = 'Member names must be unique within a group.';
  }
  return { errors, isValid: Object.keys(errors).length === 0, cleanedMembers: trimmed };
}

export function validateExpenseForm({ title, amountPaise, payerId, participantIds, date, splitMethod, splits }) {
  const errors = {};
  if (!title || !title.trim()) errors.title = 'Title is required.';
  if (!isPositiveAmount(amountPaise)) errors.amount = 'Amount must be greater than zero.';
  if (!payerId) errors.payer = 'Select who paid.';
  if (!date) errors.date = 'Date is required.';
  if (!participantIds || participantIds.length === 0) {
    errors.participants = 'Select at least one participant.';
  }

  if (isPositiveAmount(amountPaise) && participantIds && participantIds.length > 0) {
    if (splitMethod === 'exact') {
      const sum = participantIds.reduce((s, id) => s + (splits?.[id] || 0), 0);
      if (sum !== amountPaise) {
        errors.splits = `Exact amounts must add up to the total (currently off by ${Math.abs(sum - amountPaise)} paise).`;
      }
      if (participantIds.some((id) => !isPositiveAmount(splits?.[id]))) {
        errors.splits = errors.splits || 'Each participant share must be greater than zero.';
      }
    }
    if (splitMethod === 'percentage') {
      const sum = participantIds.reduce((s, id) => s + (Number(splits?.[id]) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        errors.splits = `Percentages must add up to 100 (currently ${sum.toFixed(2)}%).`;
      }
      if (participantIds.some((id) => !(Number(splits?.[id]) > 0))) {
        errors.splits = errors.splits || 'Each percentage must be greater than zero.';
      }
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}
