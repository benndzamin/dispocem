-- Voditelj prodaje (rola silo_viewer) dobija ista prava kao supervisor vage,
-- a svaki kupac dobija "odgovorno lice" (voditelj prodaje ili jedan od
-- supervizora vage). Notifikacije za najave koje čekaju odobrenje idu samo
-- odgovornom licu tog kupca; obje uloge i dalje vide sve najave/odobrenja.

-- 1. Voditelj prodaje = supervisor u svim postojećim RLS politikama ---------
create or replace function public.is_admin_or_supervisor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.rola in ('admin', 'wb_supervisor', 'silo_viewer')
  )
$$;

-- Jedini voditelj prodaje u sistemu (ako ih ikad bude više, uzima se
-- najstariji) - default odgovorno lice.
create or replace function public.voditelj_prodaje_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users
  where rola = 'silo_viewer'
  order by created_at
  limit 1
$$;

-- 2. users.odgovorno_lice_id + backfill --------------------------------------
alter table public.users
  add column odgovorno_lice_id uuid references public.users(id) on delete restrict;

do $$
begin
  if exists (select 1 from public.users where rola = 'buyer')
     and public.voditelj_prodaje_id() is null then
    raise exception 'Ne postoji nalog voditelja prodaje (silo_viewer) - kreirajte ga prije ove migracije.';
  end if;
end $$;

update public.users
set odgovorno_lice_id = public.voditelj_prodaje_id()
where rola = 'buyer' and odgovorno_lice_id is null;

alter table public.users add constraint users_buyer_odgovorno_check
  check (rola <> 'buyer' or odgovorno_lice_id is not null);

-- 3. Pravila za odgovorno lice ------------------------------------------------
-- Insert kupca uvijek dobija voditelja prodaje: BuyerManagement kreira profil
-- pod sesijom NOVOG kupca (signUp prebaci sesiju), pa se izbor admina /
-- voditelja upisuje naknadnim update-om nakon vraćanja njihove sesije.
-- Mijenjati smiju samo admin i voditelj prodaje.
create or replace function public.enforce_odgovorno_lice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rola <> 'buyer' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.odgovorno_lice_id := public.voditelj_prodaje_id();
    return new;
  end if;

  if new.odgovorno_lice_id is distinct from old.odgovorno_lice_id then
    if not (public.is_role('admin') or public.is_role('silo_viewer')) then
      raise exception 'Samo admin i voditelj prodaje mogu mijenjati odgovorno lice.';
    end if;

    if not exists (
      select 1 from public.users
      where id = new.odgovorno_lice_id
        and rola in ('wb_supervisor', 'silo_viewer')
    ) then
      raise exception 'Odgovorno lice mora biti voditelj prodaje ili supervizor vage.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_odgovorno_lice() from public;

create trigger trg_enforce_odgovorno_lice
before insert or update on public.users
for each row execute function public.enforce_odgovorno_lice();

-- 4. Najave pamte kupca i njegovo odgovorno lice ----------------------------
-- Najavu može kreirati i osoblje u ime kupca (created_by je tada osoblje),
-- pa kupac do sad nije bio vezan za najavu osim kroz naziv firme.
alter table public.announcements
  add column buyer_id uuid references public.users(id) on delete set null,
  add column odgovorno_lice_id uuid references public.users(id) on delete set null;

update public.announcements a
set buyer_id = coalesce(
  (select u.id from public.users u where u.id = a.created_by and u.rola = 'buyer'),
  (select u.id from public.users u
   where u.rola = 'buyer' and u.naziv_firme = a.firma
   order by u.created_at limit 1)
);

update public.announcements a
set odgovorno_lice_id = u.odgovorno_lice_id
from public.users u
where u.id = a.buyer_id;

create or replace function public.set_announcement_odgovorno_lice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Kupac može kreirati najavu samo za sebe.
  if public.is_role('buyer') then
    new.buyer_id := new.created_by;
  end if;

  select odgovorno_lice_id into new.odgovorno_lice_id
  from public.users
  where id = new.buyer_id;

  return new;
end;
$$;

revoke all on function public.set_announcement_odgovorno_lice() from public;

create trigger announcements_set_odgovorno_lice
before insert on public.announcements
for each row execute function public.set_announcement_odgovorno_lice();

-- Promjena odgovornog lica prebacuje i najave kupca koje još čekaju
-- odobrenje (brojač/lista kod oba korisnika se ažuriraju uživo).
create or replace function public.sync_announcement_odgovorno_lice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.odgovorno_lice_id is distinct from old.odgovorno_lice_id then
    update public.announcements
    set odgovorno_lice_id = new.odgovorno_lice_id
    where buyer_id = new.id and status = 'awaiting_approval';
  end if;
  return null;
end;
$$;

revoke all on function public.sync_announcement_odgovorno_lice() from public;

create trigger trg_sync_announcement_odgovorno_lice
after update on public.users
for each row execute function public.sync_announcement_odgovorno_lice();

-- 5. Brisanje osoblja blokirano dok je nečije odgovorno lice ----------------
create or replace function public.delete_staff_by_id(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
  buyer_count integer;
begin
  if not public.is_role('admin') then
    raise exception 'Nemate dozvolu za brisanje osoblja.';
  end if;

  if p_staff_id = auth.uid() then
    raise exception 'Ne možete obrisati sopstveni nalog.';
  end if;

  select rola into target_role
  from public.users
  where id = p_staff_id;

  if target_role is null then
    raise exception 'Odabrani nalog više ne postoji.';
  end if;

  if target_role not in ('wb_supervisor', 'wb_operator', 'mill_operator', 'silo_viewer') then
    raise exception 'Moguće je obrisati samo supervizora, operatera, radnika na mlinu ili pregled cementa.';
  end if;

  select count(*) into buyer_count
  from public.users
  where odgovorno_lice_id = p_staff_id;

  if buyer_count > 0 then
    raise exception 'Ovaj korisnik je odgovorno lice za % kupaca. Prvo ih prebacite na drugo odgovorno lice.', buyer_count;
  end if;

  delete from auth.users where id = p_staff_id;
end;
$$;
