-- Carbon Flow special theme: Torcida brasileira 2026.

alter table public.users
add column if not exists brazil_2026_theme_unlocked_at timestamptz;

comment on column public.users.brazil_2026_theme_unlocked_at is
  'Marks users who unlocked the Torcida brasileira 2026 special theme.';

create or replace function public.unlock_brazil_2026_theme()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  already_unlocked boolean;
begin
  current_user_id := public.current_app_user_id();

  if current_user_id is null then
    return false;
  end if;

  select brazil_2026_theme_unlocked_at is not null
  into already_unlocked
  from public.users
  where id = current_user_id;

  if coalesce(already_unlocked, false) then
    return true;
  end if;

  if now() >= timestamptz '2026-07-21 03:00:00+00' then
    return false;
  end if;

  update public.users
  set brazil_2026_theme_unlocked_at = now(),
      updated_at = now()
  where id = current_user_id;

  return found;
end;
$$;

revoke all on function public.unlock_brazil_2026_theme() from public;
grant execute on function public.unlock_brazil_2026_theme() to authenticated;
