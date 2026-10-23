-- Brisanje osoblja (delete_staff_by_id) je padalo na FK-ovima koji pokazuju
-- na users bez ON DELETE pravila - npr. radnik na mlinu koji je unio mjerenja
-- silosa. Istorija (mjerenja, brisanja, promjene statusa) ostaje, samo se
-- izgubi veza na obrisani nalog.

alter table public.silo_readings
  drop constraint silo_readings_recorded_by_fkey,
  add constraint silo_readings_recorded_by_fkey
    foreign key (recorded_by) references public.users(id) on delete set null;

alter table public.announcement_deletions
  drop constraint announcement_deletions_deleted_by_fkey,
  add constraint announcement_deletions_deleted_by_fkey
    foreign key (deleted_by) references public.users(id) on delete set null;

alter table public.announcement_status_history
  drop constraint announcement_status_history_changed_by_fkey,
  add constraint announcement_status_history_changed_by_fkey
    foreign key (changed_by) references public.users(id) on delete set null;

alter table public.announcements
  drop constraint announcements_last_status_changed_by_fkey,
  add constraint announcements_last_status_changed_by_fkey
    foreign key (last_status_changed_by) references public.users(id) on delete set null;
