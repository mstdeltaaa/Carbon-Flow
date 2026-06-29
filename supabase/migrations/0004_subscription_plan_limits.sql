-- Carbon Flow subscription limit defaults.

alter table public.subscriptions
alter column limits set default '{
  "users": 1,
  "ingredients": 50,
  "products": 20,
  "customers": 50,
  "budgets_per_month": 20,
  "sales_per_month": 20
}'::jsonb;

update public.subscriptions
set limits = '{
  "users": 1,
  "ingredients": 50,
  "products": 20,
  "customers": 50,
  "budgets_per_month": 20,
  "sales_per_month": 20
}'::jsonb
where plan = 'free'
  and limits = '{"users": 1, "products": 20, "budgets_per_month": 20}'::jsonb;
