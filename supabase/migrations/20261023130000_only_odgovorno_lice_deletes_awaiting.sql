-- Isto pravilo kao za odobravanje (20261023120000): najavu koja čeka
-- odobrenje od osoblja smije obrisati samo odgovorno lice kupca. Kupac i
-- dalje smije obrisati svoju najavu (RLS ga ograničava na vlastite najave i
-- vremenski rok). Pozivi bez korisnika (service role, SQL) nisu ograničeni,
-- kao ni brisanje cijelog kupca kroz delete_buyer_by_id (postavlja
-- app.deleting_buyer za trajanje transakcije).

create or replace function public.enforce_odgovorno_lice_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'awaiting_approval'
     and auth.uid() is not null
     and auth.uid() is distinct from old.odgovorno_lice_id
     and not public.is_role('buyer')
     and coalesce(current_setting('app.deleting_buyer', true), '') <> 'on' then
    raise exception 'Ovu najavu može obrisati samo odgovorno lice kupca.';
  end if;

  return old;
end;
$$;

revoke all on function public.enforce_odgovorno_lice_delete() from public;

create trigger announcements_enforce_odgovorno_lice_delete
before delete on public.announcements
for each row execute function public.enforce_odgovorno_lice_delete();

create or replace function public.delete_buyer_by_id(p_buyer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
begin
  if not public.is_admin_or_supervisor() then
    raise exception 'Nemate dozvolu za brisanje kupaca.';
  end if;

  select rola into target_role
  from public.users
  where id = p_buyer_id;

  if target_role is null then
    raise exception 'Odabrani kupac više ne postoji.';
  end if;

  if target_role <> 'buyer' then
    raise exception 'Moguće je obrisati samo kupca.';
  end if;

  -- Brisanje kupca briše i njegove najave koje čekaju odobrenje, bez obzira
  -- ko je odgovorno lice.
  perform set_config('app.deleting_buyer', 'on', true);

  delete from public.announcements
  where created_by = p_buyer_id or buyer_id = p_buyer_id;

  delete from auth.users where id = p_buyer_id;

  perform set_config('app.deleting_buyer', 'off', true);
end;
$$;
