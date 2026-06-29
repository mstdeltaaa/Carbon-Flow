-- Carbon Flow per-module company permissions.

create or replace function public.default_employee_permissions()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'dashboard', true,
    'ingredients', true,
    'products', true,
    'stock', true,
    'customers', true,
    'budgets', true,
    'sales', true,
    'finance', true
  )
$$;

update public.company_users
set permissions = public.default_employee_permissions()
where role = 'employee'
  and (permissions is null or permissions = '{}'::jsonb);

create or replace function public.has_company_permission(
  target_company_id uuid,
  permission_name text
)
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
      and (
        cu.role = 'admin'
        or (
          cu.role = 'seller'
          and permission_name in ('customers', 'products', 'budgets')
        )
        or (
          cu.role = 'employee'
          and coalesce(cu.permissions ->> permission_name, 'false') = 'true'
        )
      )
  )
$$;

revoke all on function public.default_employee_permissions() from public;
grant execute on function public.default_employee_permissions() to authenticated;

revoke all on function public.has_company_permission(uuid, text) from public;
grant execute on function public.has_company_permission(uuid, text) to authenticated;

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

  insert into public.company_users (company_id, user_id, role, status, permissions)
  values (new_company_id, current_user_id, 'admin', 'active', '{}'::jsonb);

  insert into public.subscriptions (company_id, plan, status)
  values (new_company_id, 'free', 'active');

  return new_company_id;
end;
$$;

revoke all on function public.create_company_for_current_user(text, text, text) from public;
grant execute on function public.create_company_for_current_user(text, text, text) to authenticated;

drop policy if exists ingredients_select_ops on public.ingredients;
create policy ingredients_select_ops on public.ingredients
for select
using (
  public.has_company_permission(company_id, 'ingredients')
  or public.has_company_permission(company_id, 'stock')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists ingredients_write_ops on public.ingredients;
create policy ingredients_write_ops on public.ingredients
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and (
    public.has_company_permission(company_id, 'ingredients')
    or public.has_company_permission(company_id, 'stock')
    or public.has_company_permission(company_id, 'sales')
  )
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and (
    public.has_company_permission(company_id, 'ingredients')
    or public.has_company_permission(company_id, 'stock')
    or public.has_company_permission(company_id, 'sales')
  )
);

drop policy if exists products_select_members on public.products;
create policy products_select_members on public.products
for select
using (
  public.has_company_permission(company_id, 'products')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists products_write_ops on public.products;
create policy products_write_ops on public.products
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'products')
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'products')
);

drop policy if exists product_items_select_members on public.product_items;
create policy product_items_select_members on public.product_items
for select
using (
  public.has_company_permission(company_id, 'products')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists product_items_write_ops on public.product_items;
create policy product_items_write_ops on public.product_items
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'products')
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'products')
);

drop policy if exists customers_select_commercial on public.customers;
create policy customers_select_commercial on public.customers
for select
using (
  public.has_company_permission(company_id, 'customers')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists customers_write_commercial on public.customers;
create policy customers_write_commercial on public.customers
for all
using (public.has_company_permission(company_id, 'customers'))
with check (public.has_company_permission(company_id, 'customers'));

drop policy if exists budgets_select_commercial on public.budgets;
create policy budgets_select_commercial on public.budgets
for select
using (
  public.has_company_permission(company_id, 'budgets')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists budgets_write_commercial on public.budgets;
create policy budgets_write_commercial on public.budgets
for all
using (
  public.has_company_permission(company_id, 'budgets')
  or public.has_company_permission(company_id, 'sales')
)
with check (
  public.has_company_permission(company_id, 'budgets')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists budget_items_select_commercial on public.budget_items;
create policy budget_items_select_commercial on public.budget_items
for select
using (
  public.has_company_permission(company_id, 'budgets')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists budget_items_write_commercial on public.budget_items;
create policy budget_items_write_commercial on public.budget_items
for all
using (
  public.has_company_permission(company_id, 'budgets')
  or public.has_company_permission(company_id, 'sales')
)
with check (
  public.has_company_permission(company_id, 'budgets')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists sales_select_members on public.sales;
create policy sales_select_members on public.sales
for select
using (public.has_company_permission(company_id, 'sales'));

drop policy if exists sales_write_ops on public.sales;
create policy sales_write_ops on public.sales
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'sales')
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'sales')
);

drop policy if exists sale_items_select_members on public.sale_items;
create policy sale_items_select_members on public.sale_items
for select
using (public.has_company_permission(company_id, 'sales'));

drop policy if exists sale_items_write_ops on public.sale_items;
create policy sale_items_write_ops on public.sale_items
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'sales')
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'sales')
);

drop policy if exists stock_movements_select_ops on public.ingredient_stock_movements;
create policy stock_movements_select_ops on public.ingredient_stock_movements
for select
using (
  public.has_company_permission(company_id, 'stock')
  or public.has_company_permission(company_id, 'sales')
);

drop policy if exists stock_movements_write_ops on public.ingredient_stock_movements;
create policy stock_movements_write_ops on public.ingredient_stock_movements
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and (
    public.has_company_permission(company_id, 'stock')
    or public.has_company_permission(company_id, 'sales')
  )
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and (
    public.has_company_permission(company_id, 'stock')
    or public.has_company_permission(company_id, 'sales')
  )
);

drop policy if exists financial_transactions_select_ops on public.financial_transactions;
create policy financial_transactions_select_ops on public.financial_transactions
for select
using (public.has_company_permission(company_id, 'finance'));

drop policy if exists financial_transactions_write_ops on public.financial_transactions;
create policy financial_transactions_write_ops on public.financial_transactions
for all
using (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'finance')
)
with check (
  public.has_company_role(company_id, array['admin', 'employee']::public.company_role[])
  and public.has_company_permission(company_id, 'finance')
);
