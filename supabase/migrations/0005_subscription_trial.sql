-- Carbon Flow 7-day Pro trial for new companies.

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

  insert into public.subscriptions (company_id, plan, status, limits, current_period_end)
  values (
    new_company_id,
    'pro',
    'trialing',
    '{
      "users": 5,
      "ingredients": 500,
      "products": 200,
      "customers": 500,
      "budgets_per_month": 300,
      "sales_per_month": 300
    }'::jsonb,
    now() + interval '7 days'
  );

  return new_company_id;
end;
$$;

revoke all on function public.create_company_for_current_user(text, text, text) from public;
grant execute on function public.create_company_for_current_user(text, text, text) to authenticated;

update public.subscriptions
set limits = '{
  "users": 5,
  "ingredients": 500,
  "products": 200,
  "customers": 500,
  "budgets_per_month": 300,
  "sales_per_month": 300
}'::jsonb
where plan = 'pro'
  and status = 'trialing';
