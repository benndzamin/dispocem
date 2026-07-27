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
  select * into existing_user
  from public.users
  where id = p_user_id;

  if found then
    return existing_user;
  end if;

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
    p_email,
    coalesce(p_role, 'buyer'),
    coalesce(p_naziv_firme, ''),
    coalesce(p_adresa, ''),
    array['PREMILUK (CEM I 52,5 N) - 25 kg'],
    true
  )
  returning * into existing_user;

  return existing_user;
end;
$$;
