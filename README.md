# SplitEasy - Expense Splitter

A React web app for splitting shared expenses with friends, roommates, or travel groups, and settling up with the fewest possible payments. It runs entirely in the browser - **there is no backend, no server, and no account** - yet it's backed by a real relational database: SQLite, compiled to WebAssembly, running client-side.

Built as a portfolio project to demonstrate: client-side data modeling with a relational schema, a non-trivial graph/optimization algorithm (minimum-transaction debt settlement), careful handling of money (integer arithmetic, no floating-point drift), and a static, backend-free architecture deployable to GitHub Pages.

## Live demo

Deploy it yourself in under five minutes - see [Deployment](#deployment-to-github-pages) below. (Replace this line with your live GitHub Pages URL once deployed.)

## Features

- **Dashboard** - total expenses, what you paid, what you're owed, what you owe, recent activity, and your groups at a glance. Empty states for new users; an optional one-click "Load demo data" button (never auto-populated).
- **Groups** - create groups with named members, rename/edit, delete (with confirmation), add members, and remove members (blocked if they have existing expense/settlement records, to protect financial history).
- **Expenses** - title, amount, payer, date, notes, and participants, with three split methods:
  - **Equal** - divided evenly, remainder paise distributed one-by-one so the split always sums exactly to the total.
  - **Exact amounts** - you assign each participant's share; must sum to the total.
  - **Percentage** - you assign each participant a percentage; must sum to 100%.
  - Full validation (positive amounts, shares that add up), edit/delete with automatic balance recalculation, search/filter/sort.
- **Settle-up algorithm** - computes the minimum (or near-minimum) number of payments that zero out every balance. See [Algorithm](#the-settle-up-algorithm) below.
- **Settlements** - view suggested payments, mark them as paid (with a settlement date), undo a mistaken confirmation, and see completed vs. pending settlement history separately.
- **Search, filters & reports** - search expenses by title, filter by date range or member, sort by date/amount/title, per-group totals, per-member paid/owed/net balances.
- **Data portability & privacy** - export your entire database as a JSON backup, import it back (with validation - a corrupted or malformed file is rejected without touching existing data), and a "reset all data" option behind a typed confirmation.
- **Responsive, accessible UI** - collapsible sidebar on mobile, labeled form fields, visible focus states, confirmation dialogs for destructive/balance-changing actions, toast notifications, loading/error states.

## Tech stack

| Concern | Choice |
|---|---|
| UI | React 18 + React Router (`HashRouter`) |
| Build tool | Vite |
| Database | SQLite compiled to WebAssembly via [`sql.js`](https://github.com/sql-js/sql.js) - a real relational DB, in the browser, no server |
| Persistence | The SQLite database's exported bytes are saved to **IndexedDB** after every write, and restored on startup |
| Icons | `lucide-react` |
| Tests | Vitest (+ `fake-indexeddb` and `jsdom` for integration tests that exercise the real SQLite engine) |
| Hosting | GitHub Pages (static only - no server, no paid tier) |

## Architecture

```
src/
  algorithms/
    calculateBalances.js     Pure: paid/fairShare/net per member (no DB, no React)
    calculateSettlements.js  Pure: minimum-transaction settle-up algorithm
  services/
    database/
      schema.js               SQL DDL (tables, indexes, foreign keys)
      db.js                   sql.js lifecycle: init, query/run/transaction, export, persist
      idbStore.js              IndexedDB read/write for the exported DB bytes
    groupService.js            Group + member CRUD
    expenseService.js          Expense CRUD, split computation, filtering/sorting
    settlementService.js       Wires the algorithms to the DB; settlement CRUD
    backupService.js           JSON export/import with validation
    dashboardService.js        Cross-group aggregation for the dashboard
    settingsService.js         "Who am I" display name (no auth - see below)
    demoDataService.js         Optional, explicit demo data seeding
  components/                  layout / groups / expenses / settlements / common
  pages/                       Dashboard, Groups, GroupDetail, Expenses, Settlements, Settings
  context/DatabaseContext.jsx  Initializes the DB once; a `version` counter other
                                components bump via refresh() after any mutation,
                                so reads from SQLite stay in sync with writes
  utils/
    currency.js                Integer-paise math: rounding-safe splits, formatting
    validation.js               Form validation (amounts, splits, member names)
tests/                          Vitest specs (algorithms + full-stack service tests)
```

**Design decisions worth calling out:**

- **Money is stored and computed as integer paise (never floats).** ₹1 = 100 paise. All arithmetic - splitting, summing, settling - happens in integers; rupees only appear at the UI boundary (`rupeesToPaise` / `paiseToRupees` in `src/utils/currency.js`). This eliminates an entire class of rounding bugs.
- **Remainder-safe equal splits.** Dividing ₹100 three ways gives 34/33/33 paise, not 33.33 repeating - `splitEqually()` floors the division and hands out the leftover paise one at a time so the parts always sum exactly to the whole.
- **No backend, no accounts.** Since there's no login, "you" is just a display name set once in Settings (`settingsService.js`) that's matched (case-insensitively) against member names per group to compute "you paid / you owe" on the dashboard. This is a static-hosting constraint, documented rather than hidden - see [Limitations](#limitations).
- **`HashRouter`**, not browser history routing - GitHub Pages serves static files with no server-side rewrite rules, so `/#/groups/123` always resolves client-side and a hard refresh never 404s.
- **Relative Vite `base: './'`** - works at any GitHub Pages path (`https://<user>.github.io/<repo>/`) without hardcoding the repository name. The WASM file is fetched via `new URL(file, document.baseURI)` rather than a relative string, so it resolves correctly regardless of which JS chunk requests it (this subtlety broke the first implementation during testing - see commit history).
- **Writes are export-and-persist, serialized.** `db.js` keeps a single promise chain (`saveChain`) so that if a user fires off several mutations quickly, IndexedDB writes are applied strictly in order - an older save can never clobber a newer one, which matters because every write re-exports the *entire* database (sql.js doesn't support incremental WAL export).

## Database schema

```
groups (id, name, description, created_at)
members (id, group_id → groups, name, created_at)
expenses (id, group_id → groups, title, amount_paise, payer_id → members,
          expense_date, notes, split_method, created_at, updated_at)
expense_participants (id, expense_id → expenses, member_id → members, share_paise)
settlements (id, group_id → groups, from_member_id → members, to_member_id → members,
             amount_paise, completed, settled_date, created_at)
schema_meta (key, value)   -- schema version + the "current user" display name
```

Indexes on every foreign key column used in lookups (`members.group_id`, `expenses.group_id`/`payer_id`/`expense_date`, `expense_participants.expense_id`/`member_id`, `settlements.group_id`). Foreign keys are enforced via `PRAGMA foreign_keys = ON`. `schema_meta.schema_version` plus the idempotent DDL in `migrateIfNeeded()` give a simple migration path - a future schema change would branch on the stored version number there.

**Persistence model:** on every mutation, `db.js` calls `db.export()` (sql.js serializes the whole database to a `Uint8Array`), which is written to a single IndexedDB record alongside a monotonically increasing revision number. On app start, that record is read back and used to reconstruct the SQLite database in memory. **Your data lives only in this browser** - it is not synced between devices or browsers. Use **Settings → Export backup** before switching browsers or clearing site data, and **Import backup** to restore it elsewhere.

## The settle-up algorithm

This is the project's centerpiece: `calculateSettlements(members, expenses, settlements)` in [`src/algorithms/calculateSettlements.js`](src/algorithms/calculateSettlements.js), kept completely independent of React and the database so it's trivially unit-testable (see `tests/calculateSettlements.test.js`).

**Step 1 - balances.** `calculateBalances()` walks every expense once: each payer's `paid` total goes up by the expense amount, each participant's `fairShare` goes up by their assigned share. `net = paid − fairShare`. Completed settlements are then applied on top (a completed payment moves both parties' balances toward zero) to produce `afterSettlements`, each member's *true outstanding* balance.

**Step 2 - minimize transactions.** Two strategies are implemented:

- **`greedyMatch`** - O(n log n). Repeatedly pair the member who owes the most with the member who is owed the most, settle the smaller of the two amounts, and repeat. Always correct (every balance reaches exactly zero), but a heuristic: it is **not guaranteed to find the fewest possible transactions** in every case.
- **`minTransactions`** - the true minimum, found via DFS with branch-and-bound. At each step it takes one member with a non-zero balance and tries merging it with every other member of the opposite sign, recursing until everyone is at zero, keeping the best (fewest-transaction) solution found; ties are broken by preferring the solution that moves the least total money, which in practice favors direct, intuitive pairings over routing money through an intermediary. This is the classic "optimal account balancing" search (same family as LeetCode 465) and is worst-case exponential in the number of members with a non-zero balance.

`calculateSettlements()` uses the exact solver automatically when a group has **10 or fewer** members with an outstanding balance (`EXACT_SOLVER_MEMBER_LIMIT`), and transparently falls back to the greedy heuristic above that - so the UI never hangs on a large group, at the cost of a possibly-suboptimal (but still always correct) transaction count.

**Complexity:** `calculateBalances` is O(E·P) for E expenses and average P participants each. `greedyMatch` is O(n log n) in the number of non-zero balances. `minTransactions` is worst-case O(n!)-ish (bounded exponential search), mitigated by the member-count cutoff and branch-and-bound pruning.

**Correctness properties, each covered by a test:** every transaction is positive and non-self, total debtor payments equal total creditor receipts exactly, rounding never creates or loses money, zero-balance and empty-group inputs return no transactions, and identical inputs always produce identical output (pure function, no hidden state).

## Testing

```bash
npm test          # run the full suite once (used in CI)
npm run test:watch
```

29 tests across three files:

- `tests/calculateBalances.test.js` - equal split across three members, payer-who's-also-a-participant, payer-who-isn't-a-participant, multiple expenses from different payers, zero-balance/empty-group cases, completed vs. pending settlements.
- `tests/calculateSettlements.test.js` - star-topology debt graphs (one-owes-many, many-owe-one), rounding safety, the exact solver finding the true minimum, greedy vs. exact both producing valid zero-sum settlements, deterministic repeat calculations, and a 15-member group confirming the greedy fallback stays fast.
- `tests/expenses.test.js` - **full-stack integration tests against the real sql.js engine** (via `fake-indexeddb` standing in for the browser's IndexedDB): group/member CRUD, equal/exact/percentage splits end-to-end, invalid-amount and invalid-percentage rejection, editing and deleting expenses recalculating balances correctly, completed settlements reducing balances and undo restoring them, member-removal guarded by existing records, **simulated reload** (re-initializing the DB and confirming data is restored from IndexedDB), and JSON backup export/import round-tripping plus rejection of a corrupted backup.

The UI itself was also driven end-to-end with a headless browser (load demo data → navigate a group → check Expenses/Settlements tabs → create a new group) during development to confirm the production build actually works in a browser, not just under Node - this caught a real bug (see below) that the unit tests alone would have missed.

## Known limitations

- **No cross-device sync.** By design - there's no server. Use Export/Import to move data between browsers or devices.
- **"Current user" is a display name, not an account.** It's matched by exact (case-insensitive) name against group members. If you're "Alex" in one group and "Alexa" in another, the dashboard won't link them - this is a deliberate trade-off of having zero authentication infrastructure, not a bug.
- **The exact settle-up solver is exponential** and is capped at 10 members with an outstanding balance; larger groups automatically use the greedy heuristic, which is always correct but may use one or two more transactions than the true minimum.
- **A single browser profile is a single point of failure.** Clearing site data / browser storage without exporting a backup first permanently deletes your data - there's no server-side copy.
- **sql.js re-exports the entire database on every write.** Fine at the scale this app targets (personal/small-group expense tracking); it would need a different persistence strategy (e.g. OPFS + incremental writes) to comfortably scale to a very large expense history.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # run tests
npm run build       # production build -> dist/
npm run preview     # serve the production build locally
```

## Deployment to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually from the Actions tab). [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) installs dependencies, runs the test suite, builds with `npm run build`, and publishes `dist/` via `actions/deploy-pages`.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

No repository-name configuration is needed in `vite.config.js` - it uses a relative `base: './'` that works at any GitHub Pages path. Client-side routing uses `HashRouter`, so a hard refresh on any page (e.g. `/#/groups/abc123`) loads correctly with no 404, and the SQLite WASM file is fetched via an absolute URL resolved from the deployed page itself, so it loads correctly whichever sub-path the site is served from.

**Manual deploy alternative:** `npm run build && npm run deploy` (uses `gh-pages` to push `dist/` to the `gh-pages` branch) if you'd rather not use GitHub Actions.

## Suggested resume bullets

- Built SplitEasy, a client-side expense-splitting web app (React + Vite) that runs a real relational database - SQLite compiled to WebAssembly - entirely in the browser with no backend, persisting to IndexedDB.
- Designed and implemented a minimum-transaction debt-settlement algorithm (DFS branch-and-bound with a greedy fallback for scale), covered by unit tests asserting exact-balance, zero-transaction-leak, and determinism invariants.
- Eliminated floating-point currency bugs by modeling all money as integer paise throughout the data layer and algorithms, including remainder-safe equal/percentage split logic.
- Wrote 29 automated tests (Vitest), including full-stack integration tests that exercise the real SQLite engine and IndexedDB persistence layer (via `fake-indexeddb`), and used a headless-browser smoke test during development to catch a production-only asset-resolution bug the unit tests couldn't see.
- Shipped a fully static, zero-cost deployment to GitHub Pages via GitHub Actions, including JSON backup/restore for data portability given the app has no server-side storage.
