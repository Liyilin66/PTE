create extension if not exists pgcrypto;

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  device_label text,
  browser text,
  os text,
  created_at timestamptz not null default now()
);

create index if not exists user_login_events_user_id_idx
  on public.user_login_events (user_id);

create index if not exists user_login_events_user_logged_in_at_idx
  on public.user_login_events (user_id, logged_in_at desc);

create or replace function public.normalize_user_login_event()
returns trigger
language plpgsql
as $$
begin
  new.logged_in_at := now();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_user_login_event_before_insert on public.user_login_events;

create trigger normalize_user_login_event_before_insert
before insert on public.user_login_events
for each row
execute function public.normalize_user_login_event();

create or replace function public.prune_user_login_events()
returns trigger
language plpgsql
as $$
begin
  delete from public.user_login_events
  where user_id = new.user_id
    and id in (
      select id
      from public.user_login_events
      where user_id = new.user_id
      order by logged_in_at desc, created_at desc, id desc
      offset 5
    );

  return new;
end;
$$;

drop trigger if exists prune_user_login_events_after_insert on public.user_login_events;

create trigger prune_user_login_events_after_insert
after insert on public.user_login_events
for each row
execute function public.prune_user_login_events();

alter table public.user_login_events enable row level security;

drop policy if exists "Users can read own login events" on public.user_login_events;
create policy "Users can read own login events"
on public.user_login_events
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own login events" on public.user_login_events;
create policy "Users can insert own login events"
on public.user_login_events
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own login events" on public.user_login_events;
create policy "Users can delete own login events"
on public.user_login_events
for delete
using (auth.uid() = user_id);
