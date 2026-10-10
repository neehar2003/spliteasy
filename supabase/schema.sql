-- SplitEasy shared Postgres schema (Supabase).
-- All monetary columns store integer paise, never floating point.
-- No auth: rows are attributed by a free-text "created_by" name the user sets locally.

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_members_group on members(group_id);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  amount_paise bigint not null,
  payer_id uuid not null references members(id),
  expense_date date not null,
  notes text,
  split_method text not null default 'equal',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_expenses_group on expenses(group_id);
create index if not exists idx_expenses_payer on expenses(payer_id);
create index if not exists idx_expenses_date on expenses(expense_date);

create table if not exists expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references members(id),
  share_paise bigint not null
);
create index if not exists idx_participants_expense on expense_participants(expense_id);
create index if not exists idx_participants_member on expense_participants(member_id);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_member_id uuid not null references members(id),
  to_member_id uuid not null references members(id),
  amount_paise bigint not null,
  completed boolean not null default false,
  settled_date date,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_settlements_group on settlements(group_id);

-- No auth in this app: RLS stays disabled and the anon key has full read/write.
-- Only use this with a trusted small group, since anyone with the anon key can read/write all rows.
alter table groups disable row level security;
alter table members disable row level security;
alter table expenses disable row level security;
alter table expense_participants disable row level security;
alter table settlements disable row level security;
