-- Omogućava Adminu da kroz UI kreira i briše naloge sa ulogom wb_supervisor
-- i wb_operator (do sada su se te uloge dodjeljivale isključivo ručno u
-- bazi - vidi komentar u 20260729099000).
--
-- Usput zatvara postojeću rupu: "Users can insert own profile" je do sada
-- dozvoljavala insert bilo kojeg reda gdje je id = auth.uid(), bez provjere
-- kolone rola. Jedina zaštita od self-escalation-a pri kreiranju profila je
-- do sada bila to što ensure_user_profile RPC hardkodira 'buyer' - sam
-- insert put je ostajao otvoren za direktan REST poziv sa rola='admin' prije
-- nego što profil korisnika postoji. Nova politika ispod zahtijeva da
-- self-insert uvijek bude 'buyer', što ne mijenja postojeće ponašanje jer
-- ensure_user_profile i BuyerManagement već uvijek insertuju 'buyer'.
-- Kreiranje wb_supervisor/wb_operator naloga ide isključivo kroz novu
-- admin-create-staff Edge Function (service-role klijent, zaobilazi RLS).

drop policy if exists "Users can insert own profile" on public.users;

create policy "Users can insert own profile" on public.users
for insert to authenticated
with check (id = auth.uid() and rola = 'buyer');

-- Brisanje auth korisnika automatski briše njegov public.users zapis preko
-- postojećeg ON DELETE CASCADE, isto kao delete_buyer_by_id.
create or replace function public.delete_staff_by_id(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
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

  if target_role not in ('wb_supervisor', 'wb_operator') then
    raise exception 'Moguće je obrisati samo supervisora ili operatera.';
  end if;

  delete from auth.users where id = p_staff_id;
end;
$$;

revoke all on function public.delete_staff_by_id(uuid) from public;
grant execute on function public.delete_staff_by_id(uuid) to authenticated;
