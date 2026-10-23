-- announcements.created_by je imao ON DELETE CASCADE: brisanje supervizora
-- (ili voditelja prodaje) brisalo je i sve najave koje je kreirao u ime
-- kupaca, uključujući završene. Sada najava ostaje (created_by -> null), a
-- za brisanje zajedno s kupcem brine buyer_id.

alter table public.announcements alter column created_by drop not null;

alter table public.announcements
  drop constraint announcements_created_by_fkey,
  add constraint announcements_created_by_fkey
    foreign key (created_by) references public.users(id) on delete set null;

-- Brisanje kupca i dalje briše sve njegove najave - i one koje je osoblje
-- kreiralo u njegovo ime.
alter table public.announcements
  drop constraint announcements_buyer_id_fkey,
  add constraint announcements_buyer_id_fkey
    foreign key (buyer_id) references public.users(id) on delete cascade;

-- Rezerva za stare najave kojima buyer_id nije mogao biti utvrđen: brišu se
-- eksplicitno po created_by, kao do sad.
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

  delete from public.announcements
  where created_by = p_buyer_id or buyer_id = p_buyer_id;

  delete from auth.users where id = p_buyer_id;
end;
$$;
