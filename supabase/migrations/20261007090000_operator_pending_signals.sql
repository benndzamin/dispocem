-- Signal tabela za operatera: RLS mu skriva 'awaiting_approval' najave, pa
-- ni Realtime mu ne salje INSERT event za njih - do sad je novu najavu
-- vidio tek kroz polling (svakih 20s). Ovdje trigger upise samo id najave
-- (bez ikakvih detalja), operater se pretplati na INSERT u ovoj tabeli i
-- odmah ponovo pozove get_pending_najave_for_operator. Isti obrazac kao
-- announcement_deletions. Cuva se 1 dan, pa se sam cisti.

create table public.announcement_pending_signals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.announcement_pending_signals enable row level security;

grant select on public.announcement_pending_signals to authenticated;

create policy "Admins supervisors and operators can view pending signals" on public.announcement_pending_signals
for select to authenticated
using (public.is_admin_or_supervisor() or public.is_role('wb_operator'));

-- Upis ide iskljucivo kroz trigger (nema insert politike za korisnike).

create or replace function public.signal_pending_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'awaiting_approval' then
    insert into public.announcement_pending_signals (announcement_id)
    values (new.id);

    delete from public.announcement_pending_signals
    where created_at < now() - interval '1 day';
  end if;
  return null;
end;
$$;

revoke all on function public.signal_pending_announcement() from public;

create trigger announcements_signal_pending
after insert or update on public.announcements
for each row execute function public.signal_pending_announcement();

alter publication supabase_realtime add table public.announcement_pending_signals;
