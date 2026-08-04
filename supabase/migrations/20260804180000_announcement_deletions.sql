-- Log obrisanih najava - koristi se ISKLJUCIVO da pokrene obavjestenja
-- (ko je obrisao, kupac da sazna da mu je najava obrisana) preko
-- Realtime INSERT pretplate, po istom obrascu kao za kreiranje najave.
-- Nije FK na announcements sa cascade - mora preziviti brisanje najave.
-- Cuva se 7 dana, pa se sam cisti (vidi log_announcement_deletion ispod).

create table public.announcement_deletions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  firma text not null,
  vrsta_cementa text not null,
  created_by uuid,
  deleted_by uuid references public.users(id),
  deleted_by_label text not null,
  deleted_by_role text not null,
  created_at timestamptz not null default now()
);

alter table public.announcement_deletions enable row level security;

grant select on public.announcement_deletions to authenticated;

create policy "Admins supervisors and operators can view all deletions" on public.announcement_deletions
for select to authenticated
using (public.is_admin_or_supervisor() or public.is_role('wb_operator'));

create policy "Buyers can view their own announcement deletions" on public.announcement_deletions
for select to authenticated
using (created_by = auth.uid());

-- Upis ide iskljucivo kroz ovu funkciju (nema direktne insert politike za
-- obicne korisnike) - odmah uz upis se pocisti i sve starije od 7 dana,
-- bez potrebe za pg_cron ili posebnim zakazanim zadatkom. Isti security
-- definer obrazac kao vec postojeca claim_push_subscription funkcija.

create or replace function public.log_announcement_deletion(
  p_announcement_id uuid,
  p_firma text,
  p_vrsta_cementa text,
  p_created_by uuid,
  p_deleted_by_label text,
  p_deleted_by_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.announcement_deletions (
    announcement_id, firma, vrsta_cementa, created_by,
    deleted_by, deleted_by_label, deleted_by_role
  )
  values (
    p_announcement_id, p_firma, p_vrsta_cementa, p_created_by,
    auth.uid(), p_deleted_by_label, p_deleted_by_role
  );

  delete from public.announcement_deletions
  where created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.log_announcement_deletion(uuid, text, text, uuid, text, text) from public;
grant execute on function public.log_announcement_deletion(uuid, text, text, uuid, text, text) to authenticated;

-- Realtime mora znati za ovu tabelu, isto kao za announcements.
alter publication supabase_realtime add table public.announcement_deletions;
