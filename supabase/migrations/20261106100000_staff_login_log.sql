-- Trajna historija prijava osoblja (zadnjih 20 po nalogu) + "zadnja aktivnost"
-- koja ostaje i nakon odjave. Ranije se sve čitalo iz auth.sessions, pa je
-- odjavom (brisanjem sesije) nestajao i svaki trag aktivnosti.

-- 1. Log prijava -----------------------------------------------------------------
create table if not exists public.staff_login_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null unique,
  user_agent text,
  ip inet,
  logged_in_at timestamptz not null default now()
);

create index if not exists staff_login_log_user_id_logged_in_at_idx
  on public.staff_login_log (user_id, logged_in_at desc);

alter table public.staff_login_log enable row level security;

grant select on public.staff_login_log to authenticated;
grant all on public.staff_login_log to service_role;

drop policy if exists "Admin can read staff login log" on public.staff_login_log;
create policy "Admin can read staff login log" on public.staff_login_log
for select to authenticated
using (public.is_role('admin'));

-- 2. Zadnja aktivnost ----------------------------------------------------------------
alter table public.users add column if not exists last_seen_at timestamptz;

-- 3. Snimanje prijave: podaci se čitaju iz auth.sessions (server), ne od klijenta.
create or replace function public.log_staff_login()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or coalesce(public.current_user_role(), '') not in ('admin', 'wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator') then
    return;
  end if;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if v_session_id is null then
    return;
  end if;

  insert into public.staff_login_log (user_id, session_id, user_agent, ip, logged_in_at)
  select s.user_id, s.id, s.user_agent, s.ip, s.created_at
  from auth.sessions s
  where s.id = v_session_id
    and s.user_id = v_uid
  on conflict (session_id) do nothing;

  -- Čuva se najviše 20 zadnjih prijava po nalogu.
  delete from public.staff_login_log
  where user_id = v_uid
    and id not in (
      select id from public.staff_login_log
      where user_id = v_uid
      order by logged_in_at desc
      limit 20
    );
end;
$$;

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or coalesce(public.current_user_role(), '') not in ('admin', 'wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator') then
    return;
  end if;

  update public.users
  set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at < now() - interval '1 minute');
end;
$$;

-- 4. Početno punjenje iz trenutno živih sesija osoblja --------------------------
insert into public.staff_login_log (user_id, session_id, user_agent, ip, logged_in_at)
select s.user_id, s.id, s.user_agent, s.ip, s.created_at
from auth.sessions s
join public.users u on u.id = s.user_id
where u.rola in ('admin', 'wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator')
  and (s.not_after is null or s.not_after > now())
on conflict (session_id) do nothing;

delete from public.staff_login_log l
where l.id in (
  select id from (
    select id, row_number() over (partition by user_id order by logged_in_at desc) as rn
    from public.staff_login_log
  ) ranked
  where ranked.rn > 20
);

-- 5. Pregled aktivnosti: + last_seen_at i posljednja prijava --------------------
drop function if exists public.get_staff_activity();

create function public.get_staff_activity()
returns table (
  id uuid,
  email text,
  rola text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  last_login jsonb,
  sessions jsonb,
  push_devices jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_role('admin') then
    raise exception 'Nemate dozvolu za pregled aktivnosti.';
  end if;

  return query
  select
    u.id,
    u.email,
    u.rola,
    u.created_at,
    au.last_sign_in_at,
    u.last_seen_at,
    (
      select jsonb_build_object(
        'session_id', l.session_id,
        'user_agent', l.user_agent,
        'ip', host(l.ip),
        'logged_in_at', l.logged_in_at
      )
      from public.staff_login_log l
      where l.user_id = u.id
      order by l.logged_in_at desc
      limit 1
    ) as last_login,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'user_agent', s.user_agent,
        'ip', host(s.ip),
        'created_at', s.created_at,
        'last_active', coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at)
      ) order by coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) desc)
      from auth.sessions s
      where s.user_id = u.id
        and (s.not_after is null or s.not_after > now())
    ), '[]'::jsonb) as sessions,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'endpoint_host', substring(p.endpoint from '^https?://([^/]+)'),
        'created_at', p.created_at
      ) order by p.created_at desc)
      from public.push_subscriptions p
      where p.user_id = u.id
    ), '[]'::jsonb) as push_devices
  from public.users u
  left join auth.users au on au.id = u.id
  where u.rola in ('admin', 'wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator')
  order by au.last_sign_in_at desc nulls last;
end;
$$;

-- 6. Zadnjih 20 prijava jednog naloga (samo admin) -------------------------------
create or replace function public.get_staff_logins(p_user_id uuid)
returns table (
  session_id uuid,
  user_agent text,
  ip text,
  logged_in_at timestamptz,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_role('admin') then
    raise exception 'Nemate dozvolu za pregled prijava.';
  end if;

  return query
  select
    l.session_id,
    l.user_agent,
    host(l.ip),
    l.logged_in_at,
    exists (
      select 1 from auth.sessions s
      where s.id = l.session_id
        and (s.not_after is null or s.not_after > now())
    )
  from public.staff_login_log l
  where l.user_id = p_user_id
  order by l.logged_in_at desc
  limit 20;
end;
$$;

revoke all on function public.get_staff_activity() from public;
revoke all on function public.get_staff_logins(uuid) from public;
revoke all on function public.log_staff_login() from public;
revoke all on function public.touch_last_seen() from public;
grant execute on function public.get_staff_activity() to authenticated;
grant execute on function public.get_staff_logins(uuid) to authenticated;
grant execute on function public.log_staff_login() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;

notify pgrst, 'reload schema';
