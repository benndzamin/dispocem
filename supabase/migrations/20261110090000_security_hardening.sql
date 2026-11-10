-- Sigurnosne zakrpe nakon revizije (2026-11-10). Sve provjere ovdje rade i
-- sa starim klijentima (PWA keš) - ništa što postojeći frontend radi ne
-- prestaje raditi, samo direktni API pozivi mimo aplikacije bivaju odbijeni.
--
-- Pozivi bez korisnika (auth.uid() null: service role u edge funkcijama,
-- SQL editor, migracije) nisu ograničeni.

-- 1. Niko se ne može sam upisati kao admin/osoblje -----------------------------
-- Politika iz 20260717140000 je dozvoljavala insert ako je "id = auth.uid()",
-- bez ikakve provjere uloge. Pošto su INSERT politike OR-ovane, pooštravanje
-- "Users can insert own profile" (20260805110000) to nije zatvorilo: svako ko
-- se registruje mogao je sebi upisati profil sa rola = 'admin'.
drop policy if exists "Admins and supervisors can insert buyer profiles" on public.users;

create policy "Admins and supervisors can insert buyer profiles" on public.users
for insert to authenticated
with check (public.is_admin_or_supervisor() and rola = 'buyer');

-- Dodatna zaštita nezavisna od politika: profil osoblja upisuje samo admin
-- ili service role (admin-create-staff).
create or replace function public.guard_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.rola is distinct from 'buyer'
     and not public.is_role('admin') then
    raise exception 'Nemate dozvolu za kreiranje naloga osoblja.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_user_insert() from public;

drop trigger if exists trg_guard_user_insert on public.users;
create trigger trg_guard_user_insert
before insert on public.users
for each row execute function public.guard_user_insert();

-- 2. Izmjene profila ------------------------------------------------------------
-- * ulogu mijenja samo admin (ranije i supervizor/voditelj, uključujući
--   sopstvenu ulogu u 'admin');
-- * supervizor/voditelj mijenja samo kupce i svoj red, ne druge naloge osoblja;
-- * kupac na svom redu ne smije mijenjati dozvole (dodato approval_required,
--   naziv_firme i email - ranije je mogao sam sebi isključiti odobravanje).
-- last_seen_at (touch_last_seen) i ostale kolone ostaju slobodne za vlastiti red.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_is_staff boolean;
begin
  -- Ugniježđeni update iz drugog triggera (npr. preimenovanje vrste cementa
  -- ažurira dozvoljeni_artikli svim korisnicima) je već provjeren na izvoru.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  v_is_admin := public.is_role('admin');
  v_is_staff := public.is_admin_or_supervisor();

  if new.rola is distinct from old.rola and not v_is_admin then
    raise exception 'Samo admin može mijenjati uloge korisnika.';
  end if;

  if v_is_staff and not v_is_admin
     and old.rola <> 'buyer' and old.id <> auth.uid() then
    raise exception 'Nemate dozvolu za izmjenu naloga osoblja.';
  end if;

  if (
    new.dozvoljeni_artikli is distinct from old.dozvoljeni_artikli
    or new.announcement_required is distinct from old.announcement_required
    or new.approval_required is distinct from old.approval_required
    or new.naziv_firme is distinct from old.naziv_firme
    or new.email is distinct from old.email
  ) and not v_is_staff then
    raise exception 'Nemate dozvolu za promjenu uloge ili dozvola korisnika.';
  end if;

  return new;
end;
$$;

-- 3. ensure_user_profile samo za sopstveni nalog --------------------------------
-- SECURITY DEFINER funkcija je vraćala cijeli profil BILO kojeg korisnika
-- (zaobilazeći RLS) i mogla kreirati profil za tuđi auth nalog.
create or replace function public.ensure_user_profile(
  p_user_id uuid,
  p_email text,
  p_role text,
  p_naziv_firme text,
  p_adresa text
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_user public.users;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Nemate dozvolu za pristup ovom profilu.';
  end if;

  select * into existing_user
  from public.users
  where id = p_user_id;

  if found then
    return existing_user;
  end if;

  -- p_role se namjerno ignoriše - novi profil je uvijek 'buyer'.
  insert into public.users (
    id,
    email,
    rola,
    naziv_firme,
    adresa,
    dozvoljeni_artikli,
    announcement_required
  )
  values (
    p_user_id,
    coalesce(auth.jwt() ->> 'email', p_email),
    'buyer',
    coalesce(p_naziv_firme, ''),
    coalesce(p_adresa, ''),
    array['PREMILUK (CEM I 52,5 N) - 25 kg'],
    true
  )
  returning * into existing_user;

  return existing_user;
end;
$$;

-- 4. Najava kupca: status, firma i artikl određuje baza --------------------------
-- Frontend je sam birao status ('awaiting_approval' / 'pending'), pa je kupac
-- direktnim API pozivom mogao preskočiti odobravanje, naručiti nedozvoljen
-- artikl ili upisati tuđu firmu. Trigger vrijednosti ispravlja (ne odbija),
-- pa i stari klijenti rade isto kao prije.
create or replace function public.enforce_buyer_announcement_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users;
begin
  if auth.uid() is null or not public.is_role('buyer') then
    return new;
  end if;

  select * into v_profile from public.users where id = auth.uid();

  new.created_by := auth.uid();
  new.status := case
    when v_profile.approval_required then 'awaiting_approval'
    else 'pending'
  end;

  if coalesce(v_profile.naziv_firme, '') <> '' then
    new.firma := v_profile.naziv_firme;
  end if;

  if not (new.vrsta_cementa = any (coalesce(v_profile.dozvoljeni_artikli, '{}'))) then
    raise exception 'Ova vrsta cementa nije dozvoljena za vašu firmu.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_buyer_announcement_insert() from public;

drop trigger if exists announcements_enforce_buyer_insert on public.announcements;
create trigger announcements_enforce_buyer_insert
before insert on public.announcements
for each row execute function public.enforce_buyer_announcement_insert();

-- Najave kreiraju samo kupci (za sebe) i admin/supervizor/voditelj (u ime
-- kupca) - ne operater mlina ni operater vage.
drop policy if exists "Buyers can insert their own announcements" on public.announcements;

create policy "Buyers can insert their own announcements" on public.announcements
for insert to authenticated
with check (
  created_by = auth.uid()
  and (public.is_role('buyer') or public.is_admin_or_supervisor())
);

-- 5. Veze najave (kupac / odgovorno lice / kreator) se ne mijenjaju ručno -------
-- Supervizor je mogao sebe upisati kao odgovorno lice najave pa je odobriti,
-- čime je zaobilazio pravilo iz 20261023120000. Promjenu odgovornog lica
-- radi isključivo sync trigger sa users (dubina > 1), a FK "on delete set
-- null" kaskade takođe idu kroz RI triggere (dubina > 1).
create or replace function public.lock_announcement_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.odgovorno_lice_id is distinct from old.odgovorno_lice_id
     or new.buyer_id is distinct from old.buyer_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Kupac, kreator i odgovorno lice najave se ne mogu mijenjati.';
  end if;

  return new;
end;
$$;

revoke all on function public.lock_announcement_links() from public;

drop trigger if exists announcements_lock_links on public.announcements;
create trigger announcements_lock_links
before update on public.announcements
for each row execute function public.lock_announcement_links();

-- 6. Historija statusa piše baza --------------------------------------------------
-- Klijent je sam upisivao historiju (sa proizvoljnim changed_by), a
-- DispatchChart iz nje računa tonažu. Sada je piše trigger; klijentski
-- INSERT se odbija (stari klijenti grešku ionako ignorišu), pa nema duplikata.
create or replace function public.log_announcement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.announcement_status_history (
      announcement_id, changed_by, old_status, new_status
    )
    values (new.id, auth.uid(), old.status, new.status);
  end if;
  return null;
end;
$$;

revoke all on function public.log_announcement_status_change() from public;

drop trigger if exists announcements_log_status_change on public.announcements;
create trigger announcements_log_status_change
after update of status on public.announcements
for each row execute function public.log_announcement_status_change();

drop policy if exists "Only staff can insert status history" on public.announcement_status_history;
revoke insert on public.announcement_status_history from authenticated;

-- 7. Log brisanja piše baza ---------------------------------------------------------
-- log_announcement_deletion je primao sve podatke od klijenta, pa je bilo ko
-- mogao napraviti lažno "najava obrisana" upozorenje za druge korisnike.
create or replace function public.log_announcement_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleter public.users;
begin
  -- Service role / SQL i brisanje cijelog kupca ne prave obavještenja
  -- (kao ni do sad).
  if auth.uid() is null
     or coalesce(current_setting('app.deleting_buyer', true), '') = 'on' then
    return null;
  end if;

  select * into v_deleter from public.users where id = auth.uid();

  insert into public.announcement_deletions (
    announcement_id, firma, vrsta_cementa, created_by,
    deleted_by, deleted_by_label, deleted_by_role, was_awaiting_approval
  )
  values (
    old.id,
    old.firma,
    old.vrsta_cementa,
    old.created_by,
    auth.uid(),
    case
      when v_deleter.rola = 'buyer' then old.firma
      else coalesce(v_deleter.email, 'Nepoznat korisnik')
    end,
    coalesce(v_deleter.rola, 'buyer'),
    old.status = 'awaiting_approval'
  );

  delete from public.announcement_deletions
  where created_at < now() - interval '7 days';

  return null;
end;
$$;

revoke all on function public.log_announcement_delete() from public;

drop trigger if exists announcements_log_delete on public.announcements;
create trigger announcements_log_delete
after delete on public.announcements
for each row execute function public.log_announcement_delete();

-- Stari klijenti i dalje zovu RPC - ostaje kao no-op (bez greške, bez
-- duplog upisa).
create or replace function public.log_announcement_deletion(
  p_announcement_id uuid,
  p_firma text,
  p_vrsta_cementa text,
  p_created_by uuid,
  p_deleted_by_label text,
  p_deleted_by_role text,
  p_was_awaiting_approval boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Namjerno prazno: log brisanja sada piše trigger announcements_log_delete.
  return;
end;
$$;

-- 8. Anon ne izvršava interne funkcije -------------------------------------------
revoke execute on function public.get_pending_najave_for_operator() from public, anon;
revoke execute on function public.voditelj_prodaje_id() from public, anon;
grant execute on function public.get_pending_najave_for_operator() to authenticated, service_role;
grant execute on function public.voditelj_prodaje_id() to authenticated, service_role;
