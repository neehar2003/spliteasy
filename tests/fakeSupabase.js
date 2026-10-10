// A minimal in-memory stand-in for the Supabase JS client, covering only the
// query-builder surface SplitEasy's services actually use (eq/ilike/gte/lte/
// not/order/limit/select/insert/update/delete/maybeSingle, plus count/head
// selects). It replicates the ON DELETE CASCADE relationships declared in
// supabase/schema.sql so cascading deletes behave the same as in Postgres.
// Used in tests in place of the real network client (see fakeSupabase setup).

const TABLES = ['groups', 'members', 'expenses', 'expense_participants', 'settlements'];

function freshDb() {
  return Object.fromEntries(TABLES.map((t) => [t, []]));
}

export const db = freshDb();

export function resetFakeDb() {
  for (const t of TABLES) db[t] = [];
}

function cascadeDelete(table, deletedIds) {
  if (deletedIds.size === 0) return;
  if (table === 'groups') {
    db.members = db.members.filter((m) => !deletedIds.has(m.group_id));
    const deletedExpenseIds = new Set(db.expenses.filter((e) => deletedIds.has(e.group_id)).map((e) => e.id));
    db.expenses = db.expenses.filter((e) => !deletedIds.has(e.group_id));
    db.expense_participants = db.expense_participants.filter((p) => !deletedExpenseIds.has(p.expense_id));
    db.settlements = db.settlements.filter((s) => !deletedIds.has(s.group_id));
  }
  if (table === 'expenses') {
    db.expense_participants = db.expense_participants.filter((p) => !deletedIds.has(p.expense_id));
  }
}

class FakeQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.mode = 'select';
    this.payload = null;
    this.countMode = null;
    this.head = false;
    this.single = false;
  }

  select(_cols, opts) {
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }

  insert(payload) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(col, val) {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  ilike(col, pattern) {
    const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
    this.filters.push((row) => String(row[col] ?? '').toLowerCase().includes(needle));
    return this;
  }

  gte(col, val) {
    this.filters.push((row) => row[col] >= val);
    return this;
  }

  lte(col, val) {
    this.filters.push((row) => row[col] <= val);
    return this;
  }

  not(col, op, val) {
    if (op === 'is' && val === null) {
      this.filters.push((row) => row[col] != null);
    }
    return this;
  }

  order(col, opts) {
    this.orders.push([col, opts?.ascending !== false]);
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  async _exec() {
    const store = db[this.table];

    if (this.mode === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ ...r }));
      store.push(...rows);
      return { data: rows, error: null };
    }

    if (this.mode === 'update') {
      const matched = store.filter((row) => this.filters.every((f) => f(row)));
      matched.forEach((row) => Object.assign(row, this.payload));
      return { data: matched, error: null };
    }

    if (this.mode === 'delete') {
      const toDelete = store.filter((row) => this.filters.every((f) => f(row)));
      const ids = new Set(toDelete.map((row) => row.id));
      db[this.table] = store.filter((row) => !ids.has(row.id));
      cascadeDelete(this.table, ids);
      return { data: toDelete, error: null };
    }

    let rows = store.filter((row) => this.filters.every((f) => f(row)));
    for (const [col, asc] of this.orders) {
      rows = rows.slice().sort((a, b) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);

    if (this.countMode) {
      return { data: this.head ? null : rows, error: null, count: rows.length };
    }
    if (this.single) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  then(onFulfilled, onRejected) {
    return this._exec().then(onFulfilled, onRejected);
  }
}

export const supabase = {
  from(table) {
    return new FakeQueryBuilder(table);
  },
};
