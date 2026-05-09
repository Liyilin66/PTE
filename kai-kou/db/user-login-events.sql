-- User login events for the Personal Center device history.
-- Stores only coarse device metadata. Do not add IP, location, or raw user agent.

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null,
  browser text not null,
  os text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_login_events_user_created_idx
  on public.user_login_events (user_id, created_at desc, id desc);

alter table public.user_login_events enable row level security;

drop policy if exists "user_login_events_select_own" on public.user_login_events;
drop policy if exists "user_login_events_insert_own" on public.user_login_events;

create policy "user_login_events_select_own"
on public.user_login_events
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_login_events_insert_own"
on public.user_login_events
for insert
to authenticated
with check (auth.uid() = user_id);

create or replace function public.normalize_user_login_event_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.device_label = left(nullif(btrim(coalesce(new.device_label, '')), ''), 80);
  new.browser = left(nullif(btrim(coalesce(new.browser, '')), ''), 80);
  new.os = left(nullif(btrim(coalesce(new.os, '')), ''), 80);

  if new.device_label is null then
    new.device_label = '当前浏览器设备';
  end if;

  if new.browser is null then
    new.browser = '浏览器';
  end if;

  if new.os is null then
    new.os = '未知系统';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_user_login_event_before_insert on public.user_login_events;
create trigger normalize_user_login_event_before_insert
before insert on public.user_login_events
for each row
execute function public.normalize_user_login_event_before_insert();

create or replace function public.prune_user_login_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  delete from public.user_login_events
  where user_id = new.user_id
    and id not in (
      select id
      from public.user_login_events
      where user_id = new.user_id
      order by created_at desc, id desc
      limit 5
    );

  return null;
end;
$$;

drop trigger if exists prune_user_login_events_after_insert on public.user_login_events;
create trigger prune_user_login_events_after_insert
after insert on public.user_login_events
for each row
execute function public.prune_user_login_events_after_insert();
