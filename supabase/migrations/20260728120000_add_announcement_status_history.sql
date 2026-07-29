-- Log izmjena statusa najave: ko (koji account) i kada je promijenio status.

alter table public.announcements
  add column if not exists last_status_changed_by uuid references public.users(id),
  add column if not exists last_status_changed_at timestamptz;

create table if not exists public.announcement_status_history (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  changed_by uuid references public.users(id),
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_announcement_status_history_announcement_id
  on public.announcement_status_history(announcement_id);

grant select, insert on public.announcement_status_history to authenticated;
