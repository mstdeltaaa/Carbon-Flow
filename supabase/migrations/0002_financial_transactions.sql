-- Carbon Flow financial transactions.

do $$ begin
  create type public.financial_transaction_type as enum ('income', 'expense');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.financial_transaction_status as enum ('pending', 'paid', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type public.financial_transaction_type not null,
  status public.financial_transaction_status not null default 'paid',
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  due_date date,
  paid_at timestamptz,
  source_type text not null default 'manual',
  source_id uuid,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create index if not exists financial_transactions_company_date_idx
  on public.financial_transactions(company_id, transaction_date desc);

create index if not exists financial_transactions_source_idx
  on public.financial_transactions(company_id, source_type, source_id);

drop trigger if exists set_financial_transactions_updated_at on public.financial_transactions;
create trigger set_financial_transactions_updated_at before update on public.financial_transactions
for each row execute function public.set_updated_at();

alter table public.financial_transactions enable row level security;

drop policy if exists financial_transactions_select_ops on public.financial_transactions;
create policy financial_transactions_select_ops on public.financial_transactions
for select
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists financial_transactions_write_ops on public.financial_transactions;
create policy financial_transactions_write_ops on public.financial_transactions
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));
