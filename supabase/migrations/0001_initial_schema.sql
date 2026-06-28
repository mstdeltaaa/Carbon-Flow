-- Carbon Flow initial schema for Supabase/PostgreSQL.
-- This migration defines the first production-oriented data model, tenant isolation helpers and RLS policies.

create extension if not exists pgcrypto;

do $$ begin
  create type public.company_role as enum ('admin', 'employee', 'seller');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.company_user_status as enum ('active', 'invited', 'disabled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.stock_movement_type as enum ('entry', 'sale', 'adjustment', 'reversal');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.budget_status as enum ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.sale_status as enum ('completed', 'cancelled', 'refunded');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_plan as enum ('free', 'pro', 'enterprise');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'inactive');
exception
  when duplicate_object then null;
end $$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.current_user_id', true), '')::uuid,
    auth.uid()
  )
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  document text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.company_role not null default 'seller',
  permissions jsonb not null default '{}'::jsonb,
  status public.company_user_status not null default 'active',
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text,
  inventory_unit text not null,
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  stock_quantity numeric(14,4) not null default 0 check (stock_quantity >= 0),
  minimum_stock numeric(14,4) not null default 0 check (minimum_stock >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  sku text,
  estimated_cost numeric(14,4) not null default 0 check (estimated_cost >= 0),
  suggested_price numeric(14,2) not null default 0 check (suggested_price >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  margin_percent numeric(8,4) not null default 30 check (margin_percent >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, sku),
  unique (company_id, name)
);

create table if not exists public.product_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null,
  conversion_factor_to_inventory numeric(14,8) not null default 1 check (conversion_factor_to_inventory > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products(id, company_id) on delete cascade,
  foreign key (ingredient_id, company_id) references public.ingredients(id, company_id) on delete restrict,
  unique (product_id, ingredient_id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid,
  number bigint not null,
  status public.budget_status not null default 'draft',
  valid_until date,
  subtotal_amount numeric(14,2) not null default 0 check (subtotal_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, company_id) references public.customers(id, company_id),
  unique (id, company_id),
  unique (company_id, number)
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  budget_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_price numeric(14,2) not null check (total_price >= 0),
  estimated_cost numeric(14,4) not null default 0 check (estimated_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (budget_id, company_id) references public.budgets(id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products(id, company_id)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid,
  budget_id uuid,
  number bigint not null,
  status public.sale_status not null default 'completed',
  subtotal_amount numeric(14,2) not null default 0 check (subtotal_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  estimated_profit numeric(14,2) not null default 0,
  sold_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, company_id) references public.customers(id, company_id),
  foreign key (budget_id, company_id) references public.budgets(id, company_id),
  unique (id, company_id),
  unique (company_id, number)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_price numeric(14,2) not null check (total_price >= 0),
  estimated_unit_cost numeric(14,4) not null default 0 check (estimated_unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (sale_id, company_id) references public.sales(id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products(id, company_id)
);

create table if not exists public.ingredient_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ingredient_id uuid not null,
  type public.stock_movement_type not null,
  quantity_delta numeric(14,4) not null check (quantity_delta <> 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  source_type text,
  source_id uuid,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (ingredient_id, company_id) references public.ingredients(id, company_id) on delete restrict
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'inactive',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  limits jsonb not null default '{"users":1,"products":20,"budgets_per_month":20}'::jsonb,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_users_user_id_idx on public.company_users(user_id);
create index if not exists ingredients_company_id_idx on public.ingredients(company_id);
create index if not exists products_company_id_idx on public.products(company_id);
create index if not exists product_items_product_id_idx on public.product_items(product_id);
create index if not exists product_items_ingredient_id_idx on public.product_items(ingredient_id);
create index if not exists customers_company_id_idx on public.customers(company_id);
create index if not exists budgets_company_id_idx on public.budgets(company_id);
create index if not exists budget_items_budget_id_idx on public.budget_items(budget_id);
create index if not exists sales_company_id_idx on public.sales(company_id);
create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);
create index if not exists stock_movements_company_id_idx on public.ingredient_stock_movements(company_id);
create index if not exists stock_movements_ingredient_id_idx on public.ingredient_stock_movements(ingredient_id);
create index if not exists audit_logs_company_id_idx on public.audit_logs(company_id);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_company_users_updated_at on public.company_users;
create trigger set_company_users_updated_at before update on public.company_users
for each row execute function public.set_updated_at();

drop trigger if exists set_ingredients_updated_at on public.ingredients;
create trigger set_ingredients_updated_at before update on public.ingredients
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_product_items_updated_at on public.product_items;
create trigger set_product_items_updated_at before update on public.product_items
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_budgets_updated_at on public.budgets;
create trigger set_budgets_updated_at before update on public.budgets
for each row execute function public.set_updated_at();

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = public.current_app_user_id()
      and cu.status = 'active'
  )
$$;

create or replace function public.has_company_role(target_company_id uuid, allowed_roles public.company_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = public.current_app_user_id()
      and cu.status = 'active'
      and cu.role = any (allowed_roles)
  )
$$;

create or replace function public.can_manage_commercial(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_company_role(target_company_id, array['admin', 'employee', 'seller']::public.company_role[])
$$;

create or replace function public.create_company_for_current_user(
  company_name text,
  company_slug text,
  company_document text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  current_user_id uuid;
begin
  current_user_id := public.current_app_user_id();

  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if nullif(trim(company_name), '') is null then
    raise exception 'Company name is required';
  end if;

  if nullif(trim(company_slug), '') is null then
    raise exception 'Company slug is required';
  end if;

  insert into public.companies (name, slug, document)
  values (trim(company_name), lower(trim(company_slug)), nullif(trim(company_document), ''))
  returning id into new_company_id;

  insert into public.company_users (company_id, user_id, role, status)
  values (new_company_id, current_user_id, 'admin', 'active');

  insert into public.subscriptions (company_id, plan, status)
  values (new_company_id, 'free', 'active');

  return new_company_id;
end;
$$;

revoke all on function public.create_company_for_current_user(text, text, text) from public;
grant execute on function public.create_company_for_current_user(text, text, text) to authenticated;

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.company_users enable row level security;
alter table public.ingredients enable row level security;
alter table public.products enable row level security;
alter table public.product_items enable row level security;
alter table public.customers enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.ingredient_stock_movements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists users_select_self_or_company_members on public.users;
create policy users_select_self_or_company_members on public.users
for select
using (
  id = public.current_app_user_id()
  or exists (
    select 1
    from public.company_users me
    join public.company_users other_member on other_member.company_id = me.company_id
    where me.user_id = public.current_app_user_id()
      and me.status = 'active'
      and other_member.user_id = users.id
      and other_member.status = 'active'
  )
);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
for insert
with check (id = public.current_app_user_id());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
for update
using (id = public.current_app_user_id())
with check (id = public.current_app_user_id());

drop policy if exists companies_select_members on public.companies;
create policy companies_select_members on public.companies
for select
using (public.is_company_member(id));

drop policy if exists companies_update_admins on public.companies;
create policy companies_update_admins on public.companies
for update
using (public.has_company_role(id, array['admin']::public.company_role[]))
with check (public.has_company_role(id, array['admin']::public.company_role[]));

drop policy if exists company_users_select_members on public.company_users;
create policy company_users_select_members on public.company_users
for select
using (public.is_company_member(company_id));

drop policy if exists company_users_manage_admins on public.company_users;
create policy company_users_manage_admins on public.company_users
for all
using (public.has_company_role(company_id, array['admin']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin']::public.company_role[]));

drop policy if exists ingredients_select_ops on public.ingredients;
create policy ingredients_select_ops on public.ingredients
for select
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists ingredients_write_ops on public.ingredients;
create policy ingredients_write_ops on public.ingredients
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists products_select_members on public.products;
create policy products_select_members on public.products
for select
using (public.is_company_member(company_id));

drop policy if exists products_write_ops on public.products;
create policy products_write_ops on public.products
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists product_items_select_members on public.product_items;
create policy product_items_select_members on public.product_items
for select
using (public.is_company_member(company_id));

drop policy if exists product_items_write_ops on public.product_items;
create policy product_items_write_ops on public.product_items
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists customers_select_commercial on public.customers;
create policy customers_select_commercial on public.customers
for select
using (public.can_manage_commercial(company_id));

drop policy if exists customers_write_commercial on public.customers;
create policy customers_write_commercial on public.customers
for all
using (public.can_manage_commercial(company_id))
with check (public.can_manage_commercial(company_id));

drop policy if exists budgets_select_commercial on public.budgets;
create policy budgets_select_commercial on public.budgets
for select
using (public.can_manage_commercial(company_id));

drop policy if exists budgets_write_commercial on public.budgets;
create policy budgets_write_commercial on public.budgets
for all
using (public.can_manage_commercial(company_id))
with check (public.can_manage_commercial(company_id));

drop policy if exists budget_items_select_commercial on public.budget_items;
create policy budget_items_select_commercial on public.budget_items
for select
using (public.can_manage_commercial(company_id));

drop policy if exists budget_items_write_commercial on public.budget_items;
create policy budget_items_write_commercial on public.budget_items
for all
using (public.can_manage_commercial(company_id))
with check (public.can_manage_commercial(company_id));

drop policy if exists sales_select_members on public.sales;
create policy sales_select_members on public.sales
for select
using (public.is_company_member(company_id));

drop policy if exists sales_write_ops on public.sales;
create policy sales_write_ops on public.sales
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists sale_items_select_members on public.sale_items;
create policy sale_items_select_members on public.sale_items
for select
using (public.is_company_member(company_id));

drop policy if exists sale_items_write_ops on public.sale_items;
create policy sale_items_write_ops on public.sale_items
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists stock_movements_select_ops on public.ingredient_stock_movements;
create policy stock_movements_select_ops on public.ingredient_stock_movements
for select
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists stock_movements_write_ops on public.ingredient_stock_movements;
create policy stock_movements_write_ops on public.ingredient_stock_movements
for all
using (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin', 'employee']::public.company_role[]));

drop policy if exists audit_logs_select_admins on public.audit_logs;
create policy audit_logs_select_admins on public.audit_logs
for select
using (company_id is not null and public.has_company_role(company_id, array['admin']::public.company_role[]));

drop policy if exists subscriptions_select_admins on public.subscriptions;
create policy subscriptions_select_admins on public.subscriptions
for select
using (public.has_company_role(company_id, array['admin']::public.company_role[]));

drop policy if exists subscriptions_update_admins on public.subscriptions;
create policy subscriptions_update_admins on public.subscriptions
for update
using (public.has_company_role(company_id, array['admin']::public.company_role[]))
with check (public.has_company_role(company_id, array['admin']::public.company_role[]));
