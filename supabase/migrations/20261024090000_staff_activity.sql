-- Admin tab "Aktivnost": pregled prijava i uređaja osoblja (auth.sessions),
-- odjava s uređaja, keš geolokacije IP adresa i privatni Realtime presence
-- kanal 'staff-online' za "ko je trenutno online".

-- 1. Pregled aktivnosti osoblja (samo admin) ---------------------------------
create or replace function public.get_staff_activity()
returns table (
  id uuid,
  email text,
  rola text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
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

-- 2. Odjava s uređaja (samo admin, samo osoblje, ne sebe) -------------------
create or replace function public.admin_revoke_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
begin
  if not public.is_role('admin') then
    raise exception 'Nemate dozvolu za odjavu korisnika.';
  end if;

  select s.user_id into target_user
  from auth.sessions s
  where s.id = p_session_id;

  if target_user is null then
    raise exception 'Sesija više ne postoji.';
  end if;

  if target_user = auth.uid() then
    raise exception 'Ne možete odjaviti sopstveni uređaj odavde.';
  end if;

  if not exists (
    select 1 from public.users
    where id = target_user
      and rola in ('wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator')
  ) then
    raise exception 'Moguće je odjaviti samo osoblje.';
  end if;

  -- refresh_tokens se brišu kaskadno, pa uređaj ne može obnoviti sesiju.
  delete from auth.sessions where id = p_session_id;
end;
$$;

-- Odjava sa svih uređaja briše i push pretplate, da npr. izgubljeni telefon
-- više ne prima notifikacije.
create or replace function public.admin_revoke_all_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_role('admin') then
    raise exception 'Nemate dozvolu za odjavu korisnika.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Ne možete odjaviti sopstveni nalog odavde.';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_user_id
      and rola in ('wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator')
  ) then
    raise exception 'Moguće je odjaviti samo osoblje.';
  end if;

  delete from auth.sessions where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
end;
$$;

revoke all on function public.get_staff_activity() from public;
revoke all on function public.admin_revoke_session(uuid) from public;
revoke all on function public.admin_revoke_all_sessions(uuid) from public;
grant execute on function public.get_staff_activity() to authenticated;
grant execute on function public.admin_revoke_session(uuid) to authenticated;
grant execute on function public.admin_revoke_all_sessions(uuid) to authenticated;

-- 3. Keš geolokacije IP adresa (puni ga edge funkcija geo-lookup) -----------
create table public.ip_geo_cache (
  ip inet primary key,
  city text,
  region text,
  country text,
  country_code text,
  fetched_at timestamptz not null default now()
);

alter table public.ip_geo_cache enable row level security;

grant select on public.ip_geo_cache to authenticated;
grant all on public.ip_geo_cache to service_role;

create policy "Admin can read ip geo cache" on public.ip_geo_cache
for select to authenticated
using (public.is_role('admin'));

-- 4. Privatni presence kanal 'staff-online' ---------------------------------
-- Pridružiti se i javljati prisustvo smije samo osoblje (kupci i anon ključ
-- ne mogu čitati ko je online). Bez uslova na 'extension' - Realtime provjerava
-- pravo čitanja pri pridruživanju kanalu i za broadcast, ne samo presence.
create policy "Staff can read staff-online presence" on realtime.messages
for select to authenticated
using (
  realtime.topic() = 'staff-online'
  and public.current_user_role() in ('admin', 'wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator')
);

create policy "Staff can track staff-online presence" on realtime.messages
for insert to authenticated
with check (
  realtime.topic() = 'staff-online'
  and public.current_user_role() in ('admin', 'wb_supervisor', 'silo_viewer', 'wb_operator', 'mill_operator')
);
