-- Log brisanja treba da zna da li je obrisana najava bila "čeka odobrenje"
-- (awaiting_approval) - operater tu najavu nikad nije ni vidio (RLS je
-- skriva od njega), pa toast o brisanju za njega treba biti tih.

alter table public.announcement_deletions
  add column was_awaiting_approval boolean not null default false;

drop function if exists public.log_announcement_deletion(uuid, text, text, uuid, text, text);

create or replace function public.log_announcement_deletion(
  p_announcement_id uuid,
  p_firma text,
  p_vrsta_cementa text,
  p_created_by uuid,
  p_deleted_by_label text,
  p_deleted_by_role text,
  p_was_awaiting_approval boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.announcement_deletions (
    announcement_id, firma, vrsta_cementa, created_by,
    deleted_by, deleted_by_label, deleted_by_role, was_awaiting_approval
  )
  values (
    p_announcement_id, p_firma, p_vrsta_cementa, p_created_by,
    auth.uid(), p_deleted_by_label, p_deleted_by_role, p_was_awaiting_approval
  );

  delete from public.announcement_deletions
  where created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.log_announcement_deletion(uuid, text, text, uuid, text, text, boolean) from public;
grant execute on function public.log_announcement_deletion(uuid, text, text, uuid, text, text, boolean) to authenticated;
