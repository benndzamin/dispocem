-- Brisanje auth korisnika automatski briše njegov public.users zapis i najave
-- preko postojećih ON DELETE CASCADE relacija.
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

  delete from auth.users where id = p_buyer_id;
end;
$$;

revoke all on function public.delete_buyer_by_id(uuid) from public;
grant execute on function public.delete_buyer_by_id(uuid) to authenticated;
