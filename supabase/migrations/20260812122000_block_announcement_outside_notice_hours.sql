-- Odbija kreiranje najave (announcements insert) OD STRANE KUPCA ako je
-- van konfigurisanog prozora za trenutni dan (Europe/Sarajevo vrijeme).
-- Osoblje (admin/wb_supervisor/wb_operator) nikad nije blokirano - provjera
-- se odmah preskace ako pozivalac nije kupac. Isti obrazac kao postojeci
-- check_cement_type_in_stock() (20260730122000): security definer plpgsql
-- funkcija + "drop trigger if exists" / "create trigger before insert",
-- bez eksplicitnog revoke/grant execute (trigger funkcije ne trebaju to,
-- za razliku od RPC funkcija poput delete_buyer_by_id).

create or replace function public.check_announcement_within_notice_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_sarajevo timestamp;
  today_dow smallint;
  today_time time;
  rule record;
begin
  if not public.is_role('buyer') then
    return new;
  end if;

  now_sarajevo := now() at time zone 'Europe/Sarajevo';
  today_dow := extract(isodow from now_sarajevo);
  today_time := now_sarajevo::time;

  select * into rule
  from public.notice_working_hours
  where day_of_week = today_dow;

  -- Tabela uvijek ima tacno 7 redova - ako ipak nema (nikad se ne bi
  -- trebalo desiti), ne blokiramo (fail-open), isto kao klijentska provjera
  -- kad raspored jos nije ucitan.
  if rule is null then
    return new;
  end if;

  if not rule.is_open then
    raise exception 'Poštovani, danas ne primamo najave.'
      using errcode = 'check_violation';
  end if;

  if today_time < rule.opens_at or today_time > rule.closes_at then
    raise exception 'Poštovani, vrijeme za najave je od % do %.',
      to_char(rule.opens_at, 'HH24:MI'), to_char(rule.closes_at, 'HH24:MI')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists announcements_check_notice_hours on public.announcements;
create trigger announcements_check_notice_hours
before insert on public.announcements
for each row execute function public.check_announcement_within_notice_hours();
