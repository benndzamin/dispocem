-- Nova uloga silo_viewer: vidi isključivo tab "Raspoloživi cement" (stanje
-- silosa i rinfuza), samo za čitanje. Nalog kreira admin kroz StaffManagement
-- (admin-create-staff Edge Function), isto kao ostalo osoblje.

-- 1. Nova uloga u users.rola check constraintu -----------------------------
alter table public.users drop constraint if exists users_rola_check;
alter table public.users add constraint users_rola_check
  check (rola in ('admin','wb_supervisor','wb_operator','buyer','mill_operator','silo_viewer'));

-- 2. Admin može brisati i silo_viewer naloge kroz isti StaffManagement ekran.
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

  if target_role not in ('wb_supervisor', 'wb_operator', 'mill_operator', 'silo_viewer') then
    raise exception 'Moguće je obrisati samo supervizora, operatera, radnika na mlinu ili pregled cementa.';
  end if;

  delete from auth.users where id = p_staff_id;
end;
$$;

-- 3. RLS - silo_viewer samo čita (bez insert politike za silo_readings) -----
create policy "Silo viewer can read silos" on public.silos
for select to authenticated
using (public.is_role('silo_viewer'));

create policy "Silo viewer can read readings" on public.silo_readings
for select to authenticated
using (public.is_role('silo_viewer'));

create policy "Silo viewer can read rinfuze" on public.rinfuze
for select to authenticated
using (public.is_role('silo_viewer'));

create policy "Silo viewer can read rinfuza_silos" on public.rinfuza_silos
for select to authenticated
using (public.is_role('silo_viewer'));
