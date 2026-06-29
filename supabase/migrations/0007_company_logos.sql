-- Company logo support for documents and print/PDF layouts.

alter table public.companies
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Company assets are publicly readable'
  ) then
    create policy "Company assets are publicly readable"
      on storage.objects
      for select
      using (bucket_id = 'company-assets');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Company admins can insert company assets'
  ) then
    create policy "Company admins can insert company assets"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'company-assets'
        and (storage.foldername(name))[1] = 'companies'
        and exists (
          select 1
          from public.company_users cu
          where cu.company_id::text = (storage.foldername(name))[2]
            and cu.user_id = auth.uid()
            and cu.role = 'admin'
            and cu.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Company admins can update company assets'
  ) then
    create policy "Company admins can update company assets"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'company-assets'
        and (storage.foldername(name))[1] = 'companies'
        and exists (
          select 1
          from public.company_users cu
          where cu.company_id::text = (storage.foldername(name))[2]
            and cu.user_id = auth.uid()
            and cu.role = 'admin'
            and cu.status = 'active'
        )
      )
      with check (
        bucket_id = 'company-assets'
        and (storage.foldername(name))[1] = 'companies'
        and exists (
          select 1
          from public.company_users cu
          where cu.company_id::text = (storage.foldername(name))[2]
            and cu.user_id = auth.uid()
            and cu.role = 'admin'
            and cu.status = 'active'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Company admins can delete company assets'
  ) then
    create policy "Company admins can delete company assets"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'company-assets'
        and (storage.foldername(name))[1] = 'companies'
        and exists (
          select 1
          from public.company_users cu
          where cu.company_id::text = (storage.foldername(name))[2]
            and cu.user_id = auth.uid()
            and cu.role = 'admin'
            and cu.status = 'active'
        )
      );
  end if;
end $$;
