-- Daje wb_supervisor rolji ista prava kao adminu nad cement_types
-- (dodavanje, izmjena, brisanje/restore), i zatvara rupu iz 20260717190000
-- gdje je bilo koji autentifikovan korisnik (uključujući kupca) mogao
-- insertovati/brisati vrste cementa (with check(true) / using(true), nikad obrisano).

drop policy if exists "Authenticated users can insert cement types" on public.cement_types;
drop policy if exists "Authenticated users can delete cement types" on public.cement_types;
drop policy if exists "Users can view cement types" on public.cement_types;
drop policy if exists "Admins have full access to cement types" on public.cement_types;

create policy "Users can view cement types" on public.cement_types
for select to authenticated
using (
  is_active = true
  or public.is_admin_or_supervisor()
);

create policy "Admins and supervisors manage cement types" on public.cement_types
for all to authenticated
using (public.is_admin_or_supervisor())
with check (public.is_admin_or_supervisor());
