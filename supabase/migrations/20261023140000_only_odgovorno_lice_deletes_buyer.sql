-- Kupca smije obrisati samo njegovo odgovorno lice (ne drugi supervizor /
-- voditelj, ni admin - oni mogu prvo promijeniti odgovorno lice).

create or replace function public.delete_buyer_by_id(p_buyer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
  target_odgovorno uuid;
begin
  if not public.is_admin_or_supervisor() then
    raise exception 'Nemate dozvolu za brisanje kupaca.';
  end if;

  select rola, odgovorno_lice_id into target_role, target_odgovorno
  from public.users
  where id = p_buyer_id;

  if target_role is null then
    raise exception 'Odabrani kupac više ne postoji.';
  end if;

  if target_role <> 'buyer' then
    raise exception 'Moguće je obrisati samo kupca.';
  end if;

  if target_odgovorno is distinct from auth.uid() then
    raise exception 'Kupca može obrisati samo njegovo odgovorno lice.';
  end if;

  -- Brisanje kupca briše i njegove najave koje čekaju odobrenje (vidi
  -- enforce_odgovorno_lice_delete).
  perform set_config('app.deleting_buyer', 'on', true);

  delete from public.announcements
  where created_by = p_buyer_id or buyer_id = p_buyer_id;

  delete from auth.users where id = p_buyer_id;

  perform set_config('app.deleting_buyer', 'off', true);
end;
$$;
