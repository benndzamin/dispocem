-- Sa RLS ponovo uključenim na public.users, postojeće politike dozvoljavaju
-- korisniku da vidi samo svoj red, ili admin/supervisor da vide sve. To znači
-- da wb_operator i buyer role gube mogućnost da vide email kreatora najave ili
-- email osobe koja je promijenila status (koristi se u "Historija" modalu u
-- AnnouncementsList.jsx), jer za njih ranije nije bilo potrebno jer je RLS bio
-- isključen. Ova politika otvara vidljivost email/naziv_firme samo za korisnike
-- koji su povezani sa najavom koju trenutni korisnik već ima pravo vidjeti
-- (kreator najave, ili osoba koja je mijenjala njen status) — ne otvara
-- vidljivost svih korisnika.

create policy "Users can view related announcement participants" on public.users
for select to authenticated
using (
  exists (
    select 1
    from public.announcements a
    where a.created_by = public.users.id
      and (
        a.created_by = auth.uid()
        or public.is_admin_or_supervisor()
        or public.is_role('wb_operator')
      )
  )
  or exists (
    select 1
    from public.announcement_status_history h
    join public.announcements a on a.id = h.announcement_id
    where h.changed_by = public.users.id
      and (
        a.created_by = auth.uid()
        or public.is_admin_or_supervisor()
        or public.is_role('wb_operator')
      )
  )
);
