-- 20260728120000_add_announcement_status_history.sql je kreirala tabelu
-- public.announcement_status_history sa "grant select, insert to authenticated"
-- ali nikad nije uključila RLS. Bez RLS-a, bilo koji authenticated korisnik
-- (uključujući buyer) može čitati istoriju promjena statusa bilo koje najave
-- (ne samo svoje) i ubacivati lažne unose u istoriju direktno preko API-ja.
--
-- Ne diramo originalnu migraciju (već je primijenjena na remote projekat) -
-- RLS i politike dodajemo ovdje.

alter table public.announcement_status_history enable row level security;

create policy "View history of visible announcements" on public.announcement_status_history
for select to authenticated
using (
  exists (
    select 1
    from public.announcements a
    where a.id = announcement_status_history.announcement_id
      and (
        a.created_by = auth.uid()
        or public.is_admin_or_supervisor()
        or public.is_role('wb_operator')
      )
  )
);

create policy "Only staff can insert status history" on public.announcement_status_history
for insert to authenticated
with check (
  public.is_admin_or_supervisor()
  or public.is_role('wb_operator')
);
