
-- roles enum
create type public.app_role as enum ('admin', 'user');

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users can view their own roles"
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- security definer helper
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- scenes
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.scenes to authenticated;
grant all on public.scenes to service_role;

alter table public.scenes enable row level security;

create policy "Users can view own scenes"
  on public.scenes for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own scenes"
  on public.scenes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own scenes"
  on public.scenes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own scenes"
  on public.scenes for delete to authenticated
  using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scenes_set_updated_at
  before update on public.scenes
  for each row execute function public.set_updated_at();
