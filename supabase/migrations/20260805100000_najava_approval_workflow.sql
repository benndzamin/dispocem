-- Novi status 'awaiting_approval' za najave kupaca kod kojih je oznaceno
-- da zahtijevaju odobrenje supervizora prije nego postanu vidljive/dostupne
-- operateru (npr. provjera uplata prije utovara).

-- CHECK constraint na status kolonu je originalno bio inline/bez imena,
-- pa se ime auto-generisalo. Umjesto da ga pogadjamo, dinamicki nadjemo
-- i obrisemo POSTOJECI check constraint na toj koloni, pa dodamo novi
-- sa poznatim imenom.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'announcements'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%status%';

  if existing_constraint is not null then
    execute format('alter table public.announcements drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.announcements
  add constraint announcements_status_check
  check (status in ('awaiting_approval', 'pending', 'in_progress', 'completed'));

-- Flag po kupcu - isti obrazac kao postojeci announcement_required.
alter table public.users
  add column approval_required boolean not null default false;

-- Operater ne smije ni vidjeti ni mijenjati najave koje cekaju odobrenje -
-- stvarna RLS zastita, ne samo aplikativni filter (expedicija/dispocem
-- filtriraju po statusu, ali RLS je poslednja linija odbrane).

drop policy if exists "Operators can view all announcements" on public.announcements;
create policy "Operators can view all announcements" on public.announcements
for select to authenticated
using (public.is_role('wb_operator') and status <> 'awaiting_approval');

drop policy if exists "Admins supervisors and operators can update announcements" on public.announcements;
create policy "Admins supervisors and operators can update announcements" on public.announcements
for update to authenticated
using (
  public.is_admin_or_supervisor()
  or (public.is_role('wb_operator') and status <> 'awaiting_approval')
)
with check (
  public.is_admin_or_supervisor()
  or (public.is_role('wb_operator') and status <> 'awaiting_approval')
);
