-- public.ensure_user_profile (20260717160000) je SECURITY DEFINER i nikad
-- nije imala revoke/grant, pa je EXECUTE po Postgres defaultu bio otvoren
-- svima (PUBLIC). Pošto SECURITY DEFINER zaobilazi RLS, bilo koji
-- authenticated korisnik je mogao pozvati RPC direktno (mimo frontend-a) sa
-- p_role='admin' prije nego što njegov public.users red postoji i time sebi
-- dodijeliti admin/wb_supervisor ulogu.
--
-- Frontend (Login.jsx) uvijek prvo čita postojeću ulogu iz baze i p_role
-- šalje samo kao fallback string "buyer", tako da hardkodiranje uloge ovdje
-- ne mijenja postojeće ponašanje aplikacije.

revoke all on function public.ensure_user_profile(uuid, text, text, text, text) from public;
grant execute on function public.ensure_user_profile(uuid, text, text, text, text) to authenticated;

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

  -- p_role se namjerno ignoriše pri kreiranju novog profila - vidi komentar
  -- na vrhu fajla. Novi profil je uvijek 'buyer'; admin/supervisor uloge se
  -- dodjeljuju isključivo ručno u bazi ili kroz BuyerManagement flow.
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
