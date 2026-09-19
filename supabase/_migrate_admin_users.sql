-- Migration ciblée : table admin_users + trigger de purge (voir schema.sql).
create table if not exists public.admin_users (
  email      text primary key check (email = lower(email)),
  role       text not null default 'staff' check (role in ('admin','staff')),
  label      text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create or replace function public.sync_admin_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    delete from public.admin_users where email = lower(old.email);
  end if;
  return coalesce(old, new);
end;
$$;

drop trigger if exists admin_users_auth_sync on auth.users;
create trigger admin_users_auth_sync
  after delete on auth.users
  for each row execute function public.sync_admin_users();
