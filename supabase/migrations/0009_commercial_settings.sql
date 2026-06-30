-- Commercial settings used by professional documents and default forms.

alter table public.companies
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists budget_validity_days integer not null default 15,
  add column if not exists default_margin_percent numeric(7, 4) not null default 30,
  add column if not exists commercial_terms text,
  add column if not exists payment_instructions text,
  add column if not exists document_footer text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_budget_validity_days_check'
  ) then
    alter table public.companies
      add constraint companies_budget_validity_days_check
      check (budget_validity_days between 1 and 365);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_default_margin_percent_check'
  ) then
    alter table public.companies
      add constraint companies_default_margin_percent_check
      check (default_margin_percent >= 0 and default_margin_percent <= 1000);
  end if;
end $$;
